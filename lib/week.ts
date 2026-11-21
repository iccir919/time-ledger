import { TZDate } from "@date-fns/tz";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";

// The current week, Monday 12:00 AM to the next Monday 12:00 AM, in the given time zone
export function getCurrentWeek(timeZone: string) {
  const now = TZDate.tz(timeZone);
  const start = startOfWeek(now, { weekStartsOn: 1 });
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

  return {
    start,
    end,
    days,
    today: format(now, "yyyy-MM-dd"),
    weekStart: format(start, "yyyy-MM-dd"),
    previousWeekStart: format(subWeeks(start, 1), "yyyy-MM-dd"),
  };
}