import { formatHours } from "@/lib/hours";
import type { TrendRow, TrendWeek } from "@/lib/trends";

type WeeklyChartProps = {
  weeks: TrendWeek[];
  rows: TrendRow[];
};

// Round, readable steps for the hour axis, e.g. 0, 5, 10, 15, 20
const AXIS_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
const MAX_TICKS = 5;

// The axis goes from 0 to a round number just above the tallest week
function hourAxis(tallest: number) {
  const step = AXIS_STEPS.find((candidate) => tallest / candidate <= MAX_TICKS) ?? 100;
  const top = Math.max(Math.ceil(tallest / step) * step, step);
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => index * step);
  return { top, ticks };
}

// A stacked bar per week: each color is a category, the height is total hours.
// Plain divs, no chart library. Hover a piece to see its hours.
export default function WeeklyChart({ weeks, rows }: WeeklyChartProps) {
  const totals = weeks.map((_, index) => rows.reduce((sum, row) => sum + row.hours[index], 0));
  const { top, ticks } = hourAxis(Math.max(...totals));

  // Distance from the bottom of the chart, as a percent of its height
  const percent = (hours: number) => `${(hours / top) * 100}%`;

  return (
    <section className="mt-8 rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="font-semibold">Where your weeks went</h2>

      <div className="mt-2 flex">
        {/* Hour labels down the left side */}
        <div className="relative mt-6 h-56 w-10 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 translate-y-1/2 text-xs text-stone-400"
              style={{ bottom: percent(tick) }}
            >
              {tick}h
            </span>
          ))}
        </div>

        {/* Top padding leaves room for the total above the tallest bar */}
        <div className="min-w-0 flex-1 overflow-x-auto pt-6">
          <div className="relative h-56 border-b border-stone-300">
            {/* Gridlines, one per hour label */}
            {ticks
              .filter((tick) => tick > 0)
              .map((tick) => (
                <div
                  key={tick}
                  className="absolute inset-x-0 border-t border-stone-100"
                  style={{ bottom: percent(tick) }}
                />
              ))}

            {/* Bars */}
            <div className="relative flex h-full items-end gap-3 px-2">
              {weeks.map((week, index) => (
                <div key={week.weekStart} className="flex h-full w-20 shrink-0 items-end justify-center">
                  <div className="relative w-12" style={{ height: percent(totals[index]) }}>
                    <span className="absolute inset-x-0 -top-5 text-center text-xs font-medium text-stone-600">
                      {totals[index] > 0 ? formatHours(totals[index]) : ""}
                    </span>
                    <div
                      className={`flex h-full flex-col-reverse overflow-hidden rounded-t-md ${week.isCurrent ? "opacity-60" : ""}`}
                    >
                      {rows
                        .filter((row) => row.hours[index] > 0)
                        .map((row) => (
                          <div
                            key={row.id}
                            title={`${row.name}: ${formatHours(row.hours[index])}`}
                            style={{
                              height: `${(row.hours[index] / totals[index]) * 100}%`,
                              backgroundColor: row.color,
                            }}
                          />
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Week labels, lined up under the bars */}
          <div className="flex gap-3 px-2">
            {weeks.map((week) => (
              <span
                key={week.weekStart}
                className={`mt-2 w-20 shrink-0 text-center text-xs ${week.isCurrent ? "font-semibold text-accent" : "text-stone-500"}`}
              >
                {week.isCurrent ? "This week" : week.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-600">
        {rows.map((row) => (
          <span key={row.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
            {row.name}
          </span>
        ))}
        <span className="text-stone-400">This week is lighter because it isn&apos;t over yet</span>
      </div>
    </section>
  );
}