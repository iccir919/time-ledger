import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import SignInButton from "@/components/sign-in-button";
import { syncRecentWeeks, type SyncResult } from "@/lib/sync-events";
import { formatHours, hoursBetween } from "@/lib/hours";
import WeekNav from "@/components/week-nav";
import { getWeekInRange, type Week } from "@/lib/week";

type DashboardProps = {
  searchParams: Promise<{ week?: string }>;
};

export default async function Dashboard({ searchParams }: DashboardProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const fullName = user.user_metadata.full_name as string | undefined;
  const firstName = fullName?.split(" ")[0] ?? user.email;

  // Pull recent events from Google. If it fails, still show the page.
  let sync: SyncResult | null = null;
  try {
    sync = await syncRecentWeeks(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  // The week being viewed, from the URL (?week=2026-11-23); defaults to this week
  const { week: weekParam } = await searchParams;
  const week =
    sync?.status === "ok"
      ? getWeekInRange(sync.timeZone, weekParam, { weeksBack: 1, weeksAhead: 0 })
      : null;

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
        <p className="mt-2 text-stone-600">Here&apos;s where your hours are going.</p>

        {sync === null && (
          <p className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t sync with Google Calendar right now. Try refreshing the page.
          </p>
        )}

        {sync?.status === "reconnect" && (
          <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
            <h2 className="font-semibold">Reconnect Google Calendar</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Time Ledger needs permission to read your calendars. Sign in with Google again to
              reconnect.
            </p>
            <div className="mt-6 max-w-xs">
              <SignInButton />
            </div>
          </section>
        )}

        {sync?.status === "ok" && week && (
          <>
            <WeekNav basePath="/dashboard" week={week} timeZone={sync.timeZone} />
            <WeekEvents timeZone={sync.timeZone} week={week} />
          </>
        )}
      </main>
    </div>
  );
}

type WeekEventsProps = {
  timeZone: string;
  week: Week;
};

async function WeekEvents({ timeZone, week }: WeekEventsProps) {
  const supabase = await createClient();
  const { start, end } = week;

  const [calendarsResult, eventsResult] = await Promise.all([
    supabase.from("tracked_calendars").select("id", { count: "exact", head: true }),
    supabase
      .from("events")
      .select("id, title, start_at, end_at, category:categories(name, color)")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString())
      .order("start_at"),
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  if (!calendarsResult.count) {
    return (
      <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
        <h2 className="font-semibold">No calendars tracked yet</h2>
        <p className="mt-2 text-sm text-stone-600">
          <Link href="/calendars" className="font-medium text-accent hover:underline">
            Choose which calendars to track
          </Link>{" "}
          and their events will show up here.
        </p>
      </section>
    );
  }

  const events = eventsResult.data;
  const totalHours = events.reduce(
    (sum, event) => sum + hoursBetween(event.start_at, event.end_at),
    0
  );
  const uncategorized = events.filter((event) => !event.category).length;

  // Format dates and times in the user's own time zone
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });

  // Group events by day
  const days = new Map<string, typeof events>();
  for (const event of events) {
    const day = dayLabel.format(new Date(event.start_at));
    days.set(day, [...(days.get(day) ?? []), event]);
  }

  return (
    <section className="mt-6">
      <p className="text-sm text-stone-500">Times shown in {timeZone}</p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Tracked</p>
          <p className="mt-1 font-mono text-3xl font-semibold text-accent">
            {formatHours(totalHours)}
          </p>
        </div>
        <Link
          href={`/inbox?week=${week.weekStart}`}
          className="rounded-xl border border-stone-200 bg-white p-5 transition-colors hover:border-accent"
        >
          <p className="text-sm text-stone-500">Need a category</p>
          <p className="mt-1 font-mono text-3xl font-semibold">{uncategorized}</p>
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-stone-600">No events in your tracked calendars this week.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {[...days.entries()].map(([day, dayEvents]) => (
            <div key={day}>
              <h3 className="text-sm font-medium text-stone-500">{day}</h3>
              <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                {dayEvents.map((event) => (
                  <li key={event.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                    <span className="w-20 shrink-0 text-stone-500">
                      {timeLabel.format(new Date(event.start_at))}
                    </span>
                    <span className="flex-1">{event.title}</span>
                    {event.category ? (
                      <span className="flex items-center gap-2 text-stone-600">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: event.category.color }}
                        />
                        {event.category.name}
                      </span>
                    ) : (
                      <span className="text-stone-400">Uncategorized</span>
                    )}
                    <span className="w-12 text-right font-mono text-stone-500">
                      {formatHours(hoursBetween(event.start_at, event.end_at))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}