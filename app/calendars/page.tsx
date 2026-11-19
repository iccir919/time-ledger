import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import SignInButton from "@/components/sign-in-button";
import { getGoogleAccessToken, listGoogleCalendars } from "@/lib/google";
import { saveTrackedCalendars } from "./actions";

type CalendarsPageProps = {
  searchParams: Promise<{ saved?: string }>;
};

export default async function CalendarsPage({ searchParams }: CalendarsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { saved } = await searchParams;
  const accessToken = await getGoogleAccessToken(user.id);

  // No usable Google token: ask the user to reconnect
  if (!accessToken) {
    return (
      <div className="min-h-screen">
        <AppHeader email={user.email} />
        <main className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
          <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
            <h2 className="font-semibold">Reconnect Google Calendar</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Time Ledger needs permission to read your calendars. Sign in with
              Google again to reconnect.
            </p>
            <div className="mt-6 max-w-xs">
              <SignInButton />
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Load Google calendars, saved choices, and categories at the same time
  const [calendars, trackedResult, groupsResult] = await Promise.all([
    listGoogleCalendars(accessToken),
    supabase
      .from("tracked_calendars")
      .select("google_calendar_id, default_category_id"),
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
  ]);

  if (trackedResult.error) {
    throw new Error(trackedResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  // Look up saved choices by Google calendar ID
  const tracked = new Map(
    trackedResult.data.map((row) => [row.google_calendar_id, row.default_category_id])
  );
  const groups = groupsResult.data;

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        <p className="mt-2 text-stone-600">
          Check the calendars that count toward your time budget. A default
          category sorts that calendar&apos;s events automatically.
        </p>

        <form action={saveTrackedCalendars} className="mt-10">
          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {calendars.map((calendar) => {
              const name = calendar.summaryOverride ?? calendar.summary;
              const checkboxId = `calendar-${calendar.id}`;

              return (
                <div key={calendar.id} className="flex items-center gap-4 px-5 py-3">
                  <input
                    type="checkbox"
                    id={checkboxId}
                    name="calendar_id"
                    value={calendar.id}
                    defaultChecked={tracked.has(calendar.id)}
                    className="size-4 accent-accent"
                  />
                  <input type="hidden" name={`name:${calendar.id}`} value={name} />
                  <label
                    htmlFor={checkboxId}
                    className="flex flex-1 items-center gap-3 text-sm"
                  >
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: calendar.backgroundColor ?? "#a8a29e" }}
                    />
                    <span>
                      {name}
                      {calendar.primary && (
                        <span className="ml-2 text-xs text-stone-400">primary</span>
                      )}
                    </span>
                  </label>
                  <select
                    name={`default:${calendar.id}`}
                    defaultValue={tracked.get(calendar.id) ?? ""}
                    aria-label={`Default category for ${name}`}
                    className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-stone-700"
                  >
                    <option value="">No default category</option>
                    {groups.map((group) => (
                      <optgroup key={group.id} label={group.name}>
                        {group.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
              Save
            </button>
            {saved && <p className="text-sm text-accent">Saved.</p>}
          </div>
        </form>
      </main>
    </div>
  );
}