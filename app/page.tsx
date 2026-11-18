import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignInButton from "@/components/sign-in-button";

type HomeProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">
          Time Ledger
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Give every hour a job.
        </h1>
        <p className="mt-3 leading-relaxed text-stone-600">
          Plan your week by category, then see where your time actually went,
          straight from Google Calendar.
        </p>

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Sign-in didn&apos;t complete. Please try again.
          </p>
        )}

        <div className="mt-8">
          <SignInButton />
        </div>

        <p className="mt-4 text-xs text-stone-500">
          Read-only access. Time Ledger never changes your calendar.
        </p>
      </div>
    </main>
  );
}