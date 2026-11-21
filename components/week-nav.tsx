import Link from "next/link";
import { formatWeekRange, type NavigableWeek } from "@/lib/week";

type WeekNavProps = {
  basePath: string;
  week: NavigableWeek;
  timeZone: string;
};

const arrowClass =
  "rounded-md px-2.5 py-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900";
const disabledArrowClass = "cursor-not-allowed rounded-md px-2.5 py-1 text-stone-300";

// "‹ Nov 16 to Nov 22 ›" with a way back to the current week.
// Arrows turn gray at the edge of the allowed range.
export default function WeekNav({ basePath, week, timeZone }: WeekNavProps) {
  return (
    <nav aria-label="Choose a week" className="mt-4 flex items-center gap-1 text-sm">
      {week.canGoBack ? (
        <Link
          href={`${basePath}?week=${week.previousWeekStart}`}
          aria-label="Previous week"
          className={arrowClass}
        >
          ‹
        </Link>
      ) : (
        <span aria-hidden="true" className={disabledArrowClass}>
          ‹
        </span>
      )}

      <span className="min-w-36 text-center font-medium">{formatWeekRange(week, timeZone)}</span>

      {week.canGoForward ? (
        <Link
          href={`${basePath}?week=${week.nextWeekStart}`}
          aria-label="Next week"
          className={arrowClass}
        >
          ›
        </Link>
      ) : (
        <span aria-hidden="true" className={disabledArrowClass}>
          ›
        </span>
      )}

      {week.isCurrentWeek ? (
        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
          This week
        </span>
      ) : (
        <Link href={basePath} className="ml-2 text-accent hover:underline">
          Back to this week
        </Link>
      )}
    </nav>
  );
}