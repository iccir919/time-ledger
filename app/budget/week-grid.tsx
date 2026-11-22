"use client";

import { useState } from "react";
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
  // Planned (from the Plan calendar) and actual (tracked) hours, keyed by "<categoryId>:<date>"
  planned: Record<string, number>;
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

// A thin bar: solid = done, light = scheduled, both against the goal
function ProgressBar({
  goal,
  scheduled,
  done,
  color,
}: {
  goal: number;
  scheduled: number;
  done: number;
  color: string;
}) {
  const percent = (hours: number) => `${Math.min(hours / goal, 1) * 100}%`;

  return (
    <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
      {scheduled > 0 && (
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: percent(scheduled), backgroundColor: `${color}55` }}
        />
      )}
      <span
        className="absolute inset-y-0 left-0"
        style={{ width: percent(done), backgroundColor: color }}
      />
    </div>
  );
}

// How a week is going, done first. goal is null when there's no goal.
function WeekSummaryText({
  goal,
  done,
  scheduled,
}: {
  goal: number | null;
  done: number;
  scheduled: number;
}) {
  if (goal === null && done === 0 && scheduled === 0) {
    return <p className="text-stone-300">–</p>;
  }

  const over = goal !== null ? done - goal : 0;

  // The second line: how it compares to the goal
  let status: { text: string; className: string } | null = null;
  if (goal !== null && goal === 0 && done > 0) {
    // A goal of 0 is a limit, so anything over it is worth flagging
    status = { text: `${formatHours(over)} over`, className: "text-amber-700" };
  } else if (goal !== null && goal > 0 && done >= goal) {
    status = {
      text: over > 0 ? `Goal met · ${formatHours(over)} over` : "Goal met",
      className: "text-accent",
    };
  } else if (goal !== null && goal > 0) {
    status = { text: `${formatHours(goal - done)} to go`, className: "text-stone-500" };
  }

  return (
    <>
      <p className="font-medium text-stone-800">
        {goal !== null ? `${Number(done.toFixed(2))} of ${formatHours(goal)}` : `${formatHours(done)} done`}
      </p>
      {(status || scheduled > 0) && (
        <p className="text-stone-500">
          {status && <span className={status.className}>{status.text}</span>}
          {status && scheduled > 0 && " · "}
          {scheduled > 0 && `${formatHours(scheduled)} scheduled`}
        </p>
      )}
    </>
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
  const plannedAt = (key: string) => planned[key] ?? 0;
  const actualAt = (key: string) => actual[key] ?? 0;

  const weekTotal = (categoryId: string, read: (key: string) => number) =>
    days.reduce((sum, day) => sum + read(cellKey(categoryId, day.date)), 0);

  const dayTotal = (date: string, read: (key: string) => number) =>
    categories.reduce((sum, category) => sum + read(cellKey(category.id, date)), 0);

  const goalTotal = categories.reduce((sum, category) => sum + goalFor(category.id), 0);
  const scheduledTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, plannedAt), 0);
  const doneTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, actualAt), 0);

  // Hide the days a phone doesn't show
  const dayClass = (date: string) => (mobileDates.includes(date) ? "" : "hidden md:block");

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
      {/* Summary: done first, then the goal, then scheduled if there's any */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <p className="text-sm text-stone-500">Done this week</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-accent">
          {formatHours(doneTotal)}
          {goalTotal > 0 && (
            <span className="ml-2 text-base font-normal text-stone-500">
              of {formatHours(goalTotal)} goal
            </span>
          )}
        </p>
        {goalTotal > 0 && (
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
            <span
              className="absolute inset-y-0 left-0 bg-accent"
              style={{ width: `${Math.min(doneTotal / goalTotal, 1) * 100}%` }}
            />
          </div>
        )}
        {scheduledTotal > 0 && (
          <p className="mt-2 text-sm text-stone-500">{formatHours(scheduledTotal)} scheduled</p>
        )}
      </div>

      <p className="mt-6 text-sm text-stone-600">
        Type a weekly goal for each category. It saves on its own.
      </p>

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
                const scheduled = weekTotal(category.id, plannedAt);
                const done = weekTotal(category.id, actualAt);
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

                    {/* Days: hours done, with the plan underneath when there is one */}
                    {days.map((day) => {
                      const key = cellKey(category.id, day.date);
                      const plan = plannedAt(key);
                      const spent = actualAt(key);
                      const met = plan > 0 && spent >= plan;

                      return (
                        <div
                          key={day.date}
                          className={`rounded-md py-1 text-center leading-tight tabular-nums ${dayClass(day.date)} ${
                            day.date === today ? "bg-accent-soft/60" : ""
                          }`}
                        >
                          <p
                            className={`text-sm ${
                              met ? "font-semibold text-accent" : spent > 0 ? "text-stone-800" : "text-stone-300"
                            }`}
                          >
                            {shortHours(spent)}
                          </p>
                          {plan > 0 && (
                            <p className="text-[11px] text-stone-400">plan {shortHours(plan)}</p>
                          )}
                        </div>
                      );
                    })}

                    {/* Week: done first, then what's left and what's scheduled */}
                    <div className="pl-2 text-sm leading-snug">
                      <WeekSummaryText goal={goal} done={done} scheduled={scheduled} />
                      {goal !== null && goal > 0 && (
                        <ProgressBar goal={goal} scheduled={scheduled} done={done} color={category.color} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Totals per day */}
          <div className={`${COLUMNS} border-t border-stone-200 pt-2 text-sm font-semibold`}>
            <span className="px-1">Total</span>
            <span className="pr-5 text-right text-sm tabular-nums">{formatHours(goalTotal)}</span>
            {days.map((day) => {
              const plan = dayTotal(day.date, plannedAt);
              return (
                <div key={day.date} className={`text-center leading-tight tabular-nums ${dayClass(day.date)}`}>
                  <p className="text-sm">{formatHours(dayTotal(day.date, actualAt))}</p>
                  {plan > 0 && (
                    <p className="text-[11px] font-normal text-stone-400">plan {formatHours(plan)}</p>
                  )}
                </div>
              );
            })}
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}