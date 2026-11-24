"use client";

import { useCallback, useState } from "react";
import GoalStatusLabel from "@/components/goal-status-label";
import { goalProgress, goalStatus } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import { saveGoal } from "./actions";
import DaySheet, { type DayItem } from "./day-sheet";
import PlanBlockDialog, { type BlockDraft } from "./plan-block-dialog";
import { draftAt } from "./week-calendar";

// Columns: name, goal, days, week. Phones show 3 days, wider screens all 7.
// The name column has a max width; the week column takes the leftover space.
// (No "grid" here, so the "now" row can switch between hidden and grid; GRID adds it)
const COLUMNS =
  "items-center gap-2 grid-cols-[minmax(5.5rem,7rem)_4.5rem_repeat(3,4rem)_minmax(7.5rem,1fr)] md:grid-cols-[minmax(8rem,10rem)_5.5rem_repeat(7,minmax(4rem,5rem))_minmax(11rem,1fr)]";

const GRID = `grid ${COLUMNS}`;

type GridDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  // e.g. "Fri, Nov 27", for the popup's day picker
  label: string;
};

type GridGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

type WeekGridProps = {
  weekStart: string;
  groups: GridGroup[];
  days: GridDay[];
  // The 3 days a phone shows
  mobileDates: string[];
  today: string;
  // Weekly goals, keyed by category ID. A category with no goal isn't in here; 0 is a real goal.
  goals: Record<string, number>;
  // Hours keyed by "<categoryId>:<date>": planned (the whole day's plan),
  // plannedAhead (the part of that plan still after now), and actual (tracked)
  planned: Record<string, number>;
  plannedAhead: Record<string, number>;
  actual: Record<string, number>;
  // What happened and what's planned, keyed like the hours, for the day sheet
  details: Record<string, DayItem[]>;
  // Adding plan blocks from the day sheet needs a Plan calendar
  canAddBlocks: boolean;
  timeZone: string;
  // Minutes since midnight today, or null when today isn't in this week
  nowMinutes: number | null;
};

type SaveStatus = "saving" | "saved" | "error";

function cellKey(categoryId: string, date: string) {
  return `${categoryId}:${date}`;
}

// 2.25 -> "2.25"
function num(hours: number) {
  return String(Number(hours.toFixed(2)));
}

function goalsAsText(goals: Record<string, number>) {
  const text: Record<string, string> = {};
  for (const [categoryId, hours] of Object.entries(goals)) {
    text[categoryId] = String(hours);
  }
  return text;
}

// A bar: solid = done, light = planned. Used in the header and the week column.
function Bar({
  done,
  planned,
  total,
  color,
  className,
}: {
  done: number;
  planned: number;
  total: number;
  color: string;
  className: string;
}) {
  const percent = (hours: number) => `${Math.min(hours / total, 1) * 100}%`;

  return (
    <div className={`flex overflow-hidden rounded-full bg-stone-100 ${className}`}>
      <span style={{ width: percent(done), backgroundColor: color }} />
      <span style={{ width: percent(planned), backgroundColor: `${color}55` }} />
    </div>
  );
}

