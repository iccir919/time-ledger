import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadPlanBlocks, nameKey, type PlanBlock } from "@/lib/plan-blocks";
import { PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";
import type { Week } from "@/lib/week";
import WeekCalendar, { type CalendarBlock } from "./week-calendar";

// Gray for events without a category and plan blocks that don't match one
const NO_CATEGORY_COLOR = "#a8a29e";

type CalendarViewProps = {
  userId: string;
  timeZone: string;
  week: Week;
};

// Loads plan blocks (from Google) and tracked events (from the database) for one week
export default async function CalendarView({ userId, timeZone, week }: CalendarViewProps) {
  const supabase = await createClient();

  const [eventsResult, categoriesResult, settingsResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_at, end_at, category:categories(name, color)")
      .lt("start_at", week.end.toISOString())
      .gt("end_at", week.start.toISOString()),
    supabase.from("categories").select("name, color"),
    supabase.from("user_settings").select("plan_calendar_id").maybeSingle(),
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }
  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  // Tracked events, colored by their category
  const trackedBlocks: CalendarBlock[] = eventsResult.data.map((event) => ({
    id: event.id,
    kind: "tracked" as const,
    title: event.title ?? "(No title)",
    color: event.category?.color ?? NO_CATEGORY_COLOR,
    startMs: Date.parse(event.start_at),
    endMs: Date.parse(event.end_at),
  }));

  // Plan blocks, read live from the Plan calendar in Google
  const planCalendarId = settingsResult.data?.plan_calendar_id ?? null;
  let planBlocksFromGoogle: PlanBlock[] = [];
  let planProblem = false;

  if (planCalendarId) {
    const result = await loadPlanBlocks(userId, planCalendarId, week);
    planBlocksFromGoogle = result.blocks;
    planProblem = result.problem;
  }

  // Color plan blocks by the category their title matches
  const colorByName = new Map(
    categoriesResult.data.map((category) => [nameKey(category.name), category.color])
  );

  const planBlocks: CalendarBlock[] = planBlocksFromGoogle.map((block) => ({
    id: block.id,
    kind: "plan" as const,
    title: block.title,
    color: colorByName.get(nameKey(block.title)) ?? NO_CATEGORY_COLOR,
    startMs: Date.parse(block.startAt),
    endMs: Date.parse(block.endAt),
  }));

  // Day labels in the user's time zone, e.g. "Mon" and "16"
  const weekdayLabel = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const dayNumberLabel = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" });

  const days = week.days.map((day) => ({
    date: day.date,
    weekday: weekdayLabel.format(day.start),
    dayNumber: dayNumberLabel.format(day.start),
    startMs: day.start.getTime(),
    endMs: day.end.getTime(),
  }));

  // Where the "now" line goes, if today is in this week
  const todayDay = week.days.find((day) => day.date === week.today);
  const nowMinutes = todayDay ? (Date.now() - todayDay.start.getTime()) / 60_000 : null;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-5 text-xs text-stone-500">
        <span className="flex items-center gap-2">
          <span className="h-3 w-5 rounded border border-dashed border-stone-500 bg-stone-500/10" />
          Plan (left)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-5 rounded bg-stone-500" />
          Tracked (right)
        </span>
        <span>Times shown in {timeZone}</span>
      </div>

      {!planCalendarId && (
        <p className="mt-4 text-sm text-stone-600">
          Plan blocks show up here once you{" "}
          <Link href="/calendars" className="font-medium text-accent hover:underline">
            create a {PLAN_CALENDAR_NAME} calendar
          </Link>
          .
        </p>
      )}

      {planProblem && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load your Plan calendar right now. Try refreshing the page.
        </p>
      )}

      <WeekCalendar
        days={days}
        today={week.today}
        nowMinutes={nowMinutes}
        blocks={[...planBlocks, ...trackedBlocks]}
      />
    </>
  );
}