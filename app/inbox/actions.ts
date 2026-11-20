"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Assign one category to one or more events.
// A title group sends all of its event IDs; a single event sends one.
export async function assignCategory(formData: FormData) {
  const eventIds = formData.getAll("event_id").map(String).filter(Boolean);
  const categoryId = String(formData.get("category_id") ?? "");

  if (eventIds.length === 0 || !categoryId) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ category_id: categoryId })
    .in("id", eventIds)
    .is("category_id", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/inbox");
  revalidatePath("/dashboard");
}