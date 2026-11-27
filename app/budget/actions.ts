"use server";

import { addDays, format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncCalendars } from "@/lib/sync-events";
import type { GoalDirection } from "@/lib/goals";
import {
  deleteGoogleEvent,
  GoogleApiError,
  insertGoogleEvent,
  updateGoogleEvent,
  withGoogleAccessToken,
} from "@/lib/google";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type GoalResult = { error?: string };

// Save one category's goal for one week: its hours and which way it points.
// Called when a goal field loses focus or its min / max switch is clicked.
// null (an emptied field) removes the goal; 0 is a real goal of zero hours, always "at most".
export async function saveGoal(
  weekStart: string,
  categoryId: string,
  hours: number | null,
  direction: GoalDirection = "at_least"
): Promise<GoalResult> {
  if (
    !DATE_PATTERN.test(weekStart) ||
    !categoryId ||
    (hours !== null && !Number.isFinite(hours)) ||
    (direction !== "at_least" && direction !== "at_most")
  ) {
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
            goal: Math.round(Math.min(168, Math.max(0, hours)) * 100) / 100,
            direction: hours === 0 ? "at_most" : direction,
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

// Save the hours planned for one category on one day (typed into the Plan grid, no time picked).
// null (an emptied field, or 0) removes the day's plan.
export async function saveDayPlan(
  date: string,
  categoryId: string,
  hours: number | null
): Promise<GoalResult> {
  if (!DATE_PATTERN.test(date) || !categoryId || (hours !== null && !Number.isFinite(hours))) {
    return { error: "Couldn't save that plan." };
  }

  const supabase = await createClient();

  const { error } =
    hours === null || hours <= 0
      ? await supabase.from("daily_plans").delete().eq("category_id", categoryId).eq("plan_date", date)
      : await supabase.from("daily_plans").upsert(
          {
            category_id: categoryId,
            plan_date: date,
            // A day has 24 hours
            planned_hours: Math.round(Math.min(24, hours) * 100) / 100,
          },
          { onConflict: "category_id,plan_date" }
        );

  if (error) {
    console.error("Could not save day plan:", error.message);
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
    .select("category_id, goal, direction")
    .eq("week_start", previousWeekStart);

  if (error) {
    throw new Error(error.message);
  }

  if (previous.length === 0) {
    return;
  }

  const { error: copyError } = await supabase.from("weekly_budgets").upsert(
    previous.map((row) => ({
      category_id: row.category_id,
      goal: row.goal,
      direction: row.direction,
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

// Plan blocks go to the Plan calendar; done time logged in the app goes to the Log calendar
export type BlockKind = "plan" | "done";

const CALENDAR_LABEL: Record<BlockKind, string> = { plan: "Plan", done: "Log" };

// The user and the calendar for this kind of block, or an error message to show
async function getWriteCalendar(kind: BlockKind) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in again, then try again." } as const;
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("plan_calendar_id, log_calendar_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  const calendarId = kind === "plan" ? data?.plan_calendar_id : data?.log_calendar_id;
  if (!calendarId) {
    return { error: `Create your ${CALENDAR_LABEL[kind]} calendar first, on the Calendars page.` } as const;
  }

  return { supabase, userId: user.id, calendarId };
}

// Save a block: a plan block to the Plan calendar, or done time to the Log calendar
// (kind = "plan" or "done"). Changes an existing one when block_id is set.
// The event is titled with the category's name, tagged with its ID, and private.
// An end time earlier than the start means the block ends the next day.
export async function saveBlock(formData: FormData): Promise<BlockResult> {
  const kind: BlockKind = formData.get("kind") === "done" ? "done" : "plan";
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

  const target = await getWriteCalendar(kind);
  if ("error" in target) {
    return { error: target.error };
  }

  const { data: category, error: categoryError } = await target.supabase
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
    visibility: "private" as const,
    extendedProperties: { private: { timeLedgerCategoryId: categoryId } },
  };

  try {
    const savedId = await withGoogleAccessToken(target.userId, (accessToken) =>
      blockId
        ? updateGoogleEvent(accessToken, target.calendarId, blockId, event)
        : insertGoogleEvent(accessToken, target.calendarId, event)
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
          ? "That event wasn't found. It may have been deleted in Google Calendar."
          : `Your ${CALENDAR_LABEL[kind]} calendar wasn't found. Create it again on the Calendars page.`,
      };
    }
    throw error;
  }

  // Logged time counts right away: bring the Log calendar's new event in now
  if (kind === "done") {
    await syncAfterLogging(target.userId);
  }

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return {};
}

// Sync now, so a change to logged time shows on the next render. A failure here isn't
// the save's failure: the header's sync will catch up.
async function syncAfterLogging(userId: string) {
  try {
    await syncCalendars(userId, { force: true });
  } catch (error) {
    console.error("Sync after logging failed:", error);
  }
}

// Delete a plan block or a logged done event
export async function deleteBlock(blockId: string, kind: BlockKind): Promise<BlockResult> {
  if (!blockId) {
    return { error: "Nothing to delete." };
  }

  const target = await getWriteCalendar(kind);
  if ("error" in target) {
    return { error: target.error };
  }

  try {
    const done = await withGoogleAccessToken(target.userId, async (accessToken) => {
      await deleteGoogleEvent(accessToken, target.calendarId, blockId);
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

  if (kind === "done") {
    await syncAfterLogging(target.userId);
  }

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return {};
}