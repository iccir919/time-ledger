"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import type { CategoryGroup } from "@/components/category-select";
import PlanBlockDialog, { type BlockDraft } from "./plan-block-dialog";

// A week view (or a single day): one column per day, hours down the side.
// Each day is split in two: plan blocks on the left, tracked events on the right.
// Clicking an empty spot opens a popup to add a plan block there;
// clicking a plan block opens the same popup to edit or delete it.

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
  // What the edit popup starts with: plan blocks, and done time logged in the app
  draft?: BlockDraft;
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
  // The block's real start and end, before being cut to the day
  originalStartMs: number;
  originalEndMs: number;
  top: number;
  height: number;
  column: number;
  columns: number;
};

type WeekCalendarProps = {
  days: CalendarDay[];
  today: string;
  // The 3 days a phone shows
  mobileDates: string[];
  // Minutes since midnight today, for the "now" line; null when today isn't shown
  nowMinutes: number | null;
  blocks: CalendarBlock[];
  // Adding blocks needs a Plan calendar
  canAddBlocks: boolean;
  // There's a Log calendar to log done time to (and edit time logged in the app)
  canLog?: boolean;
  groups: CategoryGroup[];
  timeZone: string;
  // When set, the calendar is this many pixels tall and scrolls, starting just before now
  scrollHeight?: number;
  // Fill the parent's height instead (the parent sets the height), scrolling the same way
  fillHeight?: boolean;
    // Makes the day headers links, e.g. the dashboard's day opens Plan → Calendar
  headerHref?: string;
  // The category new blocks start with, e.g. the one clicked in the Plan grid
  defaultCategoryId?: string;
  // Leave out the "Add time" button below, when the page puts its own elsewhere
  hideAddButton?: boolean;
  // Show a "Show All · Plan · Done" filter and a small "+ Add" above the calendar
  // (in place of the button below), as the Plan page's Calendar view does
  showFilter?: boolean;
};

// Which blocks the filter shows: both kinds side by side, or one kind at full width
type Filter = "all" | "plan" | "done";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "plan", label: "Plan" },
  { key: "done", label: "Done" },
];

