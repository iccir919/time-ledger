import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours, hoursBetween } from "@/lib/hours";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { formatWeekRange, getWeek } from "@/lib/week";
import InboxWeek, { type InboxCategoryGroup, type InboxRow } from "./inbox-week";

// More than this many events to sort at once is unlikely; this keeps one page from getting huge
const MAX_EVENTS = 1000;
// How many categorized events to look through for suggestions, at most
const MAX_HISTORY = 10_000;
const PAGE_SIZE = 1000;

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Sync first so the inbox matches Google
  let sync: SyncResult | null = null;
  try {
    sync = await syncRecentWeeks(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-2 text-stone-600">Events that still need a job.</p>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {sync?.status === "ok" && <InboxList timeZone={sync.timeZone} />}
      </main>
    </div>
  );
}

type InboxEvent = {
  id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  calendar: { name: string } | null;
};

// Every event that still needs a category, newest week first. Within a week, events that
// share a title (like a recurring "code" block) are grouped so one choice sorts them all.
async function InboxList({ timeZone }: { timeZone: string }) {
  const supabase = await createClient();

  const [eventsResult, groupsResult, allEventsResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_at, end_at, calendar:tracked_calendars(name)")
      .is("category_id", null)
      .order("start_at", { ascending: false })
      .limit(MAX_EVENTS),
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name, color)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    // Whether there are any events at all, sorted or not
    supabase.from("events").select("id", { count: "exact", head: true }),
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  const events: InboxEvent[] = eventsResult.data;
  const categoryGroups: InboxCategoryGroup[] = groupsResult.data;

  // No events at all: don't claim everything is sorted
  if (!allEventsResult.count) {
    return (
      <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="font-semibold">No events yet</p>
        <p className="mt-2 text-sm text-stone-600">
          Events from your tracked calendars will show up here.
        </p>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="font-semibold">Inbox zero</p>
        <p className="mt-2 text-sm text-stone-600">Every event has a job.</p>
      </section>
    );
  }

  // Split into weeks (Monday first), newest first, since the events come newest first
  const current = getWeek(timeZone);
  const weeks: { weekStart: string; label: string; events: InboxEvent[] }[] = [];
  const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  for (const event of events) {
    // "2026-11-24" in the user's time zone
    const week = getWeek(timeZone, dateFormat.format(new Date(event.start_at)));
    if (weeks[weeks.length - 1]?.weekStart !== week.weekStart) {
      weeks.push({
        weekStart: week.weekStart,
        label:
          week.weekStart === current.weekStart
            ? "This week"
            : week.weekStart === current.previousWeekStart
              ? "Last week"
              : formatWeekRange(week, timeZone),
        events: [],
      });
    }
    weeks[weeks.length - 1].events.push(event);
  }

  // A suggestion for each title: the category last picked for it (if it still exists)
  const categoryIds = new Set(categoryGroups.flatMap((group) => group.categories.map((c) => c.id)));
  const titles = [...new Set(events.map((event) => event.title).filter((title): title is string => Boolean(title)))];
  const lastPicked = await latestCategoryByTitle(titles);
  const suggestionFor = (title: string | null) => {
    const categoryId = title ? lastPicked.get(title) : undefined;
    return categoryId && categoryIds.has(categoryId) ? categoryId : null;
  };

  return (
    <div className="mt-10">
      <p className="text-sm text-stone-500">
        {events.length} {events.length === 1 ? "event" : "events"} to sort
      </p>
      {weeks.map((week) => (
        <InboxWeek
          key={week.weekStart}
          label={week.label}
          count={week.events.length}
          rows={rowsFor(week.events, timeZone, suggestionFor)}
          groups={categoryGroups}
        />
      ))}
    </div>
  );
}

// The most recent category picked for each title, from events that already have one.
// Newest first, so the first one seen per title wins; stops once every title has one.
async function latestCategoryByTitle(titles: string[]) {
  const latest = new Map<string, string>();
  if (titles.length === 0) {
    return latest;
  }

  const supabase = await createClient();
  for (let from = 0; from < MAX_HISTORY; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("events")
      .select("title, category_id")
      .in("title", titles)
      .not("category_id", "is", null)
      .order("start_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }
    for (const row of data) {
      if (row.title && row.category_id && !latest.has(row.title)) {
        latest.set(row.title, row.category_id);
      }
    }
    if (data.length < PAGE_SIZE || latest.size === titles.length) {
      break;
    }
  }
  return latest;
}

// One week's events as Inbox rows: grouped by title, biggest groups first. A group lists
// its events too, so one can be sorted differently.
function rowsFor(
  events: InboxEvent[],
  timeZone: string,
  suggestionFor: (title: string | null) => string | null
): InboxRow[] {
  // Oldest first within the week reads more naturally
  const sorted = [...events].sort((a, b) => a.start_at.localeCompare(b.start_at));

  const eventsByTitle = new Map<string, InboxEvent[]>();
  for (const event of sorted) {
    const title = event.title ?? "(No title)";
    eventsByTitle.set(title, [...(eventsByTitle.get(title) ?? []), event]);
  }

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const hoursOf = (event: InboxEvent) => hoursBetween(event.start_at, event.end_at);

  return [...eventsByTitle.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([title, items]) => {
      const suggested = suggestionFor(items[0].title);
      const hours = items.reduce((sum, item) => sum + hoursOf(item), 0);
      const calendars = [...new Set(items.map((item) => item.calendar?.name).filter(Boolean))].join(", ");
      const isSingle = items.length === 1;
      const summary = isSingle ? when.format(new Date(items[0].start_at)) : `${items.length} events`;

      return {
        key: title,
        title,
        meta: [summary, formatHours(hours), calendars].filter(Boolean).join(" · "),
        eventIds: items.map((item) => item.id),
        suggestedCategoryId: suggested,
        items: isSingle
          ? undefined
          : items.map((item) => ({
              key: item.id,
              title: `${title}, ${when.format(new Date(item.start_at))}`,
              meta: `${when.format(new Date(item.start_at))} · ${formatHours(hoursOf(item))}`,
              eventIds: [item.id],
              suggestedCategoryId: suggested,
            })),
      };
    });
}