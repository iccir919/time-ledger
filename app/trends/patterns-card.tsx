"use client";

import { useState } from "react";
import { formatHours } from "@/lib/hours";
import type { TrendCategory, TrendDay, TrendWeek } from "@/lib/trends";
import type { WeekPlan } from "@/lib/week-plan";
import { useShowPlanned } from "./use-show-planned";

type View = "days" | "weeks" | "weekdays" | "hours";

const VIEWS: { key: View; label: string }[] = [
  { key: "days", label: "Days" },
  { key: "weeks", label: "Weeks" },
  { key: "weekdays", label: "Weekdays" },
  { key: "hours", label: "Hours" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// How much history an average line needs before it means something
const MIN_DAYS_FOR_AVERAGE = 7;
const MIN_WEEKS_FOR_AVERAGE = 2;

const CHART_HEIGHT = 200;

type PatternsCardProps = {
  periodLabel: string;
  days: TrendDay[];
  weeks: TrendWeek[];
  categories: TrendCategory[];
  // This week's planned time, for "Done + planned". Left out where there's no toggle.
  plan?: WeekPlan;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// "2026-11-27" -> "Nov 27" (noon UTC keeps the date on its own day)
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const labelOf = (date: string) => shortDate.format(new Date(`${date}T12:00:00Z`));

// Planned hours: faded, with a dashed edge, like plans in the calendar
const plannedStyle = (color: string) => ({ backgroundColor: `${color}55`, border: `1px dashed ${color}` });

// One card, four ways to look at the same time: each day, each week, the average weekday,
// and the average day hour by hour. Every view is stacked by category color.
// With "Done + planned" on, Days and Weeks add this week's planned time, faded.
export default function PatternsCard({ periodLabel, days, weeks, categories, plan }: PatternsCardProps) {
  const [view, setView] = useState<View>("days");
  const { showPlanned } = useShowPlanned();
  const planned = showPlanned && plan ? plan : null;

  const subtitles: Record<View, string> = {
    days: `Hours each day, ${periodLabel}`,
    weeks: `Hours each week, ${periodLabel}`,
    weekdays: `Average hours on each weekday, ${periodLabel}`,
    hours: `Minutes in each hour of an average day, ${periodLabel}`,
  };

  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Patterns</h2>
          <p className="mt-0.5 text-sm text-stone-500">{subtitles[view]}</p>
        </div>
        <div className="flex rounded-full bg-stone-100 p-1" role="tablist" aria-label="Patterns view">
          {VIEWS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={view === option.key}
              onClick={() => setView(option.key)}
              // Planned time only changes Days and Weeks, so the others dim while it's on
              title={planned && (option.key === "weekdays" || option.key === "hours") ? "Shows done time only" : undefined}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                view === option.key ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
              } ${planned && (option.key === "weekdays" || option.key === "hours") ? "opacity-50" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {(categories.length > 1 || planned) && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
          {categories.map((category) => (
            <span key={category.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: category.color }} />
              {category.name}
            </span>
          ))}
          {planned && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={plannedStyle("#78716c")} />
              Planned
            </span>
          )}
        </div>
      )}

      <div className="mt-5">
        {view === "days" && <DaysView days={days} categories={categories} plan={planned} />}
        {view === "weeks" && <WeeksView weeks={weeks} categories={categories} plan={planned} />}
        {view === "weekdays" && <WeekdaysView categories={categories} />}
        {view === "hours" && <HoursView categories={categories} />}
      </div>
    </section>
  );
}

// A small line above a chart: "- - - Average day 2h 12m", or why there isn't one yet
function AverageNote({ label, hours, waiting }: { label: string; hours: number | null; waiting: string }) {
  return hours === null ? (
    <p className="mb-2 text-xs text-stone-400">{waiting}</p>
  ) : (
    <p className="mb-2 text-xs text-stone-500">
      <span className="tracking-widest">- - -</span> {label}{" "}
      <span className="font-medium text-stone-900">{formatHours(hours)}</span>
    </p>
  );
}

