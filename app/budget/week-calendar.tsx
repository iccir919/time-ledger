"use client";

import { useCallback, useState, type MouseEvent } from "react";
import type { CategoryGroup } from "@/components/category-select";
import AddBlockDialog, { type BlockDraft } from "./add-block-dialog";

// A week view: one column per day, hours down the side.
// Each day is split in two: plan blocks on the left, tracked events on the right.
// Clicking an empty spot opens a popup to add a plan block there.

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
  // e.g. "Tue, Nov 24", for the popup's day picker
  label: string;
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
  // Adding blocks needs a Plan calendar
  canAddBlocks: boolean;
  groups: CategoryGroup[];
  timeZone: string;
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

// 570 minutes -> "09:30"
function toTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// A one-hour draft starting at the given minute of the day (kept within the day)
function draftAt(date: string, startMinutes: number): BlockDraft {
  const start = Math.min(startMinutes, 23 * 60);
  return { date, start: toTime(start), end: start + 60 < 24 * 60 ? toTime(start + 60) : "23:59" };
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
            data-block
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

export default function WeekCalendar({
  days,
  today,
  nowMinutes,
  blocks,
  canAddBlocks,
  groups,
  timeZone,
}: WeekCalendarProps) {
  const planBlocks = blocks.filter((block) => block.kind === "plan");
  const trackedBlocks = blocks.filter((block) => block.kind === "tracked");
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  // The block being added, or null when the popup is closed
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const closeDialog = useCallback(() => setDraft(null), []);

  // Clicking an empty spot in a day: start a draft at that time, rounded down to 30 minutes
  function handleDayClick(event: MouseEvent<HTMLDivElement>, day: CalendarDay) {
    if (!canAddBlocks || (event.target as HTMLElement).closest("[data-block]")) {
      return;
    }
    const top = event.currentTarget.getBoundingClientRect().top;
    const minutes = ((event.clientY - top) / HOUR_HEIGHT) * 60;
    setDraft(draftAt(day.date, Math.floor(minutes / 30) * 30));
  }

  // The "Add plan block" button: today if it's in this week (next full hour), otherwise Monday 9 AM
  function openFromButton() {
    const isTodayShown = days.some((day) => day.date === today);
    if (isTodayShown && nowMinutes !== null) {
      setDraft(draftAt(today, Math.ceil(nowMinutes / 60) * 60));
    } else {
      setDraft(draftAt(days[0].date, 9 * 60));
    }
  }

  return (
    <>
      {canAddBlocks && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={openFromButton}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Add plan block
          </button>
        </div>
      )}

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
                onClick={(event) => handleDayClick(event, day)}
                className={`relative border-l border-stone-100 ${day.date === today ? "bg-accent-soft/30" : ""} ${canAddBlocks ? "cursor-pointer" : ""}`}
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

      {draft && (
        <AddBlockDialog
          draft={draft}
          days={days.map((day) => ({ date: day.date, label: day.label }))}
          groups={groups}
          timeZone={timeZone}
          onClose={closeDialog}
        />
      )}
    </>
  );
}