export default function WeekGrid({
  weekStart,
  groups,
  days,
  mobileDates,
  today,
  goals,
  planned,
  plannedAhead,
  actual,
  details,
  canAddBlocks,
  timeZone,
  nowMinutes,
}: WeekGridProps) {
  const categories = groups.flatMap((group) => group.categories);

  // Each goal's text, so a field can be empty while you type
  const [goalText, setGoalText] = useState<Record<string, string>>(() => goalsAsText(goals));
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  // The goal field being typed in, so new values from the server don't overwrite it
  const [editingId, setEditingId] = useState<string | null>(null);

  // When the server sends new goals (after a save, or "Copy last week's goals"), take them,
  // except in the field you're typing in. This is React's "adjust state when a prop changes" pattern.
  const [lastGoals, setLastGoals] = useState(goals);
  if (goals !== lastGoals) {
    setLastGoals(goals);
    setGoalText((current) => {
      const next = goalsAsText(goals);
      if (editingId) {
        next[editingId] = current[editingId] ?? "";
      }
      return next;
    });
  }

  // null when the field is empty (no goal); 0 is a real goal
  const goalOrNull = (categoryId: string) => {
    const text = (goalText[categoryId] ?? "").trim();
    return text === "" ? null : Math.max(0, Number(text) || 0);
  };
  const goalFor = (categoryId: string) => goalOrNull(categoryId) ?? 0;
  const read = (values: Record<string, number>) => (key: string) => values[key] ?? 0;
  const plannedAt = read(planned);
  const aheadAt = read(plannedAhead);
  const actualAt = read(actual);

  const weekTotal = (categoryId: string, at: (key: string) => number) =>
    days.reduce((sum, day) => sum + at(cellKey(categoryId, day.date)), 0);

  const goalTotal = categories.reduce((sum, category) => sum + goalFor(category.id), 0);
  const doneTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, actualAt), 0);
  const aheadTotal = categories.reduce((sum, c) => sum + weekTotal(c.id, aheadAt), 0);

  // Progress toward goals, for the header (null when there are no goals)
  const progress = goalProgress(
    categories
      .filter((category) => goalOrNull(category.id) !== null)
      .map((category) => ({
        goal: goalFor(category.id),
        done: weekTotal(category.id, actualAt),
        ahead: weekTotal(category.id, aheadAt),
      }))
  );

  // The day sheet that's open (a category on a day), or null
  const [sheet, setSheet] = useState<{ categoryId: string; date: string } | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  // The block being added or edited in the popup, or null when the popup is closed
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const closeDialog = useCallback(() => setDraft(null), []);

  // Plan a day for a category: today starts at the next full hour, other days at 9 AM
  function planDay(categoryId: string, date: string) {
    const start = date === today && nowMinutes !== null ? Math.ceil(nowMinutes / 60) * 60 : 9 * 60;
    setSheet(null);
    setDraft({ ...draftAt(date, start), categoryId });
  }

  // Open a plan block from the day sheet to edit or delete it
  function editBlock(blockDraft: BlockDraft) {
    setSheet(null);
    setDraft(blockDraft);
  }

  const kindOf = (date: string): "past" | "today" | "future" => (date === today ? "today" : date > today ? "future" : "past");

  // Hide the days a phone doesn't show
  // (Day cells are flex boxes, so they ask for "md:flex" instead)
  const dayClass = (date: string, show = "md:block") => (mobileDates.includes(date) ? "" : `hidden ${show}`);
  // Dates are "YYYY-MM-DD", so comparing them as text puts them in order
  const isFuture = (date: string) => date > today;

  // Save one goal when its field loses focus, if it changed
  async function save(categoryId: string) {
    setEditingId(null);
    const hours = goalOrNull(categoryId);
    if (hours === (goals[categoryId] ?? null)) {
      return;
    }

    setStatus((current) => ({ ...current, [categoryId]: "saving" }));
    const result = await saveGoal(weekStart, categoryId, hours);
    setStatus((current) => ({ ...current, [categoryId]: result.error ? "error" : "saved" }));

    // Let "Saved" show for a moment, then clear it
    if (!result.error) {
      setTimeout(() => {
        setStatus((current) => {
          if (current[categoryId] !== "saved") {
            return current;
          }
          const next = { ...current };
          delete next[categoryId];
          return next;
        });
      }, 2000);
    }
  }

  return (
    <div className="mt-6">
      {/* Header: two facts (done, planned ahead), then goal progress if there are goals */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <p className="text-sm text-stone-500">Done</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-accent">{formatHours(doneTotal)}</p>
          </div>
          <div>
            <p className="text-sm text-stone-500">Planned ahead</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-400">
              {formatHours(aheadTotal)}
            </p>
          </div>
        </div>

        {progress ? (
          <div className="mt-4">
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-stone-600">
              <span>
                Goals: <span className="font-medium text-stone-900">{Number(progress.done.toFixed(2))}</span> of{" "}
                {formatHours(progress.total)}
              </span>
              <GoalStatusLabel status={progress.status} />
            </p>
            <Bar
              done={progress.done}
              planned={progress.ahead}
              total={progress.total}
              color="#2f6f68"
              className="mt-2 h-2"
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500">Set a weekly goal below to see your progress here.</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-600">
        <span>
          Type a weekly goal for each category. It saves on its own. Click a day to see it
          {canAddBlocks ? " and plan." : "."}
        </span>
      </div>

      {/* Grid. Scrolls sideways if it still doesn't fit. */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className="min-w-[32rem] p-4 md:min-w-[58rem]">
          {/* The "now" line: past days show what happened, later days show what's planned.
              Phones show 3 days and wider screens 7, so there's one version for each. */}
          <NowBand
            dates={days.map((day) => day.date).filter((date) => mobileDates.includes(date))}
            today={today}
            className="grid md:hidden"
          />
          <NowBand dates={days.map((day) => day.date)} today={today} className="hidden md:grid" />

          {/* Headers */}
          <div className={`${GRID} pb-2 text-sm text-stone-500`}>
            <span />
            <span className="text-center font-medium text-accent">Goal ✎</span>
            {days.map((day) => (
              <span
                key={day.date}
                className={`rounded-md py-1 text-center ${dayClass(day.date)} ${
                  day.date === today ? "bg-accent-soft font-semibold text-accent" : ""
                }`}
              >
                {day.weekday} {day.dayNumber}
              </span>
            ))}
            <span className="pl-2">Week</span>
          </div>

          {groups.map((group) => (
            <div key={group.id} className="border-t border-stone-100 pt-2">
              <p className="px-1 pt-1 text-sm font-semibold">{group.name}</p>

              {group.categories.map((category) => {
                const goal = goalOrNull(category.id);
                const done = weekTotal(category.id, actualAt);
                const ahead = weekTotal(category.id, aheadAt);
                const weekly = goal === null ? null : goalStatus(goal, done, ahead);
                const fieldStatus = status[category.id];

                return (
                  <div key={category.id} className={`${GRID} py-2`}>
                    <span className="flex items-center gap-2 px-1 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate">{category.name}</span>
                    </span>

                    {/* The goal: tinted and outlined so it reads as something to type in */}
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={goalText[category.id] ?? ""}
                        onChange={(event) =>
                          setGoalText((current) => ({
                            ...current,
                            [category.id]: event.target.value,
                          }))
                        }
                        onFocus={() => setEditingId(category.id)}
                        onBlur={() => save(category.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        min={0}
                        max={168}
                        step={0.25}
                        placeholder="Set"
                        aria-label={`Weekly goal for ${category.name}, in hours`}
                        className={`w-full rounded-md border bg-accent-soft/50 py-1 pl-2 pr-5 text-right text-sm font-medium tabular-nums outline-none placeholder:font-normal placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-accent/30 ${
                          fieldStatus === "error" ? "border-red-400" : "border-accent/40"
                        }`}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">
                        h
                      </span>
                      {fieldStatus && (
                        <span
                          className={`absolute -bottom-3.5 right-0 text-[10px] ${
                            fieldStatus === "error" ? "text-red-600" : "text-stone-400"
                          }`}
                        >
                          {fieldStatus === "saving" ? "Saving" : fieldStatus === "saved" ? "Saved" : "Not saved"}
                        </span>
                      )}
                    </div>

                    {/* Days, in words: done (and missed) for past days, the plan for later days. Click to open the day. */}
                    {days.map((day) => (
                      <DayCell
                        key={day.date}
                        label={`${day.weekday} ${day.dayNumber}`}
                        kind={kindOf(day.date)}
                        done={actualAt(cellKey(category.id, day.date))}
                        planned={plannedAt(cellKey(category.id, day.date))}
                        ahead={aheadAt(cellKey(category.id, day.date))}
                        className={dayClass(day.date, "md:flex")}
                        onOpen={() => setSheet({ categoryId: category.id, date: day.date })}
                      />
                    ))}

                    {/* Week: done of goal, the bar, then the status (gray text, colored dot) */}
                    <div className="pl-2 text-sm leading-snug">
                      {goal === null ? (
                        <p className={done > 0 ? "text-stone-600" : "text-stone-300"}>
                          {done > 0 ? `${formatHours(done)} done` : "–"}
                        </p>
                      ) : goal === 0 ? (
                        // A limit: no bar, since a bar toward zero can never fill
                        <p>
                          <span className="font-medium text-stone-900">{formatHours(done)}</span>
                          <span className="text-stone-500"> · limit 0h</span>
                        </p>
                      ) : (
                        <>
                          <p>
                            <span className="font-medium text-stone-900">{Number(done.toFixed(2))}</span>
                            <span className="text-stone-500"> of {formatHours(goal)}</span>
                          </p>
                          <Bar
                            done={done}
                            planned={ahead}
                            total={goal}
                            color={category.color}
                            className="mt-1.5 h-2"
                          />
                        </>
                      )}
                      {weekly && (
                        <p className="mt-1 text-xs">
                          <GoalStatusLabel status={weekly} />
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Totals per day: done, or planned for future days */}
          <div className={`${GRID} border-t border-stone-200 pt-2 text-sm font-semibold`}>
            <span className="px-1">Total</span>
            <span className="pr-5 text-right tabular-nums">{formatHours(goalTotal)}</span>
            {days.map((day) => {
              const future = isFuture(day.date);
              const total = categories.reduce(
                (sum, category) =>
                  sum + (future ? plannedAt : actualAt)(cellKey(category.id, day.date)),
                0
              );
              return (
                <span
                  key={day.date}
                  className={`text-center tabular-nums ${dayClass(day.date)} ${future ? "font-normal text-stone-400" : ""}`}
                >
                  {total > 0 ? formatHours(total) : "–"}
                </span>
              );
            })}
            <span />
          </div>
        </div>
      </div>

      {sheet && (() => {
        const category = categories.find((c) => c.id === sheet.categoryId);
        const day = days.find((d) => d.date === sheet.date);
        if (!category || !day) {
          return null;
        }
        const key = cellKey(sheet.categoryId, sheet.date);
        return (
          <DaySheet
            category={category}
            dayLabel={day.label}
            kind={kindOf(sheet.date)}
            items={details[key] ?? []}
            done={actualAt(key)}
            planned={plannedAt(key)}
            ahead={aheadAt(key)}
            canAddBlocks={canAddBlocks}
            timeZone={timeZone}
            onAdd={() => planDay(sheet.categoryId, sheet.date)}
            onEdit={editBlock}
            onClose={closeSheet}
          />
        );
      })()}

      {draft && (
        <PlanBlockDialog
          draft={draft}
          days={days.map((day) => ({ date: day.date, label: day.label }))}
          groups={groups}
          timeZone={timeZone}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

// The row above the day headers: a solid line under past days ("what happened"),
// "now" over today, and a dashed line under later days ("what's planned")
function NowBand({ dates, today, className }: { dates: string[]; today: string; className: string }) {
  const past = dates.filter((date) => date < today).length;
  const hasToday = dates.includes(today);
  const future = dates.filter((date) => date > today).length;
  const span = (count: number) => ({ gridColumn: `span ${count} / span ${count}` });

  return (
    <div className={`${COLUMNS} pb-1 text-[11px] ${className}`}>
      <span />
      <span />
      {past > 0 && (
        <span
          style={span(past)}
          className="truncate border-b-2 border-accent/60 pb-0.5 text-center text-stone-500"
        >
          what happened
        </span>
      )}
      {hasToday && <span className="pb-0.5 text-center font-semibold text-accent">now</span>}
      {future > 0 && (
        <span
          style={span(future)}
          className="truncate border-b-2 border-dashed border-stone-300 pb-0.5 text-center text-stone-400"
        >
          what&apos;s planned
        </span>
      )}
      <span />
    </div>
  );
}

type DayCellProps = {
  label: string;
  kind: "past" | "today" | "future";
  done: number;
  // The whole day's plan, and the part of it still after now
  planned: number;
  ahead: number;
  className: string;
  // Opens the day sheet for this category and day
  onOpen: () => void;
};

// One day for one category, in words: the hours on top, what they mean underneath.
// Past days compare done to the plan, today adds what's still planned, later days show the plan.
function DayCell({ label, kind, done, planned, ahead, className, onOpen }: DayCellProps) {
  let main = done > 0 ? `${num(done)}h` : "–";
  let note: { text: string; tone: "good" | "attention" | "quiet" } | null = null;
  let mainClass = done > 0 ? "text-stone-900" : "text-stone-300";

  if (kind === "future") {
    main = planned > 0 ? `${num(planned)}h` : "–";
    mainClass = planned > 0 ? "text-stone-500" : "text-stone-300";
    if (planned > 0) {
      note = { text: "planned", tone: "quiet" };
    }
  } else if (kind === "today" && ahead > 0) {
    note = { text: `+${num(ahead)}h later`, tone: "quiet" };
  } else if (planned > 0) {
    // A past day (or today with nothing left): did the plan get done?
    if (done >= planned) {
      note = { text: "all done", tone: "good" };
    } else {
      main = `${num(done)} of ${num(planned)}h`;
      mainClass = "text-stone-900";
      note = { text: `${num(planned - done)}h missed`, tone: "attention" };
    }
  }

  const noteClass = {
    good: "text-accent",
    attention: "text-amber-600",
    quiet: "text-stone-400",
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${main}${note ? `, ${note.text}` : ""}. Open this day.`}
      className={`flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md px-1 py-1 text-center tabular-nums leading-tight outline-1 outline-transparent transition-colors hover:bg-accent-soft/40 hover:outline-accent ${
        kind === "today" ? "bg-accent-soft/60" : ""
      } ${className}`}
    >
      <span className={`whitespace-nowrap text-[13px] md:text-sm ${mainClass}`}>{main}</span>
      {note && <span className={`whitespace-nowrap text-[11px] ${noteClass[note.tone]}`}>{note.text}</span>}
    </button>
  );
}