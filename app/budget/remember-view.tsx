"use client";

import { useEffect } from "react";
import { VIEW_COOKIE } from "@/lib/plan-view";

// Remembers the view being shown, so /budget opens on it next time. Renders nothing.
export default function RememberView({ view }: { view: "calendar" | "grid" }) {
  useEffect(() => {
    // A year; SameSite=Lax is the browser default, written out to be clear
    document.cookie = `${VIEW_COOKIE}=${view}; path=/; max-age=31536000; SameSite=Lax`;
  }, [view]);
  return null;
}