"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { formatHours } from "@/lib/hours";
import { saveGoals } from "./actions";

const COLUMNS =
  "grid grid-cols-[minmax(8rem,1fr)_4rem_repeat(7,3.5rem)_9rem] items-center gap-1";

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
  today: string;
  // Typed weekly goals, keyed by category ID
  goals: Record<string, number>;
  // Planned (from the Plan calendar) and actual (tracked) hours, keyed by "<categoryId>:<date>"
  planned: Record<string, number>;
  actual: Record<string, number>;
  hasPlanCalendar: boolean;
};

function cellKey(categoryId: string, date: string) {
  return `${categoryId}:${date}`;
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save goals"}
    </button>
  );
}

// A thin bar: light part = scheduled, dark part = done, both against the goal
function ProgressBar({
  goal,
  scheduled,
  done,
  color,
  showScheduled,
}: {
  goal: number;
  scheduled: number;
  done: number;
  color: string;
  showScheduled: boolean;
}) {
  const percent = (hours: number) => `${Math.min(hours / goal, 1) * 100}%`;

  return (
    <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
      {showScheduled && (
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

export default function WeekGrid({
  weekStart,
  groups,
  days,
  today,
  goals,
  planned,
  actual,
  hasPlanCalendar,
}: WeekGridProps) {
  const categories = groups.flatMap((group) => group.categories);

  // Each goal's text, so a field can be empty while you type
  const [goalText, setGoalText] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const category of categories) {
      initial[category.id] = goals[category.id] ? String(goals[category.id]) : "";
    }
    return initial;
  });

  const goalFor = (categoryId: string) => Number(goalText[categoryId]) || 0;
  const plannedAt = (key: string) => planned[key] ?? 0;
  const actualAt = (key: string) => actual[key] ?? 0;

  const weekTotal = (categoryId: string, read: (key: string) => number) =>
    days.reduce((sum, day) => sum + read(cellKey(categoryId, day.date)), 0);

  const dayTotal = (date: string, read: (key: string) => number) =>
    categories.reduce((sum, category) => sum + read(cellKey(category.id, date)), 0);

  const goalTotal = categories.reduce((sum, category) => sum + goalFor(category.id), 0);
  const scheduledTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, plannedAt), 0);
  const doneTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, actualAt), 0);

  return (
    <form action={saveGoals} className="mt-8">
      <input type="hidden" name="week_start" value={weekStart} />

      {/* Summary */}
      <div className={`grid gap-4 ${hasPlanCalendar ? "grid-cols-3" : "grid-cols-2"}`}>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Goal</p>
          <p className="mt-1 font-mono text-3xl font-semibold">{formatHours(goalTotal)}</p>
        </div>
        {hasPlanCalendar && (
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Scheduled</p>
            <p className="mt-1 font-mono text-3xl font-semibold">{formatHours(scheduledTotal)}</p>
          </div>
        )}
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Done</p>
          <p className="mt-1 font-mono text-3xl font-semibold text-accent">
            {formatHours(doneTotal)}
          </p>
        </div>
      </div>

      {/* Grid. Scrolls sideways on narrow screens. */}
      <div className="mt-8 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="min-w-[48rem] p-3">
          {/* Headers */}
          <div className={`${COLUMNS} pb-2 text-xs text-stone-500`}>
            <span />
            <span className="text-center">Goal</span>
            {days.map((day) => (
              <span
                key={day.date}
                className={`rounded-md py-1 text-center ${
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
              <p className="px-1 pb-1 text-sm font-semibold">{group.name}</p>

              {group.categories.map((category) => {
                const goal = goalFor(category.id);
                const scheduled = weekTotal(category.id, plannedAt);
                const done = weekTotal(category.id, actualAt);
                const unscheduled = goal - scheduled;

                return (
                  <div key={category.id} className={`${COLUMNS} py-1`}>
                    <span className="flex items-center gap-2 px-1 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate">{category.name}</span>
                    </span>

                    <input
                      type="number"
                      name={`goal:${category.id}`}
                      value={goalText[category.id] ?? ""}
                      onChange={(event) =>
                        setGoalText((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      min={0}
                      max={168}
                      step={0.25}
                      placeholder="–"
                      aria-label={`Weekly goal for ${category.name}`}
                      className="w-full rounded border border-stone-200 bg-white px-1 py-0.5 text-right font-mono text-sm outline-none focus:ring-2 focus:ring-accent/30"
                    />

                    {days.map((day) => {
                      const key = cellKey(category.id, day.date);
                      const plan = plannedAt(key);
                      const spent = actualAt(key);
                      const met = plan > 0 && spent >= plan;

                      return (
                        <div
                          key={day.date}
                          className={`rounded-md py-1 text-center font-mono leading-tight ${
                            day.date === today ? "bg-accent-soft/60" : plan > 0 ? "bg-stone-50" : ""
                          }`}
                        >
                          {hasPlanCalendar && (
                            <p className="text-xs text-stone-900">
                              {plan > 0 ? Number(plan.toFixed(2)) : "–"}
                            </p>
                          )}
                          <p
                            className={`text-[11px] ${
                              met ? "font-semibold text-accent" : "text-stone-400"
                            }`}
                          >
                            {spent > 0 ? Number(spent.toFixed(2)) : "–"}
                          </p>
                        </div>
                      );
                    })}

                    {/* Week: how scheduled and done hours compare to the goal */}
                    <div className="pl-2 text-[11px] leading-tight text-stone-500">
                      {hasPlanCalendar ? (
                        <p>
                          {goal > 0
                            ? `${formatHours(scheduled)} of ${formatHours(goal)} scheduled`
                            : `${formatHours(scheduled)} scheduled`}
                        </p>
                      ) : null}
                      <p>
                        {!hasPlanCalendar && goal > 0
                          ? `${formatHours(done)} of ${formatHours(goal)} done`
                          : `${formatHours(done)} done`}
                      </p>
                      {goal > 0 && (
                        <ProgressBar
                          goal={goal}
                          scheduled={scheduled}
                          done={done}
                          color={category.color}
                          showScheduled={hasPlanCalendar}
                        />
                      )}
                      {hasPlanCalendar && goal > 0 && unscheduled > 0 && (
                        <p className="mt-0.5 text-amber-700">
                          {formatHours(unscheduled)} not scheduled
                        </p>
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
            <span className="text-right font-mono text-xs">{formatHours(goalTotal)}</span>
            {days.map((day) => (
              <div key={day.date} className="text-center font-mono leading-tight">
                {hasPlanCalendar && (
                  <p className="text-xs">{formatHours(dayTotal(day.date, plannedAt))}</p>
                )}
                <p className="text-[11px] font-normal text-stone-400">
                  {formatHours(dayTotal(day.date, actualAt))}
                </p>
              </div>
            ))}
            <span />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SaveButton />
      </div>
    </form>
  );
}