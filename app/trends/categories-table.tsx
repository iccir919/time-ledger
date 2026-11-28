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

  // One bar per hour of the day; taller where more of the category happens
  const whenStrip = (category: TrendCategory) => {
    const peak = Math.max(...category.hourMinutes);
    return (
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
    );
  };
  const axis = (
    <span className="flex justify-between">
      <span>12a</span>
      <span>6a</span>
      <span>12p</span>
      <span>6p</span>
      <span>12a</span>
    </span>
  );
  const thisWeekOf = (category: TrendCategory) => ({
    done: plan.doneByCategory[category.id] ?? 0,
    planned: (plan.aheadByCategory[category.id] ?? []).reduce((sum, hours) => sum + hours, 0),
  });

  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
      <h2 className="font-semibold">Categories</h2>

      {/* Wide: a table, one column per number */}
      <div className="mt-3 hidden text-sm sm:block">
        <div className={`grid ${COLUMNS} gap-3 border-b border-stone-100 pb-2 text-stone-500`}>
          <span>Category</span>
          <span className="text-right">This week</span>
          <span className="text-right">Weekly avg</span>
          <span className="text-right">Share</span>
          <span>When</span>
        </div>

        {categories.map((category) => {
          const thisWeek = thisWeekOf(category);
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
                {thisWeek.done > 0 ? formatHours(thisWeek.done) : <span className="text-stone-300">–</span>}
                {showPlanned && thisWeek.planned > 0 && (
                  <span className="block text-[11px] text-stone-400">+{formatHours(thisWeek.planned)} planned</span>
                )}
              </span>
              <span className="text-right tabular-nums">{formatHours(category.weeklyAverage)}</span>
              <span className="text-right tabular-nums text-stone-500">{Math.round(category.share * 100)}%</span>
              {whenStrip(category)}
            </Link>
          );
        })}

        {/* The shared axis for the When strips */}
        <div className={`grid ${COLUMNS} gap-3 pt-1.5 text-[11px] text-stone-400`}>
          <span />
          <span />
          <span />
          <span />
          {axis}
        </div>
      </div>

      {/* Phones: each category stacked. Name and this week on top, the average and share
          under it, then the When strip across the full width. */}
      <div className="mt-2 sm:hidden">
        {categories.map((category) => {
          const thisWeek = thisWeekOf(category);
          return (
            <Link
              key={category.id}
              href={`/trends/${category.id}?range=${range}`}
              className="-mx-2 block rounded-md border-b border-stone-100 px-2 py-3 hover:bg-stone-50"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                  <span className="truncate font-medium">{category.name}</span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {thisWeek.done > 0 ? formatHours(thisWeek.done) : <span className="text-stone-300">–</span>}
                  <span className="text-stone-400"> this week</span>
                </span>
              </span>
              <span className="mt-0.5 flex justify-between gap-3 pl-4.5 text-xs text-stone-500">
                <span className="tabular-nums">
                  {formatHours(category.weeklyAverage)} a week on average · {Math.round(category.share * 100)}%
                </span>
                {showPlanned && thisWeek.planned > 0 && (
                  <span className="shrink-0 tabular-nums text-stone-400">+{formatHours(thisWeek.planned)} planned</span>
                )}
              </span>
              <span className="mt-2 block pl-4.5">{whenStrip(category)}</span>
            </Link>
          );
        })}
        {/* The shared axis, lined up under the strips */}
        <div className="pt-1.5 pl-4.5 text-[11px] text-stone-400">{axis}</div>
      </div>
    </section>
  );
}