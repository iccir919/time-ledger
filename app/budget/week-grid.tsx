"use client";

import { useState } from "react";
import GoalStatusLabel from "@/components/goal-status-label";
import { goalProgress, goalStatus } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import { saveGoal } from "./actions";

// Columns: name, goal, days, week. Phones show 3 days, wider screens all 7.
// The name column has a max width; the week column takes the leftover space.
const COLUMNS =
  "grid items-center gap-2 grid-cols-[minmax(5.5rem,7rem)_4.5rem_repeat(3,2.75rem)_minmax(7.5rem,1fr)] md:grid-cols-[minmax(8rem,10rem)_5.5rem_repeat(7,minmax(3rem,3.75rem))_minmax(12rem,1fr)]";

type GridDay = {
  date: string;
  weekday: string;
  dayNumber: string;
};

type GridGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

type WeekGridProps = {
  weekStart: string;
  groups: GridGroup[];
  days: GridDay[];
  // The 3 days a phone shows
  mobileDates: string[];
  today: string;
  // Weekly goals, keyed by category ID. A category with no goal isn't in here; 0 is a real goal.
  goals: Record<string, number>;
  // Hours keyed by "<categoryId>:<date>": planned (the whole day's plan),
  // plannedAhead (the part of that plan still after now), and actual (tracked)
  planned: Record<string, number>;
  plannedAhead: Record<string, number>;
  actual: Record<string, number>;
};

type SaveStatus = "saving" | "saved" | "error";

function cellKey(categoryId: string, date: string) {
  return `${categoryId}:${date}`;
}

// 2.25 -> "2.25", 0 -> "–"
function shortHours(hours: number) {
  return hours > 0 ? String(Number(hours.toFixed(2))) : "–";
}

function goalsAsText(goals: Record<string, number>) {
  const text: Record<string, string> = {};
  for (const [categoryId, hours] of Object.entries(goals)) {
    text[categoryId] = String(hours);
  }
  return text;
}

