import "server-only";
import { listGoogleEvents, withGoogleAccessToken } from "@/lib/google";
import type { Week } from "@/lib/week";

export type PlanBlock = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
};

// The timed blocks on the user's Plan calendar for one week.
// problem is true when Google couldn't be reached, so pages can say so.
export async function loadPlanBlocks(
  userId: string,
  planCalendarId: string,
  week: Week
): Promise<{ blocks: PlanBlock[]; problem: boolean }> {
  try {
    const events = await withGoogleAccessToken(userId, (accessToken) =>
      listGoogleEvents(accessToken, planCalendarId, week.start, week.end)
    );

    if (!events) {
      return { blocks: [], problem: true };
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

    return { blocks, problem: false };
  } catch (error) {
    console.error("Could not load the Plan calendar:", error);
    return { blocks: [], problem: true };
  }
}

// Plan block titles match category names, ignoring capitals and extra spaces
export function nameKey(name: string) {
  return name.trim().toLowerCase();
}