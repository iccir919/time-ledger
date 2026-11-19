"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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