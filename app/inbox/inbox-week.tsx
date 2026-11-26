"use client";

import { useState, useTransition } from "react";
import { approveCategories, undoCategories } from "./actions";

export type InboxCategoryGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

export type InboxRow = {
  // The title for a group of events; an event ID for one event inside it
  key: string;
  title: string;
  // e.g. "3 events · 3h · Time Tracker"
  meta: string;
  eventIds: string[];
  // The category last picked for this title, if any
  suggestedCategoryId: string | null;
  // One event of a group, listed under "Show each event"
  items?: InboxRow[];
};

type Done = { categoryId: string; eventIds: string[] };

// One week of the Inbox. Every row has the same picker and Approve button; a suggestion just
// starts picked. Nothing changes until Approve. Approved rows stay, with an Undo.
export default function InboxWeek({
  label,
  count,
  rows,
  groups,
}: {
  label: string;
  count: number;
  rows: InboxRow[];
  groups: InboxCategoryGroup[];
}) {
  const allRows = rows.flatMap((row) => [row, ...(row.items ?? [])]);
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      allRows.filter((row) => row.suggestedCategoryId).map((row) => [row.key, row.suggestedCategoryId!])
    )
  );
  const [done, setDone] = useState<Record<string, Done>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const categoryById = new Map(groups.flatMap((group) => group.categories).map((c) => [c.id, c]));
  // Events already approved (in a group or one by one), so they aren't sent twice
  const doneIds = new Set(Object.values(done).flatMap((entry) => entry.eventIds));
  const openIds = (row: InboxRow) => row.eventIds.filter((id) => !doneIds.has(id));

  function approve(targets: InboxRow[]) {
    const assignments = targets
      .map((row) => ({ key: row.key, eventIds: openIds(row), categoryId: choice[row.key] }))
      .filter((entry) => entry.categoryId && entry.eventIds.length > 0);
    if (assignments.length === 0) {
      return;
    }
    setError(null);
    setDone((current) => {
      const next = { ...current };
      for (const entry of assignments) {
        next[entry.key] = { categoryId: entry.categoryId, eventIds: entry.eventIds };
      }
      return next;
    });
    startTransition(async () => {
      const result = await approveCategories(
        assignments.map(({ eventIds, categoryId }) => ({ eventIds, categoryId }))
      );
      if (result.error) {
        setError("Couldn't save. Try again.");
        setDone((current) => {
          const next = { ...current };
          for (const entry of assignments) {
            delete next[entry.key];
          }
          return next;
        });
      }
    });
  }

  function undo(key: string) {
    const entry = done[key];
    if (!entry) {
      return;
    }
    setError(null);
    setDone((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    startTransition(async () => {
      const result = await undoCategories(entry.eventIds);
      if (result.error) {
        setError("Couldn't undo. Try again.");
        setDone((current) => ({ ...current, [key]: entry }));
      }
    });
  }

  // Rows "Approve all" would approve: groups (and single events) with a category picked
  const ready = rows.filter((row) => !done[row.key] && choice[row.key] && openIds(row).length > 0);

  function rowControls(row: InboxRow, small = false) {
    const entry = done[row.key];
    if (entry) {
      const category = categoryById.get(entry.categoryId);
      return (
        <>
          <span className="flex items-center gap-1.5 truncate text-sm text-accent">
            ✓ {category?.name ?? "Done"}
          </span>
          <button
            type="button"
            onClick={() => undo(row.key)}
            className="rounded-md border border-stone-200 py-1 text-xs text-stone-600 transition-colors hover:bg-stone-50"
          >
            Undo
          </button>
        </>
      );
    }

    const picked = choice[row.key] ? categoryById.get(choice[row.key]) : undefined;
    return (
      <>
        {/* A native select under a styled face: the face shows the dot and name */}
        <label
          className={`relative flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-stone-300 bg-white px-2 ${
            small ? "py-0.5 text-xs" : "py-1 text-sm"
          }`}
        >
          {picked ? (
            <>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: picked.color }} />
              <span className="truncate">{picked.name}</span>
            </>
          ) : (
            <>
              <span className="size-2 shrink-0 rounded-full border border-dashed border-stone-400" />
              <span className="truncate text-stone-400">Choose…</span>
            </>
          )}
          <span className="ml-auto pl-1 text-[10px] text-stone-400">▾</span>
          <select
            value={choice[row.key] ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setChoice((current) => {
                const next = { ...current };
                if (value) {
                  next[row.key] = value;
                } else {
                  delete next[row.key];
                }
                return next;
              });
            }}
            aria-label={`Category for ${row.title}`}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="">Choose…</option>
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
        </label>
        <button
          type="button"
          onClick={() => approve([row])}
          disabled={!picked}
          className={`rounded-md bg-accent font-medium text-white transition-colors hover:bg-accent-hover disabled:bg-stone-100 disabled:text-stone-400 ${
            small ? "py-0.5 text-xs" : "py-1 text-sm"
          }`}
        >
          Approve
        </button>
      </>
    );
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold text-stone-700">
          {label}
          <span className="font-normal text-stone-400">
            {count} {count === 1 ? "event" : "events"}
          </span>
        </h2>
        {ready.length > 1 && (
          <button
            type="button"
            onClick={() => approve(ready)}
            className="rounded-md border border-stone-200 bg-white px-3 py-1 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            Approve all {ready.length}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {rows.map((row) => (
          <li key={row.key} className="px-4 py-3 sm:px-5">
            <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_5.5rem] sm:gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.title}</p>
                <p className="mt-0.5 truncate text-sm text-stone-500">{row.meta}</p>
              </div>
              {rowControls(row)}
            </div>

            {/* A group's events, each with its own picker, to sort one differently */}
            {row.items && !done[row.key] && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-stone-500 hover:text-stone-800">
                  Show each event
                </summary>
                <ul className="mt-2 space-y-2 border-l border-stone-200 pl-4">
                  {row.items.map((item) => (
                    <li
                      key={item.key}
                      className="grid grid-cols-[minmax(0,1fr)_8.5rem_5rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_10rem_5.5rem] sm:gap-3"
                    >
                      <span className="truncate text-stone-600">{item.meta}</span>
                      {rowControls(item, true)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}