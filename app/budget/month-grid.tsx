"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import GoalBar from "@/components/goal-bar";
import GoalStatusLabel from "@/components/goal-status-label";
import { directionOf, goalStatus, type GoalStatus } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import type { WeekGoal, WeekGoals } from "@/lib/week-goals";
import CalendarSidebar, { type ColoredCategoryGroup, type SidebarGoalsData } from "./calendar-sidebar";
import PlanBlockDialog, { type BlockDraft } from "./plan-block-dialog";
import { useHiddenCategories } from "./use-hidden-categories";
import { draftAt } from "./week-calendar";

export type MonthGridWeek = {
  weekStart: string;
  // e.g. "Nov 23"
  label: string;
  isCurrent: boolean;
  // The whole week is before today
  isPast: boolean;
  goals: WeekGoals;
};

type MonthGridProps = {
  groups: ColoredCategoryGroup[];
  weeks: MonthGridWeek[];
  // Every day the month's weeks cover, for the popup's day picker
  days: { date: string; label: string }[];
  monthKey: string;
  today: string;
  timeZone: string;
  sidebarGoals: SidebarGoalsData;
  canAddBlocks: boolean;
  canLog: boolean;
};

// 2.25 -> "2.25"
const num = (hours: number) => String(Number(hours.toFixed(2)));

const EMPTY: WeekGoal = { goal: null, direction: "at_least", done: 0, ahead: 0 };

// How a week went for one category, in a few words. A finished week says "short" rather
// than "to go"; this week and later weeks say what's left, counting what's planned.
function statusFor(entry: WeekGoal, isPast: boolean): GoalStatus | null {
  const { goal, direction, done, ahead } = entry;
  if (goal === null) {
    return null;
  }
  if (isPast && direction === "at_least" && done < goal) {
    return { text: `${formatHours(goal - done)} short`, tone: "quiet" };
  }
  return goalStatus(goal, done, isPast ? 0 : ahead, direction);
}

