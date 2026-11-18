"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { starterCategories } from "@/lib/starter-categories";

// Read a name from a form, trimmed and capped at 50 characters
function readName(formData: FormData) {
  return String(formData.get("name") ?? "").trim().slice(0, 50);
}

export async function addStarterCategories() {
  const supabase = await createClient();

  // Only add the starter set if the user has no groups yet
  const { count } = await supabase
    .from("category_groups")
    .select("id", { count: "exact", head: true });

  if (count && count > 0) {
    return;
  }

  for (const [groupIndex, starter] of starterCategories.entries()) {
    const { data: group, error } = await supabase
      .from("category_groups")
      .insert({ name: starter.group, sort_order: groupIndex })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const { error: categoriesError } = await supabase.from("categories").insert(
      starter.categories.map((category, index) => ({
        group_id: group.id,
        name: category.name,
        color: category.color,
        sort_order: index,
      }))
    );

    if (categoriesError) {
      throw new Error(categoriesError.message);
    }
  }

  revalidatePath("/categories");
}

export async function addGroup(formData: FormData) {
  const name = readName(formData);
  if (!name) {
    return;
  }

  const supabase = await createClient();

  // New groups go at the end
  const { count } = await supabase
    .from("category_groups")
    .select("id", { count: "exact", head: true });

  const { error } = await supabase
    .from("category_groups")
    .insert({ name, sort_order: count ?? 0 });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/categories");
}

export async function addCategory(formData: FormData) {
  const name = readName(formData);
  const groupId = String(formData.get("group_id") ?? "");
  const color = String(formData.get("color") ?? "#2f6f68");

  if (!name || !groupId) {
    return;
  }

  const supabase = await createClient();

  // New categories go at the end of their group
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);

  const { error } = await supabase
    .from("categories")
    .insert({ name, group_id: groupId, color, sort_order: count ?? 0 });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/categories");
}

export async function renameGroup(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = readName(formData);

  if (!id || !name) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("category_groups")
    .update({ name })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/categories");
}

export async function renameCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = readName(formData);

  if (!id || !name) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/categories");
}

export async function deleteGroup(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }

  const supabase = await createClient();

  // Safety check: only delete empty groups, so categories are never lost by accident
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("group_id", id);

  if (count && count > 0) {
    return;
  }

  const { error } = await supabase.from("category_groups").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/categories");
}

export async function deleteCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/categories");
}