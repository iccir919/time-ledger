import "server-only";
import { subWeeks } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  getGoogleAccessToken,
  getGoogleTimeZone,
  listGoogleEvents,
  GoogleApiError,
  GoogleAuthError,
  type GoogleEvent,
} from "@/lib/google";
import { getCurrentWeek } from "@/lib/week";

// Skip events that shouldn't count as time spent
function shouldImport(event: GoogleEvent) {
  if (event.status === "cancelled") {
    return false;
  }

  // All-day events have a date but no time
  if (!event.start.dateTime || !event.end.dateTime) {
    return false;
  }

  // Skip events the user declined
  const me = event.attendees?.find((attendee) => attendee.self);
  if (me?.responseStatus === "declined") {
    return false;
  }

  return true;
}

export type SyncResult =
  | { status: "reconnect" }
  | { status: "ok"; timeZone: string; week: ReturnType<typeof getCurrentWeek> };

// Import this week's and last week's events from every tracked calendar
async function syncRecentWeeksOnce(userId: string, forceRefresh = false): Promise<SyncResult> {
  const accessToken = await getGoogleAccessToken(userId, { forceRefresh });
  if (!accessToken) {
    return { status: "reconnect" };
  }

  const timeZone = await getGoogleTimeZone(accessToken);
  const week = getCurrentWeek(timeZone);

  // Sync last week too, so skipping a few days doesn't leave gaps
  const syncStart = subWeeks(week.start, 1);
  const supabase = await createClient();

  const [calendarsResult, categoriesResult] = await Promise.all([
    supabase.from("tracked_calendars").select("id, name, google_calendar_id, default_category_id"),
    supabase.from("categories").select("id"),
  ]);

  if (calendarsResult.error) {
    throw new Error(calendarsResult.error.message);
  }
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }
  const calendars = calendarsResult.data;

  // Events Time Ledger wrote (like done time logged in the app) carry their category's ID.
  // Only IDs of this user's categories count, in case a category was deleted since.
  const categoryIds = new Set(categoriesResult.data.map((category) => category.id));
  const taggedCategory = (event: GoogleEvent) => {
    const id = event.extendedProperties?.private?.timeLedgerCategoryId;
    return id && categoryIds.has(id) ? id : null;
  };

  for (const calendar of calendars) {
    let googleEvents: GoogleEvent[];
    try {
      googleEvents = (
        await listGoogleEvents(accessToken, calendar.google_calendar_id, syncStart, week.end)
      ).filter(shouldImport);
    } catch (error) {
      // 404 or 410: the calendar was deleted in Google. Skip it so one missing calendar
      // doesn't stop the whole sync. The Calendars page offers to stop tracking it.
      if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
        console.warn(`Skipping a tracked calendar that no longer exists: ${calendar.name}`);
        continue;
      }
      throw error;
    }

    // Events already saved for this calendar that overlap the sync range
    const { data: saved, error: savedError } = await supabase
      .from("events")
      .select("id, google_event_id, category_id")
      .eq("tracked_calendar_id", calendar.id)
      .lt("start_at", week.end.toISOString())
      .gt("end_at", syncStart.toISOString());

    if (savedError) {
      throw new Error(savedError.message);
    }

    const savedByGoogleId = new Map(saved.map((event) => [event.google_event_id, event]));

    const rows = googleEvents.map((event) => ({
      tracked_calendar_id: calendar.id,
      google_event_id: event.id,
      title: event.summary ?? "(No title)",
      start_at: event.start.dateTime!,
      end_at: event.end.dateTime!,
      // A category Time Ledger tagged the event with comes first (so changing it in the app
      // sticks); then one the user already chose; then the calendar's default
      category_id:
        taggedCategory(event) ??
        savedByGoogleId.get(event.id)?.category_id ??
        calendar.default_category_id,
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("events")
        .upsert(rows, { onConflict: "tracked_calendar_id,google_event_id" });

      if (upsertError) {
        throw new Error(upsertError.message);
      }
    }

    // Remove events that were deleted, cancelled, or declined in Google
    const googleIds = new Set(rows.map((row) => row.google_event_id));
    const idsToRemove = saved
      .filter((event) => !googleIds.has(event.google_event_id))
      .map((event) => event.id);

    if (idsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("events")
        .delete()
        .in("id", idsToRemove);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }
  }

  return { status: "ok", timeZone, week };
}

// Sync, and if Google rejects the cached token, try once more with a fresh one
export async function syncRecentWeeks(userId: string): Promise<SyncResult> {
  try {
    return await syncRecentWeeksOnce(userId);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return await syncRecentWeeksOnce(userId, true);
    }
    throw error;
  }
}