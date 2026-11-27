import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours, hoursWithin } from "@/lib/hours";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { getMonthGrid, getWeekInRange, type Week } from "@/lib/week";
import { PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";
import { loadPlanBlocks, nameKey } from "@/lib/plan-blocks";
import { combinePlans } from "@/lib/plan-math";
import { copyLastWeekGoals } from "./actions";
import { createPlanCalendar } from "@/app/calendars/actions";
import WeekGrid from "./week-grid";
import type { GoalDirection } from "@/lib/goals";
import CalendarView from "./calendar-view";
import PlanTopBar from "./plan-top-bar";

type BudgetPageProps = {
  searchParams: Promise<{
    week?: string;
    plan?: string;
    view?: string;
    // The calendar's range: "month" for a month (?month=2026-11), otherwise a week
    range?: string;
    month?: string;
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
  const { week: weekParam, plan, view: viewParam, range, month: monthParam } = await searchParams;
  // Calendar is the default; the grid is ?view=grid
  const view = viewParam === "grid" ? "grid" : "calendar";
  const week =
    sync?.status === "ok"
      ? getWeekInRange(sync.timeZone, weekParam, { weeksBack: 1, weeksAhead: Infinity })
      : null;
  // The calendar can show a month instead; the grid is always a week
  const month =
    sync?.status === "ok" && view === "calendar" && range === "month"
      ? getMonthGrid(sync.timeZone, monthParam)
      : null;

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-5xl px-6 py-12 xl:max-w-7xl 2xl:max-w-[88rem]">
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {sync?.status === "ok" && week && (
          <>
            <PlanTopBar week={week} month={month} timeZone={sync.timeZone} view={view} />

            {view === "calendar" ? (
              <CalendarView userId={user.id} timeZone={sync.timeZone} week={week} month={month} />
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

  const [groupsResult, goalsResult, previousGoalsResult, eventsResult, settingsResult, dayPlansResult] =
    await Promise.all([
      supabase
        .from("category_groups")
        .select("id, name, categories(id, name, color)")
        .order("sort_order")
        .order("sort_order", { referencedTable: "categories" }),
      supabase
        .from("weekly_budgets")
        .select("category_id, goal, direction")
        .eq("week_start", week.weekStart),
      supabase
        .from("weekly_budgets")
        .select("id", { count: "exact", head: true })
        .eq("week_start", week.previousWeekStart)
        .gt("goal", 0),
      supabase
        .from("events")
        .select("category_id, start_at, end_at")
        .lt("start_at", week.end.toISOString())
        .gt("end_at", week.start.toISOString()),
      supabase.from("user_settings").select("plan_calendar_id, log_calendar_id").maybeSingle(),
      // Hours typed into the grid for each day (plans without a time)
      supabase
        .from("daily_plans")
        .select("category_id, plan_date, planned_hours")
        .gte("plan_date", week.days[0].date)
        .lte("plan_date", week.days[week.days.length - 1].date),
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
  if (dayPlansResult.error) {
    throw new Error(dayPlansResult.error.message);
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

  // Weekly goals and which way each points, keyed by category ID
  const goals: Record<string, number> = {};
  const directions: Record<string, GoalDirection> = {};
  for (const goal of goalsResult.data) {
    goals[goal.category_id] = Number(goal.goal);
    directions[goal.category_id] = goal.direction === "at_most" ? "at_most" : "at_least";
  }

  const categoryById = new Map(
    groups.flatMap((group) => group.categories).map((category) => [category.id, category])
  );

  // Actual hours per category per day. An event crossing midnight is split between days.
  const actual: Record<string, number> = {};
  let uncategorizedHours = 0;

  const logCalendarId = settingsResult.data?.log_calendar_id ?? null;

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

  // Scheduled hours per category per day, from the Plan calendar's blocks,
  // and the part of them still ahead (after now)
  const planCalendarId = settingsResult.data?.plan_calendar_id ?? null;
  const scheduled: Record<string, number> = {};
  const scheduledAhead: Record<string, number> = {};
  const now = Date.now();

  const unmatchedTitles = new Set<string>();
  let planProblem = false;
  let planMissing = false;

  if (planCalendarId) {
    const { blocks, problem, missing } = await loadPlanBlocks(userId, planCalendarId, week);
    planProblem = problem;
    planMissing = missing;

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
          scheduled[key] = (scheduled[key] ?? 0) + hours;

          const aheadFrom = new Date(Math.max(now, day.start.getTime()));
          const ahead = hoursWithin(block.startAt, block.endAt, aheadFrom, day.end);
          if (ahead > 0) {
            scheduledAhead[key] = (scheduledAhead[key] ?? 0) + ahead;
          }
        }
      }
    }
  }

  // Hours typed into the grid, keyed the same way
  const typed: Record<string, number> = {};
  for (const plan of dayPlansResult.data) {
    typed[`${plan.category_id}:${plan.plan_date}`] = Number(plan.planned_hours);
  }

  // Each day's plan (the bigger of typed and scheduled), and the part still ahead
  const { planned, plannedAhead } = combinePlans({
    categoryIds: [...categoryById.keys()],
    days: week.days,
    today: week.today,
    typed,
    scheduled,
    scheduledAhead,
    actual,
  });

  const hasGoals = goalsResult.data.some((goal) => Number(goal.goal) > 0);
  const showCopyLastWeek = !hasGoals && (previousGoalsResult.count ?? 0) > 0;

  // Day labels in the user's time zone, e.g. "Mon" and "16"
  const weekdayLabel = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const dayNumberLabel = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" });
  const fullLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const days = week.days.map((day) => ({
    date: day.date,
    weekday: weekdayLabel.format(day.start),
    dayNumber: dayNumberLabel.format(day.start),
    // e.g. "Fri, Nov 27", for the popup's day picker
    label: fullLabel.format(day.start),
    // Midnight to midnight, for the day timeline
    startMs: day.start.getTime(),
    endMs: day.end.getTime(),
  }));

  // Minutes since midnight today (null when today isn't in this week), so a popup opened
  // for today starts at the next full hour
  const todayDay = week.days.find((day) => day.date === week.today);
  const nowMinutes = todayDay ? (now - todayDay.start.getTime()) / 60_000 : null;

  return (
    <>
      {/* Offer to create a Plan calendar if there isn't one yet, or it was deleted in Google */}
      {(!planCalendarId || planMissing) && (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-5 py-4">
          <div className="max-w-md">
            <p className="text-sm font-medium text-stone-900">
              {planMissing ? "Your Plan calendar was deleted" : "Want to schedule your goals?"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">
              {planMissing
                ? "It's no longer in your Google account, so planned hours can't show. Create a new one to keep planning."
                : `Time Ledger can create a ${PLAN_CALENDAR_NAME} calendar in your Google account. Blocks you add there show up here as planned hours.`}
            </p>
          </div>
          <form action={createPlanCalendar}>
            <input type="hidden" name="return_to" value={`/budget?view=grid&week=${week.weekStart}`} />
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
              {planMissing ? "Create a new Plan calendar" : "Create Plan calendar"}
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
        today={week.today}
        goals={goals}
        directions={directions}
        planned={planned}
        plannedAhead={plannedAhead}
        actual={actual}
        typed={typed}
        scheduled={scheduled}
        scheduledAhead={scheduledAhead}
        canAddBlocks={Boolean(planCalendarId) && !planMissing}
        canLog={Boolean(logCalendarId)}
        timeZone={timeZone}
        nowMinutes={nowMinutes}
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