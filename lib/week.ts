import { TZDate } from "@date-fns/tz";
import { addWeeks, format, startOfWeek } from "date-fns";

// The current week, Monday 12:00 AM to the next Monday 12:00 AM, in the given time zone
export function getCurrentWeek(timeZone: string) {
  const now = TZDate.tz(timeZone);
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = addWeeks(start, 1);

  return {
    start,
    end,
    weekStart: format(start, "yyyy-MM-dd"),
  };
}