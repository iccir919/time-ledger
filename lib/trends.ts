import "server-only";
import { format, subWeeks } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { hoursWithin } from "@/lib/hours";
import { getWeek } from "@/lib/week";

// How many weeks Trends looks back over, counting this week
const WEEKS_SHOWN = 8;

// Supabase returns at most 1,000 rows per request, so events are read in pages
const PAGE_SIZE = 1000;

// Full weeks needed before showing an average
const MIN_WEEKS_FOR_AVERAGE = 2;

const UNCATEGORIZED_COLOR = "#a8a29e";

export type TrendWeek = {
  weekStart: string; // "2026-11-16"
  label: string; // "Nov 16"
  isCurrent: boolean;
};

export type TrendRow = {
  id: string;
  name: string;
  color: string;
  // One number per week, in the same order as the weeks
  hours: number[];
  goals: number[];
  // Average over full weeks (not this one); null until there's a full week
  average: number | null;
  // This week's goal, or 0 if none
  currentGoal: number;
};

export type Trends = {
  weeks: TrendWeek[];
  rows: TrendRow[];
};

// Hours done per category per week, with that week's goals.
// Starts at the first week with any tracked time or goals, so new users don't see empty weeks.
export async function loadTrends(timeZone: string): Promise<Trends> {
  const supabase = await createClient();

  const current = getWeek(timeZone);
  const allWeeks = Array.from({ length: WEEKS_SHOWN }, (_, index) =>
    getWeek(timeZone, format(subWeeks(current.start, WEEKS_SHOWN - 1 - index), "yyyy-MM-dd"))
  );
  const rangeStart = allWeeks[0].start;
  const rangeEnd = current.end;

  const [groupsResult, goalsResult] = await Promise.all([
    supabase
      .from("category_groups")
      .select("categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase
      .from("weekly_budgets")
      .select("category_id, week_start, planned_hours")
      .gte("week_start", allWeeks[0].weekStart)
      .lte("week_start", current.weekStart)
      .gt("planned_hours", 0),
  ]);

  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }
  if (goalsResult.error) {
    throw new Error(goalsResult.error.message);
  }

  // All events that overlap the range, one page at a time
  const events: { category_id: string | null; start_at: string; end_at: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("events")
      .select("category_id, start_at, end_at")
      .lt("start_at", rangeEnd.toISOString())
      .gt("end_at", rangeStart.toISOString())
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }
    events.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  // Hours per category per week. Events crossing midnight Sunday are split between weeks.
  const hoursByCategory = new Map<string, number[]>();
  for (const event of events) {
    const key = event.category_id ?? "uncategorized";
    const hours = hoursByCategory.get(key) ?? allWeeks.map(() => 0);
    allWeeks.forEach((week, index) => {
      hours[index] += hoursWithin(event.start_at, event.end_at, week.start, week.end);
    });
    hoursByCategory.set(key, hours);
  }

  // Goals per category per week
  const weekIndex = new Map(allWeeks.map((week, index) => [week.weekStart, index]));
  const goalsByCategory = new Map<string, number[]>();
  for (const goal of goalsResult.data) {
    const index = weekIndex.get(goal.week_start);
    if (index === undefined) {
      continue;
    }
    const goals = goalsByCategory.get(goal.category_id) ?? allWeeks.map(() => 0);
    goals[index] = Number(goal.planned_hours);
    goalsByCategory.set(goal.category_id, goals);
  }

  // Skip the empty weeks at the start
  const hasData = (index: number) =>
    [...hoursByCategory.values(), ...goalsByCategory.values()].some((values) => values[index] > 0);
  const firstIndex = allWeeks.findIndex((_, index) => hasData(index));
  if (firstIndex === -1) {
    return { weeks: [], rows: [] };
  }

  const shownWeeks = allWeeks.slice(firstIndex);
  const weekLabel = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const weeks = shownWeeks.map((week) => ({
    weekStart: week.weekStart,
    label: weekLabel.format(week.start),
    isCurrent: week.weekStart === current.weekStart,
  }));

  function makeRow(id: string, name: string, color: string): TrendRow {
    const hours = (hoursByCategory.get(id) ?? allWeeks.map(() => 0)).slice(firstIndex);
    const goals = (goalsByCategory.get(id) ?? allWeeks.map(() => 0)).slice(firstIndex);
    // The last week is this one, which isn't over yet
    const fullWeeks = hours.slice(0, -1);
    return {
      id,
      name,
      color,
      hours,
      goals,
      // One week's "average" would just repeat that week, so wait for two
      average:
        fullWeeks.length >= MIN_WEEKS_FOR_AVERAGE
          ? fullWeeks.reduce((sum, h) => sum + h, 0) / fullWeeks.length
          : null,
      currentGoal: goals[goals.length - 1],
    };
  }

  // Categories in the same order as everywhere else, keeping only ones with hours or goals
  const rows = groupsResult.data
    .flatMap((group) => group.categories)
    .map((category) => makeRow(category.id, category.name, category.color))
    .filter((row) => row.hours.some((h) => h > 0) || row.goals.some((g) => g > 0));

  const uncategorized = makeRow("uncategorized", "Uncategorized", UNCATEGORIZED_COLOR);
  if (uncategorized.hours.some((h) => h > 0)) {
    rows.push(uncategorized);
  }

  return { weeks, rows };
}