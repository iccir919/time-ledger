// Clock time: how many real hours a set of events covers, with any hour that more than one
// event covers counted once. Totals use this ("Done this week", a day's total), while each
// category keeps full credit for its own events.

export type Interval = { startMs: number; endMs: number };

// Hours covered between `from` and `to` (milliseconds), overlaps counted once
export function clockHours(intervals: Interval[], from: number, to: number) {
  const clipped = intervals
    .map(({ startMs, endMs }) => [Math.max(startMs, from), Math.min(endMs, to)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  let totalMs = 0;
  let runStart = 0;
  let runEnd = 0;
  for (const [start, end] of clipped) {
    if (start > runEnd) {
      // A gap: close the run so far and start a new one
      totalMs += runEnd - runStart;
      runStart = start;
      runEnd = end;
    } else if (end > runEnd) {
      runEnd = end;
    }
  }
  totalMs += runEnd - runStart;
  return totalMs / 3_600_000;
}

// "4h counted twice": the note beside a total when categories' time adds up to more than
// the clock (null when nothing overlapped, or by less than a minute)
export function overlapNote(categoryHours: number, clock: number, formatHours: (hours: number) => string) {
  const extra = categoryHours - clock;
  return extra >= 1 / 60 ? `includes ${formatHours(extra)} counted twice` : null;
}
