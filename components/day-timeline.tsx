import Link from "next/link";
import type { CalendarBlock } from "@/app/budget/week-calendar";
import { clockHours } from "@/lib/clock-time";
import { formatHours } from "@/lib/hours";

type DayTimelineProps = {
  // The day, as the calendar sees it
  day: { date: string; startMs: number; endMs: number };
  blocks: CalendarBlock[];
  groups: { categories: { id: string; name: string; color: string }[] }[];
  // Minutes since midnight, for the "now" line (null on other days)
  nowMinutes: number | null;
  timeZone: string;
  // What to say when the day has nothing
  emptyText?: string;
};

const UNCATEGORIZED_COLOR = "#a8a29e";
// The day shown, unless something falls outside it
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 22;

// One day, by category: a row per category with time that day, the day running left to right.
// Done time is solid, planned time dashed. Overlapping events line up in their own rows, so
// time spent on two things at once is easy to see. Clicking a bar opens the day's week in
// the Plan calendar. Used by the dashboard's Today and the Plan grid's day card.
export default function DayTimeline({
  day,
  blocks,
  groups,
  nowMinutes,
  timeZone,
  emptyText = "Nothing done or planned yet.",
}: DayTimelineProps) {
  // Today's part of each block, in minutes since midnight
  const pieces = blocks
    .map((block) => ({
      block,
      start: (Math.max(block.startMs, day.startMs) - day.startMs) / 60_000,
      end: (Math.min(block.endMs, day.endMs) - day.startMs) / 60_000,
    }))
    .filter((piece) => piece.end > piece.start);

  if (pieces.length === 0) {
    return <p className="mt-4 text-sm text-stone-500">{emptyText}</p>;
  }

  // Rows: categories in their usual order, then anything without a category
  const categories = groups.flatMap((group) => group.categories);
  const rows = [
    ...categories.map((category) => ({ id: category.id, name: category.name, color: category.color })),
    { id: null, name: "Uncategorized", color: UNCATEGORIZED_COLOR },
  ]
    .map((row) => ({ ...row, pieces: pieces.filter((piece) => (piece.block.categoryId ?? null) === row.id) }))
    .filter((row) => row.pieces.length > 0);

  // 8 AM to 10 PM, stretched to whole hours if something starts earlier or ends later
  const startHour = Math.min(DEFAULT_START_HOUR, Math.floor(Math.min(...pieces.map((p) => p.start)) / 60));
  const endHour = Math.max(DEFAULT_END_HOUR, Math.ceil(Math.max(...pieces.map((p) => p.end)) / 60));
  const span = (endHour - startHour) * 60;
  const percent = (minutes: number) => `${((minutes - startHour * 60) / span) * 100}%`;

  const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const hourLabel = (hour: number) => {
    const h12 = ((hour + 11) % 12) + 1;
    return `${h12}${hour < 12 || hour === 24 ? "a" : "p"}`;
  };
  // A label every 2 hours (every 3 if the day is long)
  const step = endHour - startHour > 16 ? 3 : 2;
  const ticks: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += step) {
    ticks.push(hour);
  }

  const href = `/budget?view=calendar&week=${day.date}`;
  const showNow = nowMinutes !== null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  return (
    <div className="mt-4">
      <div className="relative">
        {rows.map((row) => {
          // This category's done time today (its own overlaps counted once)
          const done = clockHours(
            row.pieces
              .filter((piece) => piece.block.kind === "tracked")
              .map((piece) => ({ startMs: piece.block.startMs, endMs: piece.block.endMs })),
            day.startMs,
            day.endMs
          );
          return (
            <div key={row.id ?? "uncategorized"} className="grid h-8 grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className={`truncate ${row.id ? "" : "text-stone-500"}`}>{row.name}</span>
              </span>
              <div className="relative h-5 rounded bg-stone-100">
                {row.pieces.map(({ block, start, end }) => {
                  const planned = block.kind === "plan";
                  const label = `${block.title} · ${timeFormat.format(block.startMs)} to ${timeFormat.format(block.endMs)}${
                    planned ? " (planned)" : ""
                  }`;
                  return (
                    <Link
                      key={block.id}
                      href={href}
                      title={`${label}. Open in the calendar.`}
                      aria-label={`${row.name}: ${label}. Open in the calendar.`}
                      className="absolute inset-y-0.5 rounded-sm transition-[filter] hover:brightness-95"
                      style={{
                        left: percent(start),
                        width: `max(${((end - start) / span) * 100}%, 3px)`,
                        ...(planned
                          ? { backgroundColor: `${row.color}33`, border: `1px dashed ${row.color}` }
                          : { backgroundColor: row.color }),
                      }}
                    />
                  );
                })}
              </div>
              <span className="text-right text-xs tabular-nums text-stone-400">{done > 0 ? formatHours(done) : ""}</span>
            </div>
          );
        })}

        {/* The "now" line, across all the rows */}
        {showNow && (
          <div className="pointer-events-none absolute inset-y-0 left-[calc(6.5rem+0.5rem)] right-[calc(2.5rem+0.5rem)]">
            <span className="absolute inset-y-0 border-l-[1.5px] border-red-500" style={{ left: percent(nowMinutes!) }} />
          </div>
        )}
      </div>

      {/* Hour labels under the rows */}
      <div className="mt-1 grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] gap-2">
        <span />
        <div className="relative h-4 text-[10px] text-stone-400">
          {ticks.map((hour) => (
            <span key={hour} className="absolute -translate-x-1/2" style={{ left: percent(hour * 60) }}>
              {hourLabel(hour)}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}
