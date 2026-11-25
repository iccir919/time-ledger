import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import CategorySelect, { type CategoryGroup } from "@/components/category-select";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours, hoursBetween } from "@/lib/hours";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { formatWeekRange, getWeek } from "@/lib/week";
import { assignCategory } from "./actions";

// More than this many events to sort at once is unlikely; this keeps one page from getting huge
const MAX_EVENTS = 1000;

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
      .select("id, name, categories(id, name)")
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
  const categoryGroups = groupsResult.data;

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

  return (
    <div className="mt-10">
      <p className="text-sm text-stone-500">
        {events.length} {events.length === 1 ? "event" : "events"} to sort
      </p>
      {weeks.map((week) => (
        <WeekSection
          key={week.weekStart}
          label={week.label}
          events={week.events}
          timeZone={timeZone}
          categoryGroups={categoryGroups}
        />
      ))}
    </div>
  );
}

type WeekSectionProps = {
  label: string;
  events: InboxEvent[];
  timeZone: string;
  categoryGroups: CategoryGroup[];
};

// One week's events to sort, grouped by title, biggest groups first
function WeekSection({ label, events, timeZone, categoryGroups }: WeekSectionProps) {
  // Oldest first within the week reads more naturally
  const sorted = [...events].sort((a, b) => a.start_at.localeCompare(b.start_at));

  const eventsByTitle = new Map<string, InboxEvent[]>();
  for (const event of sorted) {
    const title = event.title ?? "(No title)";
    eventsByTitle.set(title, [...(eventsByTitle.get(title) ?? []), event]);
  }

  const titleGroups = [...eventsByTitle.entries()]
    .map(([title, items]) => ({
      title,
      items,
      hours: items.reduce((sum, item) => sum + hoursBetween(item.start_at, item.end_at), 0),
      calendars: [...new Set(items.map((item) => item.calendar?.name).filter(Boolean))].join(", "),
    }))
    // Biggest groups first
    .sort((a, b) => b.items.length - a.items.length);

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section className="mt-6">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-stone-700">
        {label}
        <span className="font-normal text-stone-400">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </h2>

      <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {titleGroups.map((group) => {
          const isSingle = group.items.length === 1;
          const summary = isSingle
            ? when.format(new Date(group.items[0].start_at))
            : `${group.items.length} events`;

          return (
            <li key={group.title} className="px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{group.title}</p>
                  <p className="mt-0.5 text-sm text-stone-500">
                    {summary} · {formatHours(group.hours)}
                    {group.calendars && ` · ${group.calendars}`}
                  </p>
                </div>
                <AssignForm
                  eventIds={group.items.map((item) => item.id)}
                  categoryGroups={categoryGroups}
                  ariaLabel={
                    isSingle
                      ? `Category for ${group.title}`
                      : `Category for all ${group.items.length} ${group.title} events`
                  }
                />
              </div>

              {!isSingle && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-stone-500 hover:text-stone-800">
                    Show each event
                  </summary>
                  <ul className="mt-3 space-y-2 border-l border-stone-200 pl-4">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-4 text-sm">
                        <span className="flex-1 text-stone-600">
                          {when.format(new Date(item.start_at))} ·{" "}
                          {formatHours(hoursBetween(item.start_at, item.end_at))}
                        </span>
                        <AssignForm
                          eventIds={[item.id]}
                          categoryGroups={categoryGroups}
                          ariaLabel={`Category for ${group.title} on ${when.format(new Date(item.start_at))}`}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type AssignFormProps = {
  eventIds: string[];
  categoryGroups: CategoryGroup[];
  ariaLabel: string;
};

// A category dropdown and Assign button for one or more events
function AssignForm({ eventIds, categoryGroups, ariaLabel }: AssignFormProps) {
  return (
    <form action={assignCategory} className="flex shrink-0 items-center gap-2">
      {eventIds.map((id) => (
        <input key={id} type="hidden" name="event_id" value={id} />
      ))}
      <CategorySelect
        name="category_id"
        groups={categoryGroups}
        placeholder="Choose a category"
        required
        ariaLabel={ariaLabel}
      />
      <button className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
        Assign
      </button>
    </form>
  );
}