import type { GoalStatus } from "@/lib/goals";

// A goal's status as quiet gray text with a small colored dot:
// teal when things are fine, amber when something needs attention.
// Over a limit is rose, text and dot, so it stands apart from a to-do.
export default function GoalStatusLabel({ status }: { status: GoalStatus }) {
  const dot = status.tone === "over" ? "bg-rose-500" : status.tone === "attention" ? "bg-amber-500" : "bg-accent";
  return (
    <span className={`inline-flex items-center gap-1.5 ${status.tone === "over" ? "text-rose-600" : "text-stone-500"}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {status.text}
    </span>
  );
}