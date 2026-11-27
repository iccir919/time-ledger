import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";
import SyncStatus from "@/components/sync-status";
import { createClient } from "@/lib/supabase/server";

type AppHeaderProps = {
  email: string | undefined;
};

export default async function AppHeader({ email }: AppHeaderProps) {
  // How many events still need a category, for the Inbox button
  const supabase = await createClient();
  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .is("category_id", null);
  const toSort = count ?? 0;

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4 xl:max-w-7xl 2xl:max-w-[88rem]">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="whitespace-nowrap font-semibold tracking-tight">
            Time Ledger
          </Link>
          <nav className="flex items-center gap-4 text-sm text-stone-600">
            <Link href="/dashboard" className="hover:text-stone-900">
              Dashboard
            </Link>
            <Link href="/budget" className="hover:text-stone-900">
              Plan
            </Link>
            <Link href="/trends" className="hover:text-stone-900">
              Trends
            </Link>
            <Link href="/categories" className="hover:text-stone-900">
              Categories
            </Link>
            <Link href="/calendars" className="hover:text-stone-900">
              Calendars
            </Link>
            {/* Inbox as a rounded button, like a mail inbox, with how many events are waiting */}
            <Link
              href="/inbox"
              className="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pl-2.5 pr-1.5 font-medium text-stone-700 transition-colors hover:bg-stone-200"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4" aria-hidden="true">
                <path d="M3 11.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15v-3.5" />
                <path d="M3 11.5 5 4.5h10l2 7h-4a3 3 0 0 1-6 0H3Z" strokeLinejoin="round" />
              </svg>
              Inbox
              {toSort > 0 ? (
                <span className="min-w-5 rounded-full bg-stone-600 px-1.5 text-center text-xs leading-5 text-white">
                  {toSort > 99 ? "99+" : toSort}
                </span>
              ) : (
                <span className="pr-1" />
              )}
            </Link>
            {/* A small sync icon: syncs in the background, hover for when, click to sync now */}
            <SyncStatus />
          </nav>
        </div>
        <div className="flex items-center gap-4 whitespace-nowrap">
          {/* Only on wide screens: it's the least needed thing up here */}
          <span className="hidden text-sm text-stone-500 xl:inline">{email}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}