import type { TrendRow, TrendWeek } from "@/lib/trends";

type WeeklyTableProps = {
  weeks: TrendWeek[];
  rows: TrendRow[];
};

// 12.25 -> "12.3", 0 -> "–"
function shortHours(hours: number) {
  return hours > 0 ? String(Number(hours.toFixed(1))) : "–";
}

// Categories down the side, weeks across. A shaded cell means that week's goal was met.
export default function WeeklyTable({ weeks, rows }: WeeklyTableProps) {
  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="font-semibold">Hours by category</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr className="text-xs text-stone-400">
              <th className="text-left font-normal" />
              {weeks.map((week) => (
                <th
                  key={week.weekStart}
                  className={`px-2 font-normal ${week.isCurrent ? "font-semibold text-accent" : ""}`}
                >
                  {week.isCurrent ? "This week" : week.label}
                </th>
              ))}
              <th className="px-2 font-normal" title="Average of full weeks, not counting this one. Shows once there are two full weeks.">
                Avg
              </th>
              <th className="px-2 font-normal" title="This week's goal">
                Goal
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap pr-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.name}
                  </span>
                </td>
                {weeks.map((week, index) => {
                  const hours = row.hours[index];
                  const goal = row.goals[index];
                  const met = goal > 0 && hours >= goal;

                  return (
                    <td
                      key={week.weekStart}
                      title={goal > 0 ? `${shortHours(hours)} of ${goal}h goal` : undefined}
                      className={`rounded-md px-2 py-1 text-center tabular-nums ${
                        met ? "bg-accent-soft font-semibold text-accent" : hours > 0 ? "text-stone-700" : "text-stone-300"
                      }`}
                    >
                      {shortHours(hours)}
                    </td>
                  );
                })}
                <td className="px-2 text-center tabular-nums text-stone-600">
                  {row.average === null ? "–" : shortHours(row.average)}
                </td>
                <td className="px-2 text-center tabular-nums text-stone-400">
                  {row.currentGoal > 0 ? row.currentGoal : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs text-stone-500">
        <span className="h-3 w-4 rounded bg-accent-soft" />
        Goal met that week. Avg counts full weeks only, once there are two.
      </p>
    </section>
  );
}