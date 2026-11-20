import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import CategorySelect, { type CategoryGroup } from "@/components/category-select";
import ReconnectGoogle from "@/components/reconnect-google";
import { formatHours, hoursBetween } from "@/lib/hours";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { assignCategory } from "./actions";

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
        <p className="mt-2 text-stone-600">This week&apos;s events that still need a job.</p>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && <ReconnectGoogle />}

        {sync?.status === "ok" && (
          <InboxList timeZone={sync.timeZone} start={sync.week.start} end={sync.week.end} />
        )}
      </main>
    </div>
  );
}

type InboxListProps = {
  timeZone: string;
  start: Date;
  end: Date;
};

async function InboxList({ timeZone, start, end }: InboxListProps) {
  const supabase = await createClient();

  const [eventsResult, groupsResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_at, end_at, calendar:tracked_calendars(name)")
      .is("category_id", null)
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString())
      .order("start_at"),
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  const events = eventsResult.data;
  const categoryGroups = groupsResult.data;

  if (events.length === 0) {
    return (
      <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="font-semibold">Inbox zero</p>
        <p className="mt-2 text-sm text-stone-600">Every event this week has a job.</p>
      </section>
    );
  }

  // Group events that share a title, like a recurring "code" block
  const eventsByTitle = new Map<string, typeof events>();
  for (const event of events) {
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
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section className="mt-10">
      <p className="text-sm text-stone-500">
        {events.length} {events.length === 1 ? "event" : "events"} to sort
      </p>

      <ul className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
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