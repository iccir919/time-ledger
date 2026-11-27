import "server-only";
import { TZDate } from "@date-fns/tz";
import { addWeeks, startOfMonth, startOfWeek, subWeeks } from "date-fns";
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

// Syncing brings each tracked calendar's events into the database. Pages read from the
// database and never wait on Google; the header starts a sync in the background and
// refreshes the page if anything changed.

// A sync within this many seconds of the last one is skipped (moving between pages)
const MIN_SECONDS_BETWEEN_SYNCS = 60;

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

export type SyncOutcome =
  | { status: "reconnect" }
  | { status: "ok"; timeZone: string; changed: boolean; syncedAt: string };

// What pages need before showing anything (same shape the pages have always used)
export type SyncResult =
  | { status: "reconnect" }
  | { status: "ok"; timeZone: string; week: ReturnType<typeof getCurrentWeek> };

// Sync once. Each calendar counts from the start of the week it began being tracked,
// never before (like YNAB, history starts when you do). Within that, it syncs last week
// and this week, all calendars at the same time. Only rows that changed are written.
async function syncOnce(userId: string, forceRefresh: boolean): Promise<SyncOutcome> {
  const accessToken = await getGoogleAccessToken(userId, { forceRefresh });
  if (!accessToken) {
    return { status: "reconnect" };
  }

  const timeZone = await getGoogleTimeZone(accessToken);
  const week = getCurrentWeek(timeZone);
  const lastWeekStart = subWeeks(week.start, 1);
  const supabase = await createClient();

  const [calendarsResult, categoriesResult] = await Promise.all([
    supabase.from("tracked_calendars").select("id, name, google_calendar_id, default_category_id, created_at"),
    supabase.from("categories").select("id"),
  ]);
  if (calendarsResult.error) {
    throw new Error(calendarsResult.error.message);
  }
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  // Events Time Ledger wrote (like done time logged in the app) carry their category's ID.
  // Only IDs of this user's categories count, in case a category was deleted since.
  const categoryIds = new Set(categoriesResult.data.map((category) => category.id));
  const taggedCategory = (event: GoogleEvent) => {
    const id = event.extendedProperties?.private?.timeLedgerCategoryId;
    return id && categoryIds.has(id) ? id : null;
  };

  async function syncCalendar(calendar: (typeof calendarsResult.data)[number]) {
    // The Monday of the week tracking started, in the user's time zone
    const trackingStart = startOfWeek(new TZDate(Date.parse(calendar.created_at), timeZone), { weekStartsOn: 1 });
    const from = trackingStart > lastWeekStart ? trackingStart : lastWeekStart;
    let changed = false;

    let googleEvents: GoogleEvent[];
    try {
      googleEvents = (await listGoogleEvents(accessToken!, calendar.google_calendar_id, from, week.end)).filter(
        shouldImport
      );
    } catch (error) {
      // 404 or 410: the calendar was deleted in Google. Skip it so one missing calendar
      // doesn't stop the whole sync. The Calendars page offers to stop tracking it.
      if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
        console.warn(`Skipping a tracked calendar that no longer exists: ${calendar.name}`);
        return false;
      }
      throw error;
    }

    // Events already saved for this calendar that overlap the sync range
    const { data: saved, error: savedError } = await supabase
      .from("events")
      .select("id, google_event_id, category_id, title, start_at, end_at")
      .eq("tracked_calendar_id", calendar.id)
      .lt("start_at", week.end.toISOString())
      .gt("end_at", from.toISOString());
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
        taggedCategory(event) ?? savedByGoogleId.get(event.id)?.category_id ?? calendar.default_category_id,
    }));

    // Only new or different events get written. Times are compared as moments, since Google
    // and the database write the same time differently.
    const changedRows = rows.filter((row) => {
      const before = savedByGoogleId.get(row.google_event_id);
      return (
        !before ||
        before.title !== row.title ||
        before.category_id !== row.category_id ||
        Date.parse(before.start_at) !== Date.parse(row.start_at) ||
        Date.parse(before.end_at) !== Date.parse(row.end_at)
      );
    });
    if (changedRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("events")
        .upsert(changedRows, { onConflict: "tracked_calendar_id,google_event_id" });
      if (upsertError) {
        throw new Error(upsertError.message);
      }
      changed = true;
    }

    // Remove events that were deleted, cancelled, or declined in Google
    const googleIds = new Set(rows.map((row) => row.google_event_id));
    const idsToRemove = saved.filter((event) => !googleIds.has(event.google_event_id)).map((event) => event.id);
    if (idsToRemove.length > 0) {
      const { error: deleteError } = await supabase.from("events").delete().in("id", idsToRemove);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      changed = true;
    }

    // Anything saved from before tracking started doesn't count
    const { data: early, error: earlyError } = await supabase
      .from("events")
      .delete()
      .eq("tracked_calendar_id", calendar.id)
      .lte("end_at", trackingStart.toISOString())
      .select("id");
    if (earlyError) {
      throw new Error(earlyError.message);
    }
    if (early.length > 0) {
      changed = true;
    }

    return changed;
  }

  const results = await Promise.all([
    ...calendarsResult.data.map(syncCalendar),
    syncPlanCalendar(accessToken, timeZone, userId),
  ]);

  // Remember the time zone (so pages don't ask Google) and when this sync happened
  const syncedAt = new Date().toISOString();
  const { error: settingsError } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, time_zone: timeZone, last_synced_at: syncedAt }, { onConflict: "user_id" });
  if (settingsError) {
    throw new Error(settingsError.message);
  }

  return { status: "ok", timeZone, changed: results.some(Boolean), syncedAt };
}

