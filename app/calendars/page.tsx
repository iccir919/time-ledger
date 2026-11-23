import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import SignInButton from "@/components/sign-in-button";
import { getGoogleAccessToken, listGoogleCalendars } from "@/lib/google";
import { looksLikePlanCalendar, PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";
import {
  createPlanCalendar,
  deletePlanCalendar,
  saveTrackedCalendars,
  stopUsingPlanCalendar,
} from "./actions";

type CalendarsPageProps = {
  searchParams: Promise<{ saved?: string; plan?: string }>;
};

export default async function CalendarsPage({ searchParams }: CalendarsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { saved, plan } = await searchParams;
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

  // Load Google calendars, saved choices, categories, and settings at the same time
  const [calendars, trackedResult, groupsResult, settingsResult] = await Promise.all([
    listGoogleCalendars(accessToken),
    supabase
      .from("tracked_calendars")
      .select("google_calendar_id, name, default_category_id"),
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase.from("user_settings").select("plan_calendar_id").maybeSingle(),
  ]);

  if (trackedResult.error) {
    throw new Error(trackedResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }
  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  // Tracked calendars that were deleted in Google. Saving the form stops tracking them.
  const missingCalendars = trackedResult.data.filter(
    (row) => !calendars.some((calendar) => calendar.id === row.google_calendar_id)
  );

  // Look up saved choices by Google calendar ID
  const tracked = new Map(
    trackedResult.data.map((row) => [row.google_calendar_id, row.default_category_id])
  );
  const groups = groupsResult.data;

  // The Plan calendar only counts if it's still in the user's Google account
  const savedPlanId = settingsResult.data?.plan_calendar_id ?? null;
  const planCalendarId = calendars.some((calendar) => calendar.id === savedPlanId)
    ? savedPlanId
    : null;

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        <p className="mt-2 text-stone-600">
          Check the calendars that count toward your time budget. A default
          category sorts that calendar&apos;s events automatically.
        </p>

        {missingCalendars.length > 0 && (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {missingCalendars.length === 1 ? "This calendar was" : "These calendars were"} deleted
            in Google but {missingCalendars.length === 1 ? "is" : "are"} still being tracked:{" "}
            <span className="font-medium">{missingCalendars.map((row) => row.name).join(", ")}</span>.
            Click Save to stop tracking {missingCalendars.length === 1 ? "it" : "them"}.
          </p>
        )}

        <form action={saveTrackedCalendars} className="mt-10">
          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {calendars.map((calendar) => {
              const name = calendar.summaryOverride ?? calendar.summary;
              const checkboxId = `calendar-${calendar.id}`;
              const isPlanCalendar = calendar.id === planCalendarId;
              // A Plan calendar made by another copy of Time Ledger (e.g. local vs production).
              // Plan calendars hold plans, not time spent, so neither kind can be tracked.
              const isOtherPlanCalendar = !isPlanCalendar && looksLikePlanCalendar(calendar.summary);
              const cannotTrack = isPlanCalendar || isOtherPlanCalendar;

              return (
                <div key={calendar.id} className="flex items-center gap-4 px-5 py-3">
                  <input
                    type="checkbox"
                    id={checkboxId}
                    name="calendar_id"
                    value={calendar.id}
                    defaultChecked={tracked.has(calendar.id) && !cannotTrack}
                    disabled={cannotTrack}
                    className="size-4 accent-accent disabled:opacity-40"
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
                      {isPlanCalendar && (
                        <span className="ml-2 text-xs text-accent">this app&apos;s plan calendar</span>
                      )}
                      {isOtherPlanCalendar && (
                        <span className="ml-2 text-xs text-stone-400">
                          from another copy of Time Ledger, not used here
                        </span>
                      )}
                    </span>
                  </label>
                  <select
                    disabled={cannotTrack}
                    name={`default:${calendar.id}`}
                    defaultValue={tracked.get(calendar.id) ?? ""}
                    aria-label={`Default category for ${name}`}
                    className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-stone-700 disabled:opacity-40"
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

        {/* Plan calendar */}
        <section className="mt-14">
          <h2 className="font-semibold">Plan calendar</h2>

          {planCalendarId ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Your <span className="font-medium text-stone-900">{PLAN_CALENDAR_NAME}</span>{" "}
                calendar is in Google Calendar. Blocks titled with a category name, like
                &ldquo;Learning&rdquo;, show up on the Plan page as planned hours. You can also add
                them from the Plan page&apos;s Calendar view. Its events never count as tracked time.
              </p>

              {/* Removing it: two choices, shown only when asked for */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-stone-500 hover:text-stone-800">
                  Remove Plan calendar
                </summary>
                <div className="mt-3 space-y-4 rounded-xl border border-stone-200 bg-white p-5">
                  <p className="text-sm text-stone-600">
                    Plans already in your grid stay either way.
                  </p>

                  <form action={stopUsingPlanCalendar} className="flex items-center justify-between gap-4">
                    <p className="text-sm text-stone-600">
                      <span className="font-medium text-stone-900">Stop using it.</span> It stays
                      in Google Calendar with its blocks.
                    </p>
                    <button className="shrink-0 rounded-md border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50">
                      Stop using
                    </button>
                  </form>

                  <form action={deletePlanCalendar} className="flex items-center justify-between gap-4">
                    <p className="text-sm text-stone-600">
                      <span className="font-medium text-stone-900">Delete it.</span> Removes the
                      calendar and all its blocks from Google Calendar. This can&apos;t be undone.
                    </p>
                    <button className="shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50">
                      Delete from Google
                    </button>
                  </form>
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Plan with exact times. Time Ledger will create a calendar called &ldquo;
                {PLAN_CALENDAR_NAME}&rdquo; in your Google account. It can only change that
                calendar, never your others.
              </p>
              <form action={createPlanCalendar} className="mt-4">
                <input type="hidden" name="return_to" value="/calendars" />
                <button className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
                  Create {PLAN_CALENDAR_NAME} calendar
                </button>
              </form>
            </>
          )}

          {plan === "created" && planCalendarId && (
            <p className="mt-4 text-sm text-accent">
              Created. It may take a moment to appear in Google Calendar.
            </p>
          )}

          {plan === "stopped" && (
            <p className="mt-4 text-sm text-accent">
              Time Ledger stopped using the Plan calendar. It&apos;s still in Google Calendar.
            </p>
          )}

          {plan === "deleted" && (
            <p className="mt-4 text-sm text-accent">
              Deleted the Plan calendar from Google Calendar.
            </p>
          )}

          {plan === "needs_permission" && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Time Ledger needs permission to manage its calendar. Sign out, sign back in, and
              approve the new permission on Google&apos;s screen, then try again.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}