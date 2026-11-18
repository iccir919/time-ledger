import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const fullName = user.user_metadata.full_name as string | undefined;
  const firstName = fullName?.split(" ")[0] ?? user.email;

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <span className="font-semibold tracking-tight">Time Ledger</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-500">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {firstName}
        </h1>
        <p className="mt-2 text-stone-600">
          Let&apos;s give this week&apos;s hours a job.
        </p>

        <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
          <p className="text-sm text-stone-500">Ready to assign</p>
          <p className="mt-1 font-mono text-4xl font-semibold text-accent">
            168 hours
          </p>
          <p className="mt-4 text-sm text-stone-600">
            Next: pick which calendars to track and create your first
            categories.
          </p>
        </section>
      </main>
    </div>
  );
}