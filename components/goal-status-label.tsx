import type { GoalStatus } from "@/lib/goals";

// A goal's status as quiet gray text with a small colored dot:
// teal when things are fine, amber when something needs attention, gray for plain information.
// Over a limit gets a gray dot.
export default function GoalStatusLabel({ status }: { status: GoalStatus }) {
  const dot =
    status.tone === "over" || status.tone === "quiet"
      ? "bg-stone-300"
      : status.tone === "attention"
        ? "bg-amber-500"
        : "bg-accent";
  return (
    <span className={`inline-flex items-center gap-1.5 text-stone-500`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {status.text}
    </span>
  );
}