// A column of stacked category segments, for the Days and Hours views
function Column({
  values,
  categories,
  max,
  title,
  faded,
  unit,
  planned,
}: {
  values: number[];
  categories: TrendCategory[];
  max: number;
  title: string;
  faded?: boolean;
  unit: "hours" | "minutes";
  // Planned hours per category, stacked on top, faded
  planned?: number[];
}) {
  const total = sum(values);
  const plannedTotal = planned ? sum(planned) : 0;
  const show = (value: number) => (unit === "hours" ? formatHours(value) : `${Math.round(value)} min`);

  return (
    <div
      title={`${title}: ${show(total)}${plannedTotal > 0 ? ` done, ${show(plannedTotal)} planned` : ""}`}
      className={`flex min-w-0 flex-1 flex-col-reverse gap-px ${faded ? "opacity-50" : ""}`}
      style={{ height: max > 0 ? `${((total + plannedTotal) / max) * 100}%` : 0 }}
    >
      {values.map((value, index) =>
        value > 0 ? (
          <span
            key={categories[index].id}
            title={`${title} · ${categories[index].name}: ${show(value)}`}
            className="last:rounded-t-sm"
            style={{ flexGrow: value, backgroundColor: categories[index].color }}
          />
        ) : null
      )}
      {planned?.map((value, index) =>
        value > 0 ? (
          <span
            key={`planned-${categories[index].id}`}
            title={`${title} · ${categories[index].name}: ${show(value)} planned`}
            className="last:rounded-t-sm"
            style={{ flexGrow: value, ...plannedStyle(categories[index].color) }}
          />
        ) : null
      )}
    </div>
  );
}

// A row with a stacked bar, for the Weeks and Weekdays views
function BarRow({
  label,
  values,
  categories,
  max,
  total,
  note,
  planned,
}: {
  label: string;
  values: number[];
  categories: TrendCategory[];
  max: number;
  total: string;
  note?: string;
  // Planned hours per category, after the done part, faded
  planned?: number[];
}) {
  const rowTotal = sum(values) + (planned ? sum(planned) : 0);
  return (
    <div className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 py-1.5">
      <span className="truncate text-sm text-stone-700">{label}</span>
      <div className="h-4">
        <div
          className="flex h-full gap-px overflow-hidden rounded-full"
          style={{ width: max > 0 ? `${(rowTotal / max) * 100}%` : 0 }}
        >
          {values.map((value, index) =>
            value > 0 ? (
              <span
                key={categories[index].id}
                title={`${label} · ${categories[index].name}: ${formatHours(value)}`}
                style={{ flexGrow: value, backgroundColor: categories[index].color }}
              />
            ) : null
          )}
          {planned?.map((value, index) =>
            value > 0 ? (
              <span
                key={`planned-${categories[index].id}`}
                title={`${label} · ${categories[index].name}: ${formatHours(value)} planned`}
                style={{ flexGrow: value, ...plannedStyle(categories[index].color) }}
              />
            ) : null
          )}
        </div>
      </div>
      <span className="text-right text-sm font-medium tabular-nums leading-tight">
        {total}
        {note && <span className="block text-[11px] font-normal text-stone-400">{note}</span>}
      </span>
    </div>
  );
}

