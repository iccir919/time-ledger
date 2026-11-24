"use client";

import { useState } from "react";
import GoalStatusLabel from "@/components/goal-status-label";
import GoalBar from "@/components/goal-bar";
import { directionOf, goalProgress, goalStatus, overLimits, type GoalDirection } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import { saveDayPlan, saveGoal } from "./actions";
import WeekCalendar, { type CalendarBlock } from "./week-calendar";

// Columns: name, goal, week, days. The day calendar sits right after the days.
// How many days show depends on the screen, always around the selected day:
// 1 on phones and tablets, 3 on laptops (lg), 5 on wide screens (xl), all 7 on very wide (2xl).
// (No "grid" here, so the "now" row can switch between hidden and grid; GRID adds it.)
// (Written out in full, because Tailwind only finds class names it can see whole in the code.)
const COLUMNS =
  "items-center gap-2 grid-cols-[minmax(5.5rem,9rem)_7.5rem_minmax(7rem,9rem)_minmax(5.5rem,6.5rem)] lg:grid-cols-[minmax(6rem,9rem)_7.5rem_minmax(7rem,9rem)_repeat(3,minmax(5.5rem,6.5rem))] xl:grid-cols-[minmax(6rem,9rem)_7.5rem_minmax(7rem,9rem)_repeat(5,minmax(5.5rem,6.5rem))] 2xl:grid-cols-[minmax(6rem,9rem)_7.5rem_minmax(7rem,9rem)_repeat(7,minmax(5.5rem,6.5rem))]";

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

// "" (empty field) -> null; anything else -> a number of hours, never below 0
function hoursOrNull(text: string | undefined) {
  const trimmed = (text ?? "").trim();
  return trimmed === "" ? null : Math.max(0, Number(trimmed) || 0);
}

// The selected category on the selected day, in words, for the top of the day panel
function daySummary(kind: DayKind, done: number, planned: number, scheduled: number) {
  const toSchedule = Math.max(planned - scheduled, 0);
  if (kind === "past") {
    if (planned > 0) {
      return done >= planned
        ? `${formatHours(done)} done · all of the plan`
        : `${formatHours(done)} done of ${formatHours(planned)} planned · ${formatHours(planned - done)} missed`;
    }
    return done > 0 ? `${formatHours(done)} done` : "Nothing tracked";
  }
  const parts = [planned > 0 ? `${formatHours(planned)} planned` : "Nothing planned yet"];
  if (planned > 0) {
    parts.push(toSchedule > 0 ? `${formatHours(toSchedule)} to schedule` : "all scheduled");
  }
  if (kind === "today" && done > 0) {
    parts.push(`${formatHours(done)} done`);
  }
  return parts.join(" · ");
}

