"use client";

import { useCallback, useSyncExternalStore } from "react";

// Trends' "Done | Done + planned" choice, remembered on this device and shared by
// every component that uses this hook (the toggle, the charts and the table)

const STORAGE_KEY = "time-ledger:trends-show-planned";
// localStorage's own "storage" event only fires in other tabs, so this one tells this tab
const CHANGE_EVENT = "time-ledger:trends-show-planned-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useShowPlanned() {
  // The server has no localStorage, so it renders "Done"
  const showPlanned = useSyncExternalStore(subscribe, read, () => false);

  const setShowPlanned = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Can't remember it on this device; nothing else to do
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { showPlanned, setShowPlanned };
}