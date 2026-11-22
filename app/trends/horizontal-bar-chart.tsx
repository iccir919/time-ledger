import { formatHours } from "@/lib/hours";
import {
  ChartLegend,
  columnTotals,
  hourAxis,
  Segment,
  type ChartColumn,
  type ChartSeries,
} from "./chart-parts";

type HorizontalBarChartProps = {
  title: string;
  // Each column is one row here, top to bottom
  columns: ChartColumn[];
  series: ChartSeries[];
  // Optional dashed line per row, e.g. that week's goal (0 = none)
  markers?: number[];
  markerLabel?: string;
  note?: string;
  showLegend?: boolean;
};

// Horizontal stacked bars: one row per column, bars grow to the right, hours along the bottom.
// Plain divs, no chart library. Hover a piece to see its hours.
export default function HorizontalBarChart({
  title,
  columns,
  series,
  markers,
  markerLabel = "Goal",
  note,
  showLegend = true,
}: HorizontalBarChartProps) {
  const totals = columnTotals(columns, series);
  const { top, ticks } = hourAxis(Math.max(...totals, ...(markers ?? [])));

  // Distance from the left of the track, as a percent of its width
  const percent = (hours: number) => `${(hours / top) * 100}%`;

  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="font-semibold">{title}</h2>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[30rem]">
          {columns.map((column, index) => {
            const total = totals[index];
            const marker = markers?.[index] ?? 0;

            return (
              <div key={column.key} className="flex items-center gap-3 py-1.5">
                {/* Row label, e.g. "Nov 9 to Nov 15" */}
                <div className="w-36 shrink-0 text-right text-xs leading-tight">
                  <div className={column.highlight ? "font-semibold text-accent" : "text-stone-600"}>
                    {column.label}
                  </div>
                  {column.sublabel && <div className="text-stone-400">{column.sublabel}</div>}
                </div>

                {/* The track. Right margin leaves room for the total past the longest bar. */}
                <div className="relative mr-14 h-8 flex-1">
                  {ticks
                    .filter((tick) => tick > 0)
                    .map((tick) => (
                      <div
                        key={tick}
                        className="absolute inset-y-0 border-l border-stone-100"
                        style={{ left: percent(tick) }}
                      />
                    ))}

                  <div
                    className={`relative flex h-full overflow-hidden rounded-r-md ${column.faded ? "opacity-60" : ""}`}
                    style={{ width: percent(total) }}
                  >
                    {series
                      .filter((item) => item.values[index] > 0)
                      .map((item) => (
                        <Segment
                          key={item.id}
                          item={item}
                          hours={item.values[index]}
                          style={{ width: `${(item.values[index] / total) * 100}%` }}
                        />
                      ))}
                  </div>

                  {total > 0 && (
                    <span
                      className="absolute top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-xs font-medium text-stone-600"
                      style={{ left: percent(total) }}
                    >
                      {formatHours(total)}
                    </span>
                  )}

                  {marker > 0 && (
                    <div
                      title={`${markerLabel}: ${formatHours(marker)}`}
                      className="absolute -inset-y-1 border-l-2 border-dashed border-stone-700"
                      style={{ left: percent(marker) }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Hour labels along the bottom */}
          <div className="flex gap-3">
            <div className="w-36 shrink-0" />
            <div className="relative mr-14 h-5 flex-1 border-t border-stone-300">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute top-1 -translate-x-1/2 text-xs text-stone-400"
                  style={{ left: percent(tick) }}
                >
                  {tick}h
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ChartLegend
        series={series}
        showSeries={showLegend}
        markerLabel={markers ? markerLabel : undefined}
        note={note}
      />
    </section>
  );
}