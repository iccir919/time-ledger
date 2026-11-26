"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Which categories are unchecked in the Plan page's sidebar, remembered on this device.
// Shared by every component that uses this hook, so the calendar and grid stay in step.

const STORAGE_KEY = "time-ledger:hidden-categories";
// localStorage's own "storage" event only fires in other tabs, so this one tells this tab
const CHANGE_EVENT = "time-ledger:hidden-categories-change";

// Stands in for events without a category (and plan blocks that don't match one)
export const UNCATEGORIZED = "uncategorized";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// Storage can be unavailable (private browsing, blocked cookies): then nothing is hidden
function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function useHiddenCategories() {
  // The server has no localStorage, so it renders with everything shown
  const saved = useSyncExternalStore(subscribe, read, () => "");
  const hidden = useMemo(() => new Set(saved ? saved.split(",") : []), [saved]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(hidden);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(STORAGE_KEY, [...next].join(","));
      } catch {
        // Can't remember it on this device; nothing else to do
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [hidden]
  );

  return { hidden, toggle };
}