"use client";

import { useCallback, useState } from "react";
import GoalStatusLabel from "@/components/goal-status-label";
import GoalBar from "@/components/goal-bar";
import { directionOf, goalProgress, goalStatus, overLimits, type GoalDirection } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import { saveDayPlan, saveGoal } from "./actions";
import PlanBlockDialog, { type BlockDraft } from "./plan-block-dialog";
import WeekCalendar, { draftAt, type CalendarBlock } from "./week-calendar";

// Columns: name, goal, week, days. The day calendar sits right after the days.
// How many days show depends on the screen, always around the selected day:
// 1 on phones and tablets, 3 on laptops (lg), 5 on wide screens (xl), all 7 on very wide (2xl).
// (No "grid" here, so the "now" row can switch between hidden and grid; GRID adds it.)
// (Written out in full, because Tailwind only finds class names it can see whole in the code.)
const COLUMNS =
  "items-center gap-2 grid-cols-[minmax(5.5rem,9rem)_8rem_minmax(7rem,9rem)_minmax(5.5rem,6.5rem)] lg:grid-cols-[minmax(6rem,9rem)_8rem_minmax(7rem,9rem)_repeat(3,minmax(5.5rem,6.5rem))] xl:grid-cols-[minmax(6rem,9rem)_8rem_minmax(7rem,9rem)_repeat(5,minmax(5.5rem,6.5rem))] 2xl:grid-cols-[minmax(6rem,9rem)_8rem_minmax(7rem,9rem)_repeat(7,minmax(5.5rem,6.5rem))]";

// The days shown at each screen size: a run of `count` days around the selected one,
// kept inside the week. Bigger runs always include the smaller ones.
function dayWindow(dates: string[], selectedDate: string, count: number) {
  const index = Math.max(dates.indexOf(selectedDate), 0);
  const start = Math.min(Math.max(index - Math.floor(count / 2), 0), Math.max(dates.length - count, 0));
  return dates.slice(start, start + count);
}

const GRID = `grid ${COLUMNS}`;


type GridDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  // e.g. "Fri, Nov 27", for the popup's day picker and the panel's title
  label: string;
  // Midnight to midnight, for the panel's calendar
  startMs: number;
  endMs: number;
};

type GridGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

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
  // The week's tracked events and plan blocks, for the day panel's calendar
  blocks: CalendarBlock[];
  // Adding plan blocks needs a Plan calendar
  canAddBlocks: boolean;
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

// The selected category on the selected day, in words, for the top of the day panel
function daySummary(kind: DayKind, done: number, planned: number) {
  if (kind === "past") {
    if (planned > 0) {
      return done >= planned
        ? `${formatHours(done)} done · all of the plan`
        : `${formatHours(done)} done of ${formatHours(planned)} planned · ${formatHours(planned - done)} missed`;
    }
    return done > 0 ? `${formatHours(done)} done` : "Nothing tracked";
  }
  const parts = [planned > 0 ? `${formatHours(planned)} planned` : "Nothing planned yet"];
  if (kind === "today" && done > 0) {
    parts.push(`${formatHours(done)} done`);
  }
  return parts.join(" · ");
}