// How far ahead plan blocks are stored. Weeks past this are read from Google directly.
const PLAN_WEEKS_AHEAD = 26;

// The Plan calendar's blocks, stored so pages don't ask Google: from the start of the earliest
// week the Plan page can show (the month view of last week's month) to 26 weeks ahead.
// Returns whether anything changed.
async function syncPlanCalendar(accessToken: string, timeZone: string, userId: string) {
  const supabase = await createClient();
  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("plan_calendar_id, plan_calendar_missing")
    .maybeSingle();
  if (settingsError) {
    throw new Error(settingsError.message);
  }
  const planCalendarId = settings?.plan_calendar_id;
  if (!planCalendarId) {
    return false;
  }

  const thisWeek = startOfWeek(TZDate.tz(timeZone), { weekStartsOn: 1 });
  const from = startOfWeek(startOfMonth(subWeeks(thisWeek, 1)), { weekStartsOn: 1 });
  const until = addWeeks(thisWeek, PLAN_WEEKS_AHEAD);

  let googleEvents: GoogleEvent[];
  try {
    googleEvents = await listGoogleEvents(accessToken, planCalendarId, from, until);
  } catch (error) {
    // 404 or 410: the Plan calendar was deleted in Google. Remember that, and drop its blocks.
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
      if (settings.plan_calendar_missing) {
        return false;
      }
      await supabase.from("plan_blocks").delete().eq("user_id", userId);
      await supabase
        .from("user_settings")
        .update({ plan_calendar_missing: true, plan_synced_from: null, plan_synced_until: null })
        .eq("user_id", userId);
      return true;
    }
    throw error;
  }

  // Only timed blocks count; skip all-day and cancelled events
  const rows = googleEvents
    .filter((event) => event.status !== "cancelled" && event.start.dateTime && event.end.dateTime)
    .map((event) => ({
      user_id: userId,
      google_event_id: event.id,
      title: (event.summary ?? "").trim() || "(No title)",
      start_at: event.start.dateTime!,
      end_at: event.end.dateTime!,
    }));

  const { data: saved, error: savedError } = await supabase
    .from("plan_blocks")
    .select("id, google_event_id, title, start_at, end_at");
  if (savedError) {
    throw new Error(savedError.message);
  }
  const savedByGoogleId = new Map(saved.map((block) => [block.google_event_id, block]));
  let changed = false;

  const changedRows = rows.filter((row) => {
    const before = savedByGoogleId.get(row.google_event_id);
    return (
      !before ||
      before.title !== row.title ||
      Date.parse(before.start_at) !== Date.parse(row.start_at) ||
      Date.parse(before.end_at) !== Date.parse(row.end_at)
    );
  });
  if (changedRows.length > 0) {
    const { error } = await supabase.from("plan_blocks").upsert(changedRows, { onConflict: "user_id,google_event_id" });
    if (error) {
      throw new Error(error.message);
    }
    changed = true;
  }

  // Remove blocks deleted in Google, and any from outside the window
  const googleIds = new Set(rows.map((row) => row.google_event_id));
  const idsToRemove = saved.filter((block) => !googleIds.has(block.google_event_id)).map((block) => block.id);
  if (idsToRemove.length > 0) {
    const { error } = await supabase.from("plan_blocks").delete().in("id", idsToRemove);
    if (error) {
      throw new Error(error.message);
    }
    changed = true;
  }

  const { error: windowError } = await supabase
    .from("user_settings")
    .update({
      plan_synced_from: from.toISOString(),
      plan_synced_until: until.toISOString(),
      plan_calendar_missing: false,
    })
    .eq("user_id", userId);
  if (windowError) {
    throw new Error(windowError.message);
  }

  return changed || Boolean(settings.plan_calendar_missing);
}

