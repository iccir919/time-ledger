import "server-only";
import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfYear, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { clockHours } from "@/lib/clock-time";
import { hoursWithin } from "@/lib/hours";
import { getWeek } from "@/lib/week";

// Supabase returns at most 1,000 rows per request, so events are read in pages
const PAGE_SIZE = 1000;

// Never look back further than this, even for "All time"
const MAX_DAYS = 400;

// How many event titles a category's detail page lists
const TOP_TITLES = 8;

const UNCATEGORIZED_COLOR = "#a8a29e";
const HOUR = 60 * 60 * 1000;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The range choices. A preset only shows once there's enough history to fill it.
export type RangeKey = "4w" | "12w" | "year" | "all";

export type TrendRange = { key: RangeKey; label: string };

export type TrendDay = {
  date: string; // "2026-11-24"
  label: string; // "Nov 24"
  isToday: boolean;
  // Real hours the day's events cover, with overlaps counted once (the day's total)
  clockHours: number;
};

export type TrendWeek = {
  weekStart: string;
  label: string; // "Nov 23", or "This week"
  // How many of its days are in the period (the first week can be partial)
  dayCount: number;
  isCurrent: boolean;
  // Real hours the week's events cover, with overlaps counted once (the week's total)
  clockHours: number;
};

export type TrendCategory = {
  id: string;
  name: string;
  color: string;
  // Hours on each day of the period, in order
  dayHours: number[];
  // Hours in each week of the period, in order
  weekHours: number[];
  // Average hours on each weekday (Monday first), over finished days; null for a weekday not seen yet
  weekdayAverage: (number | null)[];
  // Average minutes in each hour of the day (midnight first), over the period's days
  hourMinutes: number[];
  total: number;
  // Hours in an average week over the period
  weeklyAverage: number;
  // Share of all tracked time in the period, 0 to 1
  share: number;
  // The event titles with the most hours, most first
  topTitles: { title: string; hours: number }[];
};

export type Trends = {
  ranges: TrendRange[];
  range: RangeKey;
  // "Nov 17 to Nov 24"
  periodLabel: string;
  days: TrendDay[];
  weeks: TrendWeek[];
  categories: TrendCategory[];
};

type TrendEvent = {
  category_id: string | null;
  title: string | null;
  start_at: string;
  end_at: string;
};

// Midnight at the start of a "YYYY-MM-DD" day, in the user's time zone
function startOfDate(date: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new TZDate(year, month - 1, day, timeZone);
}

