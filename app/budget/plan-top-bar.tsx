import Link from "next/link";
import type { ReactNode } from "react";
import { formatWeekRange, type NavigableWeek } from "@/lib/week";

export type PlanView = "calendar" | "grid";

type PlanTopBarProps = {
  week: NavigableWeek;
  timeZone: string;
  view: PlanView;
};

const squareButton =
  "flex size-8 items-center justify-center rounded-full text-lg leading-none text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900";
const disabledSquareButton = "flex size-8 items-center justify-center text-lg leading-none text-stone-300";

// The bar above both Plan views, like Google Calendar's: Today, ‹ ›, the week,
// and the Calendar | Grid switch. Calendar is the default, so it has no ?view= in the URL.
export default function PlanTopBar({ week, timeZone, view }: PlanTopBarProps) {
  function href(weekStart: string | undefined, toView: PlanView = view) {
    const search = new URLSearchParams();
    if (weekStart) {
      search.set("week", weekStart);
    }
    if (toView === "grid") {
      search.set("view", "grid");
    }
    const query = search.toString();
    return query ? `/budget?${query}` : "/budget";
  }

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
      <nav aria-label="Choose a week" className="flex items-center gap-1">
        <Link
          href={href(undefined)}
          aria-current={week.isCurrentWeek ? "date" : undefined}
          className="mr-2 rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
        >
          Today
        </Link>

        {week.canGoBack ? (
          <Link href={href(week.previousWeekStart)} aria-label="Previous week" className={squareButton}>
            ‹
          </Link>
        ) : (
          <span aria-hidden="true" className={disabledSquareButton}>
            ‹
          </span>
        )}
        {week.canGoForward ? (
          <Link href={href(week.nextWeekStart)} aria-label="Next week" className={squareButton}>
            ›
          </Link>
        ) : (
          <span aria-hidden="true" className={disabledSquareButton}>
            ›
          </span>
        )}

        <span className="ml-2 text-lg font-medium">{formatWeekRange(week, timeZone)}</span>
      </nav>

      {/* Calendar | Grid */}
      <nav aria-label="Choose a view" className="grid grid-cols-2 rounded-xl bg-stone-200/70 p-1">
        {views.map((option) => (
          <Link
            key={option.key}
            href={href(week.isCurrentWeek ? undefined : week.weekStart, option.key)}
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
  );
}