function DaysView({
  days,
  categories,
  plan,
}: {
  days: TrendDay[];
  categories: TrendCategory[];
  plan: WeekPlan | null;
}) {
  // With planned on, the chart runs to the end of this week: today and the days after it
  // carry their plans on top
  const lastDate = days[days.length - 1].date;
  const extraDates = plan ? plan.dates.filter((date) => date > lastDate) : [];
  const columns = [
    ...days.map((day, index) => ({
      key: day.date,
      date: day.date,
      label: day.isToday ? "Today" : day.label,
      isToday: day.isToday,
      done: categories.map((category) => category.dayHours[index]),
    })),
    ...extraDates.map((date) => ({
      key: date,
      date,
      label: labelOf(date),
      isToday: false,
      done: categories.map(() => 0),
    })),
  ];
  const plannedOn = (date: string) => {
    const index = plan ? plan.dates.indexOf(date) : -1;
    return index === -1 ? null : categories.map((category) => plan!.aheadByCategory[category.id]?.[index] ?? 0);
  };

  const totals = days.map((_, index) => sum(categories.map((category) => category.dayHours[index])));
  // Average over finished days (today isn't over yet)
  const finished = totals.filter((_, index) => !days[index].isToday);
  const average = finished.length >= MIN_DAYS_FOR_AVERAGE ? sum(finished) / finished.length : null;
  const heights = columns.map((column) => sum(column.done) + sum(plannedOn(column.date) ?? []));
  const max = Math.max(...heights, average ?? 0) * 1.08;

  // A few date labels under the chart: first, last and two between
  const labelIndexes = [
    ...new Set([0, Math.round((columns.length - 1) / 3), Math.round(((columns.length - 1) * 2) / 3), columns.length - 1]),
  ];

  return (
    <>
      <AverageNote label="Average day" hours={average} waiting="The average line shows after a full week." />
      <div
        className={`relative flex items-end ${columns.length > 60 ? "gap-px" : "gap-1"}`}
        style={{ height: CHART_HEIGHT }}
      >
        {columns.map((column) => (
          <Column
            key={column.key}
            values={column.done}
            categories={categories}
            max={max}
            title={column.isToday ? `${column.label} (so far)` : column.label}
            // Today is faded while it's "so far"; with plans showing, the plans are what's faded
            faded={column.isToday && !plan}
            unit="hours"
            planned={plannedOn(column.date) ?? undefined}
          />
        ))}
        {average !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-stone-500"
            style={{ bottom: `${(average / max) * 100}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-400">
        {labelIndexes.map((index) => (
          <span key={index}>{columns[index].label}</span>
        ))}
      </div>
    </>
  );
}

function WeeksView({
  weeks,
  categories,
  plan,
}: {
  weeks: TrendWeek[];
  categories: TrendCategory[];
  plan: WeekPlan | null;
}) {
  const totals = weeks.map((_, index) => sum(categories.map((category) => category.weekHours[index])));
  // This week's planned time per category, added to its bar
  const plannedThisWeek = plan ? categories.map((category) => sum(plan.aheadByCategory[category.id] ?? [])) : null;
  // Average over full weeks (all 7 days in the period, and not this week)
  const full = totals.filter((_, index) => weeks[index].dayCount === 7 && !weeks[index].isCurrent);
  const average = full.length >= MIN_WEEKS_FOR_AVERAGE ? sum(full) / full.length : null;
  const max =
    Math.max(
      ...totals.map((total, index) => total + (weeks[index].isCurrent && plannedThisWeek ? sum(plannedThisWeek) : 0)),
      average ?? 0
    ) * 1.05;

  return (
    <>
      <AverageNote label="Average week" hours={average} waiting="The average line shows after 2 full weeks." />
      <div className="relative">
        {weeks.map((week, index) => (
          <BarRow
            key={week.weekStart}
            label={week.label}
            values={categories.map((category) => category.weekHours[index])}
            categories={categories}
            max={max}
            total={formatHours(totals[index])}
            note={
              week.isCurrent
                ? plannedThisWeek && sum(plannedThisWeek) > 0
                  ? `+${formatHours(sum(plannedThisWeek))} planned`
                  : "so far"
                : week.dayCount < 7
                  ? `${week.dayCount} days`
                  : undefined
            }
            planned={week.isCurrent && plannedThisWeek ? plannedThisWeek : undefined}
          />
        ))}
        {/* The average, as a dashed line down the bars (the bar area starts after the 5.5rem label and a gap, and ends before the 4.5rem total) */}
        {average !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 border-l-[1.5px] border-dashed border-stone-500"
            style={{ left: `calc(6.25rem + (100% - 11.5rem) * ${average / max})` }}
          />
        )}
      </div>
    </>
  );
}

function WeekdaysView({ categories }: { categories: TrendCategory[] }) {
  const rows = WEEKDAYS.map((_, index) => categories.map((category) => category.weekdayAverage[index]));
  const totals = rows.map((values) => (values.every((value) => value === null) ? null : sum(values.map((v) => v ?? 0))));
  const max = Math.max(...totals.map((total) => total ?? 0));

  return (
    <div>
      {WEEKDAYS.map((weekday, index) =>
        totals[index] === null ? (
          <div key={weekday} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 py-1.5">
            <span className="text-sm text-stone-700">{weekday}</span>
            <span className="text-sm text-stone-400">No {weekday} yet</span>
            <span />
          </div>
        ) : (
          <BarRow
            key={weekday}
            label={weekday}
            values={rows[index].map((value) => value ?? 0)}
            categories={categories}
            max={max}
            total={formatHours(totals[index]!)}
          />
        )
      )}
    </div>
  );
}

function HoursView({ categories }: { categories: TrendCategory[] }) {
  const columns = Array.from({ length: 24 }, (_, hour) => categories.map((category) => category.hourMinutes[hour]));
  const max = Math.max(...columns.map(sum));
  const hourName = (hour: number) => (hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`);

  return (
    <>
      <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
        {columns.map((values, hour) => (
          <Column key={hour} values={values} categories={categories} max={max} title={hourName(hour)} unit="minutes" />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </>
  );
}