// Plan → Grid → Month: one row per category, one column per week of the month. Each cell
// compares that week to that week's own goal. Clicking a cell opens that week in the grid.
export default function MonthGrid({
  groups,
  weeks,
  days,
  monthKey,
  today,
  timeZone,
  sidebarGoals,
  canAddBlocks,
  canLog,
}: MonthGridProps) {
  const { hidden, toggle } = useHiddenCategories();
  const shownGroups = groups
    .map((group) => ({ ...group, categories: group.categories.filter((category) => !hidden.has(category.id)) }))
    .filter((group) => group.categories.length > 0);

  // "+ Add": today if it's in this month, otherwise 9 AM on the 1st
  const canAdd = canAddBlocks || canLog;
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const closeDialog = useCallback(() => setDraft(null), []);
  function addBlock() {
    setDraft(draftAt(today.startsWith(monthKey) ? today : `${monthKey}-01`, 9 * 60));
  }
  // The popup's day picker lists the week of the day being added
  const dialogDays = (() => {
    if (!draft) {
      return [];
    }
    const index = Math.max(0, days.findIndex((day) => day.date === draft.date));
    const start = index - (index % 7);
    return days.slice(start, start + 7);
  })();

  const columns = `minmax(7rem,10rem) repeat(${weeks.length},minmax(6.5rem,1fr))`;

  function cell(category: { id: string; name: string; color: string }, week: MonthGridWeek) {
    const entry = week.goals[category.id] ?? EMPTY;
    const { goal, direction, done, ahead } = entry;
    const isFuture = !week.isPast && !week.isCurrent;
    const status = isFuture ? null : statusFor(entry, week.isPast);
    const when = week.isCurrent ? "this week" : `the week of ${week.label}`;
    const details =
      `${category.name}, ${when}: ${num(done)}h done` +
      (goal !== null ? ` of ${formatHours(goal)}${direction === "at_most" ? " max" : ""}` : ", no goal") +
      (!week.isPast && ahead > 0 ? `, ${num(ahead)}h planned` : "");

    return (
      <Link
        key={week.weekStart}
        href={`/budget?view=grid&week=${week.weekStart}`}
        title={`${details}. Open this week.`}
        aria-label={`${details}. Open this week.`}
        className={`flex min-h-16 flex-col justify-center rounded-md border px-2 py-1.5 text-sm transition-colors hover:brightness-[0.97] ${
          week.isCurrent
            ? "border-accent/30 bg-accent-soft/60"
            : isFuture
              ? "border-stone-200 bg-white"
              : "border-stone-200 bg-stone-100/70"
        }`}
      >
        {isFuture ? (
          // Later weeks: the goal if one is set already, and anything planned
          <span className="text-xs text-stone-400">
            {goal !== null ? `${direction === "at_most" ? "max" : "goal"} ${formatHours(goal)}` : "–"}
            {ahead > 0 && <span className="block">{formatHours(ahead)} planned</span>}
          </span>
        ) : goal === null ? (
          <span className={done > 0 ? "text-stone-600" : "text-stone-300"}>{done > 0 ? formatHours(done) : "–"}</span>
        ) : (
          <>
            <span className="tabular-nums">
              <span className="font-medium text-stone-900">{num(done)}</span>
              <span className="text-stone-500">
                {" "}
                / {formatHours(goal)}
                {direction === "at_most" ? " max" : ""}
              </span>
            </span>
            <GoalBar
              goal={goal}
              done={done}
              ahead={week.isPast ? 0 : ahead}
              direction={direction}
              color={category.color}
              className="mt-1"
            />
            {status && (
              <span className="mt-0.5 text-[11px] leading-tight">
                <GoalStatusLabel status={status} />
              </span>
            )}
          </>
        )}
      </Link>
    );
  }

  // Phones: one small cell per week, colored by how the week went against its goal:
  // teal met (or within a limit), rose over a limit, gray short. This week and later weeks
  // aren't judged yet, unless this week already went over a limit.
  function phoneCell(category: { id: string; name: string }, week: MonthGridWeek) {
    const { goal, direction, done, ahead } = week.goals[category.id] ?? EMPTY;
    const isFuture = !week.isPast && !week.isCurrent;
    const when = week.isCurrent ? "this week" : `the week of ${week.label}`;
    const label =
      `${category.name}, ${when}: ${num(done)}h done` +
      (goal !== null ? ` of ${formatHours(goal)}${direction === "at_most" ? " max" : ""}` : ", no goal") +
      (!week.isPast && ahead > 0 ? `, ${num(ahead)}h planned` : "") +
      ". Open this week.";

    let tone = "border-stone-200 bg-white text-stone-900";
    if (isFuture || goal === null) {
      tone = "border-stone-200 bg-white text-stone-400";
    } else if (directionOf(goal, direction) === "at_most") {
      if (done > goal) {
        tone = "border-transparent bg-rose-50 text-rose-700";
      } else if (week.isPast) {
        tone = "border-transparent bg-accent-soft text-accent";
      }
    } else if (done >= goal) {
      tone = "border-transparent bg-accent-soft text-accent";
    } else if (week.isPast) {
      tone = "border-transparent bg-stone-100 text-stone-500";
    }

    // Later weeks show what's planned so far, if anything
    const shown = isFuture ? ahead : done;
    return (
      <Link
        key={week.weekStart}
        href={`/budget?view=grid&week=${week.weekStart}`}
        aria-label={label}
        className={`rounded-md border py-1.5 text-center text-xs font-medium tabular-nums ${tone} ${
          week.isCurrent ? "ring-1 ring-accent/50" : ""
        }`}
      >
        {shown > 0 ? num(shown) : "–"}
      </Link>
    );
  }

  // The goal beside a category's name on phones: this week's, or else the latest week's that has one
  function goalLabel(categoryId: string) {
    const ordered = [...weeks.filter((week) => week.isCurrent), ...[...weeks].reverse()];
    const entry = ordered.map((week) => week.goals[categoryId]).find((goal) => goal && goal.goal !== null);
    if (!entry || entry.goal === null) {
      return "no goal";
    }
    return directionOf(entry.goal, entry.direction) === "at_most"
      ? `${formatHours(entry.goal)} max`
      : `${formatHours(entry.goal)} goal`;
  }
  const phoneColumns = `repeat(${weeks.length},minmax(0,1fr))`;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <CalendarSidebar
        groups={groups}
        hidden={hidden}
        onToggle={toggle}
        onAdd={canAdd ? addBlock : undefined}
        timeZone={timeZone}
        today={today}
        miniMonth={{ initialMonth: monthKey, selected: days.filter((day) => day.date.startsWith(monthKey)).map((day) => day.date) }}
        goals={sidebarGoals}
        showLegend={false}
      />

      <div className="min-w-0">
        <p className="text-sm text-stone-600">
          Each week against that week&apos;s goal. <span className="hidden sm:inline">Click</span>
          <span className="sm:hidden">Tap</span> a week to open it.
        </p>

        {/* Phones: each category's weeks in a row of small cells that fit the screen */}
        <div className="mt-3 rounded-xl border border-stone-200 bg-white px-4 pb-2 pt-3 sm:hidden">
          <div style={{ gridTemplateColumns: phoneColumns }} className="grid gap-1 pb-2 text-center text-[11px] text-stone-500">
            {weeks.map((week) => (
              <span key={week.weekStart} className={week.isCurrent ? "font-semibold text-accent" : ""}>
                {week.label}
              </span>
            ))}
          </div>
          {shownGroups.map((group) =>
            group.categories.map((category) => (
              <div key={category.id} className="border-t border-stone-100 py-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                    <span className="truncate">{category.name}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-stone-500">{goalLabel(category.id)}</span>
                </div>
                <div style={{ gridTemplateColumns: phoneColumns }} className="grid gap-1">
                  {weeks.map((week) => phoneCell(category, week))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Wider screens: the full table */}
        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-stone-200 bg-white px-4 pb-4 sm:block">
          <div className="min-w-[40rem]">
            {/* Week headers */}
            <div className="-mx-4 rounded-t-xl border-b border-stone-200 bg-stone-100 px-4 pt-3">
              <div style={{ gridTemplateColumns: columns }} className="grid items-center gap-2 pb-2 text-sm text-stone-500">
                <span />
                {weeks.map((week) => (
                  <Link
                    key={week.weekStart}
                    href={`/budget?view=grid&week=${week.weekStart}`}
                    className={`rounded-md py-1.5 text-center font-medium transition-colors hover:bg-stone-200/70 ${
                      week.isCurrent ? "text-accent" : "text-stone-600"
                    }`}
                  >
                    {week.isCurrent ? "This week" : `Week of ${week.label}`}
                  </Link>
                ))}
              </div>
            </div>

            {shownGroups.map((group) => (
              <div key={group.id} className="border-t border-stone-100 pt-2 first:border-t-0">
                <p className="px-1 pt-1 font-semibold">{group.name}</p>
                {group.categories.map((category) => (
                  <div key={category.id} style={{ gridTemplateColumns: columns }} className="grid items-center gap-2 py-1.5">
                    <span className="flex min-w-0 items-center gap-2.5 px-1 text-base">
                      <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                      <span className="truncate">{category.name}</span>
                    </span>
                    {weeks.map((week) => cell(category, week))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {draft && (
        <PlanBlockDialog
          draft={draft}
          days={dialogDays}
          groups={groups}
          timeZone={timeZone}
          canPlan={canAddBlocks}
          canLog={canLog}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}