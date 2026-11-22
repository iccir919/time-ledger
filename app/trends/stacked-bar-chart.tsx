import { formatHours } from "@/lib/hours";
import {
  ChartLegend,
  columnTotals,
  hourAxis,
  Segment,
  type ChartColumn,
  type ChartSeries,
} from "./chart-parts";

type StackedBarChartProps = {
  title: string;
  columns: ChartColumn[];
  series: ChartSeries[];
  note?: string;
  showLegend?: boolean;
};

// Vertical stacked bars with an hour axis: each color is a series, the height is the column's total.
// Plain divs, no chart library. Hover a piece to see its hours.
export default function StackedBarChart({
  title,
  columns,
  series,
  note,
  showLegend = true,
}: StackedBarChartProps) {
  const totals = columnTotals(columns, series);
  const { top, ticks } = hourAxis(Math.max(...totals));

  // Distance from the bottom of the chart, as a percent of its height
  const percent = (hours: number) => `${(hours / top) * 100}%`;

  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="font-semibold">{title}</h2>

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
              {columns.map((column, index) => {
                const total = totals[index];

                return (
                  <div key={column.key} className="flex h-full w-20 shrink-0 items-end justify-center">
                    <div className="relative w-12" style={{ height: percent(total) }}>
                      <span className="absolute inset-x-0 -top-5 text-center text-xs font-medium text-stone-600">
                        {total > 0 ? formatHours(total) : ""}
                      </span>
                      <div
                        className={`flex h-full flex-col-reverse overflow-hidden rounded-t-md ${column.faded ? "opacity-60" : ""}`}
                      >
                        {series
                          .filter((item) => item.values[index] > 0)
                          .map((item) => (
                            <Segment
                              key={item.id}
                              item={item}
                              hours={item.values[index]}
                              style={{ height: `${(item.values[index] / total) * 100}%` }}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column labels, lined up under the bars */}
          <div className="flex gap-3 px-2">
            {columns.map((column) => (
              <span
                key={column.key}
                className={`mt-2 w-20 shrink-0 text-center text-xs ${column.highlight ? "font-semibold text-accent" : "text-stone-500"}`}
              >
                {column.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ChartLegend series={series} showSeries={showLegend} note={note} />
    </section>
  );
}