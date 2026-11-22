"use server";

import { revalidatePath } from "next/cache";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getGoogleTimeZone,
  GoogleApiError,
  listGoogleEvents,
  withGoogleAccessToken,
  type GoogleEvent,
} from "@/lib/google";
import { hoursWithin } from "@/lib/hours";
import { getWeek, type Week } from "@/lib/week";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Save the whole grid. Each input is named "plan:<categoryId>:<date>".
export async function savePlan(formData: FormData) {
  const rows: { category_id: string; plan_date: string; planned_hours: number }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("plan:")) {
      continue;
    }

    const [, categoryId, planDate] = key.split(":");
    if (!categoryId || !planDate || !DATE_PATTERN.test(planDate)) {
      continue;
    }

    // Empty cells save as 0, so clearing a cell removes the plan
    const hours = Math.min(24, Math.max(0, Number(value) || 0));
    rows.push({
      category_id: categoryId,
      plan_date: planDate,
      planned_hours: Math.round(hours * 100) / 100,
    });
  }

  if (rows.length === 0) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_plans")
    .upsert(rows, { onConflict: "category_id,plan_date" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/budget");
}

// Copy last week's plan onto the same weekdays this week
export async function copyLastWeek(formData: FormData) {
  const weekStart = String(formData.get("week_start") ?? "");
  if (!DATE_PATTERN.test(weekStart)) {
    return;
  }

  const previousWeekStart = format(addDays(parseISO(weekStart), -7), "yyyy-MM-dd");

  const supabase = await createClient();
  const { data: previous, error } = await supabase
    .from("daily_plans")
    .select("category_id, plan_date, planned_hours")
    .gte("plan_date", previousWeekStart)
    .lt("plan_date", weekStart)
    .gt("planned_hours", 0);

  if (error) {
    throw new Error(error.message);
  }

  if (previous.length === 0) {
    return;
  }

  const { error: copyError } = await supabase.from("daily_plans").upsert(
    previous.map((row) => ({
      category_id: row.category_id,
      planned_hours: row.planned_hours,
      // Same weekday, one week later
      plan_date: format(addDays(parseISO(row.plan_date), 7), "yyyy-MM-dd"),
    })),
    { onConflict: "category_id,plan_date" }
  );

  if (copyError) {
    throw new Error(copyError.message);
  }

  revalidatePath("/budget");
}

// Replace a week's plan with the blocks on the Time Ledger Plan calendar.
// A block counts toward the category whose name matches its title.
export async function fillFromPlanCalendar(formData: FormData) {
  const weekStart = String(formData.get("week_start") ?? "");
  if (!DATE_PATTERN.test(weekStart)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("plan_calendar_id")
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const planCalendarId = settings?.plan_calendar_id;
  if (!planCalendarId) {
    return;
  }

  // Read the week's blocks from Google
  let result: { week: Week; events: GoogleEvent[] } | null;
  try {
    result = await withGoogleAccessToken(user.id, async (accessToken) => {
      const timeZone = await getGoogleTimeZone(accessToken);
      const week = getWeek(timeZone, weekStart);
      const events = await listGoogleEvents(accessToken, planCalendarId, week.start, week.end);
      return { week, events };
    });
  } catch (error) {
    // 404: the Plan calendar was deleted in Google
    if (error instanceof GoogleApiError && error.status === 404) {
      redirect(`/budget?week=${weekStart}&fill=missing`);
    }
    throw error;
  }

  if (!result) {
    redirect(`/budget?week=${weekStart}&fill=reconnect`);
  }

  const { week } = result;

  // Only timed blocks count; skip all-day and cancelled events
  const events = result.events.filter(
    (event) => event.status !== "cancelled" && event.start.dateTime && event.end.dateTime
  );

  // Match block titles to category names, ignoring capitals and extra spaces
  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name");

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  const categoryIdByName = new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category.id])
  );

  // Add up planned hours per category per day
  const totals = new Map<string, number>();
  const unmatched = new Set<string>();

  for (const event of events) {
    const title = (event.summary ?? "").trim();
    const categoryId = categoryIdByName.get(title.toLowerCase());

    if (!categoryId) {
      if (title) {
        unmatched.add(title);
      }
      continue;
    }

    for (const day of week.days) {
      const hours = hoursWithin(event.start.dateTime!, event.end.dateTime!, day.start, day.end);
      if (hours > 0) {
        const key = `${categoryId}:${day.date}`;
        totals.set(key, (totals.get(key) ?? 0) + hours);
      }
    }
  }

  // Replace this week's plan: clear it, then save the calendar's totals
  const { error: deleteError } = await supabase
    .from("daily_plans")
    .delete()
    .gte("plan_date", week.weekStart)
    .lte("plan_date", week.days[6].date);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const rows = [...totals.entries()].map(([key, hours]) => {
    const [categoryId, planDate] = key.split(":");
    return {
      category_id: categoryId,
      plan_date: planDate,
      planned_hours: Math.round(Math.min(24, hours) * 100) / 100,
    };
  });

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("daily_plans").insert(rows);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidatePath("/budget");

  // Tell the page it was filled, and which titles didn't match a category
  const params = new URLSearchParams({ week: weekStart, filled: String(Date.now()) });
  if (unmatched.size > 0) {
    params.set("unmatched", [...unmatched].join("|"));
  }
  redirect(`/budget?${params}`);
}