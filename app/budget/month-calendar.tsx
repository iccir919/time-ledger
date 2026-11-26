"use client";

import { useCallback, useState, type MouseEvent } from "react";
import Link from "next/link";
import CalendarSidebar, { type ColoredCategoryGroup } from "./calendar-sidebar";
import PlanBlockDialog, { type BlockDraft } from "./plan-block-dialog";
import { UNCATEGORIZED, useHiddenCategories } from "./use-hidden-categories";
import { draftAt, type CalendarBlock, type CalendarDay } from "./week-calendar";

type MonthCalendarProps = {
  // Whole weeks, Monday to Sunday, covering the month
  days: CalendarDay[];
  // e.g. "2026-11", to gray out the days from the months around it
  monthKey: string;
  today: string;
  // Minutes since midnight today, so "+ Add" for today starts at the next full hour
  nowMinutes: number | null;
  blocks: CalendarBlock[];
  canAddBlocks: boolean;
  canLog: boolean;
  groups: ColoredCategoryGroup[];
  timeZone: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Chips a day shows before "+N more"
const MAX_CHIPS = 3;

// Plan → Calendar → Month: each day lists its time as small chips, plan (dashed) and done (solid).
// Clicking a day's number opens its week; clicking an empty spot adds time that day.
export default function MonthCalendar({
  days,
  monthKey,
  today,
  nowMinutes,
  blocks,
  canAddBlocks,
  canLog,
  groups,
  timeZone,
}: MonthCalendarProps) {
  const canAdd = canAddBlocks || canLog;
  const { hidden, toggle } = useHiddenCategories();
  const shown = blocks
    .filter((block) => !hidden.has(block.categoryId ?? UNCATEGORIZED))
    .sort((a, b) => a.startMs - b.startMs);

  // "9:30a": short enough for a chip
  const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const shortTime = (ms: number) =>
    timeFormat
      .format(ms)
      .replace(/[  ]/g, " ")
      .replace(":00", "")
      .replace(" AM", "a")
      .replace(" PM", "p");

  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const closeDialog = useCallback(() => setDraft(null), []);

  // Today starts at the next full hour; other days at 9 AM
  function draftFor(date: string): BlockDraft {
    return date === today && nowMinutes !== null
      ? draftAt(date, Math.ceil(nowMinutes / 60) * 60)
      : draftAt(date, 9 * 60);
  }

  function handleDayClick(event: MouseEvent<HTMLDivElement>, date: string) {
    const target = event.target as HTMLElement;
    if (!canAdd || target.closest("[data-block]") || target.closest("a")) {
      return;
    }
    setDraft(draftFor(date));
  }

  // "+ Add": today if it's in this month, otherwise the 1st
  function openFromButton() {
    const inMonth = today.startsWith(monthKey);
    setDraft(draftFor(inMonth ? today : `${monthKey}-01`));
  }

  // The popup's day picker lists the week of the day being added or edited
  const dialogDays = (() => {
    if (!draft) {
      return [];
    }
    const index = Math.max(0, days.findIndex((day) => day.date === draft.date));
    const weekStart = index - (index % 7);
    return days.slice(weekStart, weekStart + 7).map((day) => ({ date: day.date, label: day.label }));
  })();

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <CalendarSidebar
        groups={groups}
        hidden={hidden}
        onToggle={toggle}
        onAdd={canAdd ? openFromButton : undefined}
        timeZone={timeZone}
        today={today}
        miniMonth={{ initialMonth: monthKey, selected: days.filter((day) => day.date.startsWith(monthKey)).map((day) => day.date) }}
      />

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="min-w-[40rem]">
          <div className="grid grid-cols-7 border-b border-stone-200 text-center text-xs text-stone-500">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-2">
                {weekday}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              const dayBlocks = shown.filter((block) => block.startMs < day.endMs && block.endMs > day.startMs);
              const extra = dayBlocks.length - MAX_CHIPS;
              const inMonth = day.date.startsWith(monthKey);
              const isToday = day.date === today;

              return (
                <div
                  key={day.date}
                  onClick={(event) => handleDayClick(event, day.date)}
                  className={`min-h-28 border-stone-100 p-1 ${index % 7 === 0 ? "" : "border-l"} ${
                    index >= 7 ? "border-t" : ""
                  } ${inMonth ? "" : "bg-stone-50/70"} ${canAdd ? "cursor-pointer" : ""}`}
                >
                  <Link
                    href={`/budget?week=${day.date}`}
                    title={`Open the week of ${day.label}`}
                    className={`mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                      isToday
                        ? "bg-accent font-medium text-white"
                        : inMonth
                          ? "text-stone-700 hover:bg-stone-100"
                          : "text-stone-400 hover:bg-stone-100"
                    }`}
                  >
                    {day.dayNumber}
                  </Link>

                  <div className="space-y-0.5">
                    {dayBlocks.slice(0, MAX_CHIPS).map((block) => {
                      const isPlan = block.kind === "plan";
                      const editable = block.draft && (isPlan ? canAddBlocks : canLog);
                      const draftToEdit = block.draft;
                      return (
                        <div
                          key={block.id}
                          data-block
                          title={`${block.title}, ${shortTime(block.startMs)} to ${shortTime(block.endMs)}`}
                          onClick={editable && draftToEdit ? () => setDraft(draftToEdit) : undefined}
                          className={`flex items-center gap-1 truncate rounded px-1 py-px text-[10px] leading-tight ${
                            editable ? "cursor-pointer hover:brightness-95" : "cursor-default"
                          }`}
                          style={{
                            // Same look as the week view: plan tinted and dashed, done solid
                            backgroundColor: isPlan ? `${block.color}1f` : block.color,
                            border: `1px ${isPlan ? "dashed" : "solid"} ${block.color}`,
                            color: isPlan ? "#292524" : "#ffffff",
                          }}
                        >
                          <span className="shrink-0 opacity-75">{shortTime(block.startMs)}</span>
                          <span className="truncate font-medium">{block.title}</span>
                        </div>
                      );
                    })}
                    {extra > 0 && (
                      <Link
                        href={`/budget?week=${day.date}`}
                        className="block px-1 text-[10px] font-medium text-stone-500 hover:text-stone-900"
                      >
                        +{extra} more
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
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