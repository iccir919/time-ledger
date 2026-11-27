import "server-only";
import { createClient } from "@/lib/supabase/server";
import { directionOf, type GoalDirection } from "@/lib/goals";
import type { Week } from "@/lib/week";
import { loadWeekPlan } from "@/lib/week-plan";

export type WeekGoal = {
  // null when there's no goal; 0 is a real goal (a limit)
  goal: number | null;
  direction: GoalDirection;
  done: number;
  ahead: number;
};

// Per category ID. Categories with no goal and no time aren't in here.
export type WeekGoals = Record<string, WeekGoal>;

// One week's goals with their progress: what's done and what's still planned, counted like
// the Plan grid. The Plan page's sidebar shows these in both views, so they always match.
export async function loadWeekGoals(userId: string, timeZone: string, week: Week): Promise<WeekGoals> {
  const supabase = await createClient();
  const [plan, goalsResult] = await Promise.all([
    loadWeekPlan(userId, timeZone, { week, doneUntilNow: false }),
    supabase.from("weekly_budgets").select("category_id, goal, direction").eq("week_start", week.weekStart),
  ]);
  if (goalsResult.error) {
    throw new Error(goalsResult.error.message);
  }

  const goals: WeekGoals = {};
  const entry = (categoryId: string) =>
    (goals[categoryId] ??= { goal: null, direction: "at_least", done: 0, ahead: 0 });

  for (const row of goalsResult.data) {
    const goal = Number(row.goal);
    Object.assign(entry(row.category_id), { goal, direction: directionOf(goal, row.direction as GoalDirection) });
  }
  for (const [categoryId, done] of Object.entries(plan.doneByCategory)) {
    entry(categoryId).done = done;
  }
  for (const [categoryId, aheadByDay] of Object.entries(plan.aheadByCategory)) {
    entry(categoryId).ahead = aheadByDay.reduce((sum, hours) => sum + hours, 0);
  }
  return goals;
}