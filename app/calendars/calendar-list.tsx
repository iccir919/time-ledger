"use client";

import { useRef, useState, useTransition } from "react";
import { setCalendarTracked, setDefaultCategory, type SaveResult } from "./actions";

export type CalendarRow = {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  tracked: boolean;
  defaultCategoryId: string | null;
  // Still tracked here, but deleted in Google
  missing: boolean;
};

type CategoryGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string }[];
};

type Status = { id: string; text: string; ok: boolean };

// The user's own Google calendars: a checkbox to count each one, and a default category.
// Every change saves right away.
export default function CalendarList({
  calendars,
  groups,
}: {
  calendars: CalendarRow[];
  groups: CategoryGroup[];
}) {
  const [rows, setRows] = useState(calendars);
  const [status, setStatus] = useState<Status | null>(null);
  const [, startTransition] = useTransition();
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showStatus(next: Status) {
    setStatus(next);
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
    }
    clearTimer.current = setTimeout(() => setStatus(null), next.ok ? 1500 : 4000);
  }

  // Change the row right away, save, and put it back if saving fails
  function save(id: string, change: Partial<CalendarRow>, action: () => Promise<SaveResult>) {
    const before = rows;
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setRows(before);
        showStatus({ id, text: "Couldn't save", ok: false });
      } else {
        showStatus({ id, text: "Saved", ok: true });
      }
    });
  }

  // A calendar deleted in Google: stop tracking it and take it off the list
  function stopTracking(row: CalendarRow) {
    startTransition(async () => {
      const result = await setCalendarTracked(row.id, row.name, false);
      if (result.error) {
        showStatus({ id: row.id, text: "Couldn't save", ok: false });
      } else {
        setRows((current) => current.filter((r) => r.id !== row.id));
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-stone-200 bg-white px-5 py-4 text-sm text-stone-500">
        No calendars found in your Google account.
      </p>
    );
  }

  return (
    <div className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
      {rows.map((row) => {
        const checkboxId = `calendar-${row.id}`;
        const rowStatus = status?.id === row.id ? status : null;

        if (row.missing) {
          return (
            <div key={row.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="size-2.5 shrink-0 rounded-full bg-stone-300" />
              <span className="flex-1 text-stone-500">
                {row.name}
                <span className="ml-2 text-xs text-stone-400">deleted in Google, still tracked</span>
              </span>
              {rowStatus && <span className="text-xs text-red-600">{rowStatus.text}</span>}
              <button
                type="button"
                onClick={() => stopTracking(row)}
                className="text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900"
              >
                Stop tracking
              </button>
            </div>
          );
        }

        return (
          <div key={row.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            <input
              type="checkbox"
              id={checkboxId}
              checked={row.tracked}
              onChange={(event) => {
                const tracked = event.target.checked;
                save(row.id, { tracked }, () => setCalendarTracked(row.id, row.name, tracked));
              }}
              className="size-4 shrink-0 accent-accent"
            />
            <label htmlFor={checkboxId} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="truncate">
                {row.name}
                {row.primary && <span className="ml-2 text-xs text-stone-400">primary</span>}
              </span>
            </label>

            {rowStatus && (
              <span className={`shrink-0 text-xs ${rowStatus.ok ? "text-accent" : "text-red-600"}`}>
                {rowStatus.text}
              </span>
            )}

            {/* A small text-style picker, only for calendars that count */}
            <select
              value={row.defaultCategoryId ?? ""}
              onChange={(event) => {
                const categoryId = event.target.value || null;
                save(row.id, { defaultCategoryId: categoryId }, () => setDefaultCategory(row.id, categoryId));
              }}
              aria-label={`Default category for ${row.name}`}
              className={`max-w-40 shrink-0 cursor-pointer truncate rounded border-0 bg-transparent py-0.5 text-right text-xs text-stone-500 hover:text-stone-900 focus:outline-none focus-visible:underline ${
                row.tracked ? "" : "invisible"
              }`}
            >
              <option value="">No category</option>
              {groups.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  {group.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}