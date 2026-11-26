import { hoursWithin } from "@/lib/hours";

// How the app counts plans, shared by the Plan page and the dashboard so they always agree.
// Every map is keyed by "<categoryId>:<date>".

type Day = { date: string; start: Date; end: Date };

const keyOf = (categoryId: string, date: string) => `${categoryId}:${date}`;

// Hours per category per day from timed things (events, or plan blocks), split at midnight.
// Also the part of each still after `now`, for plan blocks.
export function hoursByDay(
  items: { categoryId: string | null; startAt: string; endAt: string }[],
  days: Day[],
  now: number
) {
  const total: Record<string, number> = {};
  const ahead: Record<string, number> = {};
  for (const item of items) {
    if (!item.categoryId) {
      continue;
    }
    for (const day of days) {
      const hours = hoursWithin(item.startAt, item.endAt, day.start, day.end);
      if (hours === 0) {
        continue;
      }
      const key = keyOf(item.categoryId, day.date);
      total[key] = (total[key] ?? 0) + hours;

      const aheadFrom = new Date(Math.max(now, day.start.getTime()));
      const later = hoursWithin(item.startAt, item.endAt, aheadFrom, day.end);
      if (later > 0) {
        ahead[key] = (ahead[key] ?? 0) + later;
      }
    }
  }
  return { total, ahead };
}

// A day's plan is whichever is bigger: the hours typed, or the hours scheduled as blocks.
// So scheduling hours you already typed doesn't count them twice.
// Planned ahead: later days count their whole plan; today counts what you typed minus what's
// already done, or the blocks still ahead if that's more; past days count none.
export function combinePlans({
  categoryIds,
  days,
  today,
  typed,
  scheduled,
  scheduledAhead,
  actual,
}: {
  categoryIds: string[];
  days: { date: string }[];
  today: string;
  typed: Record<string, number>;
  scheduled: Record<string, number>;
  scheduledAhead: Record<string, number>;
  actual: Record<string, number>;
}) {
  const planned: Record<string, number> = {};
  const plannedAhead: Record<string, number> = {};
  for (const categoryId of categoryIds) {
    for (const day of days) {
      const key = keyOf(categoryId, day.date);
      const typedHours = typed[key] ?? 0;
      const plan = Math.max(typedHours, scheduled[key] ?? 0);
      if (plan === 0) {
        continue;
      }
      planned[key] = plan;

      const ahead =
        day.date > today
          ? plan
          : day.date === today
            ? Math.max(typedHours - (actual[key] ?? 0), scheduledAhead[key] ?? 0)
            : 0;
      if (ahead > 0) {
        plannedAhead[key] = ahead;
      }
    }
  }
  return { planned, plannedAhead };
}

// Adds up a "<categoryId>:<date>" map per category
export function sumByCategory(values: Record<string, number>) {
  const sums = new Map<string, number>();
  for (const [key, hours] of Object.entries(values)) {
    const categoryId = key.slice(0, key.lastIndexOf(":"));
    sums.set(categoryId, (sums.get(categoryId) ?? 0) + hours);
  }
  return sums;
}