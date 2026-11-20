export function hoursBetween(startAt: string, endAt: string) {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000;
}

// Hours of an event that fall inside a time range,
// e.g. only the part of a late-Sunday event that lands in this week
export function hoursWithin(startAt: string, endAt: string, rangeStart: Date, rangeEnd: Date) {
  const start = Math.max(new Date(startAt).getTime(), rangeStart.getTime());
  const end = Math.min(new Date(endAt).getTime(), rangeEnd.getTime());
  return Math.max(0, end - start) / 3_600_000;
}

export function formatHours(hours: number) {
  return `${Number(hours.toFixed(2))}h`;
}