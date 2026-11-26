"use client";

import MiniMonth from "./mini-month";
import { UNCATEGORIZED } from "./use-hidden-categories";

export type ColoredCategoryGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

type CalendarSidebarProps = {
  groups: ColoredCategoryGroup[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  // Opens the popup; left out when there's nowhere to add time
  onAdd?: () => void;
  timeZone: string;
  today: string;
  // The small month: which month it opens on, and the dates being shown (highlighted)
  miniMonth: { initialMonth: string; selected: string[] };
};

// The Plan page's left column: "+ Add", a small month, the categories to show, and a legend.
// On narrow screens it sits above the calendar, with the categories folded away.
export default function CalendarSidebar({
  groups,
  hidden,
  onToggle,
  onAdd,
  timeZone,
  today,
  miniMonth,
}: CalendarSidebarProps) {
  const hiddenCount = hidden.size;

  const categoryList = (
    <div className="space-y-3 text-sm">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="text-xs text-stone-400">{group.name}</p>
          <ul className="mt-1 space-y-0.5">
            {group.categories.map((category) => (
              <li key={category.id}>
                <CategoryCheckbox
                  id={category.id}
                  name={category.name}
                  color={category.color}
                  checked={!hidden.has(category.id)}
                  onToggle={onToggle}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <CategoryCheckbox
        id={UNCATEGORIZED}
        name="Uncategorized"
        color="#a8a29e"
        checked={!hidden.has(UNCATEGORIZED)}
        onToggle={onToggle}
        muted
      />
    </div>
  );

  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
        >
          + Add
        </button>
      )}

      {/* Keyed by month, so it starts over on the right month after moving to another week */}
      <div className="mt-6 hidden lg:block">
        <MiniMonth
          key={miniMonth.initialMonth}
          initialMonth={miniMonth.initialMonth}
          today={today}
          selected={miniMonth.selected}
        />
      </div>

      {/* Wide screens: always open */}
      <div className="mt-6 hidden lg:block">
        <p className="mb-2 text-sm font-medium">Categories</p>
        {categoryList}
      </div>

      {/* Narrow screens: folded, so the calendar stays near the top */}
      <details className="mt-3 rounded-lg border border-stone-200 bg-white px-4 py-2 lg:hidden">
        <summary className="cursor-pointer text-sm font-medium">
          Categories
          {hiddenCount > 0 && <span className="ml-2 font-normal text-stone-400">{hiddenCount} hidden</span>}
        </summary>
        <div className="mt-3 pb-2">{categoryList}</div>
      </details>

      <div className="mt-6 hidden space-y-1.5 text-xs text-stone-500 lg:block">
        <p className="flex items-center gap-2">
          <span className="h-3 w-5 rounded border border-dashed border-stone-500 bg-stone-500/10" />
          Plan (left)
        </p>
        <p className="flex items-center gap-2">
          <span className="h-3 w-5 rounded bg-stone-500" />
          Done (right)
        </p>
        <p className="pt-1 text-stone-400">Times in {timeZone}</p>
      </div>
    </aside>
  );
}

function CategoryCheckbox({
  id,
  name,
  color,
  checked,
  onToggle,
  muted,
}: {
  id: string;
  name: string;
  color: string;
  checked: boolean;
  onToggle: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-stone-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(id)}
        className="size-3.5 shrink-0"
        style={{ accentColor: color }}
      />
      <span className={`truncate ${muted ? "text-stone-500" : ""}`}>{name}</span>
    </label>
  );
}