// Sync just the Plan calendar, right after a block is saved or deleted, or the Plan calendar
// changes. Never throws: the header's next sync catches up.
export async function syncPlanBlocks(userId: string) {
  try {
    const supabase = await createClient();
    const { data: settings } = await supabase.from("user_settings").select("time_zone").maybeSingle();
    const accessToken = await getGoogleAccessToken(userId);
    if (!accessToken || !settings?.time_zone) {
      return;
    }
    await syncPlanCalendar(accessToken, settings.time_zone, userId);
  } catch (error) {
    console.error("Syncing the Plan calendar failed:", error);
  }
}

// Sync, unless the last one was moments ago (force skips that check). If Google rejects
// the cached token, try once more with a fresh one.
export async function syncCalendars(userId: string, { force = false } = {}): Promise<SyncOutcome> {
  if (!force) {
    const supabase = await createClient();
    const { data: settings } = await supabase.from("user_settings").select("time_zone, last_synced_at").maybeSingle();
    if (
      settings?.time_zone &&
      settings.last_synced_at &&
      Date.now() - Date.parse(settings.last_synced_at) < MIN_SECONDS_BETWEEN_SYNCS * 1000
    ) {
      return { status: "ok", timeZone: settings.time_zone, changed: false, syncedAt: settings.last_synced_at };
    }
  }

  try {
    return await syncOnce(userId, false);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return await syncOnce(userId, true);
    }
    throw error;
  }
}

// Make the next sync run even if the last one was moments ago (after tracking a new
// calendar, for example)
export async function syncSoon(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").update({ last_synced_at: null }).eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
}

// What a page needs before it can show anything: the user's time zone, saved by the last
// sync. Only the very first visit (nothing synced yet) waits for a sync.
export async function loadCalendarContext(userId: string): Promise<SyncResult> {
  const supabase = await createClient();
  const { data: settings, error } = await supabase.from("user_settings").select("time_zone").maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  let timeZone = settings?.time_zone ?? null;
  if (!timeZone) {
    const outcome = await syncCalendars(userId, { force: true });
    if (outcome.status === "reconnect") {
      return outcome;
    }
    timeZone = outcome.timeZone;
  }
  return { status: "ok", timeZone, week: getCurrentWeek(timeZone) };
}
