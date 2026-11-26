"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import GoalStatusLabel from "@/components/goal-status-label";
import GoalBar from "@/components/goal-bar";
import { directionOf, goalProgress, goalStatus, overLimits, type GoalDirection } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import { saveDayPlan, saveGoal } from "./actions";
import CalendarSidebar from "./calendar-sidebar";
import PlanBlockDialog, { type BlockDraft } from "./plan-block-dialog";
import { useHiddenCategories } from "./use-hidden-categories";
import { draftAt } from "./week-calendar";

// Plan → Grid: the week as a budget sheet. A goal per category, the week's progress, and the
// hours planned per day. Wide cards show all 7 days as columns. Narrower ones (phones) show
// one day at a time, picked from a strip of the week's days. Which layout shows is decided by
// the card's own width (a container query), so there's nothing to measure.

// Name, goal, week, then the 7 days
const COLUMNS = "minmax(7rem,10rem) 8rem minmax(8.5rem,11rem) repeat(7,minmax(4.5rem,1fr))";

type GridDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  // e.g. "Fri, Nov 27", for the popup's day picker
  label: string;
  startMs: number;
  endMs: number;
};

type GridGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

type GridCategory = GridGroup["categories"][number];

type DayKind = "past" | "today" | "future";

type WeekGridProps = {
  weekStart: string;
  groups: GridGroup[];
  days: GridDay[];
  today: string;
  // Weekly goals, keyed by category ID. A category with no goal isn't in here; 0 is a real goal.
  goals: Record<string, number>;
  // Which way each goal points ("at least" or "at most"), keyed by category ID
  directions: Record<string, GoalDirection>;
  // Hours keyed by "<categoryId>:<date>":
  // planned (the day's plan: the bigger of typed and scheduled), plannedAhead (the part still
  // after now), actual (tracked), typed (typed into the grid), scheduled (Plan calendar blocks)
  planned: Record<string, number>;
  plannedAhead: Record<string, number>;
  actual: Record<string, number>;
  typed: Record<string, number>;
  scheduled: Record<string, number>;
  // The part of the scheduled hours still after now (all of it on later days)
  scheduledAhead: Record<string, number>;
  // Adding plan blocks needs a Plan calendar
  canAddBlocks: boolean;
  // Logging done time needs a Log calendar
  canLog: boolean;
  timeZone: string;
  // Minutes since midnight today, or null when today isn't in this week
  nowMinutes: number | null;
};

type SaveStatus = "saving" | "saved" | "error";

function cellKey(categoryId: string, date: string) {
  return `${categoryId}:${date}`;
}

// 2.25 -> "2.25"
function num(hours: number) {
  return String(Number(hours.toFixed(2)));
}

function asText(values: Record<string, number>) {
  const text: Record<string, string> = {};
  for (const [key, hours] of Object.entries(values)) {
    text[key] = String(hours);
  }
  return text;
}

// "" (empty field) -> null; anything else -> a number of hours, never below 0 ("1,5" works too)
function hoursOrNull(text: string | undefined) {
  const trimmed = (text ?? "").trim().replace(",", ".");
  return trimmed === "" ? null : Math.max(0, Number(trimmed) || 0);
}

const STRIPES = (color: string) => `repeating-linear-gradient(135deg, ${color} 0 3px, ${color}66 3px 6px)`;

