"use server";

import { createClient } from "@/lib/supabase/server";
import { syncCalendars } from "@/lib/sync-events";

export type SyncStatusResult =
  | { status: "ok"; changed: boolean; syncedAt: string }
  | { status: "reconnect" }
  | { status: "error" };

// Called by the header's sync indicator: on each page (skipped if the last sync was moments
// ago), and when it's clicked (force). The indicator refreshes the page if anything changed.
export async function runSync(force: boolean): Promise<SyncStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error" };
  }

  try {
    const outcome = await syncCalendars(user.id, { force });
    return outcome.status === "reconnect"
      ? outcome
      : { status: "ok", changed: outcome.changed, syncedAt: outcome.syncedAt };
  } catch (error) {
    console.error("Sync failed:", error);
    return { status: "error" };
  }
}
