import "server-only";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { loadPlanBlocks, nameKey, type PlanBlock } from "@/lib/plan-blocks";
import type { Week } from "@/lib/week";
import type { CalendarBlock, CalendarDay } from "@/app/budget/week-calendar";

// Gray for events without a category and plan blocks that don't match one
export const NO_CATEGORY_COLOR = "#a8a29e";

// Everything the calendar needs for one week: tracked events and plan blocks as calendar blocks,
// the days, the categories (for the popup), and the Plan calendar's state.
// Used by Plan → Calendar (the whole week) and the dashboard (just today).
export async function loadCalendarData(userId: string, timeZone: string, week: Week) {
  const supabase = await createClient();

  const [eventsResult, groupsResult, settingsResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, start_at, end_at, google_event_id, category_id, category:categories(name, color), calendar:tracked_calendars(google_calendar_id)"
      )
      .lt("start_at", week.end.toISOString())
      .gt("end_at", week.start.toISOString()),
    // Groups with their categories: the popup's dropdown, and the colors for plan blocks
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase.from("user_settings").select("plan_calendar_id, log_calendar_id").maybeSingle(),
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

  // A time as the user sees it: the date ("2026-11-24") and the clock time ("19:00")
  function localParts(ms: number) {
    const local = new TZDate(ms, timeZone);
    return { date: format(local, "yyyy-MM-dd"), time: format(local, "HH:mm") };
  }

  // Tracked events, colored by their category. Ones logged in the app (in the Log calendar)
  // get a draft, so they can be edited and deleted; events from other calendars are read-only.
  const logCalendarId = settingsResult.data?.log_calendar_id ?? null;
  const trackedBlocks: CalendarBlock[] = eventsResult.data.map((event) => {
    const startMs = Date.parse(event.start_at);
    const endMs = Date.parse(event.end_at);
    const isLogged = logCalendarId !== null && event.calendar?.google_calendar_id === logCalendarId;
    return {
      id: event.id,
      kind: "tracked" as const,
      title: event.title ?? "(No title)",
      color: event.category?.color ?? NO_CATEGORY_COLOR,
      startMs,
      endMs,
      draft: isLogged
        ? {
            blockId: event.google_event_id,
            kind: "done" as const,
            categoryId: event.category_id ?? "",
            date: localParts(startMs).date,
            start: localParts(startMs).time,
            end: localParts(endMs).time,
          }
        : undefined,
    };
  });

  // Plan blocks, read live from the Plan calendar in Google
  const planCalendarId = settingsResult.data?.plan_calendar_id ?? null;
  let planBlocksFromGoogle: PlanBlock[] = [];
  let planProblem = false;
  let planMissing = false;

  if (planCalendarId) {
    const result = await loadPlanBlocks(userId, planCalendarId, week);
    planBlocksFromGoogle = result.blocks;
    planProblem = result.problem;
    planMissing = result.missing;
  }

  // Plan blocks match a category by title, which gives them their color
  const groups = groupsResult.data;
  const categoryByName = new Map(
    groups.flatMap((group) =>
      group.categories.map((category) => [nameKey(category.name), category] as const)
    )
  );

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
        kind: "plan" as const,
        categoryId: category?.id ?? "",
        date: start.date,
        start: start.time,
        end: end.time,
      },
    };
  });

  // Day labels in the user's time zone, e.g. "Mon", "16", and "Mon, Nov 16"
  const weekdayLabel = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const dayNumberLabel = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" });
  const fullLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const days: CalendarDay[] = week.days.map((day) => ({
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

  return {
    blocks: [...planBlocks, ...trackedBlocks],
    days,
    groups,
    nowMinutes,
    planCalendarId,
    planProblem,
    planMissing,
    // Adding and editing blocks needs a Plan calendar that still exists
    hasPlanCalendar: Boolean(planCalendarId) && !planMissing,
    // Logging done time needs a Log calendar
    hasLogCalendar: Boolean(logCalendarId),
  };
}