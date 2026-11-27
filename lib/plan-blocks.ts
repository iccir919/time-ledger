import "server-only";
import { GoogleApiError, listGoogleEvents, withGoogleAccessToken } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export type PlanBlock = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
};

export type PlanBlocksResult = {
  blocks: PlanBlock[];
  // Google couldn't be reached
  problem: boolean;
  // The Plan calendar was deleted in Google
  missing: boolean;
};

// The timed blocks on the user's Plan calendar between two times (a week or a month).
// The sync stores the blocks for a stretch of weeks; inside it they come from the database,
// outside it (far ahead) straight from Google. Never throws, so pages can show a notice
// instead of an error screen.
export async function loadPlanBlocks(
  userId: string,
  planCalendarId: string,
  range: { start: Date; end: Date }
): Promise<PlanBlocksResult> {
  const stored = await loadStoredPlanBlocks(planCalendarId, range);
  if (stored) {
    return stored;
  }
  return loadPlanBlocksFromGoogle(userId, planCalendarId, range);
}

// From the database, or null when the stored blocks don't cover this range
async function loadStoredPlanBlocks(
  planCalendarId: string,
  range: { start: Date; end: Date }
): Promise<PlanBlocksResult | null> {
  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("plan_calendar_id, plan_synced_from, plan_synced_until, plan_calendar_missing")
    .maybeSingle();
  if (error || !settings || settings.plan_calendar_id !== planCalendarId) {
    return null;
  }
  if (settings.plan_calendar_missing) {
    return { blocks: [], problem: false, missing: true };
  }
  const covered =
    settings.plan_synced_from &&
    settings.plan_synced_until &&
    Date.parse(settings.plan_synced_from) <= range.start.getTime() &&
    Date.parse(settings.plan_synced_until) >= range.end.getTime();
  if (!covered) {
    return null;
  }

  const { data, error: blocksError } = await supabase
    .from("plan_blocks")
    .select("google_event_id, title, start_at, end_at")
    .lt("start_at", range.end.toISOString())
    .gt("end_at", range.start.toISOString())
    .order("start_at");
  if (blocksError) {
    return null;
  }
  return {
    blocks: data.map((block) => ({
      id: block.google_event_id,
      title: block.title,
      startAt: block.start_at,
      endAt: block.end_at,
    })),
    problem: false,
    missing: false,
  };
}

async function loadPlanBlocksFromGoogle(
  userId: string,
  planCalendarId: string,
  range: { start: Date; end: Date }
): Promise<PlanBlocksResult> {
  try {
    const events = await withGoogleAccessToken(userId, (accessToken) =>
      listGoogleEvents(accessToken, planCalendarId, range.start, range.end)
    );

    if (!events) {
      return { blocks: [], problem: true, missing: false };
    }

    const blocks = events
      // Only timed blocks count; skip all-day and cancelled events
      .filter((event) => event.status !== "cancelled" && event.start.dateTime && event.end.dateTime)
      .map((event) => ({
        id: event.id,
        title: (event.summary ?? "").trim() || "(No title)",
        startAt: event.start.dateTime!,
        endAt: event.end.dateTime!,
      }));

    return { blocks, problem: false, missing: false };
  } catch (error) {
    // 404 or 410: the calendar was deleted in Google
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
      return { blocks: [], problem: false, missing: true };
    }
    console.error("Could not load the Plan calendar:", error);
    return { blocks: [], problem: true, missing: false };
  }
}

// Plan block titles match category names, ignoring capitals and extra spaces
export function nameKey(name: string) {
  return name.trim().toLowerCase();
}