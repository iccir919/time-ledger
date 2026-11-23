// Every copy of Time Ledger (local and production) names its Plan calendar starting with this
export const PLAN_CALENDAR_BASE_NAME = "Time Ledger Plan";

// The name this copy of the app uses when it creates a Plan calendar.
// Set PLAN_CALENDAR_NAME in .env.development.local (e.g. "Time Ledger Plan (dev)") so the
// local app's calendar never looks like production's in Google Calendar.
export const PLAN_CALENDAR_NAME = process.env.PLAN_CALENDAR_NAME || PLAN_CALENDAR_BASE_NAME;

// True for any calendar some copy of Time Ledger made, e.g. "Time Ledger Plan (dev)"
export function looksLikePlanCalendar(name: string) {
  return name.startsWith(PLAN_CALENDAR_BASE_NAME);
}