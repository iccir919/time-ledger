"use client";

import Link from "next/link";
import { formatHours } from "@/lib/hours";
import type { RangeKey, TrendCategory } from "@/lib/trends";
import type { WeekPlan } from "@/lib/week-plan";
import { useShowPlanned } from "./use-show-planned";

const COLUMNS = "grid-cols-[minmax(0,1.4fr)_minmax(5rem,9rem)_6rem_4rem_minmax(0,2fr)]";

// Each category's time this week (next to its weekly average, for comparing), its share of
// all tracked time, and when in the day it happens (a small strip, midnight to midnight, with
// one shared axis under the table). With "Done + planned" on, this week adds what's planned.
// A row opens that category's own page.
export default function CategoriesTable({
  categories,
  range,
  plan,
}: {
  categories: TrendCategory[];
  range: RangeKey;
  plan: WeekPlan;
}) {
  const { showPlanned } = useShowPlanned();
  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-semibold">Categories</h2>
      <div className="mt-3 text-sm">
        <div className={`grid ${COLUMNS} gap-3 border-b border-stone-100 pb-2 text-stone-500`}>
          <span>Category</span>
          <span className="text-right">This week</span>
          <span className="text-right">Weekly avg</span>
          <span className="text-right">Share</span>
          <span>When</span>
        </div>

        {categories.map((category) => {
          const peak = Math.max(...category.hourMinutes);
          const doneThisWeek = plan.doneByCategory[category.id] ?? 0;
          const plannedThisWeek = (plan.aheadByCategory[category.id] ?? []).reduce((sum, hours) => sum + hours, 0);
          return (
            <Link
              key={category.id}
              href={`/trends/${category.id}?range=${range}`}
              className={`-mx-2 grid ${COLUMNS} items-center gap-3 rounded-md border-b border-stone-100 px-2 py-2.5 hover:bg-stone-50`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="truncate">{category.name}</span>
              </span>
              <span className="text-right tabular-nums leading-tight">
                {doneThisWeek > 0 ? formatHours(doneThisWeek) : <span className="text-stone-300">–</span>}
                {showPlanned && plannedThisWeek > 0 && (
                  <span className="block text-[11px] text-stone-400">+{formatHours(plannedThisWeek)} planned</span>
                )}
              </span>
              <span className="text-right tabular-nums">{formatHours(category.weeklyAverage)}</span>
              <span className="text-right tabular-nums text-stone-500">{Math.round(category.share * 100)}%</span>
              {/* One bar per hour; taller where more of the category happens */}
              <span className="flex h-5 items-end gap-px" aria-hidden="true">
                {category.hourMinutes.map((minutes, hour) => (
                  <span
                    key={hour}
                    className="flex-1 rounded-[1px]"
                    style={{
                      height: `${Math.max(peak > 0 ? (minutes / peak) * 100 : 0, 8)}%`,
                      backgroundColor: peak > 0 && minutes / peak > 0.15 ? category.color : "#f0eeeb",
                    }}
                  />
                ))}
              </span>
            </Link>
          );
        })}

        {/* The shared axis for the When strips */}
        <div className={`grid ${COLUMNS} gap-3 pt-1.5 text-[11px] text-stone-400`}>
          <span />
          <span />
          <span />
          <span />
          <span className="flex justify-between">
            <span>12a</span>
            <span>6a</span>
            <span>12p</span>
            <span>6p</span>
            <span>12a</span>
          </span>
        </div>
      </div>
    </section>
  );
}