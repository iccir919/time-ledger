import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours, hoursWithin } from "@/lib/hours";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import WeekNav from "@/components/week-nav";
import { getWeekInRange, type Week } from "@/lib/week";
import { copyLastWeek } from "./actions";
import WeekGrid from "./week-grid";

type BudgetPageProps = {
  searchParams: Promise<{ week?: string }>;
};

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Sync first so actual hours match Google
  let sync: SyncResult | null = null;
  try {
    sync = await syncRecentWeeks(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  // The week being viewed, from the URL (?week=2026-11-23); defaults to this week
  const { week: weekParam } = await searchParams;
  const week =
    sync?.status === "ok"
      ? getWeekInRange(sync.timeZone, weekParam, { weeksBack: 1, weeksAhead: Infinity })
      : null;

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {sync?.status === "ok" && week && (
          <>
            <WeekNav basePath="/budget" week={week} timeZone={sync.timeZone} />
            <Plan timeZone={sync.timeZone} week={week} />
          </>
        )}
      </main>
    </div>
  );
}

type PlanProps = {
  timeZone: string;
  week: Week;
};

async function Plan({ timeZone, week }: PlanProps) {
  const supabase = await createClient();
  const lastDate = week.days[6].date;

  const [groupsResult, plansResult, previousResult, eventsResult] = await Promise.all([
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase
      .from("daily_plans")
      .select("category_id, plan_date, planned_hours")
      .gte("plan_date", week.weekStart)
      .lte("plan_date", lastDate),
    supabase
      .from("daily_plans")
      .select("id", { count: "exact", head: true })
      .gte("plan_date", week.previousWeekStart)
      .lt("plan_date", week.weekStart)
      .gt("planned_hours", 0),
    supabase
      .from("events")
      .select("category_id, start_at, end_at")
      .lt("start_at", week.end.toISOString())
      .gt("end_at", week.start.toISOString()),
  ]);

  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }
  if (plansResult.error) {
    throw new Error(plansResult.error.message);
  }
  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const groups = groupsResult.data;

  if (groups.length === 0) {
    return (
      <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
        <h2 className="font-semibold">No categories yet</h2>
        <p className="mt-2 text-sm text-stone-600">
          <Link href="/categories" className="font-medium text-accent hover:underline">
            Set up your categories
          </Link>{" "}
          to start planning your week.
        </p>
      </section>
    );
  }

  // Planned hours, keyed by "<categoryId>:<date>"
  const planned: Record<string, number> = {};
  for (const plan of plansResult.data) {
    planned[`${plan.category_id}:${plan.plan_date}`] = Number(plan.planned_hours);
  }

  // Actual hours per category per day. An event crossing midnight is split between days.
  const actual: Record<string, number> = {};
  let uncategorizedHours = 0;
  for (const event of eventsResult.data) {
    for (const day of week.days) {
      const hours = hoursWithin(event.start_at, event.end_at, day.start, day.end);
      if (hours === 0) {
        continue;
      }
      if (event.category_id) {
        const key = `${event.category_id}:${day.date}`;
        actual[key] = (actual[key] ?? 0) + hours;
      } else {
        uncategorizedHours += hours;
      }
    }
  }

  const hasPlan = plansResult.data.some((plan) => Number(plan.planned_hours) > 0);
  const showCopyLastWeek = !hasPlan && (previousResult.count ?? 0) > 0;

  // Day labels in the user's time zone, e.g. "Mon" and "16"
  const weekdayLabel = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const dayNumberLabel = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" });

  const days = week.days.map((day) => ({
    date: day.date,
    weekday: weekdayLabel.format(day.start),
    dayNumber: dayNumberLabel.format(day.start),
  }));

  return (
    <>
      <p className="mt-4 text-stone-600">
        Plan hours by day; actual hours appear under each cell.
      </p>

      {showCopyLastWeek && (
        <form
          action={copyLastWeek}
          className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-dashed border-stone-300 px-5 py-4"
        >
          <input type="hidden" name="week_start" value={week.weekStart} />
          <p className="text-sm text-stone-600">No plan for this week yet.</p>
          <button className="rounded-md px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft">
            Copy last week&apos;s plan
          </button>
        </form>
      )}

      <WeekGrid
        key={`${week.weekStart}:${hasPlan}`}
        groups={groups}
        days={days}
        today={week.today}
        planned={planned}
        actual={actual}
      />

      {uncategorizedHours > 0 && (
        <p className="mt-6 text-sm text-stone-600">
          {formatHours(uncategorizedHours)} of events in this week still need a category.{" "}
          <Link
            href={`/inbox?week=${week.weekStart}`}
            className="font-medium text-accent hover:underline"
          >
            Sort them in the inbox
          </Link>
        </p>
      )}
    </>
  );
}