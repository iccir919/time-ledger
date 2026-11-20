"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Save planned hours for every category this week
export async function savePlan(formData: FormData) {
  const weekStart = String(formData.get("week_start") ?? "");
  if (!DATE_PATTERN.test(weekStart)) {
    return;
  }

  const rows: { category_id: string; week_start: string; planned_hours: number }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("planned:")) {
      continue;
    }

    // Keep each value between 0 and 168, rounded to 2 decimals
    const hours = Math.min(168, Math.max(0, Number(value) || 0));
    rows.push({
      category_id: key.slice("planned:".length),
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

// Start this week with last week's planned hours
export async function copyLastWeek(formData: FormData) {
  const weekStart = String(formData.get("week_start") ?? "");
  const previousWeekStart = String(formData.get("previous_week_start") ?? "");

  if (!DATE_PATTERN.test(weekStart) || !DATE_PATTERN.test(previousWeekStart)) {
    return;
  }

  const supabase = await createClient();
  const { data: previous, error } = await supabase
    .from("weekly_budgets")
    .select("category_id, planned_hours")
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
      planned_hours: row.planned_hours,
      week_start: weekStart,
    })),
    { onConflict: "category_id,week_start", ignoreDuplicates: true }
  );

  if (copyError) {
    throw new Error(copyError.message);
  }

  revalidatePath("/budget");
}