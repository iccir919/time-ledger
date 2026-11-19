import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type GoogleCalendar = {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
};

// Trade the saved refresh token for a fresh access token.
// Returns null if there's no token or Google rejects it (the user needs to reconnect).
export async function getGoogleAccessToken(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
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

  const json = (await response.json()) as { access_token: string };
  return json.access_token;
}

export async function listGoogleCalendars(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar error: ${response.status}`);
  }

  const json = (await response.json()) as { items: GoogleCalendar[] };
  return json.items;
}