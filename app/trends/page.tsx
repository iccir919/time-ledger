import Link from "next/link";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { createClient } from "@/lib/supabase/server";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { loadTrends, WEEKDAYS, type TrendRow } from "@/lib/trends";
import { weekColumns, type ChartSeries } from "./chart-parts";
import HorizontalBarChart from "./horizontal-bar-chart";
import StackedBarChart from "./stacked-bar-chart";
import WeeklyTable from "./weekly-table";

type TrendsPageProps = {
  // ?category=<id> shows only that category
  searchParams: Promise<{ category?: string }>;
};

export default async function TrendsPage({ searchParams }: TrendsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Pull recent events from Google so this week is up to date. If it fails, still show the page.
  let sync: SyncResult | null = null;
  try {
    sync = await syncRecentWeeks(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  const trends = sync?.status === "ok" ? await loadTrends(sync.timeZone) : null;

  // The category being filtered to, if the URL names one that's on the page
  const { category: categoryParam } = await searchParams;
  const selected = trends?.rows.find((row) => row.id === categoryParam) ?? null;
  const rows = selected ? [selected] : (trends?.rows ?? []);

  // Clicking a color filters to it; clicking the color you're filtered to shows everything again
  const toSeries = (values: (row: TrendRow) => number[]): ChartSeries[] =>
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      values: values(row),
      href: selected?.id === row.id ? "/trends" : `/trends?category=${row.id}`,
    }));

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>
        <p className="mt-2 text-stone-600">How your weeks are going, week by week.</p>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {trends && trends.weeks.length === 0 && (
          <p className="mt-10 text-sm text-stone-600">
            Your trends show up here once you&apos;ve tracked some time or set goals on the Plan page.
          </p>
        )}

        {trends && trends.weeks.length > 0 && (
          <>
            {selected ? (
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-stone-100 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-stone-700">
                  Showing only
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selected.color }} />
                  <span className="font-medium">{selected.name}</span>
                </span>
                <Link href="/trends" className="text-stone-600 hover:text-stone-900 hover:underline">
                  Show all
                </Link>
                <Link
                  href={`/trends/${selected.id}`}
                  className="font-medium text-accent hover:underline"
                >
                  See details
                </Link>
              </div>
            ) : (
              <p className="mt-6 text-sm text-stone-500">Click a color in a chart to show only that category.</p>
            )}

            <HorizontalBarChart
              title="Where your weeks went"
              columns={weekColumns(trends.weeks)}
              series={toSeries((row) => row.hours)}
              note="This week is lighter because it isn't over yet"
            />
            <StackedBarChart
              title="By day of the week"
              columns={WEEKDAYS.map((weekday) => ({ key: weekday, label: weekday }))}
              series={toSeries((row) => row.weekdayHours)}
              note={`Totals across the ${trends.weeks.length === 1 ? "week" : `${trends.weeks.length} weeks`} shown`}
            />
            <WeeklyTable weeks={trends.weeks} rows={rows} />
          </>
        )}
      </main>
    </div>
  );
}