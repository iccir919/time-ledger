import "server-only";
import { GoogleApiError, listGoogleEvents, withGoogleAccessToken } from "@/lib/google";

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

// The timed blocks on the user's Plan calendar between two times (a week or a month). Never throws,
// so pages can show a notice instead of an error screen.
export async function loadPlanBlocks(
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