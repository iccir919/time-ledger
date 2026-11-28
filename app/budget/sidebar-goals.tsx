"use client";

import { useState, useTransition } from "react";
import GoalBar from "@/components/goal-bar";
import GoalStatusLabel from "@/components/goal-status-label";
import { goalProgress, goalStatus, type GoalDirection } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import type { WeekGoals } from "@/lib/week-goals";
import { saveGoal } from "./actions";
import type { ColoredCategoryGroup } from "./calendar-sidebar";
import { UNCATEGORIZED } from "./use-hidden-categories";

type SidebarGoalsProps = {
  groups: ColoredCategoryGroup[];
  goals: WeekGoals;
  weekStart: string;
  // The week isn't over yet, so "unplanned" means something
  weekStillOpen: boolean;
  hidden: Set<string>;
  onToggle: (id: string) => void;
};

// 2.25 -> "2.25"
const num = (hours: number) => String(Number(hours.toFixed(2)));

// "" -> null; anything else -> hours, never below 0 ("1,5" works too)
function hoursOrNull(text: string) {
  const trimmed = text.trim().replace(",", ".");
  return trimmed === "" ? null : Math.max(0, Math.min(168, Number(trimmed) || 0));
}

// The Plan page's goals, in the sidebar: every category with its checkbox (show or hide it),
// its goal and progress. Clicking the goal opens a small editor right there.
export default function SidebarGoals({ groups, goals, weekStart, weekStillOpen, hidden, onToggle }: SidebarGoalsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<GoalDirection>("at_least");
  const [errorId, setErrorId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const goalOf = (categoryId: string) => goals[categoryId] ?? { goal: null, direction: "at_least" as const, done: 0, ahead: 0 };

  // The total at the top: progress toward "at least" goals
  const progress = goalProgress(
    Object.values(goals)
      .filter((entry) => entry.goal !== null)
      .map((entry) => ({ goal: entry.goal!, done: entry.done, ahead: entry.ahead, direction: entry.direction }))
  );

  function open(categoryId: string) {
    const current = goalOf(categoryId);
    setEditingId(categoryId);
    setText(current.goal === null ? "" : num(current.goal));
    setDirection(current.direction);
    setErrorId(null);
  }

  // Save on blur or Enter, if something changed; the page refreshes with the new numbers
  function save(categoryId: string, nextDirection = direction) {
    const current = goalOf(categoryId);
    const hours = hoursOrNull(text);
    // 0 is always a limit
    const finalDirection: GoalDirection = hours === 0 ? "at_most" : nextDirection;
    if (hours === current.goal && (hours === null || finalDirection === current.direction)) {
      return;
    }
    setSavingId(categoryId);
    startTransition(async () => {
      const result = await saveGoal(weekStart, categoryId, hours, finalDirection);
      setSavingId(null);
      if (result.error) {
        setErrorId(categoryId);
      }
    });
  }

  function flip(categoryId: string) {
    const next: GoalDirection = direction === "at_least" ? "at_most" : "at_least";
    setDirection(next);
    save(categoryId, next);
  }

  return (
    <div className="space-y-3 text-sm">
      {/* On phones the Goals card already has this heading and total */}
      <div className="hidden items-baseline justify-between lg:flex">
        <p className="font-semibold">Goals</p>
        {progress && (
          <p className="text-xs tabular-nums text-stone-500">
            {num(progress.done)} of {formatHours(progress.total)}
          </p>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.id}>
          <p className="text-xs text-stone-400">{group.name}</p>
          <ul className="mt-1 space-y-1">
            {group.categories.map((category) => {
              const { goal, direction: savedDirection, done, ahead } = goalOf(category.id);
              const isLimit = savedDirection === "at_most";
              const status = goal === null ? null : goalStatus(goal, done, ahead, savedDirection);
              const unplanned = goal !== null && !isLimit && weekStillOpen ? Math.max(0, goal - done - ahead) : 0;
              const isEditing = editingId === category.id;

              return (
                <li key={category.id} className="rounded px-1 py-1 hover:bg-stone-100">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!hidden.has(category.id)}
                      onChange={() => onToggle(category.id)}
                      aria-label={`Show ${category.name}`}
                      className="size-3.5 shrink-0"
                      style={{ accentColor: category.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{category.name}</span>
                    {/* The goal: click to change it */}
                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingId(null) : open(category.id))}
                      aria-expanded={isEditing}
                      title="Change this week's goal"
                      className={`shrink-0 rounded px-1 text-xs tabular-nums hover:bg-white hover:ring-1 hover:ring-stone-300 ${
                        goal === null ? "text-stone-400" : "text-stone-600"
                      } ${savingId === category.id ? "opacity-50" : ""}`}
                    >
                      {goal === null
                        ? "Set"
                        : isLimit
                          ? `${num(done)} / ${formatHours(goal)} max`
                          : `${num(done)} / ${formatHours(goal)}`}
                    </button>
                  </div>

                  {isEditing && (
                    <div className="mt-1.5 flex items-center pl-5">
                      {/* goal: at least; limit: at most. 0 is always a limit. */}
                      <button
                        type="button"
                        onClick={() => flip(category.id)}
                        disabled={hoursOrNull(text) === 0}
                        className="-mr-px h-7 w-12 shrink-0 rounded-l-md border border-accent/40 bg-white text-xs font-medium text-stone-500 hover:brightness-95 disabled:opacity-70"
                      >
                        {direction === "at_most" || hoursOrNull(text) === 0 ? "limit" : "goal"}
                      </button>
                      <div className="relative w-16">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          autoFocus
                          value={text}
                          onChange={(event) => setText(event.target.value)}
                          onBlur={() => save(category.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                              setEditingId(null);
                            } else if (event.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                          maxLength={5}
                          placeholder="–"
                          aria-label={`Weekly goal for ${category.name}, in hours`}
                          className="h-7 w-full rounded-r-md border border-accent/40 bg-accent-soft/50 py-1 pl-2 pr-5 text-right text-sm font-medium tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-accent/30"
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">
                          h
                        </span>
                      </div>
                    </div>
                  )}

                  {goal !== null && (
                    <div className="pl-5">
                      <GoalBar
                        goal={goal}
                        done={done}
                        ahead={ahead}
                        direction={savedDirection}
                        color={category.color}
                        className="mt-1.5"
                      />
                      {/* "Over limit" is already said by "4.5 / 0h max" */}
                      {status && status.tone !== "over" && (
                        <p className="mt-1 text-[11px] leading-tight">
                          <GoalStatusLabel status={status} />
                          {unplanned >= 0.01 && status.tone === "quiet" && (
                            <span className="text-stone-400"> · {formatHours(unplanned)} unplanned</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {errorId === category.id && <p className="mt-1 pl-5 text-[11px] text-red-600">Couldn&apos;t save. Try again.</p>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-stone-100">
        <input
          type="checkbox"
          checked={!hidden.has(UNCATEGORIZED)}
          onChange={() => onToggle(UNCATEGORIZED)}
          className="size-3.5 shrink-0"
          style={{ accentColor: "#a8a29e" }}
        />
        <span className="truncate text-stone-500">Uncategorized</span>
      </label>
    </div>
  );
}