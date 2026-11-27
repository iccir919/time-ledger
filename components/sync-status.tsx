"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/google-sign-in";
import { runSync, type SyncStatusResult } from "@/app/sync-actions";

type State = { kind: "syncing" } | { kind: "synced"; at: number } | { kind: "reconnect" } | { kind: "error" };

// "just now", "3 min ago", "2 h ago"
function ago(at: number, now: number) {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  return `${Math.floor(minutes / 60)} h ago`;
}

// A small sync icon by the Inbox button: syncs with Google in the background when a page
// opens (skipped if it just did), refreshes the page if anything changed, and syncs again
// when clicked. Hovering says when it last synced. If Google needs a fresh sign-in, it says so.
export default function SyncStatus() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "syncing" });
  // The time "ago" is measured from, ticking along so the label stays current
  const [now, setNow] = useState(0);

  function apply(result: SyncStatusResult) {
    setNow(Date.now());
    if (result.status === "ok") {
      setState({ kind: "synced", at: Date.parse(result.syncedAt) });
      if (result.changed) {
        router.refresh();
      }
    } else {
      setState({ kind: result.status });
    }
  }

  // Sync when the page opens
  useEffect(() => {
    let active = true;
    runSync(false).then((result) => {
      if (active) {
        apply(result);
      }
    });
    return () => {
      active = false;
    };
    // Once per page; apply only uses the router and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep "3 min ago" up to date
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function syncNow() {
    setState({ kind: "syncing" });
    apply(await runSync(true));
  }

  const base = "whitespace-nowrap text-xs transition-colors";

  // Needs attention: these stay as words
  if (state.kind === "reconnect") {
    return (
      <button type="button" onClick={() => signInWithGoogle()} className={`${base} font-medium text-red-700 hover:underline`}>
        Reconnect Google
      </button>
    );
  }
  if (state.kind === "error") {
    return (
      <button type="button" onClick={syncNow} className={`${base} text-stone-500 hover:text-stone-900`}>
        Couldn&apos;t sync · Retry
      </button>
    );
  }

  // Otherwise just a small icon: it spins while syncing; hover says when it last synced
  const syncing = state.kind === "syncing";
  const label = syncing ? "Syncing with Google Calendar…" : `Synced ${ago(state.at, now)}. Click to sync now.`;
  return (
    <button
      type="button"
      onClick={syncNow}
      disabled={syncing}
      title={label}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`size-4 ${syncing ? "animate-spin" : ""}`}
        aria-hidden="true"
      >
        <path d="M16 10a6 6 0 0 1-10.4 4.1M4 10a6 6 0 0 1 10.4-4.1" />
        <path d="M14.5 2.5v3.6h-3.6M5.5 17.5v-3.6h3.6" />
      </svg>
    </button>
  );
}