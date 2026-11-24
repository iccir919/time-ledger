import { formatHours } from "@/lib/hours";

// How goals are judged, shared by the Plan grid and the dashboard.
// "ahead" means plan time still after now: once a plan's time passes,
// the done hours already say what happened, so past plans don't count.

// Each week's goal points one way: "at least" (work toward it; going past is extra)
// or "at most" (a limit; going past is over). A goal of 0 is always "at most".
export type GoalDirection = "at_least" | "at_most";

export function directionOf(goal: number, direction: GoalDirection | null | undefined): GoalDirection {
  return goal === 0 ? "at_most" : (direction ?? "at_least");
}

// "good" shows a teal dot and "attention" an amber one, with gray text.
// "over" (past an "at most" limit) is rose, dot and text, so it stands apart.
// "quiet" is a gray dot: plain information, like how many hours are still to go.
export type GoalStatus = { text: string; tone: "good" | "attention" | "over" | "quiet" };

// One category's week
export function goalStatus(
  goal: number,
  done: number,
  ahead: number,
  direction: GoalDirection = "at_least"
): GoalStatus {
  if (directionOf(goal, direction) === "at_most") {
    if (done > goal) {
      return { text: `${formatHours(done - goal)} over limit`, tone: "over" };
    }
    if (done + ahead > goal) {
      return { text: `Plans go ${formatHours(done + ahead - goal)} over`, tone: "attention" };
    }
    return goal === 0
      ? { text: "Within limit", tone: "good" }
      : { text: `${formatHours(goal - done)} left`, tone: "good" };
  }
  if (done > goal) {
    return { text: `Goal met · ${formatHours(done - goal)} extra`, tone: "good" };
  }
  if (done === goal) {
    return { text: "Goal met", tone: "good" };
  }
  // Short of the goal and the plans don't cover it: say how much is left to do
  return goal - done - ahead > 0
    ? { text: `${formatHours(goal - done)} to go`, tone: "quiet" }
    : { text: "On track", tone: "good" };
}

export type GoalProgress = {
  // Hours toward goals, each category counted only up to its goal
  done: number;
  // Planned hours that still count, again only up to what each goal still needs
  ahead: number;
  // The "at least" goals added up (limits are left out: they aren't something to fill)
  total: number;
  // How many goals went into this
  count: number;
  status: GoalStatus;
};

// All "at least" goals together, for a header. null when there are none.
// Each category counts only up to its own goal, so extra time in one
// can't hide a shortfall in another.
export function goalProgress(
  rows: { goal: number; done: number; ahead: number; direction?: GoalDirection }[]
): GoalProgress | null {
  const goals = rows.filter((row) => row.goal > 0 && directionOf(row.goal, row.direction) === "at_least");
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
        ? { text: `${formatHours(total - done)} to go`, tone: "quiet" }
        : { text: "On track", tone: "good" };

  return { done, ahead, total, count: goals.length, status };
}
// The "at most" goals that went over, for a callout: name and how far over
export function overLimits<T extends { goal: number; done: number; direction?: GoalDirection }>(rows: T[]) {
  return rows.filter((row) => directionOf(row.goal, row.direction) === "at_most" && row.done > row.goal);
}