// A bar: solid = done, light = planned. Used small in day cells and bigger in the week column.
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
  mobileDates,
  today,
  goals,
  planned,
  plannedAhead,
  actual,
}: WeekGridProps) {
  const categories = groups.flatMap((group) => group.categories);

  // Each goal's text, so a field can be empty while you type
  const [goalText, setGoalText] = useState<Record<string, string>>(() => goalsAsText(goals));
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  // The goal field being typed in, so new values from the server don't overwrite it
  const [editingId, setEditingId] = useState<string | null>(null);

  // When the server sends new goals (after a save, or "Copy last week's goals"), take them,
  // except in the field you're typing in. This is React's "adjust state when a prop changes" pattern.
  const [lastGoals, setLastGoals] = useState(goals);
  if (goals !== lastGoals) {
    setLastGoals(goals);
    setGoalText((current) => {
      const next = goalsAsText(goals);
      if (editingId) {
        next[editingId] = current[editingId] ?? "";
      }
      return next;
    });
  }

  // null when the field is empty (no goal); 0 is a real goal
  const goalOrNull = (categoryId: string) => {
    const text = (goalText[categoryId] ?? "").trim();
    return text === "" ? null : Math.max(0, Number(text) || 0);
  };
  const goalFor = (categoryId: string) => goalOrNull(categoryId) ?? 0;
  const read = (values: Record<string, number>) => (key: string) => values[key] ?? 0;
  const plannedAt = read(planned);
  const aheadAt = read(plannedAhead);
  const actualAt = read(actual);

  const weekTotal = (categoryId: string, at: (key: string) => number) =>
    days.reduce((sum, day) => sum + at(cellKey(categoryId, day.date)), 0);

  const goalTotal = categories.reduce((sum, category) => sum + goalFor(category.id), 0);
  const doneTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, actualAt), 0);
  const aheadTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, aheadAt), 0);

  // Progress toward goals, for the header (null when there are no goals)
  const progress = goalProgress(
    categories
      .filter((category) => goalOrNull(category.id) !== null)
      .map((category) => ({
        goal: goalFor(category.id),
        done: weekTotal(category.id, actualAt),
        ahead: weekTotal(category.id, aheadAt),
      }))
  );

  // Hide the days a phone doesn't show
  const dayClass = (date: string) => (mobileDates.includes(date) ? "" : "hidden md:block");
  // Dates are "YYYY-MM-DD", so comparing them as text puts them in order
  const isFuture = (date: string) => date > today;

  // Save one goal when its field loses focus, if it changed
  async function save(categoryId: string) {
    setEditingId(null);
    const hours = goalOrNull(categoryId);
    if (hours === (goals[categoryId] ?? null)) {
      return;
    }

    setStatus((current) => ({ ...current, [categoryId]: "saving" }));
    const result = await saveGoal(weekStart, categoryId, hours);
    setStatus((current) => ({ ...current, [categoryId]: result.error ? "error" : "saved" }));

    // Let "Saved" show for a moment, then clear it
    if (!result.error) {
      setTimeout(() => {
        setStatus((current) => {
          if (current[categoryId] !== "saved") {
            return current;
          }
          const next = { ...current };
          delete next[categoryId];
          return next;
        });
      }, 2000);
    }
  }

  return (
    <div className="mt-6">
      {/* Header: two facts (done, planned ahead), then goal progress if there are goals */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <p className="text-sm text-stone-500">Done</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-accent">{formatHours(doneTotal)}</p>
          </div>
          <div>
            <p className="text-sm text-stone-500">Planned ahead</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-400">
              {formatHours(aheadTotal)}
            </p>
          </div>
        </div>

        {progress ? (
          <div className="mt-4">
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
          <p className="mt-4 text-sm text-stone-500">Set a weekly goal below to see your progress here.</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-600">
        <span>Type a weekly goal for each category. It saves on its own.</span>
        <span className="flex items-center gap-2 text-xs text-stone-500">
          <span className="h-1.5 w-4 rounded-full bg-accent" /> done
          <span className="ml-2 h-1.5 w-4 rounded-full bg-accent/35" /> planned
        </span>
      </div>

      {/* Grid. Scrolls sideways if it still doesn't fit. */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="min-w-[24rem] p-4 md:min-w-[54rem]">
          {/* Headers */}
          <div className={`${COLUMNS} pb-2 text-sm text-stone-500`}>
            <span />
            <span className="text-center font-medium text-accent">Goal ✎</span>
            {days.map((day) => (
              <span
                key={day.date}
                className={`rounded-md py-1 text-center ${dayClass(day.date)} ${
                  day.date === today ? "bg-accent-soft font-semibold text-accent" : ""
                }`}
              >
                {day.weekday} {day.dayNumber}
              </span>
            ))}
            <span className="pl-2">Week</span>
          </div>

          {groups.map((group) => (
            <div key={group.id} className="border-t border-stone-100 pt-2">
              <p className="px-1 pt-1 text-sm font-semibold">{group.name}</p>

              {group.categories.map((category) => {
                const goal = goalOrNull(category.id);
                const done = weekTotal(category.id, actualAt);
                const ahead = weekTotal(category.id, aheadAt);
                const weekly = goal === null ? null : goalStatus(goal, done, ahead);
                const fieldStatus = status[category.id];

                return (
                  <div key={category.id} className={`${COLUMNS} py-2`}>
                    <span className="flex items-center gap-2 px-1 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate">{category.name}</span>
                    </span>

                    {/* The goal: tinted and outlined so it reads as something to type in */}
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={goalText[category.id] ?? ""}
                        onChange={(event) =>
                          setGoalText((current) => ({
                            ...current,
                            [category.id]: event.target.value,
                          }))
                        }
                        onFocus={() => setEditingId(category.id)}
                        onBlur={() => save(category.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        min={0}
                        max={168}
                        step={0.25}
                        placeholder="Set"
                        aria-label={`Weekly goal for ${category.name}, in hours`}
                        className={`w-full rounded-md border bg-accent-soft/50 py-1 pl-2 pr-5 text-right text-sm font-medium tabular-nums outline-none placeholder:font-normal placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-accent/30 ${
                          fieldStatus === "error" ? "border-red-400" : "border-accent/40"
                        }`}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">
                        h
                      </span>
                      {fieldStatus && (
                        <span
                          className={`absolute -bottom-3.5 right-0 text-[10px] ${
                            fieldStatus === "error" ? "text-red-600" : "text-stone-400"
                          }`}
                        >
                          {fieldStatus === "saving" ? "Saving" : fieldStatus === "saved" ? "Saved" : "Not saved"}
                        </span>
                      )}
                    </div>

                    {/* Days: one number (done, or planned for future days), plus a tiny bar when there's a plan */}
                    {days.map((day) => (
                      <DayCell
                        key={day.date}
                        label={`${day.weekday} ${day.dayNumber}`}
                        kind={day.date === today ? "today" : isFuture(day.date) ? "future" : "past"}
                        done={actualAt(cellKey(category.id, day.date))}
                        planned={plannedAt(cellKey(category.id, day.date))}
                        ahead={aheadAt(cellKey(category.id, day.date))}
                        color={category.color}
                        className={dayClass(day.date)}
                      />
                    ))}

                    {/* Week: done of goal, the bar, then the status (gray text, colored dot) */}
                    <div className="pl-2 text-sm leading-snug">
                      {goal === null ? (
                        <p className={done > 0 ? "text-stone-600" : "text-stone-300"}>
                          {done > 0 ? `${formatHours(done)} done` : "–"}
                        </p>
                      ) : goal === 0 ? (
                        // A limit: no bar, since a bar toward zero can never fill
                        <p>
                          <span className="font-medium text-stone-900">{formatHours(done)}</span>
                          <span className="text-stone-500"> · limit 0h</span>
                        </p>
                      ) : (
                        <>
                          <p>
                            <span className="font-medium text-stone-900">{Number(done.toFixed(2))}</span>
                            <span className="text-stone-500"> of {formatHours(goal)}</span>
                          </p>
                          <Bar
                            done={done}
                            planned={ahead}
                            total={goal}
                            color={category.color}
                            className="mt-1.5 h-2"
                          />
                        </>
                      )}
                      {weekly && (
                        <p className="mt-1 text-xs">
                          <GoalStatusLabel status={weekly} />
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Totals per day: done, or planned for future days */}
          <div className={`${COLUMNS} border-t border-stone-200 pt-2 text-sm font-semibold`}>
            <span className="px-1">Total</span>
            <span className="pr-5 text-right tabular-nums">{formatHours(goalTotal)}</span>
            {days.map((day) => {
              const future = isFuture(day.date);
              const total = categories.reduce(
                (sum, category) =>
                  sum + (future ? plannedAt : actualAt)(cellKey(category.id, day.date)),
                0
              );
              return (
                <span
                  key={day.date}
                  className={`text-center tabular-nums ${dayClass(day.date)} ${future ? "font-normal text-stone-400" : ""}`}
                >
                  {total > 0 ? formatHours(total) : "–"}
                </span>
              );
            })}
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

type DayCellProps = {
  label: string;
  kind: "past" | "today" | "future";
  done: number;
  // The whole day's plan, and the part of it still after now
  planned: number;
  ahead: number;
  color: string;
  className: string;
};

// One day for one category: a number, plus a tiny bar comparing it to the plan.
// Hover (or tap) for the exact figures.
function DayCell({ label, kind, done, planned, ahead, color, className }: DayCellProps) {
  let number = done;
  let bar: { done: number; planned: number; total: number } | null = null;
  let detail = done > 0 ? `${label}: ${formatHours(done)} done` : `${label}: nothing tracked`;

  if (kind === "future") {
    // Nothing done yet: show what's planned, in gray
    number = planned;
    if (planned > 0) {
      bar = { done: 0, planned, total: planned };
      detail = `${label}: ${formatHours(planned)} planned`;
    } else {
      detail = `${label}: nothing planned`;
    }
  } else if (kind === "today" && ahead > 0) {
    // Done so far, and what's still planned for later today
    bar = { done, planned: ahead, total: done + ahead };
    detail = `${label}: ${formatHours(done)} done, ${formatHours(ahead)} still planned`;
  } else if (planned > 0) {
    // A past day (or today with nothing left): how much of the plan got done
    bar = { done: Math.min(done, planned), planned: Math.max(planned - done, 0), total: planned };
    detail = `${label}: ${formatHours(done)} done of ${formatHours(planned)} planned`;
  }

  return (
    <div
      title={detail}
      className={`rounded-md px-1 py-1 text-center tabular-nums ${className} ${
        kind === "today" ? "bg-accent-soft/60" : ""
      }`}
    >
      <p
        className={`text-sm ${
          number === 0 ? "text-stone-300" : kind === "future" ? "text-stone-400" : "text-stone-800"
        }`}
      >
        {shortHours(number)}
      </p>
      {bar && (
        <Bar
          done={bar.done}
          planned={bar.planned}
          total={bar.total}
          color={color}
          className="mx-auto mt-1 h-1 w-full max-w-10"
        />
      )}
    </div>
  );
}