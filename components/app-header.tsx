import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";
import SyncStatus from "@/components/sync-status";
import { createClient } from "@/lib/supabase/server";

type AppHeaderProps = {
  email: string | undefined;
};

const PAGES = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/budget", label: "Plan" },
  { href: "/trends", label: "Trends" },
  { href: "/categories", label: "Categories" },
  { href: "/calendars", label: "Calendars" },
];

// The inbox tray icon
function InboxIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4" aria-hidden="true">
      <path d="M3 11.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15v-3.5" />
      <path d="M3 11.5 5 4.5h10l2 7h-4a3 3 0 0 1-6 0H3Z" strokeLinejoin="round" />
    </svg>
  );
}

// The bar on every page. Wide screens show every page by name, then the Inbox, the sync icon
// and Sign out. Phones show the logo, the Inbox, the sync icon and a menu button; the menu
// lists the pages, your email and Sign out.
export default async function AppHeader({ email }: AppHeaderProps) {
  // How many events still need a category, for the Inbox button
  const supabase = await createClient();
  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .is("category_id", null);
  const toSort = count ?? 0;

  const badge =
    toSort > 0 ? (
      <span className="min-w-5 rounded-full bg-stone-600 px-1.5 text-center text-xs leading-5 text-white">
        {toSort > 99 ? "99+" : toSort}
      </span>
    ) : null;

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 md:py-4 xl:max-w-7xl 2xl:max-w-[88rem]">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="whitespace-nowrap font-semibold tracking-tight">
            Time Ledger
          </Link>

          {/* Wide screens: every page by name */}
          <nav className="hidden items-center gap-4 text-sm text-stone-600 md:flex">
            {PAGES.map((page) => (
              <Link key={page.href} href={page.href} className="whitespace-nowrap hover:text-stone-900">
                {page.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* The Inbox and the sync icon (once, at every width), then Sign out or the phone menu */}
        <div className="flex items-center gap-1 whitespace-nowrap md:gap-3">
          <Link
            href="/inbox"
            aria-label={toSort > 0 ? `Inbox, ${toSort} to sort` : "Inbox"}
            className="flex h-9 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200 md:h-auto md:py-1 md:pl-2.5 md:pr-1.5"
          >
            <InboxIcon />
            <span className="hidden md:inline">Inbox</span>
            {badge ?? <span className="hidden pr-1 md:inline" />}
          </Link>
          <SyncStatus />

          {/* Wide screens: email (widest only) and Sign out */}
          <span className="ml-2 hidden text-sm text-stone-500 xl:inline">{email}</span>
          <div className="hidden md:block">
            <SignOutButton />
          </div>

          {/* Phones: a menu with the pages, your email and Sign out. A details element opens
              and closes it without any script. */}
          <details className="group relative md:hidden">
            <summary
              aria-label="Menu"
              className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 [&::-webkit-details-marker]:hidden"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5" aria-hidden="true">
                <path className="group-open:hidden" d="M3.5 6h13M3.5 10h13M3.5 14h13" strokeLinecap="round" />
                <path className="hidden group-open:block" d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </summary>
            <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
              <nav className="flex flex-col">
                {PAGES.map((page) => (
                  <Link key={page.href} href={page.href} className="rounded-lg px-3 py-2.5 text-sm text-stone-700 hover:bg-stone-100">
                    {page.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-2 border-t border-stone-100 px-3 pt-3 pb-1">
                <p className="truncate text-xs text-stone-500">{email}</p>
                <div className="mt-2">
                  <SignOutButton />
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
