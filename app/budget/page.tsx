import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours, hoursWithin } from "@/lib/hours";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { copyLastWeek } from "./actions";
import BudgetForm from "./budget-form";

export default async function BudgetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Sync first so "Actual" matches Google
  let sync: SyncResult | null = null;
  try {
    sync = await syncRecentWeeks(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {sync?.status === "ok" && (
          <Budget
            timeZone={sync.timeZone}
            start={sync.week.start}
            end={sync.week.end}
            weekStart={sync.week.weekStart}
            previousWeekStart={sync.week.previousWeekStart}
          />
        )}
      </main>
    </div>
  );
}

type BudgetProps = {
  timeZone: string;
  start: Date;
  end: Date;
  weekStart: string;
  previousWeekStart: string;
};

async function Budget({ timeZone, start, end, weekStart, previousWeekStart }: BudgetProps) {
  const supabase = await createClient();

  const [groupsResult, budgetsResult, previousResult, eventsResult] = await Promise.all([
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase
      .from("weekly_budgets")
      .select("category_id, planned_hours")
      .eq("week_start", weekStart),
    supabase
      .from("weekly_budgets")
      .select("id", { count: "exact", head: true })
      .eq("week_start", previousWeekStart),
    supabase
      .from("events")
      .select("category_id, start_at, end_at")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString()),
  ]);

  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }
  if (budgetsResult.error) {
    throw new Error(budgetsResult.error.message);
  }
  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const groups = groupsResult.data;
  const budgets = budgetsResult.data;

  if (groups.length === 0) {
    return (
      <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
        <h2 className="font-semibold">No categories yet</h2>
        <p className="mt-2 text-sm text-stone-600">
          <Link href="/categories" className="font-medium text-accent hover:underline">
            Set up your categories
          </Link>{" "}
          to start budgeting your week.
        </p>
      </section>
    );
  }

  // Planned hours by category
  const planned: Record<string, number> = {};
  for (const budget of budgets) {
    planned[budget.category_id] = Number(budget.planned_hours);
  }

  // Actual hours by category, counting only the part of each event inside this week
  const actual: Record<string, number> = {};
  let uncategorizedHours = 0;
  for (const event of eventsResult.data) {
    const hours = hoursWithin(event.start_at, event.end_at, start, end);
    if (event.category_id) {
      actual[event.category_id] = (actual[event.category_id] ?? 0) + hours;
    } else {
      uncategorizedHours += hours;
    }
  }

  const showCopyLastWeek = budgets.length === 0 && (previousResult.count ?? 0) > 0;

  const shortDate = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const lastDay = new Date(end.getTime() - 1);

  return (
    <>
      <p className="mt-2 text-stone-600">
        Week of {shortDate.format(start)} to {shortDate.format(lastDay)}. Give every hour a job.
      </p>

      {showCopyLastWeek && (
        <form
          action={copyLastWeek}
          className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-dashed border-stone-300 px-5 py-4"
        >
          <input type="hidden" name="week_start" value={weekStart} />
          <input type="hidden" name="previous_week_start" value={previousWeekStart} />
          <p className="text-sm text-stone-600">No plan for this week yet.</p>
          <button className="rounded-md px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft">
            Copy last week&apos;s plan
          </button>
        </form>
      )}

      <BudgetForm
        key={`${weekStart}:${budgets.length}`}
        weekStart={weekStart}
        groups={groups}
        planned={planned}
        actual={actual}
      />

      {uncategorizedHours > 0 && (
        <p className="mt-6 text-sm text-stone-600">
          {formatHours(uncategorizedHours)} of events this week still need a category.{" "}
          <Link href="/inbox" className="font-medium text-accent hover:underline">
            Sort them in the inbox
          </Link>
        </p>
      )}
    </>
  );
}