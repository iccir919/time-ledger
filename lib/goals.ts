import { formatHours } from "@/lib/hours";

// How goals are judged, shared by the Plan grid and the dashboard.
// "ahead" means plan time still after now: once a plan's time passes,
// the done hours already say what happened, so past plans don't count.

// "good" shows a teal dot, "attention" an amber one. The text itself stays gray.
export type GoalStatus = { text: string; tone: "good" | "attention" };

// One category's week. goal 0 is a limit, not something to work toward.
export function goalStatus(goal: number, done: number, ahead: number): GoalStatus {
  if (goal === 0) {
    return done > 0
      ? { text: `${formatHours(done)} over`, tone: "attention" }
      : { text: "Within limit", tone: "good" };
  }
  if (done >= goal) {
    return { text: "Goal met", tone: "good" };
  }
  const needs = goal - done - ahead;
  return needs > 0
    ? { text: `Needs ${formatHours(needs)} scheduled`, tone: "attention" }
    : { text: "On track", tone: "good" };
}

export type GoalProgress = {
  // Hours toward goals, each category counted only up to its goal
  done: number;
  // Planned hours that still count, again only up to what each goal still needs
  ahead: number;
  // The goals added up (limits of 0 left out)
  total: number;
  // How many goals (above 0) went into this
  count: number;
  status: GoalStatus;
};

// All goals together, for a header. null when there are no goals above 0.
// Each category counts only up to its own goal, so extra time in one
// can't hide a shortfall in another.
export function goalProgress(rows: { goal: number; done: number; ahead: number }[]): GoalProgress | null {
  const goals = rows.filter((row) => row.goal > 0);
  if (goals.length === 0) {
    return null;
  }

  let done = 0;
  let ahead = 0;
  let total = 0;
  let needs = 0;
  for (const row of goals) {
    const countedDone = Math.min(row.done, row.goal);
    const countedAhead = Math.min(row.ahead, row.goal - countedDone);
    done += countedDone;
    ahead += countedAhead;
    total += row.goal;
    needs += row.goal - countedDone - countedAhead;
  }

  const status: GoalStatus =
    done >= total
      ? { text: "Goals met", tone: "good" }
      : needs > 0
        ? { text: `Needs ${formatHours(needs)} scheduled`, tone: "attention" }
        : { text: "On track", tone: "good" };

  return { done, ahead, total, count: goals.length, status };
}