import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";

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
      <AppHeader email={user.email} />

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
            Next:{" "}
            <Link
              href="/categories"
              className="font-medium text-accent hover:underline"
            >
              set up your categories
            </Link>
            , then pick which calendars to track.
          </p>
        </section>
      </main>
    </div>
  );
}