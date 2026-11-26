import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import SignInButton from "@/components/sign-in-button";
import { getGoogleAccessToken, listGoogleCalendars, type GoogleCalendar } from "@/lib/google";
import { LOG_CALENDAR_NAME, looksLikeLogCalendar } from "@/lib/log-calendar";
import { looksLikePlanCalendar, PLAN_CALENDAR_NAME } from "@/lib/plan-calendar";
import { createLogCalendar, createPlanCalendar, deleteLogCalendar, deletePlanCalendar } from "./actions";
import CalendarList, { type CalendarRow } from "./calendar-list";

type CalendarsPageProps = {
  searchParams: Promise<{ plan?: string; log?: string; confirm?: string }>;
};

export default async function CalendarsPage({ searchParams }: CalendarsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { plan, log, confirm } = await searchParams;
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
              Time Ledger needs permission to read your calendars. Sign in with Google again to
              reconnect.
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
    supabase.from("tracked_calendars").select("google_calendar_id, name, default_category_id"),
    supabase
      .from("category_groups")
      .select("id, name, categories(id, name)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "categories" }),
    supabase.from("user_settings").select("plan_calendar_id, log_calendar_id").maybeSingle(),
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

  const tracked = new Map(trackedResult.data.map((row) => [row.google_calendar_id, row.default_category_id]));
  const inGoogle = (id: string | null) => calendars.find((calendar) => calendar.id === id) ?? null;
  const nameOf = (calendar: GoogleCalendar) => calendar.summaryOverride ?? calendar.summary;

  // This app's calendars. Saved but gone from Google means it was deleted there.
  const savedPlanId = settingsResult.data?.plan_calendar_id ?? null;
  const savedLogId = settingsResult.data?.log_calendar_id ?? null;
  const planCalendar = inGoogle(savedPlanId);
  const logCalendar = inGoogle(savedLogId);

  // Calendars another copy of Time Ledger made (local vs production). They're hidden,
  // unless this copy is somehow tracking one, so it can still be unchecked.
  const isOtherCopy = (calendar: GoogleCalendar) =>
    calendar.id !== savedPlanId &&
    calendar.id !== savedLogId &&
    (looksLikePlanCalendar(calendar.summary) || looksLikeLogCalendar(calendar.summary)) &&
    !tracked.has(calendar.id);
  const hidden = calendars.filter(isOtherCopy);

  // Your calendars: everything else in Google, then tracked ones that were deleted there
  const rows: CalendarRow[] = [
    ...calendars
      .filter((calendar) => calendar.id !== savedPlanId && calendar.id !== savedLogId && !isOtherCopy(calendar))
      .map((calendar) => ({
        id: calendar.id,
        name: nameOf(calendar),
        color: calendar.backgroundColor ?? "#a8a29e",
        primary: Boolean(calendar.primary),
        tracked: tracked.has(calendar.id),
        defaultCategoryId: tracked.get(calendar.id) ?? null,
        missing: false,
      })),
    ...trackedResult.data
      .filter(
        (row) =>
          !inGoogle(row.google_calendar_id) &&
          row.google_calendar_id !== savedPlanId &&
          row.google_calendar_id !== savedLogId
      )
      .map((row) => ({
        id: row.google_calendar_id,
        name: row.name,
        color: "#d6d3d1",
        primary: false,
        tracked: true,
        defaultCategoryId: row.default_category_id,
        missing: true,
      })),
  ];

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>

        <section className="mt-8">
          <h2 className="font-semibold">Your calendars</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            Check the ones that count toward your time. A default category sorts that calendar&apos;s
            events automatically. Changes save as you go.
          </p>
          <CalendarList calendars={rows} groups={groupsResult.data} />
        </section>

        <section className="mt-12">
          <h2 className="font-semibold">Time Ledger&apos;s calendars</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            Calendars this app makes in your Google account, so &ldquo;+ Add&rdquo; can put time there.
            It can only change these, never your others.
          </p>

          <div className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            <AppCalendar
              kind="plan"
              label="Plan"
              googleName={PLAN_CALENDAR_NAME}
              calendar={planCalendar}
              deletedInGoogle={Boolean(savedPlanId) && !planCalendar}
              inUseText="Planned time goes here. It never counts as done time."
              createAction={createPlanCalendar}
              deleteAction={deletePlanCalendar}
              deleteText="Removes the calendar and all its blocks from Google Calendar. Day plans typed into the grid stay. This can't be undone."
              confirming={confirm === "plan"}
              status={plan}
            />
            <AppCalendar
              kind="log"
              label="Log"
              googleName={LOG_CALENDAR_NAME}
              calendar={logCalendar}
              deletedInGoogle={Boolean(savedLogId) && !logCalendar}
              inUseText="Time you've done goes here, filed under its category and private. Always counted."
              createAction={createLogCalendar}
              deleteAction={deleteLogCalendar}
              deleteText="Removes the calendar and everything logged in it from Google Calendar, and that time stops counting. This can't be undone."
              confirming={confirm === "log"}
              status={log}
            />
          </div>
        </section>

        {hidden.length > 0 && (
          <p className="mt-8 text-xs text-stone-400">
            Hidden: {hidden.map(nameOf).join(", ")}, made by another copy of Time Ledger.
          </p>
        )}
      </main>
    </div>
  );
}

