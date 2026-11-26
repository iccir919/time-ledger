import Link from "next/link";
import { loadCalendarData } from "@/lib/calendar-data";
import { PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";
import { focusDays, type Week } from "@/lib/week";
import WeekCalendar from "./week-calendar";

type CalendarViewProps = {
  userId: string;
  timeZone: string;
  week: Week;
};

// Plan → Calendar: the whole week, with plan blocks and tracked events side by side,
// and a sidebar to add time and choose which categories show
export default async function CalendarView({ userId, timeZone, week }: CalendarViewProps) {
  const data = await loadCalendarData(userId, timeZone, week);

  return (
    <>
      {data.planMissing && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your Plan calendar was deleted in Google.{" "}
          <Link href="/calendars" className="font-medium underline">
            Create a new one
          </Link>{" "}
          to keep planning here.
        </p>
      )}

      {!data.planCalendarId && (
        <p className="mt-4 text-sm text-stone-600">
          Plan blocks show up here once you{" "}
          <Link href="/calendars" className="font-medium text-accent hover:underline">
            create a {PLAN_CALENDAR_NAME} calendar
          </Link>
          .
        </p>
      )}

      {data.planProblem && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load your Plan calendar right now. Try refreshing the page.
        </p>
      )}

      <WeekCalendar
        days={data.days}
        today={week.today}
        mobileDates={focusDays(data.days.map((day) => day.date), week.today)}
        nowMinutes={data.nowMinutes}
        blocks={data.blocks}
        canAddBlocks={data.hasPlanCalendar}
        canLog={data.hasLogCalendar}
        groups={data.groups}
        timeZone={timeZone}
        withSidebar
      />
    </>
  );
}