// The header's bar for the whole week, in category colors. Right of 0: progress toward
// "at least" goals, all the done time first (solid), then all the planned time (faded).
// Left of 0: time past "at most" limits, striped in each category's color.
// The goals' total is labeled at the end; hovering shows the details in words.
function WeekBar({
  segments,
  overs,
  total,
  details,
}: {
  segments: { id: string; color: string; done: number; ahead: number }[];
  overs: { id: string; color: string; hours: number }[];
  total: number;
  details: string;
}) {
  const overTotal = overs.reduce((sum, over) => sum + over.hours, 0);
  const span = Math.max(overTotal + total, 0.01);
  const percent = (hours: number) => `${(hours / span) * 100}%`;
  const zero = percent(overTotal);
  const hasDone = segments.some((segment) => segment.done > 0);
  const hasAhead = segments.some((segment) => segment.ahead > 0);

  return (
    <div title={details} aria-label={details} className="relative mt-3 mb-4 cursor-default">
      <div className="flex h-2 overflow-hidden rounded-full bg-stone-100">
        {overs.map((over) => (
          <span key={over.id} className="h-full" style={{ width: percent(over.hours), background: STRIPES(over.color) }} />
        ))}
        {segments.map((segment) =>
          segment.done > 0 ? (
            <span key={segment.id} className="h-full" style={{ width: percent(segment.done), backgroundColor: segment.color }} />
          ) : null
        )}
        {/* A thin gap where done time ends and planned time starts */}
        {hasDone && hasAhead && <span className="h-full w-0.5 shrink-0 bg-white" />}
        {segments.map((segment) =>
          segment.ahead > 0 ? (
            <span
              key={segment.id}
              className="h-full"
              style={{ width: percent(segment.ahead), backgroundColor: `${segment.color}66` }}
            />
          ) : null
        )}
      </div>
      {/* The 0 mark, only needed when there's something below zero */}
      {overTotal > 0 && (
        <>
          <span className="absolute -top-1 h-4 border-l-2 border-stone-700" style={{ left: zero }} />
          <span className="absolute top-3.5 -translate-x-1/2 text-[10px] leading-none text-stone-400" style={{ left: zero }}>
            0
          </span>
        </>
      )}
      {total > 0 && (
        <span className="absolute right-0 top-3.5 text-[10px] leading-none text-stone-400">{formatHours(total)}</span>
      )}
    </div>
  );
}

