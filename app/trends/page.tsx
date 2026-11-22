import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { createClient } from "@/lib/supabase/server";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { loadTrends } from "@/lib/trends";
import WeeklyChart from "./weekly-chart";
import WeeklyTable from "./weekly-table";

export default async function TrendsPage() {
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
            <WeeklyChart weeks={trends.weeks} rows={trends.rows} />
            <WeeklyTable weeks={trends.weeks} rows={trends.rows} />
          </>
        )}
      </main>
    </div>
  );
}