"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/google-sign-in";

export default function SignInButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const { error } = await signInWithGoogle();
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
