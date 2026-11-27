import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadPlanBlocks, nameKey } from "@/lib/plan-blocks";
import { combinePlans, hoursByDay } from "@/lib/plan-math";
import { getWeek } from "@/lib/week";

export type WeekPlan = {
  // This week's days, Monday first, and today
  dates: string[];
  today: string;
  // Per category: hours still planned on each of this week's days (0 for past days)
  aheadByCategory: Record<string, number[]>;
  // Per category: hours done this week
  doneByCategory: Record<string, number>;
};

// This week's done and still-planned time per category, counted like the Plan page
// (each day's plan is the bigger of typed hours and Plan calendar blocks).
// For Trends' "Done + planned".
export async function loadWeekPlan(userId: string, timeZone: string): Promise<WeekPlan> {
  const supabase = await createClient();
  const week = getWeek(timeZone);
  const now = Date.now();

  const [groupsResult, eventsResult, dayPlansResult, settingsResult] = await Promise.all([
    supabase.from("category_groups").select("categories(id, name)"),
    supabase
      .from("events")
      .select("category_id, start_at, end_at")
      .lt("start_at", week.end.toISOString())
      .gt("end_at", week.start.toISOString()),
    supabase
      .from("daily_plans")
      .select("category_id, plan_date, planned_hours")
      .gte("plan_date", week.days[0].date)
      .lte("plan_date", week.days[week.days.length - 1].date),
    supabase.from("user_settings").select("plan_calendar_id").maybeSingle(),
  ]);

  for (const result of [groupsResult, eventsResult, dayPlansResult, settingsResult]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const categories = (groupsResult.data ?? []).flatMap((group) => group.categories);
  const categoryIdByName = new Map(categories.map((category) => [nameKey(category.name), category.id]));

  // Done so far (nothing after now counts)
  const nowIso = new Date(now).toISOString();
  const actual = hoursByDay(
    (eventsResult.data ?? []).map((event) => ({
      categoryId: event.category_id,
      startAt: event.start_at,
      endAt: event.end_at < nowIso ? event.end_at : nowIso,
    })),
    week.days,
    now
  ).total;

  // Plan calendar blocks, matched to categories by title (a Google problem just means none)
  const planCalendarId = settingsResult.data?.plan_calendar_id ?? null;
  const planBlocks = planCalendarId ? (await loadPlanBlocks(userId, planCalendarId, week)).blocks : [];
  const scheduled = hoursByDay(
    planBlocks.map((block) => ({
      categoryId: categoryIdByName.get(nameKey(block.title)) ?? null,
      startAt: block.startAt,
      endAt: block.endAt,
    })),
    week.days,
    now
  );

  const typed: Record<string, number> = {};
  for (const plan of dayPlansResult.data ?? []) {
    typed[`${plan.category_id}:${plan.plan_date}`] = Number(plan.planned_hours);
  }

  const { plannedAhead } = combinePlans({
    categoryIds: categories.map((category) => category.id),
    days: week.days,
    today: week.today,
    typed,
    scheduled: scheduled.total,
    scheduledAhead: scheduled.ahead,
    actual,
  });

  const aheadByCategory: Record<string, number[]> = {};
  const doneByCategory: Record<string, number> = {};
  for (const category of categories) {
    const ahead = week.days.map((day) => plannedAhead[`${category.id}:${day.date}`] ?? 0);
    if (ahead.some((hours) => hours > 0)) {
      aheadByCategory[category.id] = ahead;
    }
    const done = week.days.reduce((sum, day) => sum + (actual[`${category.id}:${day.date}`] ?? 0), 0);
    if (done > 0) {
      doneByCategory[category.id] = done;
    }
  }

  return { dates: week.days.map((day) => day.date), today: week.today, aheadByCategory, doneByCategory };
}