// The header's bar for the whole week, with a 0 mark. To the right of 0: progress toward
// min goals (solid = done, light = planned ahead). To the left of 0, below zero: time past
// max limits (the week's time debt), striped in gray.
// The total of the goals is labeled at the end; hovering shows the details in words.
function WeekBar({
  done,
  ahead,
  total,
  over,
  details,
}: {
  done: number;
  ahead: number;
  total: number;
  over: number;
  details: string;
}) {
  const span = Math.max(over + total, 0.01);
  const percent = (hours: number) => `${(hours / span) * 100}%`;
  const zero = percent(over);

  return (
    <div title={details} aria-label={details} className="relative mt-3 mb-4 h-2 cursor-default rounded-full bg-stone-100">
      {over > 0 && (
        <span
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{
            width: zero,
            background: "repeating-linear-gradient(135deg, #a8a29e 0 3px, #e7e5e4 3px 6px)",
          }}
        />
      )}
      <span className="absolute inset-y-0 bg-[#2f6f68]" style={{ left: zero, width: percent(done) }} />
      <span
        className="absolute inset-y-0 bg-[#6f9d94]"
        style={{ left: `calc(${zero} + ${percent(done)})`, width: percent(ahead) }}
      />
      {/* The 0 mark, only needed when there's something below zero */}
      {over > 0 && (
        <>
          <span className="absolute -inset-y-1 border-l-2 border-stone-700" style={{ left: zero }} />
          <span className="absolute top-3.5 -translate-x-1/2 text-[10px] leading-none text-stone-400" style={{ left: zero }}>
            0
          </span>
        </>
      )}
      {/* The goals' total at the end of the bar */}
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
  blocks,
  canAddBlocks,
  timeZone,
  nowMinutes,
}: WeekGridProps) {
  const categories = groups.flatMap((group) => group.categories);

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
  // A goal of 0 is always "at most"; an empty goal keeps whatever the switch says
  const directionFor = (categoryId: string): GoalDirection => {
    const goal = goalOrNull(categoryId);
    return goal === null ? (directionById[categoryId] ?? "at_least") : directionOf(goal, directionById[categoryId]);
  };

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

  // The Total row adds up "at least" goals only; limits aren't something to fill
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
      name: category.name,
      goal: goalFor(category.id),
      done: weekTotal(category.id, actualAt),
      ahead: weekTotal(category.id, aheadAt),
      direction: directionFor(category.id),
    }));
  const progress = goalProgress(goalRows);
  // Time past "at most" limits, added up: the week's time debt, shown below zero in the header
  const overTotal = overLimits(goalRows).reduce((sum, row) => sum + (row.done - row.goal), 0);
  // "Done this week" leaves out time past limits: that shows on its own, as "Over limit"
  const doneCounted = doneTotal - overTotal;

  // The selected day (shown in the panel) and the category clicked, if any.
  // Starts on today, or the first day when viewing another week.
  const [selected, setSelected] = useState<{ date: string; categoryId: string | null }>(() => ({
    date: days.some((day) => day.date === today) ? today : days[0].date,
    categoryId: null,
  }));

  // A block being added from the panel's "+ Add" button, or null when that popup is closed
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const closeDialog = useCallback(() => setDraft(null), []);

  // "+ Add": a block on the selected day, at the next full hour today or 9 AM on other days,
  // with the selected category (if any)
  function addBlock() {
    const start = selected.date === today && nowMinutes !== null ? Math.ceil(nowMinutes / 60) * 60 : 9 * 60;
    setDraft({ ...draftAt(selected.date, start), categoryId: selected.categoryId ?? undefined });
  }

  // The panel's ‹ › arrows: the day before or after, keeping the selected category
  function stepDay(offset: number) {
    const index = days.findIndex((day) => day.date === selected.date) + offset;
    if (days[index]) {
      setSelected((current) => ({ ...current, date: days[index].date }));
    }
  }

  // The day column under the pointer: its background gets a soft highlight (see DayColumns)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const hoverProps = (date: string) => ({
    onMouseEnter: () => setHoveredDate(date),
    onMouseLeave: () => setHoveredDate((current) => (current === date ? null : current)),
  });

  // Dates are "YYYY-MM-DD", so comparing them as text puts them in order
  const kindOf = (date: string): DayKind => (date === today ? "today" : date > today ? "future" : "past");

  // Which days show at each screen size (see COLUMNS)
  const dates = days.map((day) => day.date);
  const windows = {
    lg: dayWindow(dates, selected.date, 3),
    xl: dayWindow(dates, selected.date, 5),
  };
  // A day's classes: shown from the smallest screen size whose run includes it.
  // Cells are flex boxes, so they ask for "flex" instead of "block".
  const dayClass = (date: string, display: "block" | "flex" = "block") => {
    if (date === selected.date) {
      return "";
    }
    if (windows.lg.includes(date)) {
      return display === "flex" ? "hidden lg:flex" : "hidden lg:block";
    }
    if (windows.xl.includes(date)) {
      return display === "flex" ? "hidden xl:flex" : "hidden xl:block";
    }
    return display === "flex" ? "hidden 2xl:flex" : "hidden 2xl:block";
  };

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

  const selectedDay = days.find((day) => day.date === selected.date) ?? days[0];
  const selectedIndex = days.indexOf(selectedDay);
  const selectedKind = kindOf(selectedDay.date);
  const selectedCategory = categories.find((c) => c.id === selected.categoryId) ?? null;
  const selectedKey = selectedCategory ? cellKey(selectedCategory.id, selectedDay.date) : null;

  return (
    <div className="mt-6">
      {/* Header: the week's two facts (done, planned ahead), and goal progress beside them */}
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex gap-x-10">
          <div>
            <p className="text-sm text-stone-500">Done this week</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-accent">{formatHours(doneCounted)}</p>
          </div>
          <div>
            <p className="text-sm text-stone-500">Planned ahead</p>
            {/* The same light teal as the planned part of the Goals bar */}
            <p className="mt-1 text-3xl font-semibold tabular-nums text-[#6f9d94]">
              {formatHours(aheadTotal)}
            </p>
          </div>
          {/* Time past limits, as a negative number, kept quiet. Only shows when something went over. */}
          {overTotal > 0 && (
            <div>
              <p className="text-sm text-stone-500">Over limit</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-400">−{formatHours(overTotal)}</p>
            </div>
          )}
        </div>

        {/* Goal progress, beside the numbers (under them on narrow screens) */}
        {progress || overTotal > 0 ? (
          <div className="min-w-64 flex-1 md:border-l md:border-stone-100 md:pl-10">
            <p className="text-sm text-stone-500">Goals</p>
            {/* The details are on hover, to keep the header quiet */}
            <WeekBar
              done={progress?.done ?? 0}
              ahead={progress?.ahead ?? 0}
              total={progress?.total ?? 0}
              over={overTotal}
              details={[
                progress ? `${num(progress.done)} of ${formatHours(progress.total)} done` : null,
                progress ? progress.status.text : null,
                overTotal > 0 ? `${formatHours(overTotal)} over limit` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>
        ) : (
          <p className="min-w-64 flex-1 text-sm text-stone-500 md:border-l md:border-stone-100 md:pl-10">
            Set a weekly goal below to see your progress here.
          </p>
        )}
      </div>

      <p className="mt-6 text-sm text-stone-600">
        Type a weekly goal for each category, and the hours you plan for each day. Both save on their own.
      </p>

      {/* One card: the grid, then the selected day's calendar attached right after the days
          (below the grid on phones) */}
      {/* (Nothing here clips or scrolls on tablets and up, so the headers can stick to the top of the
          window. Phones keep sideways scrolling for the grid, so they don't get sticky headers.) */}
      <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white md:grid md:grid-cols-[auto_minmax(14rem,1fr)] md:overflow-visible">
        <div className="overflow-x-auto md:overflow-visible">
          <div className="relative px-4 pb-4">
            {/* Full-height backgrounds behind each day's column: a soft highlight on hover (and on the
                selected day), and clicking anywhere in the column, gaps included, shows that day */}
            <div className={`${GRID} pointer-events-none absolute inset-y-0 left-4 right-4`}>
              <span />
              <span />
              <span />
              {days.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  {...hoverProps(day.date)}
                  onClick={() => setSelected((current) => ({ ...current, date: day.date }))}
                  className={`pointer-events-auto self-stretch rounded-lg transition-colors ${dayClass(day.date)} ${
                    // (The tiles have borders, so they still show on top of this)
                    hoveredDate === day.date
                      ? "bg-stone-100"
                      : day.date === selected.date
                        ? "bg-accent-soft/30"
                        : ""
                  }`}
                />
              ))}
            </div>

            {/* The column headers stay at the top of the window while you scroll, on a darker band */}
            <div className="sticky top-0 z-10 -mx-4 rounded-tl-xl border-b border-stone-200 bg-stone-100 px-4 pt-3">
            {/* Headers. Clicking a day selects it without a category. */}
            <div className={`${GRID} pb-2 text-sm text-stone-500`}>
              <span />
              <span className="text-center font-medium text-accent">Goal ✎</span>
              <span className="pl-1">Week</span>
              {days.map((day) => (
                <span key={day.date} className={dayClass(day.date)}>
                  <button
                    type="button"
                    {...hoverProps(day.date)}
                    onClick={() => setSelected({ date: day.date, categoryId: null })}
                    className={`w-full rounded-md py-1.5 text-center text-base font-medium ${
                      day.date === today ? "bg-accent-soft font-semibold text-accent" : "text-stone-600"
                    } ${day.date === selected.date ? "ring-2 ring-accent/40" : ""}`}
                  >
                    {day.weekday} {day.dayNumber}
                  </button>
                </span>
              ))}
            </div>
            </div>

            {groups.map((group) => (
              <div key={group.id} className="border-t border-stone-100 pt-2">
                <p className="px-1 pt-1 font-semibold">{group.name}</p>

                {group.categories.map((category) => {
                  const goal = goalOrNull(category.id);
                  const done = weekTotal(category.id, actualAt);
                  const ahead = weekTotal(category.id, aheadAt);
                  const direction = directionFor(category.id);
                  const isLimit = direction === "at_most";
                  const weekly = goal === null ? null : goalStatus(goal, done, ahead, direction);
                  const fieldStatus = goalStatusById[category.id];

                  return (
                    // Positioned so it sits above the column backgrounds; the row itself lets clicks through
                    // (to the column behind), while everything in it still takes them
                    <div key={category.id} className={`${GRID} pointer-events-none relative py-2 *:pointer-events-auto`}>
                      <span className="flex items-center gap-2.5 px-1 text-base">
                        <span
                          className="size-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="truncate">{category.name}</span>
                      </span>

                      {/* The goal: tinted and outlined so it reads as something to type in */}
                      <div className="flex items-center">
                        {/* min: at least (work toward it), or max: at most (a limit). 0 is always a limit. */}
                        <button
                          type="button"
                          onClick={() => flipDirection(category.id)}
                          disabled={goal === 0}
                          title={isLimit ? "Limit: at most this many hours. Click to make it a goal." : "Goal: at least this many hours. Click to make it a limit."}
                          aria-label={`${category.name} is a ${isLimit ? "limit (at most)" : "goal (at least)"}. Switch.`}
                          className={`-mr-px h-[30px] w-11 shrink-0 rounded-l-md border text-xs font-medium ${
                            "border-accent/40 bg-white text-stone-500"
                          } hover:brightness-95 disabled:cursor-default disabled:opacity-70`}
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
                        status={fieldStatus}
                        tinted
                        attached
                      />
                      </div>

                      {/* Week: done of goal, the bar, then the status (gray text, colored dot) */}
                      <div className="flex min-h-14 flex-col justify-center pl-1 text-sm leading-snug">
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
                            <GoalBar
                              goal={goal}
                              done={done}
                              ahead={ahead}
                              direction={direction}
                              color={category.color}
                              className="mt-1.5"
                            />
                          </>
                        )}
                        {/* "Over limit" stays out: the line above already says it */}
                        {weekly && weekly.tone !== "over" && (
                          <p className="mt-1 text-xs">
                            <GoalStatusLabel status={weekly} />
                          </p>
                        )}
                      </div>

                      {/* Days: type today's and later days' plans; past days show what happened */}
                      {days.map((day) => {
                        const key = cellKey(category.id, day.date);
                        const kind = kindOf(day.date);
                        const isSelected = selected.date === day.date && selected.categoryId === category.id;
                        const select = () => setSelected({ date: day.date, categoryId: category.id });
                        const dayPlan = plannedAt(key);

                        if (kind === "past") {
                          return (
                            <PastCell
                              key={day.date}
                              label={`${category.name}, ${day.label}`}
                              done={actualAt(key)}
                              planned={dayPlan}
                              goal={goal}
                              direction={direction}
                              doneBefore={days
                                .filter((d) => d.date < day.date)
                                .reduce((sum, d) => sum + actualAt(cellKey(category.id, d.date)), 0)}
                              selected={isSelected}
                              hoverProps={hoverProps(day.date)}
                              className={dayClass(day.date, "flex")}
                              onSelect={select}
                            />
                          );
                        }

                        return (
                          // A fixed size, so typing doesn't change it. Clicking anywhere on the tile
                          // types into it (and shows that day in the calendar).
                          <div
                            key={day.date}
                            {...hoverProps(day.date)}
                            onClick={(event) => event.currentTarget.querySelector("input")?.focus()}
                            className={`flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-stone-200 px-1 ${
                              kind === "today" ? "bg-accent-soft/60" : "bg-stone-100/70"
                            } ${isSelected ? "ring-2 ring-accent" : ""} ${dayClass(day.date, "flex")}`}
                          >
                            <HoursField
                              value={dayText[key] ?? ""}
                              onChange={(value) => setDayText((current) => ({ ...current, [key]: value }))}
                              onFocus={() => {
                                setEditingKey(key);
                                select();
                              }}
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
                      })}

                    </div>
                  );
                })}
              </div>
            ))}

            {/* Totals per day: done for past days and today, planned for later days */}
            <div className={`${GRID} pointer-events-none relative border-t border-stone-200 pt-2 text-sm font-semibold *:pointer-events-auto`}>
              <span className="px-1">Total</span>
              <span className="pr-5 text-right tabular-nums">{formatHours(goalTotal)}</span>
              <span />
              {days.map((day) => {
                const future = kindOf(day.date) === "future";
                const total = categories.reduce((sum, category) => {
                  const key = cellKey(category.id, day.date);
                  return sum + (future ? plannedAt(key) : actualAt(key));
                }, 0);
                // Clicking a total shows that day in the calendar, like its header
                return (
                  <button
                    type="button"
                    key={day.date}
                    {...hoverProps(day.date)}
                    onClick={() => setSelected({ date: day.date, categoryId: null })}
                    className={`rounded-md py-1 text-center tabular-nums ${dayClass(day.date)} ${future ? "font-normal text-stone-400" : ""}`}
                  >
                    {total > 0 ? formatHours(total) : "–"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* The day calendar: the selected day, with every category, to plan around */}
        {/* On wider screens it stays in view while you scroll and is about a screen tall,
            instead of stretching down the whole grid */}
        <aside className="flex flex-col border-t border-stone-200 p-3 md:sticky md:top-4 md:h-[calc(100vh-2rem)] md:max-h-[48rem] md:self-start md:border-l md:border-t-0">
          <div className="flex items-center gap-1">
            <ArrowButton
              direction="previous"
              onClick={selectedIndex > 0 ? () => stepDay(-1) : undefined}
            />
            <h2 className="flex-1 truncate text-center text-sm font-semibold">
              {/* Short, so it fits beside the arrows and "+ Add"; the calendar below shows the date */}
              {selectedKind === "today" ? "Today" : `${selectedDay.weekday} ${selectedDay.dayNumber}`}
            </h2>
            <ArrowButton
              direction="next"
              onClick={selectedIndex < days.length - 1 ? () => stepDay(1) : undefined}
            />
            {/* Small, in the top row. Later an "Add event" button can sit beside it. */}
            {canAddBlocks && selectedKind !== "past" && (
              <button
                type="button"
                onClick={addBlock}
                className="ml-1 shrink-0 rounded-md border border-stone-200 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
              >
                + Add
              </button>
            )}
          </div>

          {selectedCategory && selectedKey && (
            <div className="mt-2 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
                {selectedCategory.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                {daySummary(selectedKind, actualAt(selectedKey), plannedAt(selectedKey))}
              </p>
            </div>
          )}

          {/* Fills the rest of the panel on wider screens (scrolls, starting just before now); fixed on phones */}
          <div className="relative mt-2 h-[28rem] md:h-auto md:min-h-0 md:flex-1">
            <div className="absolute inset-0">
              <WeekCalendar
                key={selectedDay.date}
                days={[{ ...selectedDay }]}
                today={today}
                mobileDates={[selectedDay.date]}
                nowMinutes={selectedKind === "today" ? nowMinutes : null}
                blocks={blocks}
                canAddBlocks={canAddBlocks && selectedKind !== "past"}
                groups={groups}
                timeZone={timeZone}
                fillHeight
                defaultCategoryId={selected.categoryId ?? undefined}
                hideAddButton
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-400">Plan on the left, done on the right.</p>
        </aside>
      </div>

      {draft && (
        <PlanBlockDialog
          draft={draft}
          days={days.map((day) => ({ date: day.date, label: day.label }))}
          groups={groups}
          timeZone={timeZone}
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
// goal, "extra" for an "at least" one.
function PastCell({
  label,
  done,
  planned,
  goal,
  direction,
  doneBefore,
  selected,
  hoverProps,
  className,
  onSelect,
}: {
  label: string;
  done: number;
  planned: number;
  // The week's goal (null when there isn't one), its direction, and what was done earlier this week
  goal: number | null;
  direction: GoalDirection;
  doneBefore: number;
  selected: boolean;
  hoverProps: { onMouseEnter: () => void; onMouseLeave: () => void };
  className: string;
  onSelect: () => void;
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
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${label}: ${main}${note ? `, ${note.text}` : ""}. Show this day.`}
      aria-pressed={selected}
      {...hoverProps}
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md border border-stone-200 bg-stone-100/70 px-1 text-center tabular-nums leading-tight ${
        selected ? "ring-2 ring-accent" : ""
      } ${className}`}
    >
      <span className={`whitespace-nowrap text-sm ${mainTone}`}>{main}</span>
      {note && <span className={`block max-w-full truncate text-[11px] leading-3.5 ${note.tone}`}>{note.text}</span>}
    </button>
  );
}

// ‹ or ›, grayed out (and doing nothing) at the start or end of the week
function ArrowButton({ direction, onClick }: { direction: "previous" | "next"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={direction === "previous" ? "Previous day" : "Next day"}
      className="flex size-8 items-center justify-center rounded-md text-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:text-stone-200 disabled:hover:bg-transparent"
    >
      {direction === "previous" ? "‹" : "›"}
    </button>
  );
}