// Create and Delete share one size, so they line up from row to row
const ROW_BUTTON =
  "inline-flex w-16 shrink-0 items-center justify-center rounded-md border border-stone-200 py-1 text-xs font-medium text-stone-700 transition-colors";

// One of the app's calendars: in use (with Delete), or not set up (with Create)
function AppCalendar({
  kind,
  label,
  googleName,
  calendar,
  deletedInGoogle,
  inUseText,
  createAction,
  deleteAction,
  deleteText,
  confirming,
  status,
}: {
  kind: "plan" | "log";
  label: string;
  googleName: string;
  calendar: GoogleCalendar | null;
  deletedInGoogle: boolean;
  inUseText: string;
  createAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
  deleteText: string;
  confirming: boolean;
  status: string | undefined;
}) {
  const inUse = calendar !== null;

  return (
    <div className="px-5 py-3 text-sm">
      <div className="flex items-center gap-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: inUse ? (calendar.backgroundColor ?? "#a8a29e") : "#d6d3d1" }}
        />
        <div className="min-w-0 flex-1">
          <p className={inUse ? "" : "text-stone-500"}>
            {label}
            {inUse && (
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">In use</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {inUse
              ? `${inUseText} "${googleName}" in Google.`
              : deletedInGoogle
                ? `It was deleted in Google. Create a new "${googleName}" calendar?`
                : `Not set up. Creates a calendar called "${googleName}" in your Google account.`}
          </p>
        </div>

        {inUse ? (
          !confirming && (
            <Link
              href={`/calendars?confirm=${kind}`}
              scroll={false}
              className={`${ROW_BUTTON} hover:border-red-200 hover:bg-red-50 hover:text-red-700`}
            >
              Delete
            </Link>
          )
        ) : (
          <form action={createAction} className="flex shrink-0">
            <input type="hidden" name="return_to" value="/calendars" />
            <button className={`${ROW_BUTTON} hover:bg-stone-50`}>
              Create
            </button>
          </form>
        )}
      </div>

      {/* Deleting can't be undone, so it asks first */}
      {inUse && confirming && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-stone-600">{deleteText}</p>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/calendars" scroll={false} className="text-xs text-stone-500 hover:text-stone-900">
              Cancel
            </Link>
            <form action={deleteAction}>
              <button className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50">
                Delete from Google
              </button>
            </form>
          </div>
        </div>
      )}

      {status === "created" && inUse && (
        <p className="mt-2 text-xs text-accent">Created. It may take a moment to appear in Google Calendar.</p>
      )}
      {status === "deleted" && !inUse && (
        <p className="mt-2 text-xs text-accent">Deleted from Google Calendar.</p>
      )}
      {status === "needs_permission" && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Time Ledger needs permission to manage its calendars. Sign out, sign back in, and approve the
          new permission on Google&apos;s screen, then try again.
        </p>
      )}
    </div>
  );
}