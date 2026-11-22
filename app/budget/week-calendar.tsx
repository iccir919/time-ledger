// A read-only week view: one column per day, hours down the side.
// Each day is split in two: plan blocks on the left, tracked events on the right.

const HOUR_HEIGHT = 32; // pixels per hour
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const MIN_BLOCK_HEIGHT = 14; // so very short events stay visible

export type CalendarBlock = {
  id: string;
  kind: "plan" | "tracked";
  title: string;
  color: string;
  startMs: number;
  endMs: number;
};

export type CalendarDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  startMs: number;
  endMs: number;
};

type PlacedBlock = CalendarBlock & {
  top: number;
  height: number;
  column: number;
  columns: number;
};

type WeekCalendarProps = {
  days: CalendarDay[];
  today: string;
  // Minutes since midnight today, for the "now" line; null when today isn't shown
  nowMinutes: number | null;
  blocks: CalendarBlock[];
};

// Place one day's blocks: cut them to the day, then put overlapping blocks side by side
function layoutDay(blocks: CalendarBlock[], day: CalendarDay): PlacedBlock[] {
  const pieces = blocks
    .filter((block) => block.startMs < day.endMs && block.endMs > day.startMs)
    .map((block) => ({
      ...block,
      startMs: Math.max(block.startMs, day.startMs),
      endMs: Math.min(block.endMs, day.endMs),
    }))
    .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);

  // Each block takes the first column that's free when it starts
  const columnEnds: number[] = [];
  const placed = pieces.map((piece) => {
    let column = columnEnds.findIndex((end) => end <= piece.startMs);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(piece.endMs);
    } else {
      columnEnds[column] = piece.endMs;
    }

    return {
      ...piece,
      top: ((piece.startMs - day.startMs) / 3_600_000) * HOUR_HEIGHT,
      height: Math.max(((piece.endMs - piece.startMs) / 3_600_000) * HOUR_HEIGHT, MIN_BLOCK_HEIGHT),
      column,
      columns: 1,
    };
  });

  // Keep it simple: every block that day shares the same column width
  return placed.map((block) => ({ ...block, columns: columnEnds.length }));
}

function hourLabel(hour: number) {
  if (hour === 0) {
    return "";
  }
  const suffix = hour < 12 ? "AM" : "PM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour} ${suffix}`;
}

type LaneProps = {
  blocks: PlacedBlock[];
  side: "left" | "right";
};

// One half of a day column: plan blocks (left) or tracked events (right)
function Lane({ blocks, side }: LaneProps) {
  return (
    <div
      className={`absolute inset-y-0 ${side === "left" ? "left-0.5 right-1/2 pr-px" : "left-1/2 right-0.5 pl-px"}`}
    >
      {blocks.map((block) => {
        const width = 100 / block.columns;
        const isPlan = block.kind === "plan";

        return (
          <div
            key={block.id}
            title={block.title}
            className="absolute overflow-hidden rounded px-1 py-0.5 text-[10px] leading-tight"
            style={{
              top: block.top,
              height: block.height,
              left: `${block.column * width}%`,
              width: `${width}%`,
              // Plan blocks: light tint with a dashed border. Tracked: solid color.
              backgroundColor: isPlan ? `${block.color}1f` : block.color,
              border: `1px ${isPlan ? "dashed" : "solid"} ${block.color}`,
              color: isPlan ? "#292524" : "#ffffff",
            }}
          >
            {block.title}
          </div>
        );
      })}
    </div>
  );
}

export default function WeekCalendar({ days, today, nowMinutes, blocks }: WeekCalendarProps) {
  const planBlocks = blocks.filter((block) => block.kind === "plan");
  const trackedBlocks = blocks.filter((block) => block.kind === "tracked");
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <div className="min-w-[46rem]">
        {/* Day headers */}
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-stone-200 text-xs text-stone-500">
          <span />
          {days.map((day) => (
            <div
              key={day.date}
              className={`py-2 text-center ${day.date === today ? "font-semibold text-accent" : ""}`}
            >
              {day.weekday} {day.dayNumber}
            </div>
          ))}
        </div>

        {/* Hours and days */}
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)]" style={{ height: DAY_HEIGHT }}>
          <div className="relative">
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-stone-400"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>

          {days.map((day) => (
            <div
              key={day.date}
              className={`relative border-l border-stone-100 ${day.date === today ? "bg-accent-soft/30" : ""}`}
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-stone-100"
                  style={{ top: hour * HOUR_HEIGHT }}
                />
              ))}

              <Lane blocks={layoutDay(planBlocks, day)} side="left" />
              <Lane blocks={layoutDay(trackedBlocks, day)} side="right" />

              {day.date === today && nowMinutes !== null && (
                <div
                  className="absolute inset-x-0 z-10 border-t-2 border-red-400"
                  style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}