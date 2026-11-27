"use client";

import type { WeekGoals } from "@/lib/week-goals";
import MiniMonth from "./mini-month";
import SidebarGoals from "./sidebar-goals";

export type ColoredCategoryGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

// What the sidebar's goals need: a week's goals and progress, and which week they're for
export type SidebarGoalsData = {
  goals: WeekGoals;
  weekStart: string;
  weekStillOpen: boolean;
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
  goals: SidebarGoalsData;
  // The Plan (left) / Done (right) key, for the calendar. The grid leaves it out.
  showLegend?: boolean;
};

// The Plan page's left column, the same in both views: "+ Add", a small month, the goals
// (each category with its checkbox, goal and progress), and a legend.
// On narrow screens it sits above the view, with the goals folded away.
export default function CalendarSidebar({
  groups,
  hidden,
  onToggle,
  onAdd,
  timeZone,
  today,
  miniMonth,
  goals,
  showLegend = true,
}: CalendarSidebarProps) {
  const hiddenCount = hidden.size;

  const goalList = (
    <SidebarGoals
      groups={groups}
      goals={goals.goals}
      weekStart={goals.weekStart}
      weekStillOpen={goals.weekStillOpen}
      hidden={hidden}
      onToggle={onToggle}
    />
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
      <div className="mt-6 hidden lg:block">{goalList}</div>

      {/* Narrow screens: folded, so the view stays near the top */}
      <details className="mt-3 rounded-lg border border-stone-200 bg-white px-4 py-2 lg:hidden">
        <summary className="cursor-pointer text-sm font-medium">
          Goals
          {hiddenCount > 0 && <span className="ml-2 font-normal text-stone-400">{hiddenCount} hidden</span>}
        </summary>
        <div className="mt-3 pb-2">{goalList}</div>
      </details>

      <div className={`mt-6 hidden space-y-1.5 text-xs text-stone-500 ${showLegend ? "lg:block" : ""}`}>
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