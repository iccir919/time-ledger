// Every copy of Time Ledger (local and production) names its Log calendar starting with this
export const LOG_CALENDAR_BASE_NAME = "Time Ledger Log";

// The name this copy of the app uses when it creates a Log calendar.
// Set LOG_CALENDAR_NAME in .env.development.local (e.g. "Time Ledger Log (dev)") so the
// local app's calendar never looks like production's in Google Calendar.
export const LOG_CALENDAR_NAME = process.env.LOG_CALENDAR_NAME || LOG_CALENDAR_BASE_NAME;