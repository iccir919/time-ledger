export function hoursBetween(startAt: string, endAt: string) {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000;
}

export function formatHours(hours: number) {
  return `${Number(hours.toFixed(2))}h`;
}