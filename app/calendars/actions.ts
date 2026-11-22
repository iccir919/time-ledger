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
import { PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";

export async function saveTrackedCalendars(formData: FormData) {
  const supabase = await createClient();
  const selectedIds = formData.getAll("calendar_id").map(String);

  // Save or update each checked calendar
  const rows = selectedIds.map((calendarId) => ({
    google_calendar_id: calendarId,
    name: String(formData.get(`name:${calendarId}`) ?? calendarId),
    default_category_id:
      String(formData.get(`default:${calendarId}`) ?? "") || null,
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("tracked_calendars")
      .upsert(rows, { onConflict: "user_id,google_calendar_id" });

    if (error) {
      throw new Error(error.message);
    }
  }

  // Remove calendars that were unchecked
  const { data: existing, error: existingError } = await supabase
    .from("tracked_calendars")
    .select("id, google_calendar_id");

  if (existingError) {
    throw new Error(existingError.message);
  }

  const idsToRemove = existing
    .filter((row) => !selectedIds.includes(row.google_calendar_id))
    .map((row) => row.id);

  if (idsToRemove.length > 0) {
    const { error } = await supabase
      .from("tracked_calendars")
      .delete()
      .in("id", idsToRemove);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/calendars");
  redirect("/calendars?saved=1");
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

// Forget the Plan calendar. It stays in Google Calendar with its blocks.
export async function stopUsingPlanCalendar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { error } = await supabase
    .from("user_settings")
    .update({ plan_calendar_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/calendars");
  revalidatePath("/budget");
  redirect("/calendars?plan=stopped");
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