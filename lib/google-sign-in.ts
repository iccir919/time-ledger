import { createClient } from "@/lib/supabase/client";

// Send the user to Google to sign in (or reconnect), asking for the calendar permissions
// Time Ledger needs. Resolves only if it couldn't start (otherwise the page leaves).
export async function signInWithGoogle() {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      // Read all calendars; create and manage only calendars Time Ledger makes
      scopes:
        "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.app.created",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
  return { error };
}
