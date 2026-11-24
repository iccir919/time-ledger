import type { GoalDirection } from "@/lib/goals";

type GoalBarProps = {
  goal: number;
  done: number;
  // Planned hours still ahead (after now)
  ahead: number;
  direction?: GoalDirection;
  color: string;
  className?: string;
};

// A week's progress toward a goal. Used by the Plan grid and the dashboard.
// Solid = done, light = planned ahead, and a black line marks the goal.
// Going past the line is striped in the category's color, for both min goals (extra) and
// max goals (over the limit); the status text under the bar says which.
export default function GoalBar({ goal, done, ahead, color, className = "" }: GoalBarProps) {
  const past = Math.max(done - goal, 0);
  const doneToGoal = Math.min(done, goal);
  const aheadToGoal = Math.min(ahead, Math.max(goal - done, 0));
  // Leave a little room past the line when something went over, so the line stays visible
  const total = Math.max(goal, done + aheadToGoal, 0.01) * (past > 0 ? 1.08 : 1);
  const percent = (hours: number) => `${(hours / total) * 100}%`;

  return (
    <div className={`relative h-2 rounded-full bg-stone-100 ${className}`}>
      <span
        className="absolute inset-y-0 left-0 rounded-l-full"
        style={{ width: percent(doneToGoal), backgroundColor: color }}
      />
      <span
        className="absolute inset-y-0"
        style={{ left: percent(doneToGoal), width: percent(aheadToGoal), backgroundColor: `${color}55` }}
      />
      {past > 0 && (
        <span
          className="absolute inset-y-0 rounded-r-full"
          style={{
            left: percent(goal),
            width: percent(past),
            background: `repeating-linear-gradient(135deg, ${color} 0 3px, ${color}66 3px 6px)`,
          }}
        />
      )}
      {/* The goal line */}
      <span className="absolute -inset-y-0.5 border-l-2 border-stone-700" style={{ left: percent(goal) }} />
    </div>
  );
}