"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import CategorySelect, { type CategoryGroup } from "@/components/category-select";
import { createPlanBlock } from "./actions";

export type BlockDraft = {
  date: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

type AddBlockDialogProps = {
  draft: BlockDraft;
  days: { date: string; label: string }[];
  groups: CategoryGroup[];
  timeZone: string;
  onClose: () => void;
};

function AddButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? "Adding..." : "Add"}
    </button>
  );
}

// A popup for adding one block to the Plan calendar
export default function AddBlockDialog({
  draft,
  days,
  groups,
  timeZone,
  onClose,
}: AddBlockDialogProps) {
  const [error, setError] = useState("");

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

  async function submit(formData: FormData) {
    setError("");
    const result = await createPlanBlock(formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
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
        aria-labelledby="add-block-title"
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-lg"
      >
        <h2 id="add-block-title" className="font-semibold">
          Add a plan block
        </h2>

        <form action={submit} className="mt-5 space-y-4">
          <input type="hidden" name="time_zone" value={timeZone} />

          <div className="text-sm">
            <span className="text-stone-600">Category</span>
            <div className="mt-1 [&>select]:w-full [&>select]:py-2">
              <CategorySelect
                name="category_id"
                groups={groups}
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
              {days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-3">
            <label className="block flex-1 text-sm">
              <span className="text-stone-600">Start</span>
              <input
                type="time"
                name="start"
                defaultValue={draft.start}
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
                defaultValue={draft.end}
                step={900}
                required
                className="mt-1 w-full rounded-md border border-stone-200 px-2 py-2 text-sm"
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100"
            >
              Cancel
            </button>
            <AddButton />
          </div>
        </form>
      </div>
    </div>
  );
}