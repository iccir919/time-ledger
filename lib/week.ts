import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, addWeeks, format, startOfWeek, subMonths, subWeeks } from "date-fns";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export type Week = ReturnType<typeof getWeek>;

// A Monday-to-Monday week in the given time zone.
// Pass a date like "2026-11-23" to get the week containing it; leave it out for the current week.
export function getWeek(timeZone: string, date?: string) {
  const now = TZDate.tz(timeZone);

  let anchor: TZDate = now;
  if (date && DATE_PATTERN.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    const candidate = new TZDate(year, month - 1, day, timeZone);
    if (!Number.isNaN(candidate.getTime())) {
      anchor = candidate;
    }
  }

  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = addWeeks(start, 1);

  // The seven days, each with its own start and end in the user's time zone
  const days = Array.from({ length: 7 }, (_, index) => {
    const dayStart = addDays(start, index);
    return {
      date: format(dayStart, "yyyy-MM-dd"),
      start: dayStart,
      end: addDays(dayStart, 1),
    };
  });

  const weekStart = format(start, "yyyy-MM-dd");
  const currentWeekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

  return {
    start,
    end,
    days,
    today: format(now, "yyyy-MM-dd"),
    weekStart,
    previousWeekStart: format(subWeeks(start, 1), "yyyy-MM-dd"),
    nextWeekStart: format(addWeeks(start, 1), "yyyy-MM-dd"),
    isCurrentWeek: weekStart === currentWeekStart,
  };
}

// The current week (used by the sync)
export function getCurrentWeek(timeZone: string) {
  return getWeek(timeZone);
}

type WeekRange = {
  weeksBack: number;
  weeksAhead: number;
};

export type NavigableWeek = ReturnType<typeof getWeekInRange>;

// Like getWeek, but keeps the week within a range around the current week,
// and says whether the user can step further back or forward.
// Use Infinity for no limit, e.g. { weeksBack: 1, weeksAhead: Infinity }.
export function getWeekInRange(timeZone: string, date: string | undefined, range: WeekRange) {
  const current = getWeek(timeZone);
  const requested = getWeek(timeZone, date);

  // Whole weeks between the requested week and this week.
  // Rounded, because a daylight saving change makes one week an hour shorter or longer.
  const offset = Math.round(
    (requested.start.getTime() - current.start.getTime()) / (7 * 24 * 3_600_000)
  );
  const allowed = Math.min(range.weeksAhead, Math.max(-range.weeksBack, offset));

  const week =
    allowed === offset
      ? requested
      : getWeek(timeZone, format(addWeeks(current.start, allowed), "yyyy-MM-dd"));

  return {
    ...week,
    canGoBack: allowed > -range.weeksBack,
    canGoForward: allowed < range.weeksAhead,
  };
}

// e.g. "Nov 16 to Nov 22"
export function formatWeekRange(week: Week, timeZone: string) {
  const shortDate = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  return `${shortDate.format(week.start)} to ${shortDate.format(week.days[6].start)}`;
}

// The 3 days to show on a phone: today with the day before and after.
// For other weeks: the last 3 days of a past week, the first 3 of a future one.
export function focusDays(dates: string[], today: string) {
  const todayIndex = dates.indexOf(today);
  if (todayIndex === -1) {
    return today > dates[dates.length - 1] ? dates.slice(-3) : dates.slice(0, 3);
  }
  const start = Math.min(Math.max(todayIndex - 1, 0), dates.length - 3);
  return dates.slice(start, start + 3);
}

export type MonthGrid = ReturnType<typeof getMonthGrid>;

// A month as a calendar shows it: whole weeks, Monday to Sunday, from the week the 1st
// falls in to the week the last day falls in (so 5 or 6 rows). Pass "2026-11" for November;
// leave it out for this month. Like the Plan page's weeks, it goes back no further than
// the month of last week, and forward without limit.
export function getMonthGrid(timeZone: string, month?: string) {
  const now = TZDate.tz(timeZone);
  const earliest = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1);
  const earliestIndex = earliest.getFullYear() * 12 + earliest.getMonth();

  let index = now.getFullYear() * 12 + now.getMonth();
  if (month && MONTH_PATTERN.test(month)) {
    const [year, monthNumber] = month.split("-").map(Number);
    if (monthNumber >= 1 && monthNumber <= 12) {
      index = year * 12 + monthNumber - 1;
    }
  }
  index = Math.max(index, earliestIndex);

  const first = new TZDate(Math.floor(index / 12), index % 12, 1, timeZone);
  const nextFirst = addMonths(first, 1);
  const start = startOfWeek(first, { weekStartsOn: 1 });
  // The Monday after the week holding the month's last day
  const end = addWeeks(startOfWeek(addDays(nextFirst, -1), { weekStartsOn: 1 }), 1);

  const days: { date: string; start: TZDate; end: TZDate }[] = [];
  for (let day = start; day < end; day = addDays(day, 1)) {
    days.push({ date: format(day, "yyyy-MM-dd"), start: day, end: addDays(day, 1) });
  }

  const monthKey = format(first, "yyyy-MM");
  return {
    start,
    end,
    days,
    today: format(now, "yyyy-MM-dd"),
    monthKey,
    // e.g. "November 2026"
    title: format(first, "MMMM yyyy"),
    previousMonth: format(subMonths(first, 1), "yyyy-MM"),
    nextMonth: format(nextFirst, "yyyy-MM"),
    isCurrentMonth: monthKey === format(now, "yyyy-MM"),
    canGoBack: index > earliestIndex,
    canGoForward: true,
  };
}