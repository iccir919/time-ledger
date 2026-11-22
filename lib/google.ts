import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type GoogleCalendar = {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
};

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

const FIVE_MINUTES = 5 * 60 * 1000;

// Thrown when Google rejects an access token (HTTP 401)
export class GoogleAuthError extends Error {}

// Thrown for any other failed Google request, with its HTTP status.
// 403 usually means a missing permission; 404 means not found.
export class GoogleApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`Google Calendar error: ${status}`);
    this.status = status;
  }
}

// Get a Google access token for this user.
// Reuses the cached one if it's still good; otherwise trades the refresh token for a new one.
// Returns null if the user needs to reconnect Google.
export async function getGoogleAccessToken(
  userId: string,
  options: { forceRefresh?: boolean } = {}
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_tokens")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  // Reuse the cached access token if it's good for at least 5 more minutes
  if (
    !options.forceRefresh &&
    data.access_token &&
    data.access_token_expires_at &&
    new Date(data.access_token_expires_at).getTime() - Date.now() > FIVE_MINUTES
  ) {
    return data.access_token;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const { error: saveError } = await admin
    .from("google_tokens")
    .update({
      access_token: json.access_token,
      access_token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      // Google rarely sends a new refresh token here, but save it if it does
      ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (saveError) {
    console.error("Could not cache Google access token:", saveError.message);
  }

  return json.access_token;
}

// Run a Google request with this user's access token.
// Returns null if the user needs to reconnect Google.
// If Google rejects a cached token, tries once more with a fresh one.
export async function withGoogleAccessToken<T>(
  userId: string,
  request: (accessToken: string) => Promise<T>
): Promise<T | null> {
  async function attempt(forceRefresh: boolean) {
    const accessToken = await getGoogleAccessToken(userId, { forceRefresh });
    if (!accessToken) {
      return null;
    }
    return await request(accessToken);
  }

  try {
    return await attempt(false);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return await attempt(true);
    }
    throw error;
  }
}

// Shared helper for requests to the Google Calendar API
async function googleRequest<T>(
  accessToken: string,
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new GoogleAuthError("Google rejected the access token");
  }

  if (!response.ok) {
    throw new GoogleApiError(response.status);
  }

  // Some requests, like deleting, succeed with an empty response
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function listGoogleCalendars(accessToken: string) {
  const data = await googleRequest<{ items: GoogleCalendar[] }>(
    accessToken,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList"
  );
  return data.items;
}

// The time zone set in the user's Google Calendar, e.g. "America/Los_Angeles"
export async function getGoogleTimeZone(accessToken: string) {
  const data = await googleRequest<{ value: string }>(
    accessToken,
    "https://www.googleapis.com/calendar/v3/users/me/settings/timezone"
  );
  return data.value;
}

// Events in one calendar between two times.
// singleEvents=true expands repeating events into individual ones.
export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
) {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });

  const data = await googleRequest<{ items: GoogleEvent[] }>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  );
  return data.items;
}

// Create a new calendar owned by the user and return its ID.
// Needs the calendar.app.created permission.
export async function createGoogleCalendar(accessToken: string, name: string, timeZone: string) {
  const data = await googleRequest<{ id: string }>(
    accessToken,
    "https://www.googleapis.com/calendar/v3/calendars",
    { method: "POST", body: { summary: name, timeZone } }
  );
  return data.id;
}

// Delete a calendar Time Ledger created, along with all its events.
// Needs the calendar.app.created permission.
export async function deleteGoogleCalendar(accessToken: string, calendarId: string) {
  await googleRequest<void>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
    { method: "DELETE" }
  );
}

export type NewGoogleEvent = {
  summary: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties?: { private?: Record<string, string> };
};

// Add an event to a calendar. Returns the new event's id.
export async function insertGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: NewGoogleEvent
) {
  const data = await googleRequest<{ id: string }>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: event }
  );
  return data.id;
}