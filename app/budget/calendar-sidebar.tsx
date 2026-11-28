"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { buttonClasses } from "@/components/button";
import { PHONE_ADD_SLOT } from "@/lib/plan-view";
import { goalProgress } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
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
  // The week grid shows the goals in its own summary card on phones, so the Goals card is left out
  goalsElsewhereOnPhones?: boolean;
};

// The title row may not be on the page yet the first time the sidebar draws, so look again
// once right after it's on screen
function checkAfterDraw(onChange: () => void) {
  const frame = requestAnimationFrame(onChange);
  return () => cancelAnimationFrame(frame);
}

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
  goalsElsewhereOnPhones = false,
}: CalendarSidebarProps) {
  // Phones: "+ Add" goes in the title row's empty spot (null on the server and before it's found)
  const phoneAddSlot = useSyncExternalStore(
    checkAfterDraw,
    () => document.getElementById(PHONE_ADD_SLOT),
    () => null
  );
  const hiddenCount = hidden.size;

  // The week's progress toward "at least" goals, for the phone card's closed summary
  const progress = goalProgress(
    Object.values(goals.goals)
      .filter((entry) => entry.goal !== null)
      .map((entry) => ({ goal: entry.goal!, done: entry.done, ahead: entry.ahead, direction: entry.direction }))
  );

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
    // Phones: the Goals card ("+ Add" is up in the title row). Wide screens: "+ Add" on top.
    <aside className={`lg:sticky lg:top-6 lg:block lg:self-start ${goalsElsewhereOnPhones ? "hidden" : ""}`}>
      {onAdd && (
        <div className="hidden lg:block">
          <button type="button" onClick={onAdd} className={`w-full ${buttonClasses("primary")}`}>
            + Add
          </button>
        </div>
      )}
      {onAdd &&
        phoneAddSlot &&
        createPortal(
          // Small, so it fits on the title row beside both switches
          <button type="button" onClick={onAdd} className={buttonClasses("primary", "sm")}>
            + Add
          </button>,
          phoneAddSlot
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

      {/* Narrow screens: a card that shows the week's total even when closed; tap to open the list */}
      <details className="group rounded-xl border border-stone-200 bg-white p-4 lg:hidden">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            <span className="font-semibold">Goals</span>
            <span className="flex items-center gap-2 text-sm tabular-nums text-stone-500">
              {progress ? `${Number(progress.done.toFixed(2))} of ${formatHours(progress.total)}` : "None set"}
              {hiddenCount > 0 && <span className="text-stone-400">· {hiddenCount} hidden</span>}
              <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          </span>
          {progress && progress.total > 0 && (
            <span className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-stone-100">
              <span className="bg-accent" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              <span className="bg-accent/35" style={{ width: `${(progress.ahead / progress.total) * 100}%` }} />
            </span>
          )}
        </summary>
        <div className="mt-4 border-t border-stone-100 pt-3">{goalList}</div>
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