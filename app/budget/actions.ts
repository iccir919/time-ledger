"use server";

import { addDays, format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  deleteGoogleEvent,
  GoogleApiError,
  insertGoogleEvent,
  updateGoogleEvent,
  withGoogleAccessToken,
} from "@/lib/google";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type GoalResult = { error?: string };

// Save one category's goal for one week. Called as soon as a goal field loses focus.
// null (an emptied field) removes the goal; 0 is a real goal of zero hours, like a limit.
export async function saveGoal(
  weekStart: string,
  categoryId: string,
  hours: number | null
): Promise<GoalResult> {
  if (!DATE_PATTERN.test(weekStart) || !categoryId || (hours !== null && !Number.isFinite(hours))) {
    return { error: "Couldn't save that goal." };
  }

  const supabase = await createClient();

  const { error } =
    hours === null
      ? await supabase
          .from("weekly_budgets")
          .delete()
          .eq("category_id", categoryId)
          .eq("week_start", weekStart)
      : await supabase.from("weekly_budgets").upsert(
          {
            category_id: categoryId,
            week_start: weekStart,
            // A week has 168 hours
            planned_hours: Math.round(Math.min(168, Math.max(0, hours)) * 100) / 100,
          },
          { onConflict: "category_id,week_start" }
        );

  if (error) {
    console.error("Could not save goal:", error.message);
    return { error: "Couldn't save. Try again." };
  }

  revalidatePath("/budget");
  return {};
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

export type BlockResult = { error?: string };

// The day after a "YYYY-MM-DD" date, e.g. "2026-11-30" -> "2026-12-01"
function nextDay(date: string) {
  return format(addDays(parseISO(date), 1), "yyyy-MM-dd");
}

// The user and their Plan calendar, or an error message to show
async function getPlanCalendar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in again, then try again." } as const;
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("plan_calendar_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.plan_calendar_id) {
    return { error: "Create your Plan calendar first." } as const;
  }

  return { supabase, userId: user.id, planCalendarId: data.plan_calendar_id };
}

// Add a block to the Time Ledger Plan calendar, or change one (when block_id is set).
// The event is titled with the category's name, so it matches that category.
// An end time earlier than the start means the block ends the next day.
export async function savePlanBlock(formData: FormData): Promise<BlockResult> {
  const blockId = String(formData.get("block_id") ?? "");
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
  if (endTime === startTime) {
    return { error: "The start and end times are the same." };
  }

  const plan = await getPlanCalendar();
  if ("error" in plan) {
    return { error: plan.error };
  }

  const { data: category, error: categoryError } = await plan.supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  if (categoryError) {
    throw new Error(categoryError.message);
  }
  if (!category) {
    return { error: "That category doesn't exist anymore." };
  }

  // "HH:MM" strings compare correctly as text, e.g. "09:30" < "10:00"
  const endDate = endTime < startTime ? nextDay(date) : date;

  const event = {
    summary: category.name,
    start: { dateTime: `${date}T${startTime}:00`, timeZone },
    end: { dateTime: `${endDate}T${endTime}:00`, timeZone },
    extendedProperties: { private: { timeLedgerCategoryId: categoryId } },
  };

  try {
    const savedId = await withGoogleAccessToken(plan.userId, (accessToken) =>
      blockId
        ? updateGoogleEvent(accessToken, plan.planCalendarId, blockId, event)
        : insertGoogleEvent(accessToken, plan.planCalendarId, event)
    );

    if (!savedId) {
      return { error: "Sign in with Google again, then try again." };
    }
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 403) {
      return { error: "Time Ledger needs permission to change events. Sign out and back in." };
    }
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
      return {
        error: blockId
          ? "That block wasn't found. It may have been deleted in Google Calendar."
          : "Your Plan calendar wasn't found. Create it again on the Calendars page.",
      };
    }
    throw error;
  }

  revalidatePath("/budget");
  return {};
}

// Delete a block from the Plan calendar
export async function deletePlanBlock(blockId: string): Promise<BlockResult> {
  if (!blockId) {
    return { error: "No block to delete." };
  }

  const plan = await getPlanCalendar();
  if ("error" in plan) {
    return { error: plan.error };
  }

  try {
    const done = await withGoogleAccessToken(plan.userId, async (accessToken) => {
      await deleteGoogleEvent(accessToken, plan.planCalendarId, blockId);
      return true;
    });

    if (!done) {
      return { error: "Sign in with Google again, then try again." };
    }
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 403) {
      return { error: "Time Ledger needs permission to change events. Sign out and back in." };
    }
    // 404 or 410: it's already gone, which is what we wanted
    if (!(error instanceof GoogleApiError && (error.status === 404 || error.status === 410))) {
      throw error;
    }
  }

  revalidatePath("/budget");
  return {};
}