// "3 days", "2 weeks", "5 months": how much history there is
function spanLabel(days: number) {
  if (days < 14) {
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (days < 60) {
    return `${Math.round(days / 7)} weeks`;
  }
  return `${Math.round(days / 30)} months`;
}

// Everything the Trends page shows, for one range: each category's hours by day, by week,
// by weekday and by hour of the day, plus its weekly average, share and top events.
// History starts at the first tracked event or goal, so new users don't see empty time.
export async function loadTrends(timeZone: string, requestedRange?: string): Promise<Trends | null> {
  const supabase = await createClient();
  const now = Date.now();
  const today = getWeek(timeZone).today;
  const todayStart = startOfDate(today, timeZone);

  // Where history starts: the earliest tracked event or goal
  const [firstEventResult, firstGoalResult, groupsResult] = await Promise.all([
    supabase.from("events").select("start_at").order("start_at").limit(1).maybeSingle(),
    supabase.from("weekly_budgets").select("week_start").order("week_start").limit(1).maybeSingle(),
    supabase
      .from("category_groups")
      .select("categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
  ]);
  if (firstEventResult.error) {
    throw new Error(firstEventResult.error.message);
  }
  if (firstGoalResult.error) {
    throw new Error(firstGoalResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  const firstDates = [
    firstEventResult.data ? format(new TZDate(firstEventResult.data.start_at, timeZone), "yyyy-MM-dd") : null,
    firstGoalResult.data?.week_start ?? null,
  ].filter((date): date is string => date !== null && date <= today);
  if (firstDates.length === 0) {
    return null;
  }
  const earliest = format(subDays(todayStart, MAX_DAYS - 1), "yyyy-MM-dd");
  const firstDate = [...firstDates].sort()[0];
  const dataStart = firstDate < earliest ? earliest : firstDate;

  // How many days of history, counting today
  const dataDays =
    Math.round((todayStart.getTime() - startOfDate(dataStart, timeZone).getTime()) / (24 * HOUR)) + 1;

  // The ranges worth offering: a preset only once there's history to fill it, and "This year"
  // only when it would show something "All time" doesn't
  const yearStart = format(startOfYear(todayStart), "yyyy-MM-dd");
  const ranges: TrendRange[] = [];
  if (dataDays >= 28) {
    ranges.push({ key: "4w", label: "4 weeks" });
  }
  if (dataDays >= 84) {
    ranges.push({ key: "12w", label: "12 weeks" });
  }
  if (dataStart < yearStart && dataDays > 84) {
    ranges.push({ key: "year", label: "This year" });
  }
  ranges.push({ key: "all", label: `All time · ${spanLabel(dataDays)}` });

  // The range asked for, if it's offered; otherwise the first one (4 weeks once there is that much)
  const range = ranges.find((option) => option.key === requestedRange)?.key ?? ranges[0].key;
  const presetStart =
    range === "4w"
      ? format(subDays(todayStart, 27), "yyyy-MM-dd")
      : range === "12w"
        ? format(subDays(todayStart, 83), "yyyy-MM-dd")
        : range === "year"
          ? yearStart
          : dataStart;
  const periodStart = presetStart < dataStart ? dataStart : presetStart;

  // The period's days, each with its start and end in the user's time zone
  const days: { date: string; start: Date; end: Date }[] = [];
  for (let day: Date = startOfDate(periodStart, timeZone); ; day = addDays(day, 1)) {
    const date = format(day, "yyyy-MM-dd");
    if (date > today) {
      break;
    }
    days.push({ date, start: day, end: addDays(day, 1) });
  }
  const rangeStart = days[0].start;
  const rangeEnd = days[days.length - 1].end;

  // All events that overlap the period, one page at a time
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

  // Per category: hours per day, minutes per hour of the day (added up), hours per title
  const dayHoursById = new Map<string, number[]>();
  const hourMinutesById = new Map<string, number[]>();
  const titleHoursById = new Map<string, Map<string, number>>();

  for (const event of events) {
    const id = event.category_id ?? "uncategorized";
    const dayHours = dayHoursById.get(id) ?? days.map(() => 0);
    const hourMinutes = hourMinutesById.get(id) ?? Array.from({ length: 24 }, () => 0);
    const startMs = Date.parse(event.start_at);
    const endMs = Math.min(Date.parse(event.end_at), now);
    let eventTotal = 0;

    days.forEach((day, index) => {
      if (day.end.getTime() <= startMs || day.start.getTime() >= endMs) {
        return;
      }
      const hours = hoursWithin(event.start_at, new Date(endMs).toISOString(), day.start, day.end);
      dayHours[index] += hours;
      eventTotal += hours;
      // Split the day into hours (a day with a clock change is off by an hour; that's fine here)
      for (let hour = 0; hour < 24; hour++) {
        const hourStart = new Date(day.start.getTime() + hour * HOUR);
        const hourEnd = new Date(hourStart.getTime() + HOUR);
        hourMinutes[hour] += hoursWithin(event.start_at, new Date(endMs).toISOString(), hourStart, hourEnd) * 60;
      }
    });

    dayHoursById.set(id, dayHours);
    hourMinutesById.set(id, hourMinutes);
    const titleHours = titleHoursById.get(id) ?? new Map<string, number>();
    const title = event.title?.trim() || "(No title)";
    titleHours.set(title, (titleHours.get(title) ?? 0) + eventTotal);
    titleHoursById.set(id, titleHours);
  }

  // Each day's total in real hours: an hour two events share counts once
  const intervals = events.map((event) => ({
    startMs: Date.parse(event.start_at),
    endMs: Math.min(Date.parse(event.end_at), now),
  }));
  const dayClock = days.map((day) => clockHours(intervals, day.start.getTime(), day.end.getTime()));

  // The period's weeks (Monday first); the first and the current one can be partial
  const weekLabel = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const currentWeekStart = getWeek(timeZone).weekStart;
  const weekIndexOfDay: number[] = [];
  const weeks: TrendWeek[] = [];
  for (const day of days) {
    const weekStart = getWeek(timeZone, day.date).weekStart;
    if (weeks[weeks.length - 1]?.weekStart !== weekStart) {
      weeks.push({
        weekStart,
        label: weekStart === currentWeekStart ? "This week" : weekLabel.format(startOfDate(weekStart, timeZone)),
        dayCount: 0,
        isCurrent: weekStart === currentWeekStart,
        clockHours: 0,
      });
    }
    weeks[weeks.length - 1].dayCount++;
    weeks[weeks.length - 1].clockHours += dayClock[weekIndexOfDay.length];
    weekIndexOfDay.push(weeks.length - 1);
  }

  // Finished days (not today), for the weekday averages
  // Monday = 0 ... Sunday = 6
  const weekdayOf = (date: string) => (startOfDate(date, timeZone).getDay() + 6) % 7;
  const weekdayCounts = WEEKDAYS.map(() => 0);
  days.forEach((day) => {
    if (day.date < today) {
      weekdayCounts[weekdayOf(day.date)]++;
    }
  });

  let allHours = 0;
  for (const dayHours of dayHoursById.values()) {
    allHours += dayHours.reduce((sum, hours) => sum + hours, 0);
  }

  function makeCategory(id: string, name: string, color: string): TrendCategory {
    const dayHours = dayHoursById.get(id) ?? days.map(() => 0);
    const total = dayHours.reduce((sum, hours) => sum + hours, 0);

    const weekHours = weeks.map(() => 0);
    dayHours.forEach((hours, index) => {
      weekHours[weekIndexOfDay[index]] += hours;
    });

    const weekdayTotals = WEEKDAYS.map(() => 0);
    days.forEach((day, index) => {
      if (day.date < today) {
        weekdayTotals[weekdayOf(day.date)] += dayHours[index];
      }
    });

    const hourTotals = hourMinutesById.get(id) ?? Array.from({ length: 24 }, () => 0);

    const topTitles = [...(titleHoursById.get(id) ?? new Map<string, number>())]
      .map(([title, hours]) => ({ title, hours }))
      .filter((entry) => entry.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, TOP_TITLES);

    return {
      id,
      name,
      color,
      dayHours,
      weekHours,
      weekdayAverage: weekdayTotals.map((hours, index) =>
        weekdayCounts[index] > 0 ? hours / weekdayCounts[index] : null
      ),
      hourMinutes: hourTotals.map((minutes) => minutes / days.length),
      total,
      weeklyAverage: (total / days.length) * 7,
      share: allHours > 0 ? total / allHours : 0,
      topTitles,
    };
  }

  // Categories in the usual order, keeping only ones with time in this period
  const categories = groupsResult.data
    .flatMap((group) => group.categories)
    .map((category) => makeCategory(category.id, category.name, category.color))
    .filter((category) => category.total > 0);
  const uncategorized = makeCategory("uncategorized", "Uncategorized", UNCATEGORIZED_COLOR);
  if (uncategorized.total > 0) {
    categories.push(uncategorized);
  }

  const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  return {
    ranges,
    range,
    periodLabel: `${dayLabel.format(days[0].start)} to ${dayLabel.format(days[days.length - 1].start)}`,
    days: days.map((day, index) => ({
      date: day.date,
      label: dayLabel.format(day.start),
      isToday: day.date === today,
      clockHours: dayClock[index],
    })),
    weeks,
    categories,
  };
}