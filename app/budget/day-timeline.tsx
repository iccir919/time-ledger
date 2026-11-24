"use client";

import type { MouseEvent } from "react";
import type { BlockDraft } from "./plan-block-dialog";

// One thing on a day for a category: a tracked event (done) or a Plan calendar block (planned)
export type DayItem = {
  kind: "done" | "plan";
  title: string;
  startMs: number;
  endMs: number;
  // Plan blocks only: what the edit popup starts with
  draft?: BlockDraft;
};

// A DayItem with its category, so the timeline can color it
export type TimelineItem = DayItem & {
  categoryId: string;
  categoryName: string;
  color: string;
};

type DayTimelineProps = {
  dayLabel: string;
  // The day's start and end (midnight to midnight in the user's time zone)
  startMs: number;
  endMs: number;
  items: TimelineItem[];
  // The category clicked in the grid: its blocks stay bright, the rest fade
  selectedCategoryId: string | null;
  // A line in words about the selected category on this day, e.g. "0.5h done · 1h still planned"
  summary: string | null;
  // Minutes since midnight when this day is today, otherwise null
  nowMinutes: number | null;
  // Clicking an empty spot adds a block there (today and later days, with a Plan calendar)
  canAdd: boolean;
  // Clicking a plan block edits it (any day, with a Plan calendar)
  canEdit: boolean;
  timeZone: string;
  onAddAt: (minutes: number) => void;
  onAdd: () => void;
  onEdit: (draft: BlockDraft) => void;
  // The ‹ › arrows; missing at the start or end of the week
  onPrevious?: () => void;
  onNext?: () => void;
};

const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function hourLabel(hour: number) {
  if (hour === 0 || hour === 24) {
    return "12a";
  }
  if (hour === 12) {
    return "12p";
  }
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

// The whole selected day, across: plan blocks in the top lane, tracked events in the bottom one.
// Shows every category, so you can plan around everything else that day.
// Sits in its own card under the Plan grid.
export default function DayTimeline({
  dayLabel,
  startMs,
  endMs,
  items,
  selectedCategoryId,
  summary,
  nowMinutes,
  canAdd,
  canEdit,
  timeZone,
  onAddAt,
  onAdd,
  onEdit,
  onPrevious,
  onNext,
}: DayTimelineProps) {
  const dayLength = endMs - startMs;
  // Where a time sits across the day, as a percentage
  const percent = (ms: number) => ((Math.min(Math.max(ms, startMs), endMs) - startMs) / dayLength) * 100;

  // "9:00 – 10:30 AM" in the user's time zone, with normal spaces
  const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const timeRange = (start: number, end: number) =>
    timeFormat.formatRange(start, end).replace(/[  ]/g, " ");

  // Clicking empty space in the plan lane: add a block at that half hour
  function handleLaneClick(event: MouseEvent<HTMLDivElement>) {
    if (!canAdd || event.target !== event.currentTarget) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = ((event.clientX - rect.left) / rect.width) * 24 * 60;
    onAddAt(Math.floor(minutes / 30) * 30);
  }

  const lanes: { kind: DayItem["kind"]; label: string }[] = [
    { kind: "plan", label: "Planned" },
    { kind: "done", label: "Done" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <ArrowButton direction="previous" onClick={onPrevious} />
            <h2 className="px-1 font-semibold">{dayLabel}</h2>
            <ArrowButton direction="next" onClick={onNext} />
          </div>
          {summary && <p className="mt-0.5 pl-9 text-sm text-stone-600">{summary}</p>}
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md border border-stone-200 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            + Add plan block
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {lanes.map((lane) => (
          <div key={lane.kind} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-stone-500">{lane.label}</span>
            <div
              onClick={lane.kind === "plan" ? handleLaneClick : undefined}
              title={lane.kind === "plan" && canAdd ? "Click an empty spot to add a plan block" : undefined}
              className={`relative h-9 flex-1 rounded-md bg-stone-100 ${
                lane.kind === "plan" && canAdd ? "cursor-pointer hover:bg-stone-200/70" : ""
              }`}
            >
              {/* Faint lines every 3 hours */}
              {HOUR_LABELS.slice(1, -1).map((hour) => (
                <span
                  key={hour}
                  className="pointer-events-none absolute inset-y-0 border-l border-white"
                  style={{ left: `${(hour / 24) * 100}%` }}
                />
              ))}

              {items
                .filter((item) => item.kind === lane.kind)
                .map((item, index) => {
                  const faded = selectedCategoryId !== null && item.categoryId !== selectedCategoryId;
                  const editable = item.kind === "plan" && item.draft && canEdit;
                  const label = `${item.kind === "done" ? item.title : item.categoryName} · ${timeRange(item.startMs, item.endMs)}`;
                  const style = {
                    left: `${percent(item.startMs)}%`,
                    width: `max(${percent(item.endMs) - percent(item.startMs)}%, 4px)`,
                    opacity: faded ? 0.35 : 1,
                    ...(item.kind === "done"
                      ? { backgroundColor: item.color }
                      : { backgroundColor: `${item.color}33`, borderColor: item.color }),
                  };
                  const className = `absolute inset-y-1 rounded ${
                    item.kind === "plan" ? "border-[1.5px] border-dashed" : ""
                  }`;

                  return editable ? (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onEdit(item.draft!)}
                      title={`${label}. Click to edit.`}
                      aria-label={`${label}. Edit this plan block.`}
                      className={`${className} cursor-pointer hover:brightness-95`}
                      style={style}
                    />
                  ) : (
                    <span key={index} title={label} className={className} style={style} />
                  );
                })}

              {nowMinutes !== null && (
                <span
                  className="pointer-events-none absolute -inset-y-1 border-l-2 border-red-500"
                  style={{ left: `${(nowMinutes / (24 * 60)) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Hour labels under the lanes */}
      <div className="ml-[4.25rem] mt-1 flex justify-between text-[11px] text-stone-400">
        {HOUR_LABELS.map((hour) => (
          <span key={hour}>{hourLabel(hour)}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border-[1.5px] border-dashed border-stone-400 bg-stone-400/20" />
          planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-stone-400" />
          done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 border-l-2 border-red-500" />
          now
        </span>
        {canAdd && <span>Click an empty spot in Planned to add a block there.</span>}
      </div>
    </div>
  );
}

// ‹ or ›, grayed out (and doing nothing) at the start or end of the week
function ArrowButton({ direction, onClick }: { direction: "previous" | "next"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={direction === "previous" ? "Previous day" : "Next day"}
      className="flex size-8 items-center justify-center rounded-md text-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:text-stone-200 disabled:hover:bg-transparent"
    >
      {direction === "previous" ? "‹" : "›"}
    </button>
  );
}