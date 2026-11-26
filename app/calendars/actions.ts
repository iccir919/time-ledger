"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createGoogleCalendar,
  getGoogleTimeZone,
  GoogleApiError,
  listGoogleCalendars,
  withGoogleAccessToken,
  deleteGoogleCalendar,
} from "@/lib/google";
import { LOG_CALENDAR_NAME } from "@/lib/log-calendar";
import { PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";

// The app's own calendars (Plan and Log) aren't in the "Your calendars" list, so these
// two actions refuse to change them.
async function appCalendarIds(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("user_settings")
    .select("plan_calendar_id, log_calendar_id")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return [data?.plan_calendar_id, data?.log_calendar_id].filter(Boolean);
}

function revalidateEverywhere() {
  revalidatePath("/calendars");
  revalidatePath("/budget");
  revalidatePath("/dashboard");
  revalidatePath("/inbox");
  revalidatePath("/trends");
}

export type SaveResult = { error?: string };

// Check or uncheck one of the user's calendars. Unchecking stops tracking it,
// and its saved events go with it (they come back on the next sync if it's checked again).
export async function setCalendarTracked(
  calendarId: string,
  name: string,
  tracked: boolean
): Promise<SaveResult> {
  const supabase = await createClient();

  if ((await appCalendarIds(supabase)).includes(calendarId)) {
    return { error: "This calendar belongs to Time Ledger." };
  }

  const { error } = tracked
    ? // Only these two columns, so a saved default category is kept
      await supabase
        .from("tracked_calendars")
        .upsert({ google_calendar_id: calendarId, name }, { onConflict: "user_id,google_calendar_id" })
    : await supabase.from("tracked_calendars").delete().eq("google_calendar_id", calendarId);

  if (error) {
    return { error: error.message };
  }

  revalidateEverywhere();
  return {};
}

// Pick (or clear, with null) the category a tracked calendar's events get automatically
export async function setDefaultCategory(calendarId: string, categoryId: string | null): Promise<SaveResult> {
  const supabase = await createClient();

  if ((await appCalendarIds(supabase)).includes(calendarId)) {
    return { error: "This calendar belongs to Time Ledger." };
  }

  const { error } = await supabase
    .from("tracked_calendars")
    .update({ default_category_id: categoryId })
    .eq("google_calendar_id", calendarId);

  if (error) {
    return { error: error.message };
  }

  revalidateEverywhere();
  return {};
}

// Where to send the user after a Plan calendar action, with a status added.
// Only paths inside the app are allowed, so a form can't redirect somewhere else.
function backTo(formData: FormData, status: string) {
  const requested = String(formData.get("return_to") ?? "");
  const path = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/calendars";
  const url = new URL(path, "http://localhost");
  url.searchParams.set("plan", status);
  return `${url.pathname}${url.search}`;
}

// Create the "Time Ledger Plan" calendar in the user's Google account.
// If it already exists, keep using it instead of making a second one.
export async function createPlanCalendar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("plan_calendar_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existingId = settings?.plan_calendar_id ?? null;

  let calendarId: string | null;
  try {
    calendarId = await withGoogleAccessToken(user.id, async (accessToken) => {
      // Reuse the saved calendar if it's still in the user's Google account
      if (existingId) {
        const calendars = await listGoogleCalendars(accessToken);
        if (calendars.some((calendar) => calendar.id === existingId)) {
          return existingId;
        }
      }

      const timeZone = await getGoogleTimeZone(accessToken);
      return await createGoogleCalendar(accessToken, PLAN_CALENDAR_NAME, timeZone);
    });
  } catch (error) {
    // 403: the user hasn't approved the permission to create calendars yet
    if (error instanceof GoogleApiError && error.status === 403) {
      redirect(backTo(formData, "needs_permission"));
    }
    throw error;
  }

  if (!calendarId) {
    redirect(backTo(formData, "needs_permission"));
  }

  const { error: saveError } = await supabase
    .from("user_settings")
    .upsert(
      { plan_calendar_id: calendarId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (saveError) {
    throw new Error(saveError.message);
  }

  revalidatePath("/calendars");
  revalidatePath("/budget");
  redirect(backTo(formData, "created"));
}

// Delete the Plan calendar and all its blocks from Google, then forget it
export async function deletePlanCalendar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("plan_calendar_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const calendarId = settings?.plan_calendar_id;
  if (!calendarId) {
    redirect("/calendars");
  }

  let deleted: boolean | null;
  try {
    deleted = await withGoogleAccessToken(user.id, async (accessToken) => {
      await deleteGoogleCalendar(accessToken, calendarId);
      return true;
    });
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) {
      // Already deleted in Google, so there's nothing left to remove
      deleted = true;
    } else if (error instanceof GoogleApiError && error.status === 403) {
      redirect("/calendars?plan=needs_permission");
    } else {
      throw error;
    }
  }

  if (!deleted) {
    redirect("/calendars?plan=needs_permission");
  }

  const { error: clearError } = await supabase
    .from("user_settings")
    .update({ plan_calendar_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (clearError) {
    throw new Error(clearError.message);
  }

  revalidatePath("/calendars");
  revalidatePath("/budget");
  redirect("/calendars?plan=deleted");
}

// Create the "Time Ledger Log" calendar in the user's Google account, for done time logged
// in the app, and track it so its events count. If it already exists, keep using it.
export async function createLogCalendar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("log_calendar_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existingId = settings?.log_calendar_id ?? null;

  let calendarId: string | null;
  try {
    calendarId = await withGoogleAccessToken(user.id, async (accessToken) => {
      // Reuse the saved calendar if it's still in the user's Google account
      if (existingId) {
        const calendars = await listGoogleCalendars(accessToken);
        if (calendars.some((calendar) => calendar.id === existingId)) {
          return existingId;
        }
      }

      const timeZone = await getGoogleTimeZone(accessToken);
      return await createGoogleCalendar(accessToken, LOG_CALENDAR_NAME, timeZone);
    });
  } catch (error) {
    // 403: the user hasn't approved the permission to create calendars yet
    if (error instanceof GoogleApiError && error.status === 403) {
      redirect("/calendars?log=needs_permission");
    }
    throw error;
  }

  if (!calendarId) {
    redirect("/calendars?log=needs_permission");
  }

  const { error: saveError } = await supabase
    .from("user_settings")
    .upsert(
      { log_calendar_id: calendarId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (saveError) {
    throw new Error(saveError.message);
  }

  // An old Log calendar that was deleted in Google: stop tracking it (its saved events go with it)
  if (existingId && existingId !== calendarId) {
    const { error: oldError } = await supabase
      .from("tracked_calendars")
      .delete()
      .eq("google_calendar_id", existingId);
    if (oldError) {
      throw new Error(oldError.message);
    }
  }

  // Track it, so time logged in it counts as done
  const { error: trackError } = await supabase
    .from("tracked_calendars")
    .upsert(
      { google_calendar_id: calendarId, name: LOG_CALENDAR_NAME },
      { onConflict: "user_id,google_calendar_id" }
    );

  if (trackError) {
    throw new Error(trackError.message);
  }

  revalidatePath("/calendars");
  revalidatePath("/budget");
  revalidatePath("/dashboard");
  redirect("/calendars?log=created");
}

// Delete the Log calendar and everything logged in it from Google, stop tracking it,
// and forget it. The time logged there stops counting.
export async function deleteLogCalendar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("log_calendar_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const calendarId = settings?.log_calendar_id;
  if (!calendarId) {
    redirect("/calendars");
  }

  let deleted: boolean | null;
  try {
    deleted = await withGoogleAccessToken(user.id, async (accessToken) => {
      await deleteGoogleCalendar(accessToken, calendarId);
      return true;
    });
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) {
      // Already deleted in Google, so there's nothing left to remove
      deleted = true;
    } else if (error instanceof GoogleApiError && error.status === 403) {
      redirect("/calendars?log=needs_permission");
    } else {
      throw error;
    }
  }

  if (!deleted) {
    redirect("/calendars?log=needs_permission");
  }

  // Stop tracking it (its saved events go with it)
  const { error: untrackError } = await supabase
    .from("tracked_calendars")
    .delete()
    .eq("google_calendar_id", calendarId);

  if (untrackError) {
    throw new Error(untrackError.message);
  }

  const { error: clearError } = await supabase
    .from("user_settings")
    .update({ log_calendar_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (clearError) {
    throw new Error(clearError.message);
  }

  revalidatePath("/calendars");
  revalidatePath("/budget");
  revalidatePath("/dashboard");
  redirect("/calendars?log=deleted");
}