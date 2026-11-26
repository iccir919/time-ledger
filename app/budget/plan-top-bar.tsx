import Link from "next/link";
import type { ReactNode } from "react";
import { formatWeekRange, type MonthGrid, type NavigableWeek } from "@/lib/week";

export type PlanView = "calendar" | "grid";
export type CalendarRange = "week" | "month";

type PlanTopBarProps = {
  week: NavigableWeek;
  // Set when the calendar shows a month
  month: MonthGrid | null;
  timeZone: string;
  view: PlanView;
};

const squareButton =
  "flex size-8 items-center justify-center rounded-full text-lg leading-none text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900";
const disabledSquareButton = "flex size-8 items-center justify-center text-lg leading-none text-stone-300";

// Where a link goes. Calendar and Week are the defaults, so they have no ?view= or ?range=.
// date is a week's start (any day in it works) or, for a month, "2026-11". Leave it out for now.
function planHref({ view, range = "week", date }: { view: PlanView; range?: CalendarRange; date?: string }) {
  const search = new URLSearchParams();
  if (view === "grid") {
    search.set("view", "grid");
  }
  if (range === "month") {
    search.set("range", "month");
  }
  if (date) {
    search.set(range === "month" ? "month" : "week", date);
  }
  const query = search.toString();
  return query ? `/budget?${query}` : "/budget";
}

// The bar above both Plan views, like Google Calendar's: Today, ‹ ›, the week or month,
// then Week | Month (calendar only) and the Calendar | Grid switch.
export default function PlanTopBar({ week, month, timeZone, view }: PlanTopBarProps) {
  const isMonth = view === "calendar" && month !== null;
  const range: CalendarRange = isMonth ? "month" : "week";

  // What to keep when switching: a month's first week, a week's month (the one its Thursday is in).
  // Nothing when it's the current one, so the link just means "now".
  const weekToKeep = isMonth
    ? month.isCurrentMonth
      ? undefined
      : `${month.monthKey}-01`
    : week.isCurrentWeek
      ? undefined
      : week.weekStart;
  const monthToKeep = week.isCurrentWeek ? undefined : week.days[3].date.slice(0, 7);

  const previous = isMonth
    ? { show: month.canGoBack, href: planHref({ view, range, date: month.previousMonth }), label: "Previous month" }
    : { show: week.canGoBack, href: planHref({ view, date: week.previousWeekStart }), label: "Previous week" };
  const next = isMonth
    ? { show: month.canGoForward, href: planHref({ view, range, date: month.nextMonth }), label: "Next month" }
    : { show: week.canGoForward, href: planHref({ view, date: week.nextWeekStart }), label: "Next week" };

  const views: { key: PlanView; label: string; icon: ReactNode }[] = [
    {
      key: "calendar",
      label: "Calendar",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M3 8h14M7 2.5v3M13 2.5v3" />
        </svg>
      ),
    },
    {
      key: "grid",
      label: "Grid",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="3" width="6" height="6" rx="1" />
          <rect x="11" y="3" width="6" height="6" rx="1" />
          <rect x="3" y="11" width="6" height="6" rx="1" />
          <rect x="11" y="11" width="6" height="6" rx="1" />
        </svg>
      ),
    },
  ];

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
      <nav aria-label={isMonth ? "Choose a month" : "Choose a week"} className="flex items-center gap-1">
        <Link
          href={planHref({ view, range })}
          className="mr-2 rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
        >
          Today
        </Link>

        {[previous, next].map((arrow, index) =>
          arrow.show ? (
            <Link key={arrow.label} href={arrow.href} aria-label={arrow.label} className={squareButton}>
              {index === 0 ? "‹" : "›"}
            </Link>
          ) : (
            <span key={arrow.label} aria-hidden="true" className={disabledSquareButton}>
              {index === 0 ? "‹" : "›"}
            </span>
          )
        )}

        <span className="ml-2 text-lg font-medium">
          {isMonth ? month.title : formatWeekRange(week, timeZone)}
        </span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        {/* Week | Month: only the calendar has a month */}
        {view === "calendar" && (
          <nav aria-label="Choose a range" className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
            <Link
              href={planHref({ view, date: weekToKeep })}
              aria-current={!isMonth ? "page" : undefined}
              className={`rounded-md px-3 py-1 transition-colors ${
                !isMonth ? "bg-stone-100 font-medium text-stone-900" : "text-stone-500 hover:text-stone-900"
              }`}
            >
              Week
            </Link>
            <Link
              href={planHref({ view, range: "month", date: isMonth ? month.monthKey : monthToKeep })}
              aria-current={isMonth ? "page" : undefined}
              className={`rounded-md px-3 py-1 transition-colors ${
                isMonth ? "bg-stone-100 font-medium text-stone-900" : "text-stone-500 hover:text-stone-900"
              }`}
            >
              Month
            </Link>
          </nav>
        )}

        {/* Calendar | Grid. The grid is always a week. */}
        <nav aria-label="Choose a view" className="grid grid-cols-2 rounded-xl bg-stone-200/70 p-1">
          {views.map((option) => (
            <Link
              key={option.key}
              href={
                option.key === view
                  ? planHref({ view, range, date: isMonth ? month.monthKey : weekToKeep })
                  : planHref({ view: option.key, date: weekToKeep })
              }
              aria-current={view === option.key ? "page" : undefined}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                view === option.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"
              }`}
            >
              {option.icon}
              {option.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}