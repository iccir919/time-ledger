import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours } from "@/lib/hours";
import { createClient } from "@/lib/supabase/server";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { loadTrends, type TrendCategory } from "@/lib/trends";
import PatternsCard from "../patterns-card";
import RangePicker from "../range-picker";

type CategoryTrendsProps = {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<{ range?: string }>;
};

// One category up close: the same Patterns card as Trends, for just this category,
// plus its top events
export default async function CategoryTrendsPage({ params, searchParams }: CategoryTrendsProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { categoryId } = await params;
  const { range } = await searchParams;

  let sync: SyncResult | null = null;
  try {
    sync = await syncRecentWeeks(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  const trends = sync?.status === "ok" ? await loadTrends(sync.timeZone, range) : null;
  const category = trends?.categories.find((candidate) => candidate.id === categoryId);

  // Synced fine but this category has no time in this range (or doesn't exist)
  if (sync?.status === "ok" && !category) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href={`/trends${trends ? `?range=${trends.range}` : ""}`} className="text-sm text-stone-500 hover:text-stone-900">
          &larr; Trends
        </Link>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {trends && category && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="size-4 rounded-full" style={{ backgroundColor: category.color }} />
                  {category.name}
                </h1>
                <p className="mt-2 text-stone-600">
                  {formatHours(category.total)} from {trends.periodLabel}, {formatHours(category.weeklyAverage)} in an
                  average week ({Math.round(category.share * 100)}% of your tracked time).
                </p>
              </div>
              <RangePicker ranges={trends.ranges} current={trends.range} basePath={`/trends/${category.id}`} />
            </div>

            <PatternsCard
              periodLabel={trends.periodLabel}
              days={trends.days}
              weeks={trends.weeks}
              categories={[category]}
            />
            <TopEvents category={category} />
          </>
        )}
      </main>
    </div>
  );
}

function TopEvents({ category }: { category: TrendCategory }) {
  const topHours = category.topTitles[0]?.hours ?? 0;

  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-semibold">Top events</h2>
      {category.topTitles.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">No tracked events yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {category.topTitles.map((entry) => (
            <li key={entry.title} className="text-sm">
              <div className="flex justify-between gap-4">
                <span className="truncate text-stone-700">{entry.title}</span>
                <span className="shrink-0 tabular-nums text-stone-500">{formatHours(entry.hours)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(entry.hours / topHours) * 100}%`, backgroundColor: category.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {category.id === "uncategorized" && (
        <p className="mt-4 text-sm text-stone-600">
          Give these a category in the{" "}
          <Link href="/inbox" className="font-medium text-accent hover:underline">
            Inbox
          </Link>
          .
        </p>
      )}
    </section>
  );
}