"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import CategorySelect, { type CategoryGroup } from "@/components/category-select";
import { deletePlanBlock, savePlanBlock } from "./actions";

// What the popup starts with. blockId is set when editing an existing block.
export type BlockDraft = {
  blockId?: string;
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
  onClose: () => void;
};

// A popup for adding a block to the Plan calendar, or editing or deleting one
export default function PlanBlockDialog({
  draft,
  days,
  groups,
  timeZone,
  onClose,
}: PlanBlockDialogProps) {
  const isEditing = Boolean(draft.blockId);
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
      const result = await savePlanBlock(formData);
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
      const result = await deletePlanBlock(blockId);
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
          {isEditing ? "Edit plan block" : "Add a plan block"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input type="hidden" name="time_zone" value={timeZone} />
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
                {isSaving ? "Saving..." : isEditing ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}