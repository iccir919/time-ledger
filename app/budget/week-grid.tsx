"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { formatHours } from "@/lib/hours";
import { savePlan } from "./actions";

const COLUMNS = "grid grid-cols-[minmax(9rem,1fr)_repeat(7,4.25rem)_4.5rem] gap-1";

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
  groups: GridGroup[];
  days: GridDay[];
  today: string;
  // Both keyed by "<categoryId>:<date>"
  planned: Record<string, number>;
  actual: Record<string, number>;
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
      {pending ? "Saving..." : "Save plan"}
    </button>
  );
}

export default function WeekGrid({ groups, days, today, planned, actual }: WeekGridProps) {
  const categories = groups.flatMap((group) => group.categories);

  // Each cell's text, so a cell can be empty while you type
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const category of categories) {
      for (const day of days) {
        const key = cellKey(category.id, day.date);
        initial[key] = planned[key] ? String(planned[key]) : "";
      }
    }
    return initial;
  });

  const plannedAt = (key: string) => Number(values[key]) || 0;
  const actualAt = (key: string) => actual[key] ?? 0;

  const sumFor = (categoryIds: string[], dates: string[], read: (key: string) => number) =>
    categoryIds.reduce(
      (total, id) => total + dates.reduce((sum, date) => sum + read(cellKey(id, date)), 0),
      0
    );

  const allIds = categories.map((category) => category.id);
  const allDates = days.map((day) => day.date);
  const plannedTotal = sumFor(allIds, allDates, plannedAt);
  const trackedTotal = sumFor(allIds, allDates, actualAt);

  return (
    <form action={savePlan} className="mt-8">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Planned</p>
          <p className="mt-1 font-mono text-3xl font-semibold">{formatHours(plannedTotal)}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Tracked</p>
          <p className="mt-1 font-mono text-3xl font-semibold text-accent">
            {formatHours(trackedTotal)}
          </p>
        </div>
      </div>

      {/* Grid. Scrolls sideways on narrow screens. */}
      <div className="mt-8 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="min-w-[46rem] p-3">
          {/* Day headers */}
          <div className={`${COLUMNS} pb-2 text-xs text-stone-500`}>
            <span />
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
            <span className="py-1 text-right">Week</span>
          </div>

          {groups.map((group) => (
            <div key={group.id} className="border-t border-stone-100 pt-2">
              <p className="px-1 pb-1 text-sm font-semibold">{group.name}</p>

              {group.categories.map((category) => {
                const weekPlanned = sumFor([category.id], allDates, plannedAt);
                const weekActual = sumFor([category.id], allDates, actualAt);

                return (
                  <div key={category.id} className={`${COLUMNS} items-start py-1`}>
                    <span className="flex items-center gap-2 px-1 pt-1 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate">{category.name}</span>
                    </span>

                    {days.map((day) => {
                      const key = cellKey(category.id, day.date);
                      const plan = plannedAt(key);
                      const spent = actualAt(key);
                      const met = plan > 0 && spent >= plan;

                      return (
                        <div
                          key={day.date}
                          className={`rounded-md p-0.5 ${day.date === today ? "bg-accent-soft/60" : ""}`}
                        >
                          <input
                            type="number"
                            name={`plan:${key}`}
                            value={values[key] ?? ""}
                            onChange={(event) =>
                              setValues((current) => ({ ...current, [key]: event.target.value }))
                            }
                            min={0}
                            max={24}
                            step={0.25}
                            aria-label={`Planned ${category.name} hours on ${day.weekday}`}
                            className="w-full rounded border border-stone-200 bg-white px-1 py-0.5 text-right font-mono text-sm outline-none focus:ring-2 focus:ring-accent/30"
                          />
                          <p
                            className={`mt-0.5 h-4 text-right font-mono text-[11px] ${
                              met ? "font-semibold text-accent" : "text-stone-400"
                            }`}
                          >
                            {spent > 0 ? formatHours(spent) : ""}
                          </p>
                        </div>
                      );
                    })}

                    <div className="pt-1 text-right font-mono text-sm">
                      <p>{formatHours(weekPlanned)}</p>
                      <p className="text-[11px] text-stone-400">{formatHours(weekActual)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Totals per day */}
          <div className={`${COLUMNS} border-t border-stone-200 pt-2 text-sm font-semibold`}>
            <span className="px-1">Total</span>
            {days.map((day) => (
              <div key={day.date} className="text-right font-mono">
                <p>{formatHours(sumFor(allIds, [day.date], plannedAt))}</p>
                <p className="text-[11px] font-normal text-stone-400">
                  {formatHours(sumFor(allIds, [day.date], actualAt))}
                </p>
              </div>
            ))}
            <div className="text-right font-mono">
              <p>{formatHours(plannedTotal)}</p>
              <p className="text-[11px] font-normal text-stone-400">{formatHours(trackedTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SaveButton />
      </div>
    </form>
  );
}