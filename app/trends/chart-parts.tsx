import Link from "next/link";
import type { CSSProperties } from "react";
import { formatHours } from "@/lib/hours";
import type { TrendWeek } from "@/lib/trends";

// Pieces shared by the vertical and horizontal bar charts

// One bar: a week, or a day of the week
export type ChartColumn = {
  key: string;
  label: string;
  // A second, smaller line under the label, e.g. "since Nov 16"
  sublabel?: string;
  // Shown in the accent color, e.g. "This week"
  highlight?: boolean;
  // Drawn lighter, e.g. a week that isn't over yet
  faded?: boolean;
};

// One color in the stack, with one value per column
export type ChartSeries = {
  id: string;
  name: string;
  color: string;
  values: number[];
  // Where clicking this color goes (its bar pieces and its legend entry)
  href?: string;
};

// Weeks as chart rows: "Nov 9 to Nov 15", or "This week" with when it started
export function weekColumns(weeks: TrendWeek[]): ChartColumn[] {
  return weeks.map((week) => ({
    key: week.weekStart,
    label: week.isCurrent ? "This week" : week.rangeLabel,
    sublabel: week.isCurrent ? `since ${week.label}` : undefined,
    highlight: week.isCurrent,
    faded: week.isCurrent,
  }));
}

// Round, readable steps for the hour axis, e.g. 0, 5, 10, 15, 20
const AXIS_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
const MAX_TICKS = 5;

// The axis goes from 0 to a round number just above the biggest value
export function hourAxis(biggest: number) {
  const step = AXIS_STEPS.find((candidate) => biggest / candidate <= MAX_TICKS) ?? 100;
  const top = Math.max(Math.ceil(biggest / step) * step, step);
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => index * step);
  return { top, ticks };
}

// Each column's total across all series
export function columnTotals(columns: ChartColumn[], series: ChartSeries[]) {
  return columns.map((_, index) => series.reduce((sum, item) => sum + item.values[index], 0));
}

type SegmentProps = {
  item: ChartSeries;
  hours: number;
  // The segment's size: a height for vertical bars, a width for horizontal ones
  style: CSSProperties;
};

// One colored piece of a bar. A link when the series has an href.
export function Segment({ item, hours, style }: SegmentProps) {
  const shared = {
    title: `${item.name}: ${formatHours(hours)}`,
    style: { ...style, backgroundColor: item.color },
  };

  return item.href ? (
    <Link href={item.href} {...shared} className="block transition-opacity hover:opacity-80" />
  ) : (
    <div {...shared} />
  );
}

type ChartLegendProps = {
  series: ChartSeries[];
  showSeries: boolean;
  markerLabel?: string;
  note?: string;
};

// The row under a chart: colors (as links when they have an href), the goal line, and a note
export function ChartLegend({ series, showSeries, markerLabel, note }: ChartLegendProps) {
  if (!showSeries && !markerLabel && !note) {
    return null;
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-600">
      {showSeries &&
        series.map((item) => {
          const content = (
            <>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </>
          );
          return item.href ? (
            <Link key={item.id} href={item.href} className="flex items-center gap-1.5 hover:underline">
              {content}
            </Link>
          ) : (
            <span key={item.id} className="flex items-center gap-1.5">
              {content}
            </span>
          );
        })}
      {markerLabel && (
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-stone-700" />
          {markerLabel}
        </span>
      )}
      {note && <span className="text-stone-400">{note}</span>}
    </div>
  );
}