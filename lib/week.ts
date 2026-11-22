import { TZDate } from "@date-fns/tz";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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