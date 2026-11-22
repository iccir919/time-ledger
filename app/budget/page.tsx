import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours, hoursWithin } from "@/lib/hours";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import WeekNav from "@/components/week-nav";
import { focusDays, getWeekInRange, type Week } from "@/lib/week";
import { PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";
import { loadPlanBlocks, nameKey } from "@/lib/plan-blocks";
import { copyLastWeekGoals } from "./actions";
import { createPlanCalendar } from "@/app/calendars/actions";
import WeekGrid from "./week-grid";
import CalendarView from "./calendar-view";

type BudgetPageProps = {
  searchParams: Promise<{
    week?: string;
    plan?: string;
    view?: string;
  }>;
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
  const { week: weekParam, plan, view: viewParam } = await searchParams;
  const view = viewParam === "calendar" ? "calendar" : "grid";
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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <WeekNav
                basePath="/budget"
                week={week}
                timeZone={sync.timeZone}
                params={view === "calendar" ? { view: "calendar" } : undefined}
              />

              {/* Grid | Calendar switch: big, since it's one of the main controls */}
              <nav
                aria-label="Choose a view"
                className="mt-4 grid w-full grid-cols-2 rounded-xl bg-stone-200/70 p-1 sm:w-auto"
              >
                <Link
                  href={`/budget?week=${week.weekStart}`}
                  aria-current={view === "grid" ? "page" : undefined}
                  className={`flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-base font-medium transition-colors ${
                    view === "grid" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"
                  }`}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <rect x="3" y="3" width="6" height="6" rx="1" />
                    <rect x="11" y="3" width="6" height="6" rx="1" />
                    <rect x="3" y="11" width="6" height="6" rx="1" />
                    <rect x="11" y="11" width="6" height="6" rx="1" />
                  </svg>
                  Grid
                </Link>
                <Link
                  href={`/budget?week=${week.weekStart}&view=calendar`}
                  aria-current={view === "calendar" ? "page" : undefined}
                  className={`flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-base font-medium transition-colors ${
                    view === "calendar" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"
                  }`}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <rect x="3" y="4" width="14" height="13" rx="2" />
                    <path d="M3 8h14M7 2.5v3M13 2.5v3" />
                  </svg>
                  Calendar
                </Link>
              </nav>
            </div>

            {view === "calendar" ? (
              <CalendarView userId={user.id} timeZone={sync.timeZone} week={week} />
            ) : (
              <Plan
                userId={user.id}
                timeZone={sync.timeZone}
                week={week}
                planStatus={plan}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

type PlanProps = {
  userId: string;
  timeZone: string;
  week: Week;
  // Set after "Create Plan calendar" runs from this page
  planStatus?: string;
};

async function Plan({ userId, timeZone, week, planStatus }: PlanProps) {
  const supabase = await createClient();

  const [groupsResult, goalsResult, previousGoalsResult, eventsResult, settingsResult] =
    await Promise.all([
      supabase
        .from("category_groups")
        .select("id, name, categories(id, name, color)")
        .order("sort_order")
        .order("sort_order", { referencedTable: "categories" }),
      supabase
        .from("weekly_budgets")
        .select("category_id, planned_hours")
        .eq("week_start", week.weekStart),
      supabase
        .from("weekly_budgets")
        .select("id", { count: "exact", head: true })
        .eq("week_start", week.previousWeekStart)
        .gt("planned_hours", 0),
      supabase
        .from("events")
        .select("category_id, start_at, end_at")
        .lt("start_at", week.end.toISOString())
        .gt("end_at", week.start.toISOString()),
      supabase.from("user_settings").select("plan_calendar_id").maybeSingle(),
    ]);

  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }
  if (goalsResult.error) {
    throw new Error(goalsResult.error.message);
  }
  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
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

  // Weekly goals, keyed by category ID
  const goals: Record<string, number> = {};
  for (const goal of goalsResult.data) {
    goals[goal.category_id] = Number(goal.planned_hours);
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

  // Planned hours per category per day, from the Plan calendar's blocks
  const planCalendarId = settingsResult.data?.plan_calendar_id ?? null;
  const planned: Record<string, number> = {};
  const unmatchedTitles = new Set<string>();
  let planProblem = false;

  if (planCalendarId) {
    const { blocks, problem } = await loadPlanBlocks(userId, planCalendarId, week);
    planProblem = problem;

    const categoryIdByName = new Map(
      groups
        .flatMap((group) => group.categories)
        .map((category) => [nameKey(category.name), category.id])
    );

    for (const block of blocks) {
      const categoryId = categoryIdByName.get(nameKey(block.title));
      if (!categoryId) {
        unmatchedTitles.add(block.title);
        continue;
      }
      for (const day of week.days) {
        const hours = hoursWithin(block.startAt, block.endAt, day.start, day.end);
        if (hours > 0) {
          const key = `${categoryId}:${day.date}`;
          planned[key] = (planned[key] ?? 0) + hours;
        }
      }
    }
  }

  const hasGoals = goalsResult.data.some((goal) => Number(goal.planned_hours) > 0);
  const showCopyLastWeek = !hasGoals && (previousGoalsResult.count ?? 0) > 0;

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

      {/* Offer to create a Plan calendar if there isn't one yet */}
      {!planCalendarId && (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-5 py-4">
          <div className="max-w-md">
            <p className="text-sm font-medium text-stone-900">Want to schedule your goals?</p>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">
              Time Ledger can create a {PLAN_CALENDAR_NAME} calendar in your Google account.
              Blocks you add there show up here as planned hours.
            </p>
          </div>
          <form action={createPlanCalendar}>
            <input type="hidden" name="return_to" value={`/budget?week=${week.weekStart}`} />
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
              Create Plan calendar
            </button>
          </form>
        </section>
      )}

      {planStatus === "created" && planCalendarId && (
        <p className="mt-4 text-sm text-accent">
          Created. Add blocks to {PLAN_CALENDAR_NAME} in Google Calendar, titled with a category
          name, and they&apos;ll show up here.
        </p>
      )}

      {planStatus === "needs_permission" && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Time Ledger needs permission to create its calendar. Sign out, sign back in, and approve
          the new permission on Google&apos;s screen, then try again.
        </p>
      )}

      {planProblem && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load your Plan calendar right now, so planned hours are missing. Try
          refreshing the page.
        </p>
      )}

      {unmatchedTitles.size > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These Plan calendar blocks don&apos;t match a category:{" "}
          <span className="font-medium">{[...unmatchedTitles].join(", ")}</span>. Rename the
          block or the category so they match.
        </p>
      )}

      {showCopyLastWeek && (
        <form
          action={copyLastWeekGoals}
          className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-dashed border-stone-300 px-5 py-4"
        >
          <input type="hidden" name="week_start" value={week.weekStart} />
          <input type="hidden" name="previous_week_start" value={week.previousWeekStart} />
          <p className="text-sm text-stone-600">No goals for this week yet.</p>
          <button className="rounded-md px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft">
            Copy last week&apos;s goals
          </button>
        </form>
      )}

      <WeekGrid
        key={week.weekStart}
        weekStart={week.weekStart}
        groups={groups}
        days={days}
        mobileDates={focusDays(days.map((day) => day.date), week.today)}
        today={week.today}
        goals={goals}
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