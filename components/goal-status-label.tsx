import type { GoalStatus } from "@/lib/goals";

// A goal's status as quiet gray text with a small colored dot:
// teal when things are fine, amber when something needs attention.
export default function GoalStatusLabel({ status }: { status: GoalStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-stone-500">
      <span
        className={`size-1.5 shrink-0 rounded-full ${status.tone === "attention" ? "bg-amber-500" : "bg-accent"}`}
      />
      {status.text}
    </span>
  );
}