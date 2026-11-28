import { createClient } from "@/lib/supabase/server";
import { getWeek, type MonthGrid as MonthGridData, type Week } from "@/lib/week";
import { loadWeekGoals } from "@/lib/week-goals";
import MonthGrid, { type MonthGridWeek } from "./month-grid";

type MonthGridViewProps = {
  userId: string;
  timeZone: string;
  month: MonthGridData;
  // The week the page is on (this week by default): the sidebar's goals are for it
  week: Week;
};

const weekLabel = (week: Week, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(week.start);

// Plan → Grid → Month: each week of the month with each category's goal and what was done.
// Loads one snapshot per week (goals can change from week to week), then hands off to the grid.
export default async function MonthGridView({ userId, timeZone, month, week }: MonthGridViewProps) {
  const supabase = await createClient();

  // The month's weeks, Monday to Sunday
  const weeks: Week[] = [];
  for (let index = 0; index < month.days.length; index += 7) {
    weeks.push(getWeek(timeZone, month.days[index].date));
  }

  const [groupsResult, settingsResult, sidebarGoals, ...weekGoals] = await Promise.all([
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase.from("user_settings").select("plan_calendar_id, plan_calendar_missing, log_calendar_id").maybeSingle(),
    loadWeekGoals(userId, timeZone, week),
    ...weeks.map((monthWeek) => loadWeekGoals(userId, timeZone, monthWeek)),
  ]);
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }
  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  const gridWeeks: MonthGridWeek[] = weeks.map((monthWeek, index) => {
    const lastDay = monthWeek.days[monthWeek.days.length - 1].date;
    return {
      weekStart: monthWeek.weekStart,
      label: weekLabel(monthWeek, timeZone),
      isCurrent: monthWeek.days.some((day) => day.date === month.today),
      isPast: lastDay < month.today,
      goals: weekGoals[index],
    };
  });

  const settings = settingsResult.data;
  return (
    <MonthGrid
      groups={groupsResult.data}
      weeks={gridWeeks}
      days={month.days.map((day) => ({
        date: day.date,
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }).format(
          day.start
        ),
      }))}
      monthKey={month.monthKey}
      today={month.today}
      timeZone={timeZone}
      sidebarGoals={{
        goals: sidebarGoals,
        weekStart: week.weekStart,
        weekStillOpen: week.days[week.days.length - 1].date >= week.today,
      }}
      canAddBlocks={Boolean(settings?.plan_calendar_id) && !settings?.plan_calendar_missing}
      canLog={Boolean(settings?.log_calendar_id)}
    />
  );
}
