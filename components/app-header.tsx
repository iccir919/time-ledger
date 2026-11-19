import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";

type AppHeaderProps = {
  email: string | undefined;
};

export default function AppHeader({ email }: AppHeaderProps) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Time Ledger
          </Link>
          <nav className="flex items-center gap-4 text-sm text-stone-600">
            <Link href="/dashboard" className="hover:text-stone-900">
              Dashboard
            </Link>
            <Link href="/categories" className="hover:text-stone-900">
              Categories
            </Link>
            <Link href="/calendars" className="hover:text-stone-900">
              Calendars
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-stone-500">{email}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}