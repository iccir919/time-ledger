import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import { categoryColors } from "@/lib/colors";
import {
  addCategory,
  addGroup,
  addStarterCategories,
  deleteCategory,
  deleteGroup,
  renameCategory,
  renameGroup,
  updateCategoryColor,
} from "./actions";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Each group, with its categories nested inside
  const { data: groups, error } = await supabase
    .from("category_groups")
    .select("id, name, categories(id, name, color)")
    .order("sort_order")
    .order("sort_order", { referencedTable: "categories" });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-2 text-stone-600">
          The jobs you give your hours. Click a name to rename it, then press
          Enter to save. Click a color dot to change it.
        </p>

        {groups.length === 0 && (
          <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
            <h2 className="font-semibold">Set up your categories</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Start with a suggested set (Work, Health, Personal, and Growth)
              and adjust it to fit your life, or build your own groups below.
            </p>
            <form action={addStarterCategories} className="mt-6">
              <button className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
                Use suggested categories
              </button>
            </form>
          </section>
        )}

        <div className="mt-10 space-y-6">
          {groups.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-stone-200 bg-white"
            >
              {/* Group name */}
              <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
                <form action={renameGroup} className="flex-1">
                  <input type="hidden" name="id" value={group.id} />
                  <input
                    name="name"
                    defaultValue={group.name}
                    aria-label="Group name"
                    maxLength={50}
                    className="w-full rounded-md bg-transparent px-2 py-1 font-semibold outline-none hover:bg-stone-50 focus:bg-stone-50 focus:ring-2 focus:ring-accent/30"
                  />
                </form>
                {group.categories.length === 0 && (
                  <form action={deleteGroup}>
                    <input type="hidden" name="id" value={group.id} />
                    <button className="rounded-md px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-red-50 hover:text-red-700">
                      Delete group
                    </button>
                  </form>
                )}
              </div>

              {/* Categories in this group */}
              <ul className="divide-y divide-stone-100">
                {group.categories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center gap-3 px-5 py-2"
                  >
                    {/* Color dot: click it to pick a new color */}
                    <details className="relative">
                      <summary
                        aria-label={`Change color for ${category.name}`}
                        className="flex size-6 cursor-pointer list-none items-center justify-center rounded-full hover:bg-stone-100 [&::-webkit-details-marker]:hidden"
                      >
                        <span
                          className="size-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                      </summary>
                      <div className="absolute left-0 top-8 z-10 grid w-max grid-cols-5 gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
                        {categoryColors.map((color) => (
                          <form key={color} action={updateCategoryColor}>
                            <input type="hidden" name="id" value={category.id} />
                            <input type="hidden" name="color" value={color} />
                            <button
                              aria-label={`Use color ${color}`}
                              className={`size-6 rounded-full transition-transform hover:scale-110 ${
                                color === category.color
                                  ? "ring-2 ring-stone-900 ring-offset-2"
                                  : ""
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          </form>
                        ))}
                      </div>
                    </details>
                    <form action={renameCategory} className="flex-1">
                      <input type="hidden" name="id" value={category.id} />
                      <input
                        name="name"
                        defaultValue={category.name}
                        aria-label="Category name"
                        maxLength={50}
                        className="w-full rounded-md bg-transparent px-2 py-1 text-sm outline-none hover:bg-stone-50 focus:bg-stone-50 focus:ring-2 focus:ring-accent/30"
                      />
                    </form>
                    <form action={deleteCategory}>
                      <input type="hidden" name="id" value={category.id} />
                      <button
                        aria-label={`Delete ${category.name}`}
                        className="rounded-md px-2 py-1 text-sm text-stone-400 transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </form>
                  </li>
                ))}
              </ul>

              {/* Add a category to this group */}
              <form
                action={addCategory}
                className="flex items-center gap-3 border-t border-stone-100 px-5 py-3"
              >
                <input type="hidden" name="group_id" value={group.id} />
                {/* New categories match the last color in their group */}
                <input
                  type="hidden"
                  name="color"
                  value={group.categories.at(-1)?.color ?? categoryColors[0]}
                />
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <span
                    className="size-3 rounded-full"
                    style={{
                      backgroundColor: group.categories.at(-1)?.color ?? categoryColors[0],
                    }}
                  />
                </span>
                <input
                  name="name"
                  placeholder="Add a category"
                  required
                  maxLength={50}
                  className="flex-1 rounded-md px-2 py-1 text-sm outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-accent/30"
                />
                <button className="rounded-md px-3 py-1 text-sm font-medium text-accent transition-colors hover:bg-accent-soft">
                  Add
                </button>
              </form>
            </section>
          ))}
        </div>

        {/* Add a new group */}
        <form
          action={addGroup}
          className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-stone-300 px-5 py-3"
        >
          <input
            name="name"
            placeholder="Add a group"
            required
            maxLength={50}
            className="flex-1 rounded-md bg-transparent px-2 py-1 text-sm outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-accent/30"
          />
          <button className="rounded-md px-3 py-1 text-sm font-medium text-accent transition-colors hover:bg-accent-soft">
            Add group
          </button>
        </form>
      </main>
    </div>
  );
}