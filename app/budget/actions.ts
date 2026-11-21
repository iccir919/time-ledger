"use server";

import { revalidatePath } from "next/cache";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";

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