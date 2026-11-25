import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { createClient } from "@/lib/supabase/server";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { loadTrends } from "@/lib/trends";
import CategoriesTable from "./categories-table";
import PatternsCard from "./patterns-card";
import RangePicker from "./range-picker";

type TrendsPageProps = {
  // ?range=4w | 12w | year | all (only ranges with enough history are offered)
  searchParams: Promise<{ range?: string }>;
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

  const { range } = await searchParams;
  const trends = sync?.status === "ok" ? await loadTrends(sync.timeZone, range) : null;

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>
            <p className="mt-2 text-stone-600">Where your time goes, and when.</p>
          </div>
          {trends && <RangePicker ranges={trends.ranges} current={trends.range} basePath="/trends" />}
        </div>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {sync?.status === "ok" && (!trends || trends.categories.length === 0) && (
          <p className="mt-10 text-sm text-stone-600">
            Your trends show up here once you&apos;ve tracked some time in your calendars.
          </p>
        )}

        {trends && trends.categories.length > 0 && (
          <>
            <PatternsCard
              periodLabel={trends.periodLabel}
              days={trends.days}
              weeks={trends.weeks}
              categories={trends.categories}
            />
            <CategoriesTable categories={trends.categories} range={trends.range} />
          </>
        )}
      </main>
    </div>
  );
}