// Place one day's blocks: cut them to the day, then put overlapping blocks side by side
function layoutDay(blocks: CalendarBlock[], day: CalendarDay): PlacedBlock[] {
  const pieces = blocks
    .filter((block) => block.startMs < day.endMs && block.endMs > day.startMs)
    .map((block) => ({
      ...block,
      originalStartMs: block.startMs,
      originalEndMs: block.endMs,
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

// A one-hour draft starting at the given minute of the day.
// A late start like 23:30 ends at 00:30, which the popup reads as the next day.
export function draftAt(date: string, startMinutes: number): BlockDraft {
  const start = Math.min(startMinutes, 23 * 60 + 30);
  return { date, start: toTime(start), end: toTime((start + 60) % (24 * 60)) };
}

function hourLabel(hour: number) {
  if (hour === 0) {
    return "";
  }
  const suffix = hour < 12 ? "AM" : "PM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour} ${suffix}`;
}

// Blocks at least this tall have room for a second line with their times
const TIME_LINE_MIN_HEIGHT = 26;

type LaneProps = {
  blocks: PlacedBlock[];
  // A half of the day, or all of it when the filter shows one kind
  side: "left" | "right" | "full";
  // Formats a block's times, e.g. "9:00 – 10:30 AM"
  timeRange: (startMs: number, endMs: number) => string;
  // Called when a block with a draft is clicked; leave out to make blocks read-only
  onEdit?: (draft: BlockDraft) => void;
};

// One half of a day column (plan blocks left, tracked events right), or the whole day
function Lane({ blocks, side, timeRange, onEdit }: LaneProps) {
  const position = {
    left: "left-0.5 right-1/2 pr-px",
    right: "left-1/2 right-0.5 pl-px",
    full: "left-0.5 right-0.5",
  };
  return (
    <div className={`absolute inset-y-0 ${position[side]}`}>
      {blocks.map((block) => {
        const width = 100 / block.columns;
        const isPlan = block.kind === "plan";
        const draft = block.draft;
        const handleClick = onEdit && draft ? () => onEdit(draft) : undefined;
        // The block's own times (not cut to the day), e.g. "11:00 PM – 7:00 AM"
        const times = timeRange(block.originalStartMs, block.originalEndMs);

        return (
          <div
            key={block.id}
            data-block
            title={`${block.title}, ${times}`}
            onClick={handleClick}
            className={`absolute overflow-hidden rounded px-1 py-0.5 text-[10px] leading-tight ${handleClick ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
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
            <div className="truncate font-medium">{block.title}</div>
            {block.height >= TIME_LINE_MIN_HEIGHT && <div className="truncate opacity-75">{times}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function WeekCalendar({
  days,
  today,
  mobileDates,
  nowMinutes,
  blocks,
  canAddBlocks,
  canLog = false,
  groups,
  timeZone,
  scrollHeight,
  fillHeight,
  headerHref,
  defaultCategoryId,
  hideAddButton,
  showFilter,
}: WeekCalendarProps) {
  const [filter, setFilter] = useState<Filter>("all");
  // Adding works when there's somewhere to write: the Plan calendar, the Log calendar, or both
  const canAdd = canAddBlocks || canLog;
  const planBlocks = blocks.filter((block) => block.kind === "plan");
  const trackedBlocks = blocks.filter((block) => block.kind === "tracked");
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  // "9:00 – 10:30 AM" in the user's time zone
  const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  // Swap the thin and narrow spaces Intl uses for normal ones: the server (Node) and the
  // browser don't always agree on them, which breaks hydration
  const timeRange = (startMs: number, endMs: number) =>
    timeFormat.formatRange(startMs, endMs).replace(/[\u2009\u202f]/g, " ");

  // Phones show 3 days; wider screens show all 7. A single day (the dashboard) is one column.
  const isSingleDay = days.length === 1;
  const dayClass = (date: string) => (mobileDates.includes(date) ? "" : "hidden md:block");
  const gridColumns = isSingleDay
    ? "grid-cols-[3.5rem_1fr]"
    : "grid-cols-[3rem_repeat(3,1fr)] md:grid-cols-[3.5rem_repeat(7,1fr)]";

  // In a scrolling calendar, start an hour before now (or at 8 AM on other days)
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollHeight && !fillHeight) {
      return;
    }
    // Wait a frame so the calendar has its final size before scrolling it
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) {
        const startMinutes = (nowMinutes ?? 9 * 60) - 60;
        scrollRef.current.scrollTop = Math.max(0, (startMinutes / 60) * HOUR_HEIGHT);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollHeight, fillHeight, nowMinutes]);

  // The block being added or edited, or null when the popup is closed
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const closeDialog = useCallback(() => setDraft(null), []);

  // Clicking an empty spot in a day: start a draft at that time, rounded down to 30 minutes
  function handleDayClick(event: MouseEvent<HTMLDivElement>, day: CalendarDay) {
    if (!canAdd || (event.target as HTMLElement).closest("[data-block]")) {
      return;
    }
    const top = event.currentTarget.getBoundingClientRect().top;
    const minutes = ((event.clientY - top) / HOUR_HEIGHT) * 60;
    setDraft({ ...draftAt(day.date, Math.floor(minutes / 30) * 30), categoryId: defaultCategoryId });
  }

  // The "Add time" / "+ Add" button: today if it's in this week (next full hour), otherwise Monday 9 AM
  function openFromButton() {
    const isTodayShown = days.some((day) => day.date === today);
    if (isTodayShown && nowMinutes !== null) {
      setDraft({ ...draftAt(today, Math.ceil(nowMinutes / 60) * 60), categoryId: defaultCategoryId });
    } else {
      setDraft({ ...draftAt(days[0].date, 9 * 60), categoryId: defaultCategoryId });
    }
  }

  return (
    <div className={fillHeight ? "flex h-full flex-col" : undefined}>
      {/* Which blocks to show, and a small "+ Add" */}
      {showFilter && (
        <div className="mt-4 flex items-center justify-end gap-4 text-sm">
          {/* A small segmented switch: clear enough to spot, light enough to stay out of the way */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500">Show</span>
            <div className="flex rounded-md border border-stone-200 bg-stone-100 p-0.5" role="group" aria-label="Show">
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={filter === option.key}
                  onClick={() => setFilter(option.key)}
                  className={`rounded px-2.5 py-0.5 text-xs transition-colors ${
                    filter === option.key
                      ? "bg-white font-medium text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={openFromButton}
              className="rounded-md border border-stone-200 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              + Add
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className={`overflow-x-auto rounded-xl border border-stone-200 bg-white ${
          fillHeight ? "min-h-0 flex-1 overflow-y-auto" : showFilter ? "mt-2" : "mt-4"
        } ${scrollHeight ? "overflow-y-auto" : ""}`}
        style={scrollHeight ? { maxHeight: scrollHeight } : undefined}
      >
        <div className={isSingleDay ? "" : "md:min-w-[46rem]"}>
          {/* Day headers. They stay at the top while a scrolling calendar scrolls. */}
          <div className={`sticky top-0 z-20 grid ${gridColumns} border-b border-stone-200 bg-white text-xs text-stone-500`}>
            <span />
            {days.map((day) => (
              <div
                key={day.date}
                className={`py-2 text-center ${dayClass(day.date)} ${day.date === today ? "font-semibold text-accent" : ""}`}
              >
                {headerHref ? (
                  <Link href={headerHref} className="hover:underline">
                    {day.weekday} {day.dayNumber}
                  </Link>
                ) : (
                  <>
                    {day.weekday} {day.dayNumber}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Hours and days */}
          <div className={`grid ${gridColumns}`} style={{ height: DAY_HEIGHT }}>
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
                className={`relative border-l border-stone-100 ${dayClass(day.date)} ${day.date === today ? "bg-accent-soft/30" : ""} ${canAdd ? "cursor-pointer" : ""}`}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-stone-100"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}

                {filter !== "done" && (
                  <Lane
                    blocks={layoutDay(planBlocks, day)}
                    side={filter === "plan" ? "full" : "left"}
                    timeRange={timeRange}
                    onEdit={canAddBlocks ? setDraft : undefined}
                  />
                )}
                {filter !== "plan" && (
                  <Lane
                    blocks={layoutDay(trackedBlocks, day)}
                    side={filter === "done" ? "full" : "right"}
                    timeRange={timeRange}
                    // Only time logged in the app has a draft; events from other calendars stay read-only
                    onEdit={canLog ? setDraft : undefined}
                  />
                )}

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

      {/* Below the calendar, full width. Later an "Add event" button sits beside it. */}
      {canAdd && !hideAddButton && !showFilter && (
        <div className="mt-3 flex justify-center gap-3">
          <button
            type="button"
            onClick={openFromButton}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Add time
          </button>
        </div>
      )}

      {draft && (
        <PlanBlockDialog
          draft={draft}
          days={days.map((day) => ({ date: day.date, label: day.label }))}
          groups={groups}
          timeZone={timeZone}
          canPlan={canAddBlocks}
          canLog={canLog}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}