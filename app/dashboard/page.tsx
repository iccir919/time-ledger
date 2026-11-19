import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import SignInButton from "@/components/sign-in-button";
import { syncCurrentWeek, type SyncResult } from "@/lib/sync-events";

function hoursBetween(startAt: string, endAt: string) {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000;
}

function formatHours(hours: number) {
  return `${Number(hours.toFixed(2))}h`;
}

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const fullName = user.user_metadata.full_name as string | undefined;
  const firstName = fullName?.split(" ")[0] ?? user.email;

  // Pull this week's events from Google. If it fails, still show the page.
  let sync: SyncResult | null = null;
  try {
    sync = await syncCurrentWeek(user.id);
  } catch (error) {
    console.error("Sync failed:", error);
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
        <p className="mt-2 text-stone-600">Here&apos;s where this week&apos;s hours are going.</p>

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

        {sync?.status === "ok" && (
          <ThisWeek timeZone={sync.timeZone} start={sync.week.start} end={sync.week.end} />
        )}
      </main>
    </div>
  );
}

type ThisWeekProps = {
  timeZone: string;
  start: Date;
  end: Date;
};

async function ThisWeek({ timeZone, start, end }: ThisWeekProps) {
  const supabase = await createClient();

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
  const shortDate = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
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

  const lastDay = new Date(end.getTime() - 1);

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">
          This week: {shortDate.format(start)} to {shortDate.format(lastDay)}
        </h2>
        <p className="text-sm text-stone-500">{timeZone}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Tracked</p>
          <p className="mt-1 font-mono text-3xl font-semibold text-accent">
            {formatHours(totalHours)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Need a category</p>
          <p className="mt-1 font-mono text-3xl font-semibold">{uncategorized}</p>
        </div>
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