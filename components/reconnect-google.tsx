import SignInButton from "@/components/sign-in-button";

export default function ReconnectGoogle() {
  return (
    <section className="mt-10 rounded-xl border border-stone-200 bg-white p-8">
      <h2 className="font-semibold">Reconnect Google Calendar</h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Time Ledger needs permission to read your calendars. Sign in with Google
        again to reconnect.
      </p>
      <div className="mt-6 max-w-xs">
        <SignInButton />
      </div>
    </section>
  );
}