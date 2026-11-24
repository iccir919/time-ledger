"use client";

import { useEffect } from "react";
import { formatHours } from "@/lib/hours";
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

type DaySheetProps = {
  category: { name: string; color: string };
  dayLabel: string;
  kind: "past" | "today" | "future";
  items: DayItem[];
  done: number;
  planned: number;
  ahead: number;
  // Adding and editing blocks needs a Plan calendar
  canAddBlocks: boolean;
  timeZone: string;
  onAdd: () => void;
  onEdit: (draft: BlockDraft) => void;
  onClose: () => void;
};

// The summary line at the top, in words
function summary(kind: DaySheetProps["kind"], done: number, planned: number, ahead: number) {
  if (kind === "future") {
    return planned > 0 ? `${formatHours(planned)} planned` : "Nothing planned yet";
  }
  if (kind === "today" && ahead > 0) {
    return `${formatHours(done)} done · ${formatHours(ahead)} still planned`;
  }
  if (planned > 0) {
    const missed = planned - done;
    return missed > 0
      ? `${formatHours(done)} done of ${formatHours(planned)} planned · ${formatHours(missed)} missed`
      : `${formatHours(done)} done · all of the plan`;
  }
  return done > 0 ? `${formatHours(done)} done` : "Nothing tracked";
}

// A sheet for one category on one day: what happened, what's planned, and a way to plan more.
// Slides up from the bottom on phones and sits in the middle on wider screens.
export default function DaySheet({
  category,
  dayLabel,
  kind,
  items,
  done,
  planned,
  ahead,
  canAddBlocks,
  timeZone,
  onAdd,
  onEdit,
  onClose,
}: DaySheetProps) {
  // Close with the Escape key
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // "9:00 – 10:30 AM" in the user's time zone, with normal spaces
  const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const timeRange = (startMs: number, endMs: number) =>
    timeFormat.formatRange(startMs, endMs).replace(/[  ]/g, " ");

  const sorted = [...items].sort((a, b) => a.startMs - b.startMs);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/30 md:items-center md:px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-sheet-title"
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border border-stone-200 bg-white p-5 shadow-lg md:max-w-md md:rounded-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="day-sheet-title" className="flex items-center gap-2 font-semibold">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
              <span className="font-normal text-stone-500">· {dayLabel}</span>
            </h2>
            <p className="mt-1 text-sm text-stone-600">{summary(kind, done, planned, ahead)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-md px-2 py-1 text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ×
          </button>
        </div>

        {/* What happened and what's planned, in time order */}
        {sorted.length > 0 ? (
          <ul className="mt-4 divide-y divide-stone-100 border-y border-stone-100">
            {sorted.map((item, index) => {
              const editable = item.kind === "plan" && item.draft && canAddBlocks;
              const content = (
                <>
                  <span className="w-36 shrink-0 tabular-nums text-stone-700">
                    {timeRange(item.startMs, item.endMs)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-stone-500">
                    {item.kind === "done" ? item.title : ""}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      item.kind === "done"
                        ? "bg-accent-soft text-accent"
                        : "border border-dashed border-stone-300 text-stone-500"
                    }`}
                  >
                    {item.kind === "done" ? "Done" : "Planned"}
                  </span>
                </>
              );

              return (
                <li key={index}>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => onEdit(item.draft!)}
                      title="Edit this plan block"
                      className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left text-sm hover:bg-stone-50"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-1 py-2.5 text-sm">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg bg-stone-50 px-3 py-4 text-center text-sm text-stone-500">
            {kind === "past" ? "Nothing tracked or planned this day." : "Nothing here yet."}
          </p>
        )}

        {/* Planning is for today and later days */}
        {kind !== "past" && canAddBlocks && (
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            + Add plan block
          </button>
        )}
      </div>
    </div>
  );
}