// A bar: solid = done, light = planned. Used in the header and the week column.
function Bar({
  done,
  planned,
  total,
  color,
  className,
}: {
  done: number;
  planned: number;
  total: number;
  color: string;
  className: string;
}) {
  const percent = (hours: number) => `${Math.min(hours / total, 1) * 100}%`;

  return (
    <div className={`flex overflow-hidden rounded-full bg-stone-100 ${className}`}>
      <span style={{ width: percent(done), backgroundColor: color }} />
      <span style={{ width: percent(planned), backgroundColor: `${color}55` }} />
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
  planned,
  plannedAhead,
  actual,
  typed,
  scheduled,
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
  // Each goal's direction, flipped right away by its min / max switch
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

  // A day's plan and the part still ahead use what's typed right now, so a cell reacts as you type
  const plannedAt = (key: string) => {
    const typedNow = hoursOrNull(dayText[key]);
    return typedNow === null ? (planned[key] ?? 0) : Math.max(typedNow, scheduledAt(key));
  };
  const aheadAt = (key: string, date: string) => {
    const typedNow = hoursOrNull(dayText[key]);
    if (typedNow === null || date < today) {
      return plannedAhead[key] ?? 0;
    }
    const plan = Math.max(typedNow, scheduledAt(key));
    if (date > today) {
      return plan;
    }
    // Today: the blocks still ahead (from the server) plus typed hours not scheduled yet
    const blocksAhead = Math.max((plannedAhead[key] ?? 0) - Math.max((typed[key] ?? 0) - scheduledAt(key), 0), 0);
    return blocksAhead + Math.max(typedNow - scheduledAt(key), 0);
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
  // "At most" goals that went over, for the callout in the header
  const overs = overLimits(goalRows);

  // The selected day (shown in the panel) and the category clicked, if any.
  // Starts on today, or the first day when viewing another week.
  const [selected, setSelected] = useState<{ date: string; categoryId: string | null }>(() => ({
    date: days.some((day) => day.date === today) ? today : days[0].date,
    categoryId: null,
  }));

  // The panel's ‹ › arrows: the day before or after, keeping the selected category
  function stepDay(offset: number) {
    const index = days.findIndex((day) => day.date === selected.date) + offset;
    if (days[index]) {
      setSelected((current) => ({ ...current, date: days[index].date }));
    }
  }

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

  // The min / max switch: flip the direction and save it with the goal
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
            <p className="mt-1 text-3xl font-semibold tabular-nums text-accent">{formatHours(doneTotal)}</p>
          </div>
          <div>
            <p className="text-sm text-stone-500">Planned ahead</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-400">
              {formatHours(aheadTotal)}
            </p>
          </div>
        </div>

        {/* Goal progress, beside the numbers (under them on narrow screens) */}
        {progress ? (
          <div className="min-w-64 flex-1 md:border-l md:border-stone-100 md:pl-10">
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-stone-600">
              <span>
                Goals: <span className="font-medium text-stone-900">{Number(progress.done.toFixed(2))}</span> of{" "}
                {formatHours(progress.total)}
              </span>
              <GoalStatusLabel status={progress.status} />
            </p>
            <Bar
              done={progress.done}
              planned={progress.ahead}
              total={progress.total}
              color="#2f6f68"
              className="mt-2 h-2"
            />
          </div>
        ) : (
          <p className="min-w-64 flex-1 text-sm text-stone-500 md:border-l md:border-stone-100 md:pl-10">
            {overs.length === 0 && "Set a weekly goal below to see your progress here."}
          </p>
        )}

        {/* Limits that went over, so they're seen without scrolling */}
        {overs.length > 0 && (
          <p className="w-full rounded-full bg-rose-50 px-3 py-1 text-sm text-rose-700 md:ml-auto md:w-auto">
            {overs.length} over limit:{" "}
            {overs.map((row) => `${row.name} +${formatHours(row.done - row.goal)}`).join(", ")}
          </p>
        )}
      </div>

      <p className="mt-6 text-sm text-stone-600">
        Type a weekly goal for each category, and the hours you plan for each day. Both save on their own.
      </p>

      {/* One card: the grid, then the selected day's calendar attached right after the days
          (below the grid on phones) */}
      <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white md:grid md:grid-cols-[auto_minmax(14rem,1fr)]">
        <div className="overflow-x-auto">
          <div className="p-4">
            {/* The "now" line: past days show what happened, later days show what's planned */}
            <NowBand dates={[selected.date]} today={today} className="grid lg:hidden" />
            <NowBand dates={windows.lg} today={today} className="hidden lg:grid xl:hidden" />
            <NowBand dates={windows.xl} today={today} className="hidden xl:grid 2xl:hidden" />
            <NowBand dates={dates} today={today} className="hidden 2xl:grid" />

            {/* Headers. Clicking a day selects it without a category. */}
            <div className={`${GRID} pb-2 text-sm text-stone-500`}>
              <span />
              <span className="text-center font-medium text-accent">Goal ✎</span>
              <span className="pl-1">Week</span>
              {days.map((day) => (
                <span key={day.date} className={dayClass(day.date)}>
                  <button
                    type="button"
                    onClick={() => setSelected({ date: day.date, categoryId: null })}
                    className={`w-full rounded-md py-1 text-center ${
                      day.date === today ? "bg-accent-soft font-semibold text-accent" : "hover:bg-stone-100"
                    } ${day.date === selected.date ? "ring-2 ring-accent/40" : ""}`}
                  >
                    {day.weekday} {day.dayNumber}
                  </button>
                </span>
              ))}
            </div>

            {groups.map((group) => (
              <div key={group.id} className="border-t border-stone-100 pt-2">
                <p className="px-1 pt-1 text-sm font-semibold">{group.name}</p>

                {group.categories.map((category) => {
                  const goal = goalOrNull(category.id);
                  const done = weekTotal(category.id, actualAt);
                  const ahead = weekTotal(category.id, aheadAt);
                  const direction = directionFor(category.id);
                  const isLimit = direction === "at_most";
                  const weekly = goal === null ? null : goalStatus(goal, done, ahead, direction);
                  const fieldStatus = goalStatusById[category.id];

                  return (
                    <div key={category.id} className={`${GRID} py-2`}>
                      <span className="flex items-center gap-2 px-1 text-sm">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
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
                          title={isLimit ? "Max: at most this many hours (a limit). Click for min." : "Min: at least this many hours. Click for max."}
                          aria-label={`${category.name} goal is ${isLimit ? "at most" : "at least"}. Switch.`}
                          className={`-mr-px h-[30px] w-9 shrink-0 rounded-l-md border text-xs font-medium ${
                            isLimit ? "border-rose-200 bg-rose-50 text-rose-700" : "border-accent/40 bg-white text-accent"
                          } hover:brightness-95 disabled:cursor-default disabled:opacity-70`}
                        >
                          {isLimit ? "max" : "min"}
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
                      <div className="pl-1 text-sm leading-snug">
                        {goal === null ? (
                          <p className={done > 0 ? "text-stone-600" : "text-stone-300"}>
                            {done > 0 ? `${formatHours(done)} done` : "–"}
                          </p>
                        ) : (
                          <>
                            <p>
                              <span
                                className={`font-medium ${isLimit && done > goal ? "text-rose-600" : "text-stone-900"}`}
                              >
                                {num(done)}
                              </span>
                              <span className="text-stone-500">
                                {" "}
                                of {formatHours(goal)}
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
                        {weekly && (
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
                              className={dayClass(day.date, "flex")}
                              onSelect={select}
                            />
                          );
                        }

                        return (
                          <div
                            key={day.date}
                            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 ${
                              kind === "today" ? "bg-accent-soft/60" : ""
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
                            <DayNote
                              kind={kind}
                              planned={dayPlan}
                              scheduled={scheduledAt(key)}
                              done={actualAt(key)}
                              typedSomething={hoursOrNull(dayText[key]) !== null}
                            />
                          </div>
                        );
                      })}

                    </div>
                  );
                })}
              </div>
            ))}

            {/* Totals per day: done for past days and today, planned for later days */}
            <div className={`${GRID} border-t border-stone-200 pt-2 text-sm font-semibold`}>
              <span className="px-1">Total</span>
              <span className="pr-5 text-right tabular-nums">{formatHours(goalTotal)}</span>
              <span />
              {days.map((day) => {
                const future = kindOf(day.date) === "future";
                const total = categories.reduce((sum, category) => {
                  const key = cellKey(category.id, day.date);
                  return sum + (future ? plannedAt(key) : actualAt(key));
                }, 0);
                return (
                  <span
                    key={day.date}
                    className={`text-center tabular-nums ${dayClass(day.date)} ${future ? "font-normal text-stone-400" : ""}`}
                  >
                    {total > 0 ? formatHours(total) : "–"}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* The day calendar: the selected day, with every category, to plan around */}
        <aside className="flex flex-col border-t border-stone-200 p-3 md:border-l md:border-t-0">
          <div className="flex items-center gap-1">
            <ArrowButton
              direction="previous"
              onClick={selectedIndex > 0 ? () => stepDay(-1) : undefined}
            />
            <h2 className="flex-1 text-center text-sm font-semibold">
              {selectedKind === "today" ? "Today · " : ""}
              {selectedDay.label}
            </h2>
            <ArrowButton
              direction="next"
              onClick={selectedIndex < days.length - 1 ? () => stepDay(1) : undefined}
            />
          </div>

          {selectedCategory && selectedKey && (
            <div className="mt-2 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
                {selectedCategory.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                {daySummary(
                  selectedKind,
                  actualAt(selectedKey),
                  plannedAt(selectedKey),
                  scheduledAt(selectedKey)
                )}
              </p>
            </div>
          )}

          {/* As tall as the grid on wider screens (scrolls, starting just before now); fixed on phones */}
          <div className="relative mt-2 h-[28rem] md:h-auto md:min-h-[22rem] md:flex-1">
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
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-400">Plan on the left, done on the right.</p>
        </aside>
      </div>
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
  // Joined to a button on its left (the goal's min / max switch)
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
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        min={0}
        max={max}
        step={0.25}
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

// The small line under a typed day: how the day's plan compares with its blocks (and, today, what's done)
function DayNote({
  kind,
  planned,
  scheduled,
  done,
  typedSomething,
}: {
  kind: "today" | "future";
  planned: number;
  scheduled: number;
  done: number;
  typedSomething: boolean;
}) {
  let text = "";
  let tone = "text-stone-400";

  if (planned > scheduled) {
    text = `${num(planned - scheduled)}h to schedule`;
    tone = "text-amber-600";
  } else if (kind === "today" && done > 0) {
    text = `${num(done)}h done`;
    tone = "text-accent";
  } else if (scheduled > 0) {
    // Blocks cover the plan: "all scheduled" if you typed it, otherwise just how much is scheduled
    text = typedSomething ? "all scheduled" : "scheduled";
    tone = typedSomething ? "text-accent" : "text-stone-400";
  }

  if (!text) {
    return null;
  }
  return <span className={`text-center text-[11px] leading-tight ${tone}`}>{text}</span>;
}

// A past day for one category, in words: done, compared with the plan if there was one.
// If this day took the week past its goal, it says so: "over limit" (rose) for an "at most"
// goal, "extra" for an "at least" one.
function PastCell({
  label,
  done,
  planned,
  goal,
  direction,
  doneBefore,
  selected,
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
    mainTone = "text-rose-600";
    note = { text: doneBefore >= goal! ? "over limit" : `+${num(pastBy)}h over`, tone: "text-rose-600" };
  } else if (planned > 0) {
    if (done >= planned) {
      note = { text: "all done", tone: "text-accent" };
    } else {
      main = `${num(done)} of ${num(planned)}h`;
      mainTone = "text-stone-900";
      note = { text: `${num(planned - done)}h missed`, tone: "text-amber-600" };
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
      className={`flex min-h-12 flex-col items-center justify-center rounded-md px-1 py-1 text-center tabular-nums leading-tight hover:bg-stone-50 ${
        selected ? "ring-2 ring-accent" : ""
      } ${className}`}
    >
      <span className={`whitespace-nowrap text-sm ${mainTone}`}>{main}</span>
      {note && <span className={`text-[11px] ${note.tone}`}>{note.text}</span>}
    </button>
  );
}

// The row above the day headers: a solid line under past days ("what happened"),
// "now" over today, and a dashed line under later days ("what's planned")
function NowBand({ dates, today, className }: { dates: string[]; today: string; className: string }) {
  const past = dates.filter((date) => date < today).length;
  const hasToday = dates.includes(today);
  const future = dates.filter((date) => date > today).length;
  const span = (count: number) => ({ gridColumn: `span ${count} / span ${count}` });

  return (
    <div className={`${COLUMNS} pb-1 text-[11px] ${className}`}>
      <span />
      <span />
      <span />
      {past > 0 && (
        <span style={span(past)} className="truncate border-b-2 border-accent/60 pb-0.5 text-center text-stone-500">
          what happened
        </span>
      )}
      {hasToday && <span className="pb-0.5 text-center font-semibold text-accent">now</span>}
      {future > 0 && (
        <span
          style={span(future)}
          className="truncate border-b-2 border-dashed border-stone-300 pb-0.5 text-center text-stone-400"
        >
          what&apos;s planned
        </span>
      )}
    </div>
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