export default function WeekGrid({
  weekStart,
  groups,
  days,
  today,
  goals,
  directions,
  actual,
  typed,
  scheduled,
  scheduledAhead,
  canAddBlocks,
  canLog,
  timeZone,
  nowMinutes,
}: WeekGridProps) {
  const categories = groups.flatMap((group) => group.categories);

  // Unchecked in the sidebar: their rows are hidden (the week's totals still count them)
  const { hidden, toggle } = useHiddenCategories();
  const shownGroups = groups
    .map((group) => ({ ...group, categories: group.categories.filter((category) => !hidden.has(category.id)) }))
    .filter((group) => group.categories.length > 0);
  const shownCategories = shownGroups.flatMap((group) => group.categories);

  // Goals: each one's text, so a field can be empty while you type
  const [goalText, setGoalText] = useState<Record<string, string>>(() => asText(goals));
  const [goalStatusById, setGoalStatusById] = useState<Record<string, SaveStatus>>({});
  // Day plans: the same, keyed by "<categoryId>:<date>"
  const [dayText, setDayText] = useState<Record<string, string>>(() => asText(typed));
  const [dayStatus, setDayStatus] = useState<Record<string, SaveStatus>>({});
  // The field being typed in (a category ID or a cell key), so new values from the server don't overwrite it
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // When the server sends new values (after a save, or "Copy last week's goals"), take them,
  // except in the field you're typing in. This is React's "adjust state when a prop changes" pattern.
  const [lastGoals, setLastGoals] = useState(goals);
  if (goals !== lastGoals) {
    setLastGoals(goals);
    setGoalText((current) => {
      const next = asText(goals);
      if (editingKey && editingKey in current) {
        next[editingKey] = current[editingKey];
      }
      return next;
    });
  }
  // Each goal's direction, flipped right away by its goal / limit switch
  const [directionById, setDirectionById] = useState<Record<string, GoalDirection>>(directions);
  const [lastDirections, setLastDirections] = useState(directions);
  if (directions !== lastDirections) {
    setLastDirections(directions);
    setDirectionById(directions);
  }

  const [lastTyped, setLastTyped] = useState(typed);
  if (typed !== lastTyped) {
    setLastTyped(typed);
    setDayText((current) => {
      const next = asText(typed);
      if (editingKey && editingKey in current) {
        next[editingKey] = current[editingKey];
      }
      return next;
    });
  }

  // null when the field is empty (no goal); 0 is a real goal
  const goalOrNull = (categoryId: string) => hoursOrNull(goalText[categoryId]);
  const goalFor = (categoryId: string) => goalOrNull(categoryId) ?? 0;
  // A goal of 0 is always "at most"; an empty goal keeps whatever the switch says
  const directionFor = (categoryId: string): GoalDirection => {
    const goal = goalOrNull(categoryId);
    return goal === null ? (directionById[categoryId] ?? "at_least") : directionOf(goal, directionById[categoryId]);
  };

  const read = (values: Record<string, number>) => (key: string) => values[key] ?? 0;
  const actualAt = read(actual);
  const scheduledAt = read(scheduled);
  const scheduledAheadAt = read(scheduledAhead);
  // What's typed in a day right now (0 when empty), so cells react as you type
  const typedAt = (key: string) => hoursOrNull(dayText[key]) ?? 0;

  // A day's plan: the bigger of what's typed and what's scheduled
  const plannedAt = (key: string) => Math.max(typedAt(key), scheduledAt(key));
  // The part of a day's plan still ahead: later days count all of it; today counts what's typed
  // minus what's already done, or the blocks still ahead if that's more; past days count none
  const aheadAt = (key: string, date: string) => {
    if (date < today) {
      return 0;
    }
    if (date > today) {
      return plannedAt(key);
    }
    return Math.max(typedAt(key) - actualAt(key), scheduledAheadAt(key));
  };
  const weekTotal = (categoryId: string, at: (key: string, date: string) => number) =>
    days.reduce((sum, day) => sum + at(cellKey(categoryId, day.date), day.date), 0);

  // Dates are "YYYY-MM-DD", so comparing them as text puts them in order
  const kindOf = (date: string): DayKind => (date === today ? "today" : date > today ? "future" : "past");
  // Only a week that isn't over yet can still get time planned
  const weekStillOpen = days[days.length - 1].date >= today;

  // Everything a row shows about its week
  function rowFor(category: GridCategory) {
    const goal = goalOrNull(category.id);
    const done = weekTotal(category.id, actualAt);
    const ahead = weekTotal(category.id, aheadAt);
    const direction = directionFor(category.id);
    const isLimit = direction === "at_most";
    const weekly = goal === null ? null : goalStatus(goal, done, ahead, direction);
    // A goal's hours not done and not planned yet ("2.5h unplanned")
    const unplanned = goal !== null && !isLimit && weekStillOpen ? Math.max(0, goal - done - ahead) : 0;
    return { goal, done, ahead, direction, isLimit, weekly, unplanned };
  }

  // The Total adds up "at least" goals only; limits aren't something to fill
  const goalTotal = categories.reduce(
    (sum, category) => sum + (directionFor(category.id) === "at_least" ? goalFor(category.id) : 0),
    0
  );
  const doneTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, actualAt), 0);
  const aheadTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, aheadAt), 0);

  // Progress toward goals, for the header (null when there are no goals)
  const goalRows = categories
    .filter((category) => goalOrNull(category.id) !== null)
    .map((category) => ({
      id: category.id,
      color: category.color,
      name: category.name,
      goal: goalFor(category.id),
      done: weekTotal(category.id, actualAt),
      ahead: weekTotal(category.id, aheadAt),
      direction: directionFor(category.id),
    }));
  const progress = goalProgress(goalRows);
  const overs = overLimits(goalRows).map((row) => ({ id: row.id, color: row.color, hours: row.done - row.goal }));
  // Time past "at most" limits, added up: shown below zero in the header
  const overTotal = overs.reduce((sum, over) => sum + over.hours, 0);
  // "Done this week" leaves out time past limits: that shows on its own, as "Over limit"
  const doneCounted = doneTotal - overTotal;
  // The bar's pieces, counted the same way goalProgress counts them (nothing past a goal)
  const segments = goalRows
    .filter((row) => row.goal > 0 && directionOf(row.goal, row.direction) === "at_least")
    .map((row) => {
      const done = Math.min(row.done, row.goal);
      return { id: row.id, color: row.color, done, ahead: Math.min(row.ahead, row.goal - done) };
    });

  // Phones: the day the rows show. Starts on today, or the first day of another week.
  const [phoneDate, setPhoneDate] = useState(() =>
    days.some((day) => day.date === today) ? today : days[0].date
  );
  const phoneDay = days.find((day) => day.date === phoneDate) ?? days[0];
  // Phones: the category whose goal editor is open
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);

  // "+ Add" (in the sidebar): today at the next full hour, or 9 AM on the first day
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const closeDialog = useCallback(() => setDraft(null), []);
  function addBlock() {
    const inWeek = days.some((day) => day.date === today);
    setDraft(
      inWeek && nowMinutes !== null
        ? draftAt(today, Math.ceil(nowMinutes / 60) * 60)
        : draftAt(days[0].date, 9 * 60)
    );
  }

  // Save one goal when its field loses focus (if it changed) or its direction is flipped
  async function saveGoalField(categoryId: string, direction = directionById[categoryId] ?? "at_least") {
    setEditingKey(null);
    const hours = goalOrNull(categoryId);
    if (hours === (goals[categoryId] ?? null) && direction === (directions[categoryId] ?? "at_least")) {
      return;
    }
    // Nothing to save yet without hours; the direction is saved with them
    if (hours === null && goals[categoryId] === undefined) {
      return;
    }
    setGoalStatusById((current) => ({ ...current, [categoryId]: "saving" }));
    const result = await saveGoal(weekStart, categoryId, hours, direction);
    setGoalStatusById((current) => ({ ...current, [categoryId]: result.error ? "error" : "saved" }));
    if (!result.error) {
      clearSavedLater(setGoalStatusById, categoryId);
    }
  }

  // Save one day's typed hours when its field loses focus, if they changed
  async function saveDayField(categoryId: string, date: string) {
    setEditingKey(null);
    const key = cellKey(categoryId, date);
    const hours = hoursOrNull(dayText[key]);
    // 0 and empty both mean "no typed plan"
    const next = hours === 0 ? null : hours;
    if (next === (typed[key] ?? null)) {
      return;
    }
    setDayStatus((current) => ({ ...current, [key]: "saving" }));
    const result = await saveDayPlan(date, categoryId, next);
    setDayStatus((current) => ({ ...current, [key]: result.error ? "error" : "saved" }));
    if (!result.error) {
      clearSavedLater(setDayStatus, key);
    }
  }

  // The goal / limit switch: flip the direction and save it with the goal
  function flipDirection(categoryId: string) {
    const next: GoalDirection = (directionById[categoryId] ?? "at_least") === "at_least" ? "at_most" : "at_least";
    setDirectionById((current) => ({ ...current, [categoryId]: next }));
    saveGoalField(categoryId, next);
  }

  // The goal / limit switch joined to the hours field
  function goalEditor(category: GridCategory) {
    const goal = goalOrNull(category.id);
    const isLimit = directionFor(category.id) === "at_most";
    return (
      <div className="flex items-center">
        {/* goal: at least (work toward it), or limit: at most. 0 is always a limit. */}
        <button
          type="button"
          onClick={() => flipDirection(category.id)}
          disabled={goal === 0}
          title={isLimit ? "Limit: at most this many hours. Click to make it a goal." : "Goal: at least this many hours. Click to make it a limit."}
          aria-label={`${category.name} is a ${isLimit ? "limit (at most)" : "goal (at least)"}. Switch.`}
          className="-mr-px h-[30px] w-11 shrink-0 rounded-l-md border border-accent/40 bg-white text-xs font-medium text-stone-500 hover:brightness-95 disabled:cursor-default disabled:opacity-70"
        >
          {isLimit ? "limit" : "goal"}
        </button>
        <HoursField
          value={goalText[category.id] ?? ""}
          onChange={(value) => setGoalText((current) => ({ ...current, [category.id]: value }))}
          onFocus={() => setEditingKey(category.id)}
          onBlur={() => saveGoalField(category.id)}
          max={168}
          placeholder="Set"
          label={`Weekly goal for ${category.name}, in hours`}
          status={goalStatusById[category.id]}
          tinted
          attached
        />
      </div>
    );
  }

  // The week for one category: done of goal, the bar, then the status (and what's unplanned)
  function weekSummary(category: GridCategory) {
    const { goal, done, ahead, direction, isLimit, weekly, unplanned } = rowFor(category);
    return (
      <div className="flex min-h-14 flex-col justify-center text-sm leading-snug">
        {goal === null ? (
          <p className={done > 0 ? "text-stone-600" : "text-stone-300"}>
            {done > 0 ? `${formatHours(done)} done` : "–"}
          </p>
        ) : (
          <>
            {/* "2 of 3h max", or "4.5 over 0h max" once a limit is passed */}
            <p>
              <span className="font-medium text-stone-900">{num(done)}</span>
              <span className="text-stone-500">
                {isLimit && done > goal ? " over " : " of "}
                {formatHours(goal)}
                {isLimit ? " max" : ""}
              </span>
            </p>
            <GoalBar goal={goal} done={done} ahead={ahead} direction={direction} color={category.color} className="mt-1.5" />
          </>
        )}
        {/* "Over limit" stays out: the line above already says it */}
        {weekly && weekly.tone !== "over" && (
          <p className="mt-1 text-xs">
            <GoalStatusLabel status={weekly} />
            {unplanned >= 0.01 && weekly.tone === "quiet" && (
              <span className="text-stone-400"> · {formatHours(unplanned)} unplanned</span>
            )}
          </p>
        )}
      </div>
    );
  }

  // One category on one day: what happened (past), or a field to type the plan (today and later)
  function dayCell(category: GridCategory, day: GridDay, goal: number | null, direction: GoalDirection) {
    const key = cellKey(category.id, day.date);
    const kind = kindOf(day.date);

    if (kind === "past") {
      return (
        <PastCell
          key={day.date}
          href={`/budget?week=${day.date}`}
          label={`${category.name}, ${day.label}`}
          done={actualAt(key)}
          planned={plannedAt(key)}
          goal={goal}
          direction={direction}
          doneBefore={days
            .filter((d) => d.date < day.date)
            .reduce((sum, d) => sum + actualAt(cellKey(category.id, d.date)), 0)}
        />
      );
    }

    return (
      // A fixed size, so typing doesn't change it. Clicking anywhere on the tile types into it.
      <div
        key={day.date}
        onClick={(event) => event.currentTarget.querySelector("input")?.focus()}
        className={`flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-stone-200 px-1 ${
          kind === "today" ? "bg-accent-soft/60" : "bg-stone-100/70"
        }`}
      >
        <HoursField
          value={dayText[key] ?? ""}
          onChange={(value) => setDayText((current) => ({ ...current, [key]: value }))}
          onFocus={() => setEditingKey(key)}
          onBlur={() => saveDayField(category.id, day.date)}
          max={24}
          // A day with blocks but nothing typed shows the scheduled hours in gray
          placeholder={scheduledAt(key) > 0 ? num(scheduledAt(key)) : "–"}
          label={`${category.name}, ${day.label}: hours planned`}
          status={dayStatus[key]}
          compact
        />
        <DayNote kind={kind} scheduled={scheduledAt(key)} done={actualAt(key)} />
      </div>
    );
  }

  // A day's total: done for past days and today, planned for later days
  function dayTotal(day: GridDay) {
    const future = kindOf(day.date) === "future";
    const total = shownCategories.reduce((sum, category) => {
      const key = cellKey(category.id, day.date);
      return sum + (future ? plannedAt(key) : actualAt(key));
    }, 0);
    return { future, total };
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <CalendarSidebar
        groups={groups}
        hidden={hidden}
        onToggle={toggle}
        onAdd={canAddBlocks || canLog ? addBlock : undefined}
        timeZone={timeZone}
        today={today}
        miniMonth={{ initialMonth: days[3].date.slice(0, 7), selected: days.map((day) => day.date) }}
        showLegend={false}
      />

      <div className="@container min-w-0">
        {/* Header: the week's facts, and goal progress beside them */}
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
          <div className="flex gap-x-6 sm:gap-x-10">
            <div>
              <p className="flex items-center gap-1.5 text-xs text-stone-500 sm:text-sm">
                <span className="h-2 w-3 rounded-sm bg-stone-500" />
                Done this week
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums sm:text-3xl">{formatHours(doneCounted)}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs text-stone-500 sm:text-sm">
                <span className="h-2 w-3 rounded-sm bg-stone-500/40" />
                Planned ahead
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums sm:text-3xl">{formatHours(aheadTotal)}</p>
            </div>
            {/* Time past limits, as a negative number, kept quiet. Only shows when something went over. */}
            {overTotal > 0 && (
              <div>
                <p className="text-xs text-stone-500 sm:text-sm">Over limit</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-stone-400 sm:text-3xl">
                  −{formatHours(overTotal)}
                </p>
              </div>
            )}
          </div>

          {progress || overTotal > 0 ? (
            <div className="min-w-64 flex-1 md:border-l md:border-stone-100 md:pl-10">
              <p className="text-sm text-stone-500">Goals</p>
              <WeekBar
                segments={segments}
                overs={overs}
                total={progress?.total ?? 0}
                details={[
                  ...segments.map((s) => {
                    const row = goalRows.find((r) => r.id === s.id)!;
                    return `${row.name} ${num(row.done)} done, ${num(row.ahead)} planned of ${formatHours(row.goal)}`;
                  }),
                  ...overs.map((o) => `${goalRows.find((r) => r.id === o.id)!.name} ${formatHours(o.hours)} over limit`),
                ].join(" · ")}
              />
            </div>
          ) : (
            <p className="min-w-64 flex-1 text-sm text-stone-500 md:border-l md:border-stone-100 md:pl-10">
              Set a weekly goal below to see your progress here.
            </p>
          )}
        </div>

        {/* Wide: all 7 days as columns */}
        <div className="hidden @min-[61rem]:block">
          <p className="mt-6 text-sm text-stone-600">
            Type a weekly goal for each category, and the hours you plan for each day. Both save on their own.
          </p>

          <div className="mt-3 rounded-xl border border-stone-200 bg-white px-4 pb-4">
            {/* The column headers stay at the top of the window while you scroll */}
            <div className="sticky top-0 z-10 -mx-4 rounded-t-xl border-b border-stone-200 bg-stone-100 px-4 pt-3">
              <div style={{ gridTemplateColumns: COLUMNS }} className="grid items-center gap-2 pb-2 text-sm text-stone-500">
                <span />
                <span className="text-center font-medium text-accent">Goal ✎</span>
                <span className="pl-1">Week</span>
                {days.map((day) => (
                  // Opens this week in the calendar
                  <Link
                    key={day.date}
                    href={`/budget?week=${day.date}`}
                    title={`Open ${day.label} in the calendar`}
                    className={`rounded-md py-1.5 text-center text-base font-medium transition-colors ${
                      day.date === today ? "bg-accent-soft font-semibold text-accent" : "text-stone-600 hover:bg-stone-200/70"
                    }`}
                  >
                    {day.weekday} {day.dayNumber}
                  </Link>
                ))}
              </div>
            </div>

            {shownGroups.map((group) => (
              <div key={group.id} className="border-t border-stone-100 pt-2">
                <p className="px-1 pt-1 font-semibold">{group.name}</p>
                {group.categories.map((category) => {
                  const { goal, direction } = rowFor(category);
                  return (
                    <div key={category.id} style={{ gridTemplateColumns: COLUMNS }} className="grid items-center gap-2 py-2">
                      <span className="flex items-center gap-2.5 px-1 text-base">
                        <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                        <span className="truncate">{category.name}</span>
                      </span>
                      {goalEditor(category)}
                      <div className="pl-1">{weekSummary(category)}</div>
                      {days.map((day) => dayCell(category, day, goal, direction))}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Totals per day, for the rows showing */}
            <div style={{ gridTemplateColumns: COLUMNS }} className="grid items-center gap-2 border-t border-stone-200 pt-2 text-sm font-semibold">
              <span className="px-1">Total</span>
              <span className="pr-5 text-right tabular-nums">{formatHours(goalTotal)}</span>
              <span />
              {days.map((day) => {
                const { future, total } = dayTotal(day);
                return (
                  <span key={day.date} className={`py-1 text-center tabular-nums ${future ? "font-normal text-stone-400" : ""}`}>
                    {total > 0 ? formatHours(total) : "–"}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Narrow (phones): pick a day, then each row shows that day */}
        <div className="@min-[61rem]:hidden">
          <div className="mt-4 grid grid-cols-7 gap-1" role="tablist" aria-label="Choose a day">
            {days.map((day) => {
              const isSelected = day.date === phoneDate;
              const isToday = day.date === today;
              return (
                <button
                  key={day.date}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setPhoneDate(day.date)}
                  className={`rounded-lg border py-1.5 text-center ${
                    isSelected ? "border-accent bg-accent-soft" : "border-transparent hover:bg-stone-100"
                  }`}
                >
                  <span className="block text-[11px] text-stone-400">{day.weekday.slice(0, 1)}</span>
                  <span className={`block text-sm font-medium tabular-nums ${isSelected || isToday ? "text-accent" : ""}`}>
                    {day.dayNumber}
                  </span>
                  <span className={`mx-auto mt-0.5 block size-1 rounded-full ${isToday ? "bg-accent" : ""}`} />
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-stone-500">
            {kindOf(phoneDay.date) === "past"
              ? `${phoneDay.label}: done, and what was planned. Tap a row's day to open it in the calendar.`
              : `${kindOf(phoneDay.date) === "today" ? "Today" : phoneDay.label}: type the hours you plan.`}
          </p>

          <div className="mt-2 rounded-xl border border-stone-200 bg-white px-4 pb-2">
            {shownGroups.map((group) => (
              <div key={group.id}>
                <p className="pt-3 text-xs font-semibold text-stone-500">{group.name}</p>
                {group.categories.map((category) => {
                  const { goal, direction, isLimit } = rowFor(category);
                  const open = openGoalId === category.id;
                  return (
                    <div
                      key={category.id}
                      className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3 border-b border-stone-100 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                          <span>{category.name}</span>
                          {/* The goal, as a small chip; tap to change it */}
                          <button
                            type="button"
                            onClick={() => setOpenGoalId(open ? null : category.id)}
                            aria-expanded={open}
                            className={`rounded-full border px-2 py-px text-[11px] ${
                              open ? "border-accent text-accent" : "border-stone-200 text-stone-500"
                            }`}
                          >
                            {goal === null ? "Set goal" : `${formatHours(goal)} ${isLimit ? "limit" : "goal"}`}
                          </button>
                        </div>
                        {open && <div className="mt-2 w-36">{goalEditor(category)}</div>}
                        {goal !== null && <div className="-mt-1">{weekSummary(category)}</div>}
                      </div>
                      {dayCell(category, phoneDay, goal, direction)}
                    </div>
                  );
                })}
              </div>
            ))}
            {(() => {
              const { future, total } = dayTotal(phoneDay);
              return (
                <p className="flex justify-between border-t border-stone-200 pt-2 text-sm font-semibold">
                  <span>{future ? "Planned" : "Done"} this day</span>
                  <span className="tabular-nums">{total > 0 ? formatHours(total) : "–"}</span>
                </p>
              );
            })()}
          </div>
        </div>
      </div>

      {draft && (
        <PlanBlockDialog
          draft={draft}
          days={days.map((day) => ({ date: day.date, label: day.label }))}
          groups={groups}
          timeZone={timeZone}
          canPlan={canAddBlocks}
          canLog={canLog}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

// Show "Saved" for a moment, then clear it
function clearSavedLater(
  setStatus: (update: (current: Record<string, SaveStatus>) => Record<string, SaveStatus>) => void,
  key: string
) {
  setTimeout(() => {
    setStatus((current) => {
      if (current[key] !== "saved") {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, 2000);
}

type HoursFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  max: number;
  placeholder: string;
  label: string;
  status?: SaveStatus;
  // The goal field: tinted and outlined. Day fields are lighter.
  tinted?: boolean;
  compact?: boolean;
  // Joined to a button on its left (the goal's goal / limit switch)
  attached?: boolean;
};

// A number field for hours that saves when it loses focus (Enter does the same)
function HoursField({
  value,
  onChange,
  onFocus,
  onBlur,
  max,
  placeholder,
  label,
  status,
  tinted,
  compact,
  attached,
}: HoursFieldProps) {
  return (
    <div className="relative w-full">
      <input
        // Text, not a number field: a number field changes its value when you scroll over it.
        // inputMode still brings up the number keypad on phones.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        maxLength={5}
        placeholder={placeholder}
        aria-label={label}
        className={`w-full appearance-none border ${attached ? "rounded-r-md" : "rounded-md"} text-right text-sm font-medium tabular-nums outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder:font-normal placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-accent/30 ${
          compact ? "py-0.5 pl-1 pr-4" : "py-1 pl-2 pr-5"
        } ${tinted ? "bg-accent-soft/50" : "bg-white"} ${
          status === "error" ? "border-red-400" : tinted ? "border-accent/40" : "border-stone-200"
        }`}
      />
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">
        h
      </span>
      {/* Day fields are too small for the words; their red border shows a failed save */}
      {status && !compact && (
        <span
          className={`absolute -bottom-3.5 right-0 text-[10px] ${status === "error" ? "text-red-600" : "text-stone-400"}`}
        >
          {status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Not saved"}
        </span>
      )}
    </div>
  );
}

// The small line under a typed day: what's done (today), or how much is on the Plan calendar
function DayNote({ kind, scheduled, done }: { kind: "today" | "future"; scheduled: number; done: number }) {
  let text = "";
  let tone = "text-stone-400";

  if (kind === "today" && done > 0) {
    text = `${num(done)}h done`;
    tone = "text-accent";
  } else if (scheduled > 0) {
    text = `${num(scheduled)}h planned`;
  }

  // Always takes one line (even when empty), so the field above never moves
  return (
    <span className={`block h-3.5 max-w-full truncate text-center text-[11px] leading-3.5 ${tone}`}>{text}</span>
  );
}

// A past day for one category, in words: done, compared with the plan if there was one.
// If this day took the week past its goal, it says so: "over limit" for an "at most"
// goal, "extra" for an "at least" one. Clicking it opens that week in the calendar.
function PastCell({
  href,
  label,
  done,
  planned,
  goal,
  direction,
  doneBefore,
}: {
  href: string;
  label: string;
  done: number;
  planned: number;
  // The week's goal (null when there isn't one), its direction, and what was done earlier this week
  goal: number | null;
  direction: GoalDirection;
  doneBefore: number;
}) {
  let main = done > 0 ? `${num(done)}h` : "–";
  let mainTone = done > 0 ? "text-stone-900" : "text-stone-300";
  let note: { text: string; tone: string } | null = null;

  const doneAfter = doneBefore + done;
  const wentPast = goal !== null && done > 0 && doneAfter > goal;
  const pastBy = goal === null ? 0 : doneBefore >= goal ? done : doneAfter - goal;

  if (wentPast && direction === "at_most") {
    // Over a limit comes first: it's the thing to notice
    note = { text: doneBefore >= goal! ? "over limit" : `+${num(pastBy)}h over`, tone: "text-stone-500" };
  } else if (planned > 0) {
    if (done >= planned) {
      note = { text: "all done", tone: "text-accent" };
    } else {
      main = `${num(done)} of ${num(planned)}h`;
      mainTone = "text-stone-900";
      note = { text: `${num(planned - done)}h missed`, tone: "text-stone-500" };
    }
  } else if (wentPast) {
    note = { text: doneBefore >= goal! ? "extra" : `+${num(pastBy)}h extra`, tone: "text-stone-500" };
  } else if (goal !== null && goal > 0 && done > 0 && doneAfter === goal) {
    note = { text: "goal met", tone: "text-accent" };
  }

  return (
    <Link
      href={href}
      aria-label={`${label}: ${main}${note ? `, ${note.text}` : ""}. Open in the calendar.`}
      className="flex h-14 flex-col items-center justify-center gap-1 rounded-md border border-stone-200 bg-stone-100/70 px-1 text-center tabular-nums leading-tight transition-colors hover:bg-stone-200/70"
    >
      <span className={`whitespace-nowrap text-sm ${mainTone}`}>{main}</span>
      {note && <span className={`block max-w-full truncate text-[11px] leading-3.5 ${note.tone}`}>{note.text}</span>}
    </Link>
  );
}