import Link from "next/link";
import { buttonClasses } from "@/components/button";
import Switch, { type SwitchOption } from "@/components/switch";
import { formatWeekRange, type MonthGrid, type NavigableWeek } from "@/lib/week";
import { PHONE_ADD_SLOT } from "@/lib/plan-view";

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

// Where a link goes. The view is always spelled out, since a bare /budget opens the view
// used last. Week is the default range, so it has no ?range=.
// date is a week's start (any day in it works) or, for a month, "2026-11". Leave it out for now.
function planHref({ view, range = "week", date }: { view: PlanView; range?: CalendarRange; date?: string }) {
  const search = new URLSearchParams();
  search.set("view", view);
  if (range === "month") {
    search.set("range", "month");
  }
  if (date) {
    search.set(range === "month" ? "month" : "week", date);
  }
  return `/budget?${search.toString()}`;
}

// The bar above both Plan views, like Google Calendar's: Today, ‹ ›, the week or month,
// then Week | Month and the Calendar | Grid switch.
export default function PlanTopBar({ week, month, timeZone, view }: PlanTopBarProps) {
  const isMonth = month !== null;
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

  const viewOptions: SwitchOption<PlanView>[] = [
    {
      key: "calendar",
      label: "Calendar",
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M3 8h14M7 2.5v3M13 2.5v3" />
        </svg>
      ),
      // Switching views keeps the week or month you're looking at
      href: planHref({ view: "calendar", range, date: isMonth ? month.monthKey : weekToKeep }),
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
      href: planHref({ view: "grid", range, date: isMonth ? month.monthKey : weekToKeep }),
    },
  ];
  const rangeOptions: SwitchOption<CalendarRange>[] = [
    { key: "week", label: "Week", href: planHref({ view, date: weekToKeep }) },
    {
      key: "month",
      label: "Month",
      href: planHref({ view, range: "month", date: isMonth ? month.monthKey : monthToKeep }),
    },
  ];

  const rangeSwitch = <Switch label="Choose a range" options={rangeOptions} value={range} size="sm" />;

  return (
    <>
      {/* The title, and Calendar | Grid on the right. On phones Week | Month sits next to the
          title and "+ Add" next to the switch, leaving the row below to the dates. The view puts
          its "+ Add" into the empty spot (see calendar-sidebar.tsx). */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
          <div className="sm:hidden">{rangeSwitch}</div>
        </div>
        <div className="flex items-center gap-2">
          <Switch label="Choose a view" options={viewOptions} value={view} iconsOnPhones />
          <div id={PHONE_ADD_SLOT} className="lg:hidden" />
        </div>
      </div>

      {/* The week (or month) and its arrows, and Week | Month on the right */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <nav aria-label={isMonth ? "Choose a month" : "Choose a week"} className="flex min-w-0 items-center gap-1">
          <Link href={planHref({ view, range })} className={`mr-1 sm:mr-2 ${buttonClasses("secondary", "sm")}`}>
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

          <span className="ml-1 truncate text-base font-medium sm:ml-2 sm:text-lg">
            {isMonth ? month.title : formatWeekRange(week, timeZone)}
          </span>
        </nav>

        <div className="hidden sm:block">{rangeSwitch}</div>
      </div>
    </>
  );
}