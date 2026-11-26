"use client";

import { useState } from "react";
import Link from "next/link";

type MiniMonthProps = {
  // The month it opens on, e.g. "2026-11"
  initialMonth: string;
  today: string;
  // Dates to highlight: the week (or month) being shown
  selected: string[];
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// Plain calendar math on "yyyy-mm-dd" strings. Noon UTC keeps every date on its own day,
// whatever the browser's time zone.
function dateString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function monthDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = Date.UTC(year, monthNumber - 1, 1, 12);
  // Monday is 0
  const leading = (new Date(first).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  const rows = Math.ceil((leading + daysInMonth) / 7);
  return Array.from({ length: rows * 7 }, (_, index) => dateString(first + (index - leading) * 86_400_000));
}

function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return dateString(Date.UTC(year, monthNumber - 1 + by, 1, 12)).slice(0, 7);
}

const titleFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// A small month in the sidebar, like Google Calendar's. Clicking a day opens its week.
// The arrows only change which month this little calendar shows.
export default function MiniMonth({ initialMonth, today, selected }: MiniMonthProps) {
  const [month, setMonth] = useState(initialMonth);
  const [year, monthNumber] = month.split("-").map(Number);
  const title = titleFormat.format(Date.UTC(year, monthNumber - 1, 1, 12));

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-700">{title}</span>
        <span className="flex">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="rounded-full px-1.5 text-sm text-stone-500 hover:bg-stone-200/70"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Next month"
            className="rounded-full px-1.5 text-sm text-stone-500 hover:bg-stone-200/70"
          >
            ›
          </button>
        </span>
      </div>

      <div className="mt-2 grid grid-cols-7 text-center">
        {WEEKDAYS.map((weekday, index) => (
          <span key={index} className="pb-1 text-[10px] text-stone-400">
            {weekday}
          </span>
        ))}
        {monthDays(month).map((date) => {
          const isToday = date === today;
          const inMonth = date.startsWith(month);
          return (
            <Link
              key={date}
              href={`/budget?week=${date}`}
              className={`flex h-6 items-center justify-center tabular-nums ${
                selected.includes(date) ? "bg-accent-soft" : ""
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full ${
                  isToday
                    ? "bg-accent font-medium text-white"
                    : inMonth
                      ? "text-stone-700 hover:bg-stone-200"
                      : "text-stone-300 hover:bg-stone-200"
                }`}
              >
                {Number(date.slice(8))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}