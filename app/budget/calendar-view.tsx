import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadPlanBlocks, nameKey, type PlanBlock } from "@/lib/plan-blocks";
import { PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";
import { focusDays, type Week } from "@/lib/week";
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

  const [eventsResult, groupsResult, settingsResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_at, end_at, category:categories(name, color)")
      .lt("start_at", week.end.toISOString())
      .gt("end_at", week.start.toISOString()),
    // Groups with their categories: the popup's dropdown, and the colors for plan blocks
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase.from("user_settings").select("plan_calendar_id").maybeSingle(),
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
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

  // Plan blocks match a category by title, which gives them their color
  const groups = groupsResult.data;
  const categoryByName = new Map(
    groups.flatMap((group) =>
      group.categories.map((category) => [nameKey(category.name), category] as const)
    )
  );

  // A time as the user sees it: the date ("2026-11-24") and the clock time ("19:00")
  function localParts(ms: number) {
    const local = new TZDate(ms, timeZone);
    return { date: format(local, "yyyy-MM-dd"), time: format(local, "HH:mm") };
  }

  const planBlocks: CalendarBlock[] = planBlocksFromGoogle.map((block) => {
    const category = categoryByName.get(nameKey(block.title));
    const startMs = Date.parse(block.startAt);
    const endMs = Date.parse(block.endAt);
    const start = localParts(startMs);
    const end = localParts(endMs);

    return {
      id: block.id,
      kind: "plan" as const,
      title: block.title,
      color: category?.color ?? NO_CATEGORY_COLOR,
      startMs,
      endMs,
      // What the edit popup starts with. No category when the title doesn't match one.
      draft: {
        blockId: block.id,
        categoryId: category?.id ?? "",
        date: start.date,
        start: start.time,
        end: end.time,
      },
    };
  });

  // Day labels in the user's time zone, e.g. "Mon" and "16"
  const weekdayLabel = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const dayNumberLabel = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" });
  const fullLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const days = week.days.map((day) => ({
    date: day.date,
    weekday: weekdayLabel.format(day.start),
    dayNumber: dayNumberLabel.format(day.start),
    label: fullLabel.format(day.start),
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
        {planCalendarId && <span>Click an empty spot to add a plan block</span>}
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
        mobileDates={focusDays(days.map((day) => day.date), week.today)}
        nowMinutes={nowMinutes}
        blocks={[...planBlocks, ...trackedBlocks]}
        canAddBlocks={Boolean(planCalendarId)}
        groups={groups}
        timeZone={timeZone}
      />
    </>
  );
}