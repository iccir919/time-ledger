"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { formatHours } from "@/lib/hours";
import { savePlan } from "./actions";

const HOURS_IN_WEEK = 168;
const COLUMNS = "grid grid-cols-[1fr_6rem_5rem_5rem] items-center gap-4";

type BudgetGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

type BudgetFormProps = {
  weekStart: string;
  groups: BudgetGroup[];
  planned: Record<string, number>;
  actual: Record<string, number>;
};

// Shows "Saving..." while the Server Action runs
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

export default function BudgetForm({ weekStart, groups, planned, actual }: BudgetFormProps) {
  // Inputs are kept as text so a field can be empty while you type
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const group of groups) {
      for (const category of group.categories) {
        initial[category.id] = planned[category.id] ? String(planned[category.id]) : "";
      }
    }
    return initial;
  });

  const plannedHours = (categoryId: string) => Number(values[categoryId]) || 0;

  const assigned = Object.keys(values).reduce((sum, id) => sum + plannedHours(id), 0);
  const ready = Math.round((HOURS_IN_WEEK - assigned) * 100) / 100;

  return (
    <form action={savePlan} className="mt-8">
      <input type="hidden" name="week_start" value={weekStart} />

      {/* Ready to assign */}
      <div
        className={`rounded-xl border p-6 ${
          ready < 0 ? "border-red-200 bg-red-50" : "border-stone-200 bg-white"
        }`}
      >
        <p className="text-sm text-stone-500">Ready to assign</p>
        <p
          className={`mt-1 font-mono text-4xl font-semibold ${
            ready < 0 ? "text-red-700" : ready === 0 ? "text-stone-900" : "text-accent"
          }`}
        >
          {formatHours(ready)}
        </p>
        <p className="mt-2 text-sm text-stone-600">
          {ready > 0 && `of ${HOURS_IN_WEEK} hours this week still need a job.`}
          {ready === 0 && "Every hour has a job."}
          {ready < 0 && `Over-assigned by ${formatHours(-ready)}. Take hours from a category.`}
        </p>
      </div>

      {/* Categories */}
      <div className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div
          className={`${COLUMNS} border-b border-stone-200 bg-stone-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-stone-500`}
        >
          <span>Category</span>
          <span className="text-right">Planned</span>
          <span className="text-right">Actual</span>
          <span className="text-right">Left</span>
        </div>

        {groups.map((group) => {
          const groupPlanned = group.categories.reduce((sum, c) => sum + plannedHours(c.id), 0);
          const groupActual = group.categories.reduce((sum, c) => sum + (actual[c.id] ?? 0), 0);

          return (
            <div key={group.id} className="border-b border-stone-100 last:border-b-0">
              <div className={`${COLUMNS} bg-stone-50/60 px-5 py-2 text-sm font-semibold`}>
                <span>{group.name}</span>
                <span className="text-right font-mono">{formatHours(groupPlanned)}</span>
                <span className="text-right font-mono">{formatHours(groupActual)}</span>
                <span />
              </div>

              {group.categories.map((category) => {
                const spent = actual[category.id] ?? 0;
                const left = plannedHours(category.id) - spent;

                return (
                  <div key={category.id} className={`${COLUMNS} px-5 py-2 text-sm`}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </span>
                    <input
                      type="number"
                      name={`planned:${category.id}`}
                      value={values[category.id] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      min={0}
                      max={HOURS_IN_WEEK}
                      step={0.25}
                      placeholder="0"
                      aria-label={`Planned hours for ${category.name}`}
                      className="w-full rounded-md border border-stone-200 px-2 py-1 text-right font-mono outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <span className="text-right font-mono text-stone-600">
                      {formatHours(spent)}
                    </span>
                    <span
                      className={`text-right font-mono ${
                        left < 0 ? "text-red-700" : "text-stone-600"
                      }`}
                    >
                      {formatHours(left)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <SaveButton />
      </div>
    </form>
  );
}