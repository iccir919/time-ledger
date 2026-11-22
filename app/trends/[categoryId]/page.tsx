import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours } from "@/lib/hours";
import { createClient } from "@/lib/supabase/server";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { loadTrends, WEEKDAYS, type TrendRow, type TrendWeek } from "@/lib/trends";
import { weekColumns } from "../chart-parts";
import HorizontalBarChart from "../horizontal-bar-chart";
import StackedBarChart from "../stacked-bar-chart";

type CategoryTrendsProps = {
  params: Promise<{ categoryId: string }>;
};

// One category up close: week by week against its goal, by weekday, and its top events
export default async function CategoryTrendsPage({ params }: CategoryTrendsProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { categoryId } = await params;

  let sync: SyncResult | null = null;
  try {
    sync = await syncRecentWeeks(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  const trends = sync?.status === "ok" ? await loadTrends(sync.timeZone) : null;
  const row = trends?.rows.find((candidate) => candidate.id === categoryId);

  // Synced fine but this category has no hours or goals in the weeks shown (or doesn't exist)
  if (trends && !row) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/trends" className="text-sm text-stone-500 hover:text-stone-900">
          &larr; Trends
        </Link>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {trends && row && <CategoryDetail weeks={trends.weeks} row={row} />}
      </main>
    </div>
  );
}

type CategoryDetailProps = {
  weeks: TrendWeek[];
  row: TrendRow;
};

function CategoryDetail({ weeks, row }: CategoryDetailProps) {
  const total = row.hours.reduce((sum, h) => sum + h, 0);

  // Goal hit rate over full weeks that had a goal (this week isn't over yet)
  const fullWeekIndexes = weeks.map((_, index) => index).filter((index) => !weeks[index].isCurrent);
  const weeksWithGoal = fullWeekIndexes.filter((index) => row.goals[index] > 0);
  const weeksMet = weeksWithGoal.filter((index) => row.hours[index] >= row.goals[index]);

  const series = (values: number[]) => [{ id: row.id, name: row.name, color: row.color, values }];
  const topHours = row.topTitles[0]?.hours ?? 0;

  return (
    <>
      <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold tracking-tight">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: row.color }} />
        {row.name}
      </h1>
      <p className="mt-2 text-stone-600">
        {formatHours(total)} over {weeks.length === 1 ? "1 week" : `${weeks.length} weeks`}
        {row.average !== null && <>, {formatHours(row.average)} a week on average</>}
        {weeksWithGoal.length > 0 && (
          <>
            . Goal met {weeksMet.length} of {weeksWithGoal.length} full{" "}
            {weeksWithGoal.length === 1 ? "week" : "weeks"}
          </>
        )}
        .
      </p>

      <HorizontalBarChart
        title="Week by week"
        columns={weekColumns(weeks)}
        series={series(row.hours)}
        markers={row.goals.some((goal) => goal > 0) ? row.goals : undefined}
        showLegend={false}
        note="This week is lighter because it isn't over yet"
      />

      <StackedBarChart
        title="By day of the week"
        columns={WEEKDAYS.map((weekday) => ({ key: weekday, label: weekday }))}
        series={series(row.weekdayHours)}
        showLegend={false}
        note={`Totals across the ${weeks.length === 1 ? "week" : `${weeks.length} weeks`} shown`}
      />

      <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="font-semibold">Top events</h2>
        {row.topTitles.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">No tracked events yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {row.topTitles.map((entry) => (
              <li key={entry.title} className="text-sm">
                <div className="flex justify-between gap-4">
                  <span className="truncate text-stone-700">{entry.title}</span>
                  <span className="shrink-0 tabular-nums text-stone-500">{formatHours(entry.hours)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(entry.hours / topHours) * 100}%`, backgroundColor: row.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {row.id === "uncategorized" && (
          <p className="mt-4 text-sm text-stone-600">
            Give these a category in the{" "}
            <Link href="/inbox" className="font-medium text-accent hover:underline">
              Inbox
            </Link>
            .
          </p>
        )}
      </section>
    </>
  );
}