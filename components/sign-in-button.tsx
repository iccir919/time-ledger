"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {loading ? "Redirecting to Google..." : "Continue with Google"}
    </button>
  );
}