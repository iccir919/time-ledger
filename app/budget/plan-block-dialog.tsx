"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import CategorySelect, { type CategoryGroup } from "@/components/category-select";
import { deleteBlock, saveBlock, type BlockKind } from "./actions";

// What the popup starts with. blockId is set when editing an existing block or logged event;
// kind says which (a new one picks Plan or Done on its own when kind is left out).
export type BlockDraft = {
  blockId?: string;
  kind?: BlockKind;
  categoryId?: string;
  date: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

type PlanBlockDialogProps = {
  draft: BlockDraft;
  days: { date: string; label: string }[];
  groups: CategoryGroup[];
  timeZone: string;
  // Which calendars exist to write to: the Plan calendar, and the Log calendar for done time
  canPlan?: boolean;
  canLog?: boolean;
  onClose: () => void;
};

// Now as "YYYY-MM-DDTHH:MM" in the user's time zone, to tell past times from later ones
function nowLocal(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// A popup for adding time: a plan block (Plan calendar) or done time (Log calendar),
// with a Plan / Done switch. Also edits or deletes either kind.
export default function PlanBlockDialog({
  draft,
  days,
  groups,
  timeZone,
  canPlan = true,
  canLog = false,
  onClose,
}: PlanBlockDialogProps) {
  const isEditing = Boolean(draft.blockId);

  // Plan or Done: what the draft says, otherwise Done for a time that's passed and Plan for
  // one ahead, as long as that calendar exists
  const [kind, setKind] = useState<BlockKind>(() => {
    const preferred: BlockKind = draft.kind ?? (`${draft.date}T${draft.start}` < nowLocal(timeZone) ? "done" : "plan");
    if (isEditing) {
      return preferred;
    }
    if (preferred === "done" && !canLog) {
      return "plan";
    }
    if (preferred === "plan" && !canPlan) {
      return "done";
    }
    return preferred;
  });
  const showSwitch = !isEditing && canPlan && canLog;
  const [error, setError] = useState("");
  const [start, setStart] = useState(draft.start);
  const [end, setEnd] = useState(draft.end);
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const isBusy = isSaving || isDeleting;

  // An end time earlier than the start means the block ends the next day (like sleep)
  const endsNextDay = end !== "" && start !== "" && end < start;

  // A block that started in last week still needs its day in the list
  const dayOptions = days.some((day) => day.date === draft.date)
    ? days
    : [{ date: draft.date, label: draft.date }, ...days];

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

  // Handling submit ourselves (instead of a form action) keeps what was typed if saving fails
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");

    startSaving(async () => {
      const result = await saveBlock(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!draft.blockId) {
      return;
    }
    const blockId = draft.blockId;
    setError("");

    startDeleting(async () => {
      const result = await deleteBlock(blockId, kind);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    // The dark backdrop. Clicking it (but not the box) closes the popup.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-block-title"
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-lg"
      >
        <h2 id="plan-block-title" className="font-semibold">
          {isEditing
            ? kind === "done"
              ? "Edit logged time"
              : "Edit plan block"
            : kind === "done"
              ? "Log time"
              : "Add a plan block"}
        </h2>

        {/* Plan or Done, when adding and both calendars exist */}
        {showSwitch && (
          <div className="mt-4 flex rounded-lg bg-stone-100 p-1" role="group" aria-label="Plan or done">
            {(["plan", "done"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={`flex-1 rounded-md py-1.5 text-sm transition-colors ${
                  kind === option ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {option === "plan" ? "Plan" : "Done"}
              </button>
            ))}
          </div>
        )}
        {!isEditing && (
          <p className="mt-2 text-xs text-stone-500">
            {kind === "done"
              ? "Saved to your Log calendar. Counts as done."
              : "Saved to your Plan calendar."}
            {!canLog && (
              <>
                {" "}
                To log done time here,{" "}
                <Link href="/calendars" className="font-medium text-accent hover:underline">
                  create a Log calendar
                </Link>
                .
              </>
            )}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input type="hidden" name="time_zone" value={timeZone} />
          <input type="hidden" name="kind" value={kind} />
          {draft.blockId && <input type="hidden" name="block_id" value={draft.blockId} />}

          <div className="text-sm">
            <span className="text-stone-600">Category</span>
            <div className="mt-1 [&>select]:w-full [&>select]:py-2">
              <CategorySelect
                name="category_id"
                groups={groups}
                defaultValue={draft.categoryId}
                placeholder="Choose a category"
                required
                ariaLabel="Category"
              />
            </div>
          </div>

          <label className="block text-sm">
            <span className="text-stone-600">Day</span>
            <select
              name="date"
              defaultValue={draft.date}
              className="mt-1 w-full rounded-md border border-stone-200 bg-white px-2 py-2 text-sm"
            >
              {dayOptions.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="flex items-end gap-3">
              <label className="block flex-1 text-sm">
                <span className="text-stone-600">Start</span>
                <input
                  type="time"
                  name="start"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  step={900}
                  required
                  className="mt-1 w-full rounded-md border border-stone-200 px-2 py-2 text-sm"
                />
              </label>
              <span className="pb-2 text-sm text-stone-400">to</span>
              <label className="block flex-1 text-sm">
                <span className="text-stone-600">End</span>
                <input
                  type="time"
                  name="end"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  step={900}
                  required
                  className="mt-1 w-full rounded-md border border-stone-200 px-2 py-2 text-sm"
                />
              </label>
            </div>
            {endsNextDay && <p className="mt-2 text-xs text-stone-500">Ends the next day</p>}
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center gap-2 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isBusy}
                className="rounded-lg px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                disabled={isBusy}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {isSaving ? "Saving..." : isEditing ? "Save" : kind === "done" ? "Log it" : "Add"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}