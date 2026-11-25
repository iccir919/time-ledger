import Link from "next/link";
import WeekCalendar from "@/app/budget/week-calendar";
import GoalBar from "@/components/goal-bar";
import GoalStatusLabel from "@/components/goal-status-label";
import { loadCalendarData } from "@/lib/calendar-data";
import { directionOf, goalProgress, goalStatus } from "@/lib/goals";
import { formatHours, hoursWithin } from "@/lib/hours";
import { createClient } from "@/lib/supabase/server";
import { loadTrends } from "@/lib/trends";
import type { Week } from "@/lib/week";

type OverviewProps = {
  userId: string;
  timeZone: string;
  week: Week;
};

// How tall the Today calendar is before it scrolls (about 12 hours)
const TODAY_CALENDAR_HEIGHT = 420;

// The dashboard: how today and this week are going, at a glance
export default async function Overview({ userId, timeZone, week }: OverviewProps) {
  const supabase = await createClient();

  const [calendar, goalsResult, nextGoalsResult, eventsResult, trackedResult, trends] =
    await Promise.all([
      // Today's calendar: plan blocks and tracked events, plus the categories
      loadCalendarData(userId, timeZone, week),
      supabase
        .from("weekly_budgets")
        .select("category_id, planned_hours, direction")
        .eq("week_start", week.weekStart),
      supabase
        .from("weekly_budgets")
        .select("id", { count: "exact", head: true })
        .eq("week_start", week.nextWeekStart),
      supabase
        .from("events")
        .select("category_id, start_at, end_at")
        .lt("start_at", week.end.toISOString())
        .gt("end_at", week.start.toISOString()),
      supabase.from("tracked_calendars").select("id", { count: "exact", head: true }),
      // All of history, so the average week has as many full weeks as possible
      loadTrends(timeZone, "all"),
    ]);

  if (goalsResult.error) {
    throw new Error(goalsResult.error.message);
  }
  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const categories = calendar.groups.flatMap((group) => group.categories);
  const events = eventsResult.data;
  const now = Date.now();

  // This week: hours done per category (only categorized events count, like the Plan grid)
  const doneByCategory = new Map<string, number>();
  for (const event of events) {
    if (event.category_id) {
      const hours = hoursWithin(event.start_at, event.end_at, week.start, week.end);
      doneByCategory.set(event.category_id, (doneByCategory.get(event.category_id) ?? 0) + hours);
    }
  }
  const doneTotal = [...doneByCategory.values()].reduce((sum, h) => sum + h, 0);

  // Where this week went: categories with time, most first
  const spent = categories
    .map((category) => ({ ...category, hours: doneByCategory.get(category.id) ?? 0 }))
    .filter((category) => category.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  // Plan time still ahead this week (after now), per category
  const aheadByCategory = new Map<string, number>();
  for (const block of calendar.blocks) {
    const categoryId = block.draft?.categoryId;
    if (block.kind === "plan" && categoryId) {
      const ahead =
        Math.max(0, Math.min(block.endMs, week.end.getTime()) - Math.max(block.startMs, now)) / 3_600_000;
      aheadByCategory.set(categoryId, (aheadByCategory.get(categoryId) ?? 0) + ahead);
    }
  }

  // Goals for categories that have one (0 counts: it's a limit), in category order
  const goalByCategory = new Map(goalsResult.data.map((goal) => [goal.category_id, goal]));
  const goalRows = categories
    .filter((category) => goalByCategory.has(category.id))
    .map((category) => ({
      ...category,
      goal: Number(goalByCategory.get(category.id)!.planned_hours),
      direction: directionOf(
        Number(goalByCategory.get(category.id)!.planned_hours),
        goalByCategory.get(category.id)!.direction === "at_most" ? "at_most" : "at_least"
      ),
      done: doneByCategory.get(category.id) ?? 0,
      ahead: aheadByCategory.get(category.id) ?? 0,
    }));
  const aheadTotal = [...aheadByCategory.values()].reduce((sum, h) => sum + h, 0);
  // All goals added up, for the goals card's header (shown only with 2 or more goals).
  // Each goal counts only up to itself.
  const progress = goalProgress(goalRows);

  // Today: just today's column of the calendar
  const todayDay = calendar.days.find((day) => day.date === week.today)!;
  const overlapToday = (startMs: number, endMs: number, from = todayDay.startMs) =>
    Math.max(0, Math.min(endMs, todayDay.endMs) - Math.max(startMs, from)) / 3_600_000;
  const doneToday = calendar.blocks
    .filter((block) => block.kind === "tracked")
    .reduce((sum, block) => sum + overlapToday(block.startMs, block.endMs), 0);
  // Planned time still ahead today: from now (or the block's start) to the block's end
  const plannedLeft = calendar.blocks
    .filter((block) => block.kind === "plan")
    .reduce((sum, block) => sum + overlapToday(block.startMs, block.endMs, now), 0);

  // Needs attention
  const noTrackedCalendars = (trackedResult.count ?? 0) === 0;
  const uncategorizedCount = events.filter((event) => !event.category_id).length;
  // Friday, Saturday, or Sunday (days 4 to 6, counting Monday as 0)
  const isLateInWeek = week.days.findIndex((day) => day.date === week.today) >= 4;
  const needsNextWeekGoals = isLateInWeek && (nextGoalsResult.count ?? 0) === 0;

  // Trends: this week so far next to the average full week (once there are 2)
  const weekTotals = (trends?.weeks ?? []).map((_, index) =>
    trends!.categories.reduce((sum, category) => sum + category.weekHours[index], 0)
  );
  // Full weeks: all 7 days in the history, and not this week
  const fullWeekTotals = weekTotals.filter(
    (_, index) => trends!.weeks[index].dayCount === 7 && !trends!.weeks[index].isCurrent
  );
  const averageWeek =
    fullWeekTotals.length >= 2
      ? fullWeekTotals.reduce((sum, h) => sum + h, 0) / fullWeekTotals.length
      : null;

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <p className="mt-1 text-stone-600">{dateLabel.format(now)}</p>
      {/* Where this week went: one bar split by category, biggest first */}
      {spent.length > 0 && (
        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold">Where this week went</h2>
            <Link href="/trends" className="text-sm font-medium text-accent hover:underline">
              See trends
            </Link>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {formatHours(doneTotal)} done
            {aheadTotal > 0 && <> · {formatHours(aheadTotal)} planned ahead</>}
          </p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full">
            {spent.map((category) => (
              <div
                key={category.id}
                title={`${category.name}: ${formatHours(category.hours)}`}
                style={{ width: `${(category.hours / doneTotal) * 100}%`, backgroundColor: category.color }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
            {spent.slice(0, 3).map((category) => (
              <span key={category.id} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                {category.name}
                <span className="tabular-nums text-stone-400">{formatHours(category.hours)}</span>
              </span>
            ))}
            {spent.length > 3 && <span className="text-stone-400">and {spent.length - 3} more</span>}
          </div>
        </section>
      )}

      <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
        {/* Today: the calendar for today, where you can add and edit plan blocks */}
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold">Today</h2>
            <Link href="/budget?view=calendar" className="text-sm font-medium text-accent hover:underline">
              Whole week
            </Link>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {formatHours(doneToday)} done
            {plannedLeft > 0 && <> · {formatHours(plannedLeft)} planned left</>}
          </p>

          <WeekCalendar
            days={[todayDay]}
            today={week.today}
            mobileDates={[week.today]}
            nowMinutes={calendar.nowMinutes}
            blocks={calendar.blocks}
            canAddBlocks={calendar.hasPlanCalendar}
            groups={calendar.groups}
            timeZone={timeZone}
            scrollHeight={TODAY_CALENDAR_HEIGHT}
            headerHref="/budget?view=calendar"
          />
          <p className="mt-2 text-xs text-stone-400">
            Plan on the left, tracked on the right.
            {calendar.hasPlanCalendar && " Click an empty spot to add a plan block."}
          </p>
        </section>

        <div className="space-y-4">
          {/* Needs attention: only things you can act on */}
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold">Needs attention</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {noTrackedCalendars && (
                <li>
                  No calendars are tracked yet.{" "}
                  <Link href="/calendars" className="font-medium text-accent hover:underline">
                    Choose calendars
                  </Link>
                </li>
              )}
              {uncategorizedCount > 0 && (
                <li>
                  {uncategorizedCount === 1 ? "1 event needs" : `${uncategorizedCount} events need`} a
                  category.{" "}
                  <Link
                    href={`/inbox?week=${week.weekStart}`}
                    className="font-medium text-accent hover:underline"
                  >
                    Sort them
                  </Link>
                </li>
              )}
              {needsNextWeekGoals && (
                <li>
                  Next week has no goals yet.{" "}
                  <Link
                    href={`/budget?week=${week.nextWeekStart}`}
                    className="font-medium text-accent hover:underline"
                  >
                    Set goals
                  </Link>
                </li>
              )}
              {calendar.planMissing && (
                <li>
                  Your Plan calendar was deleted in Google.{" "}
                  <Link href="/calendars" className="font-medium text-accent hover:underline">
                    Create a new one
                  </Link>
                </li>
              )}
              {!noTrackedCalendars &&
                uncategorizedCount === 0 &&
                !needsNextWeekGoals &&
                !calendar.planMissing && <li className="text-stone-500">You&apos;re all caught up.</li>}
            </ul>

            {averageWeek !== null && (
              <p className="mt-4 border-t border-stone-100 pt-3 text-sm text-stone-500">
                So far this week: {formatHours(weekTotals[weekTotals.length - 1])}. Your average week:{" "}
                {formatHours(averageWeek)}.
              </p>
            )}
          </section>

          {/* This week's goals */}
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            {/* A quiet total in the header, only when there's more than one goal to add up */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-semibold">This week&apos;s goals</h2>
              {progress && progress.count > 1 && (
                <p className="text-sm text-stone-500">
                  <span className="font-medium text-stone-900">{Number(progress.done.toFixed(2))}</span> of{" "}
                  {formatHours(progress.total)}
                </p>
              )}
            </div>

            {goalRows.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">
                No goals this week.{" "}
                <Link href="/budget" className="font-medium text-accent hover:underline">
                  Set goals on the Plan page
                </Link>
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {goalRows.map((row) => {
                  const status = goalStatus(row.goal, row.done, row.ahead, row.direction);
                  const isLimit = row.direction === "at_most";
                  return (
                    <li key={row.id} className="text-sm">
                      {/* Name and numbers, then the bar, then the status: one line each */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          {row.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          <span>
                            {Number(row.done.toFixed(2))}
                          </span>
                          <span className="text-stone-500">
                            {isLimit && row.done > row.goal ? " over " : " of "}
                            {formatHours(row.goal)}
                            {isLimit ? " max" : ""}
                          </span>
                        </span>
                      </div>
                      {/* Solid = done, light = planned ahead, a line at the goal, and anything past it */}
                      <GoalBar
                        goal={row.goal}
                        done={row.done}
                        ahead={row.ahead}
                        direction={row.direction}
                        color={row.color}
                        className="mt-1.5"
                      />
                      {/* "Over limit" is already said by "4.5 over 0h max" above */}
                      {status.tone !== "over" && (
                        <p className="mt-1 text-xs">
                          <GoalStatusLabel status={status} />
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}