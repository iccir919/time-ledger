import "server-only";
import { format, subWeeks } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { hoursWithin } from "@/lib/hours";
import { formatWeekRange, getWeek } from "@/lib/week";

// How many weeks Trends looks back over, counting this week
const WEEKS_SHOWN = 8;

// Supabase returns at most 1,000 rows per request, so events are read in pages
const PAGE_SIZE = 1000;

// Full weeks needed before showing an average
const MIN_WEEKS_FOR_AVERAGE = 2;

// How many event titles a category's detail page lists
const TOP_TITLES = 8;

const UNCATEGORIZED_COLOR = "#a8a29e";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type TrendWeek = {
  weekStart: string; // "2026-11-16"
  label: string; // "Nov 16"
    rangeLabel: string; // "Nov 16 to Nov 22"
  isCurrent: boolean;
};

export type TrendRow = {
  id: string;
  name: string;
  color: string;
  // One number per week, in the same order as the weeks
  hours: number[];
  goals: number[];
  // Average over full weeks (not this one); null until there are at least 2
  average: number | null;
  // This week's goal, or 0 if none
  currentGoal: number;
  // Total hours on each day of the week (Monday first) across the weeks shown
  weekdayHours: number[];
  // The event titles with the most hours, most first
  topTitles: { title: string; hours: number }[];
};

export type Trends = {
  weeks: TrendWeek[];
  rows: TrendRow[];
};

type TrendEvent = {
  category_id: string | null;
  title: string | null;
  start_at: string;
  end_at: string;
};

// Hours done per category per week, with that week's goals,
// plus each category's weekday totals and top event titles.
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
  const events: TrendEvent[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("events")
      .select("category_id, title, start_at, end_at")
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

  // For each category: hours per day, as [week][weekday].
  // Splitting by day means an event crossing midnight counts toward both days.
  const emptyDays = () => allWeeks.map(() => WEEKDAYS.map(() => 0));
  const dayHoursByCategory = new Map<string, number[][]>();
  // For each category: hours per event title
  const titleHoursByCategory = new Map<string, Map<string, number>>();

  for (const event of events) {
    const key = event.category_id ?? "uncategorized";

    const dayHours = dayHoursByCategory.get(key) ?? emptyDays();
    let eventTotal = 0;
    allWeeks.forEach((week, weekIndex) => {
      week.days.forEach((day, dayIndex) => {
        const hours = hoursWithin(event.start_at, event.end_at, day.start, day.end);
        dayHours[weekIndex][dayIndex] += hours;
        eventTotal += hours;
      });
    });
    dayHoursByCategory.set(key, dayHours);

    const titleHours = titleHoursByCategory.get(key) ?? new Map<string, number>();
    const title = event.title?.trim() || "(No title)";
    titleHours.set(title, (titleHours.get(title) ?? 0) + eventTotal);
    titleHoursByCategory.set(key, titleHours);
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

  // A week's total is the sum of its days
  const weekHours = (id: string) =>
    (dayHoursByCategory.get(id) ?? emptyDays()).map((days) => days.reduce((sum, h) => sum + h, 0));

  // Skip the empty weeks at the start
  const hasData = (index: number) =>
    [...dayHoursByCategory.keys()].some((id) => weekHours(id)[index] > 0) ||
    [...goalsByCategory.values()].some((goals) => goals[index] > 0);
  const firstIndex = allWeeks.findIndex((_, index) => hasData(index));
  if (firstIndex === -1) {
    return { weeks: [], rows: [] };
  }

  const shownWeeks = allWeeks.slice(firstIndex);
  const weekLabel = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const weeks = shownWeeks.map((week) => ({
    weekStart: week.weekStart,
    label: weekLabel.format(week.start),
    rangeLabel: formatWeekRange(week, timeZone),
    isCurrent: week.weekStart === current.weekStart,
  }));

  function makeRow(id: string, name: string, color: string): TrendRow {
    const hours = weekHours(id).slice(firstIndex);
    const goals = (goalsByCategory.get(id) ?? allWeeks.map(() => 0)).slice(firstIndex);
    // The last week is this one, which isn't over yet
    const fullWeeks = hours.slice(0, -1);

    // Add up each weekday across the weeks shown
    const shownDays = (dayHoursByCategory.get(id) ?? emptyDays()).slice(firstIndex);
    const weekdayHours = WEEKDAYS.map((_, dayIndex) =>
      shownDays.reduce((sum, days) => sum + days[dayIndex], 0)
    );

    const topTitles = [...(titleHoursByCategory.get(id) ?? new Map<string, number>())]
      .map(([title, titleHours]) => ({ title, hours: titleHours }))
      .filter((entry) => entry.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, TOP_TITLES);

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
      weekdayHours,
      topTitles,
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