"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GoogleApiError, insertGoogleEvent, withGoogleAccessToken } from "@/lib/google";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Save the week's goals. Each input is named "goal:<categoryId>".
export async function saveGoals(formData: FormData) {
  const weekStart = String(formData.get("week_start") ?? "");
  if (!DATE_PATTERN.test(weekStart)) {
    return;
  }

  const rows: { category_id: string; week_start: string; planned_hours: number }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("goal:")) {
      continue;
    }

    // Empty goals save as 0. A week has 168 hours.
    const hours = Math.min(168, Math.max(0, Number(value) || 0));
    rows.push({
      category_id: key.slice("goal:".length),
      week_start: weekStart,
      planned_hours: Math.round(hours * 100) / 100,
    });
  }

  if (rows.length === 0) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("weekly_budgets")
    .upsert(rows, { onConflict: "category_id,week_start" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/budget");
}

// Start a week with the previous week's goals
export async function copyLastWeekGoals(formData: FormData) {
  const weekStart = String(formData.get("week_start") ?? "");
  const previousWeekStart = String(formData.get("previous_week_start") ?? "");

  if (!DATE_PATTERN.test(weekStart) || !DATE_PATTERN.test(previousWeekStart)) {
    return;
  }

  const supabase = await createClient();
  const { data: previous, error } = await supabase
    .from("weekly_budgets")
    .select("category_id, planned_hours")
    .eq("week_start", previousWeekStart)
    .gt("planned_hours", 0);

  if (error) {
    throw new Error(error.message);
  }

  if (previous.length === 0) {
    return;
  }

  const { error: copyError } = await supabase.from("weekly_budgets").upsert(
    previous.map((row) => ({
      category_id: row.category_id,
      planned_hours: row.planned_hours,
      week_start: weekStart,
    })),
    { onConflict: "category_id,week_start" }
  );

  if (copyError) {
    throw new Error(copyError.message);
  }

  revalidatePath("/budget");
}

const TIME_PATTERN = /^\d{2}:\d{2}$/;

export type AddBlockResult = { error?: string };

// Add a block to the Time Ledger Plan calendar.
// The event is titled with the category's name, so it matches that category.
export async function createPlanBlock(formData: FormData): Promise<AddBlockResult> {
  const categoryId = String(formData.get("category_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("start") ?? "");
  const endTime = String(formData.get("end") ?? "");
  const timeZone = String(formData.get("time_zone") ?? "");

  if (!categoryId) {
    return { error: "Choose a category." };
  }
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return { error: "Choose a day and times." };
  }
  // "HH:MM" strings compare correctly as text, e.g. "09:30" < "10:00"
  if (endTime <= startTime) {
    return { error: "The end time needs to be after the start time." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in again, then try again." };
  }

  const [settingsResult, categoryResult] = await Promise.all([
    supabase.from("user_settings").select("plan_calendar_id").maybeSingle(),
    supabase.from("categories").select("name").eq("id", categoryId).maybeSingle(),
  ]);

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }
  if (categoryResult.error) {
    throw new Error(categoryResult.error.message);
  }

  const planCalendarId = settingsResult.data?.plan_calendar_id;
  if (!planCalendarId) {
    return { error: "Create your Plan calendar first." };
  }
  if (!categoryResult.data) {
    return { error: "That category doesn't exist anymore." };
  }

  const categoryName = categoryResult.data.name;

  try {
    const eventId = await withGoogleAccessToken(user.id, (accessToken) =>
      insertGoogleEvent(accessToken, planCalendarId, {
        summary: categoryName,
        start: { dateTime: `${date}T${startTime}:00`, timeZone },
        end: { dateTime: `${date}T${endTime}:00`, timeZone },
        extendedProperties: { private: { timeLedgerCategoryId: categoryId } },
      })
    );

    if (!eventId) {
      return { error: "Sign in with Google again, then try again." };
    }
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 403) {
      return { error: "Time Ledger needs permission to add events. Sign out and back in." };
    }
    if (error instanceof GoogleApiError && error.status === 404) {
      return { error: "Your Plan calendar wasn't found. Create it again on the Calendars page." };
    }
    throw error;
  }

  revalidatePath("/budget");
  return {};
}