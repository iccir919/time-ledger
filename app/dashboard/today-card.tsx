"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import DayTimeline from "@/components/day-timeline";
import Switch from "@/components/switch";
import { formatHours } from "@/lib/hours";
import type { ColoredCategoryGroup } from "@/app/budget/calendar-sidebar";
import WeekCalendar, { type CalendarBlock, type CalendarDay } from "@/app/budget/week-calendar";

type TodayCardProps = {
  day: CalendarDay;
  nowMinutes: number | null;
  blocks: CalendarBlock[];
  canAddBlocks: boolean;
  canLog: boolean;
  groups: ColoredCategoryGroup[];
  timeZone: string;
  doneToday: number;
  plannedLeft: number;
};

type TodayView = "calendar" | "category";

// How tall the calendar is before it scrolls (about 12 hours)
const CALENDAR_HEIGHT = 420;

// Which view the card shows, remembered on this device
const STORAGE_KEY = "time-ledger:today-view";
const CHANGE_EVENT = "time-ledger:today-view-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read(): TodayView {
  try {
    return localStorage.getItem(STORAGE_KEY) === "category" ? "category" : "calendar";
  } catch {
    return "calendar";
  }
}

// The dashboard's Today: the day as a calendar (add and edit time right here), or by
// category (a row per category, overlaps easy to see). A small switch picks between them.
export default function TodayCard({
  day,
  nowMinutes,
  blocks,
  canAddBlocks,
  canLog,
  groups,
  timeZone,
  doneToday,
  plannedLeft,
}: TodayCardProps) {
  // The server has no localStorage, so it renders the calendar
  const view = useSyncExternalStore(subscribe, read, () => "calendar" as TodayView);
  const setView = useCallback((next: TodayView) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Can't remember it on this device; nothing else to do
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const options: { key: TodayView; label: string }[] = [
    { key: "calendar", label: "Calendar" },
    { key: "category", label: "By category" },
  ];

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      {/* "Today" with its switch beside it, and "Whole week" on the right */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Today</h2>
          <Switch label="Show today as" size="sm" options={options} value={view} onChange={setView} />
        </div>
        <Link href="/budget?view=calendar" className="text-sm font-medium text-accent hover:underline">
          Whole week
        </Link>
      </div>
      <p className="mt-2 mb-1 text-sm text-stone-500">
        {formatHours(doneToday)} done
        {plannedLeft > 0 && <> · {formatHours(plannedLeft)} planned left</>}
      </p>

      {view === "calendar" ? (
        <>
          <WeekCalendar
            days={[day]}
            today={day.date}
            mobileDates={[day.date]}
            nowMinutes={nowMinutes}
            blocks={blocks}
            canAddBlocks={canAddBlocks}
            canLog={canLog}
            groups={groups}
            timeZone={timeZone}
            scrollHeight={CALENDAR_HEIGHT}
            headerHref="/budget?view=calendar"
          />
          <p className="mt-2 text-xs text-stone-400">
            Plan on the left, done on the right.
            {(canAddBlocks || canLog) && " Click an empty spot to add time."}
          </p>
        </>
      ) : (
        <>
          <DayTimeline
            day={day}
            blocks={blocks}
            groups={groups}
            nowMinutes={nowMinutes}
            timeZone={timeZone}
            emptyText="Nothing done or planned today yet."
          />
          <p className="mt-3 text-xs text-stone-400">Solid is done, dashed is planned. Click a bar to open it in the calendar.</p>
        </>
      )}
    </section>
  );
}