"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type InboxResult = { error?: string };

export type Assignment = { eventIds: string[]; categoryId: string };

// The other pages that show uncategorized time. The Inbox itself isn't refreshed, so an
// approved row stays put (with its Undo) until you leave the page.
function revalidateOthers() {
  revalidatePath("/dashboard");
  revalidatePath("/budget");
  revalidatePath("/trends");
}

// Approve one or more rows: each gives its events a category.
// Only events still without one change, so approving twice is harmless.
export async function approveCategories(assignments: Assignment[]): Promise<InboxResult> {
  const supabase = await createClient();

  for (const { eventIds, categoryId } of assignments) {
    if (eventIds.length === 0 || !categoryId) {
      continue;
    }
    const { error } = await supabase
      .from("events")
      .update({ category_id: categoryId })
      .in("id", eventIds)
      .is("category_id", null);
    if (error) {
      return { error: error.message };
    }
  }

  revalidateOthers();
  return {};
}

// Undo an approval: the events go back to having no category
export async function undoCategories(eventIds: string[]): Promise<InboxResult> {
  if (eventIds.length === 0) {
    return {};
  }

  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ category_id: null }).in("id", eventIds);
  if (error) {
    return { error: error.message };
  }

  revalidateOthers();
  return {};
}