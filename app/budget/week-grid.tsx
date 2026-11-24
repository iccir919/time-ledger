"use client";

import { useState } from "react";
import GoalStatusLabel from "@/components/goal-status-label";
import { goalProgress, goalStatus } from "@/lib/goals";
import { formatHours } from "@/lib/hours";
import { saveDayPlan, saveGoal } from "./actions";
import WeekCalendar, { type CalendarBlock } from "./week-calendar";

// Columns: name, goal, week, days. The day calendar sits right after the days.
// Wide screens (xl) show all 7 days; anything narrower shows only the selected day,
// so the calendar always has room beside (or below, on phones) the grid.
// (No "grid" here, so the "now" row can switch between hidden and grid; GRID adds it.)
const COLUMNS =
  "items-center gap-2 grid-cols-[minmax(5.5rem,9rem)_5rem_minmax(7rem,9rem)_minmax(5.5rem,6.5rem)] xl:grid-cols-[minmax(7rem,9rem)_5rem_minmax(8rem,10rem)_repeat(7,minmax(3.75rem,4.5rem))]";

const GRID = `grid ${COLUMNS}`;


type GridDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  // e.g. "Fri, Nov 27", for the popup's day picker and the panel's title
  label: string;
  // Midnight to midnight, for the panel's calendar
  startMs: number;
  endMs: number;
};

type GridGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; color: string }[];
};

type DayKind = "past" | "today" | "future";

type WeekGridProps = {
  weekStart: string;
  groups: GridGroup[];
  days: GridDay[];
  today: string;
  // Weekly goals, keyed by category ID. A category with no goal isn't in here; 0 is a real goal.
  goals: Record<string, number>;
  // Hours keyed by "<categoryId>:<date>":
  // planned (the day's plan: the bigger of typed and scheduled), plannedAhead (the part still
  // after now), actual (tracked), typed (typed into the grid), scheduled (Plan calendar blocks)
  planned: Record<string, number>;
  plannedAhead: Record<string, number>;
  actual: Record<string, number>;
  typed: Record<string, number>;
  scheduled: Record<string, number>;
  // The week's tracked events and plan blocks, for the day panel's calendar
  blocks: CalendarBlock[];
  // Adding plan blocks needs a Plan calendar
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

function asText(values: Record<string, number>) {
  const text: Record<string, string> = {};
  for (const [key, hours] of Object.entries(values)) {
    text[key] = String(hours);
  }
  return text;
}

// "" (empty field) -> null; anything else -> a number of hours, never below 0
function hoursOrNull(text: string | undefined) {
  const trimmed = (text ?? "").trim();
  return trimmed === "" ? null : Math.max(0, Number(trimmed) || 0);
}

// The selected category on the selected day, in words, for the top of the day panel
function daySummary(kind: DayKind, done: number, planned: number, scheduled: number) {
  const toSchedule = Math.max(planned - scheduled, 0);
  if (kind === "past") {
    if (planned > 0) {
      return done >= planned
        ? `${formatHours(done)} done · all of the plan`
        : `${formatHours(done)} done of ${formatHours(planned)} planned · ${formatHours(planned - done)} missed`;
    }
    return done > 0 ? `${formatHours(done)} done` : "Nothing tracked";
  }
  const parts = [planned > 0 ? `${formatHours(planned)} planned` : "Nothing planned yet"];
  if (planned > 0) {
    parts.push(toSchedule > 0 ? `${formatHours(toSchedule)} to schedule` : "all scheduled");
  }
  if (kind === "today" && done > 0) {
    parts.push(`${formatHours(done)} done`);
  }
  return parts.join(" · ");
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
  today,
  goals,
  planned,
  plannedAhead,
  actual,
  typed,
  scheduled,
  blocks,
  canAddBlocks,
  timeZone,
  nowMinutes,
}: WeekGridProps) {
  const categories = groups.flatMap((group) => group.categories);

  // Goals: each one's text, so a field can be empty while you type
  const [goalText, setGoalText] = useState<Record<string, string>>(() => asText(goals));
  const [goalStatusById, setGoalStatusById] = useState<Record<string, SaveStatus>>({});
  // Day plans: the same, keyed by "<categoryId>:<date>"
  const [dayText, setDayText] = useState<Record<string, string>>(() => asText(typed));
  const [dayStatus, setDayStatus] = useState<Record<string, SaveStatus>>({});
  // The field being typed in (a category ID or a cell key), so new values from the server don't overwrite it
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // When the server sends new values (after a save, or "Copy last week's goals"), take them,
  // except in the field you're typing in. This is React's "adjust state when a prop changes" pattern.
  const [lastGoals, setLastGoals] = useState(goals);
  if (goals !== lastGoals) {
    setLastGoals(goals);
    setGoalText((current) => {
      const next = asText(goals);
      if (editingKey && editingKey in current) {
        next[editingKey] = current[editingKey];
      }
      return next;
    });
  }
  const [lastTyped, setLastTyped] = useState(typed);
  if (typed !== lastTyped) {
    setLastTyped(typed);
    setDayText((current) => {
      const next = asText(typed);
      if (editingKey && editingKey in current) {
        next[editingKey] = current[editingKey];
      }
      return next;
    });
  }

  // null when the field is empty (no goal); 0 is a real goal
  const goalOrNull = (categoryId: string) => hoursOrNull(goalText[categoryId]);
  const goalFor = (categoryId: string) => goalOrNull(categoryId) ?? 0;
  const read = (values: Record<string, number>) => (key: string) => values[key] ?? 0;
  const actualAt = read(actual);
  const scheduledAt = read(scheduled);

  // A day's plan and the part still ahead use what's typed right now, so a cell reacts as you type
  const plannedAt = (key: string) => {
    const typedNow = hoursOrNull(dayText[key]);
    return typedNow === null ? (planned[key] ?? 0) : Math.max(typedNow, scheduledAt(key));
  };
  const aheadAt = (key: string, date: string) => {
    const typedNow = hoursOrNull(dayText[key]);
    if (typedNow === null || date < today) {
      return plannedAhead[key] ?? 0;
    }
    const plan = Math.max(typedNow, scheduledAt(key));
    if (date > today) {
      return plan;
    }
    // Today: the blocks still ahead (from the server) plus typed hours not scheduled yet
    const blocksAhead = Math.max((plannedAhead[key] ?? 0) - Math.max((typed[key] ?? 0) - scheduledAt(key), 0), 0);
    return blocksAhead + Math.max(typedNow - scheduledAt(key), 0);
  };

  const weekTotal = (categoryId: string, at: (key: string, date: string) => number) =>
    days.reduce((sum, day) => sum + at(cellKey(categoryId, day.date), day.date), 0);

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

  // The selected day (shown in the panel) and the category clicked, if any.
  // Starts on today, or the first day when viewing another week.
  const [selected, setSelected] = useState<{ date: string; categoryId: string | null }>(() => ({
    date: days.some((day) => day.date === today) ? today : days[0].date,
    categoryId: null,
  }));

  // The panel's ‹ › arrows: the day before or after, keeping the selected category
  function stepDay(offset: number) {
    const index = days.findIndex((day) => day.date === selected.date) + offset;
    if (days[index]) {
      setSelected((current) => ({ ...current, date: days[index].date }));
    }
  }

  // Dates are "YYYY-MM-DD", so comparing them as text puts them in order
  const kindOf = (date: string): DayKind => (date === today ? "today" : date > today ? "future" : "past");

  // Narrower screens show only the selected day (cells are flex boxes, so they ask for "xl:flex")
  const dayClass = (date: string, show = "xl:block") => (date === selected.date ? "" : `hidden ${show}`);

  // Save one goal when its field loses focus, if it changed
  async function saveGoalField(categoryId: string) {
    setEditingKey(null);
    const hours = goalOrNull(categoryId);
    if (hours === (goals[categoryId] ?? null)) {
      return;
    }
    setGoalStatusById((current) => ({ ...current, [categoryId]: "saving" }));
    const result = await saveGoal(weekStart, categoryId, hours);
    setGoalStatusById((current) => ({ ...current, [categoryId]: result.error ? "error" : "saved" }));
    if (!result.error) {
      clearSavedLater(setGoalStatusById, categoryId);
    }
  }

  // Save one day's typed hours when its field loses focus, if they changed
  async function saveDayField(categoryId: string, date: string) {
    setEditingKey(null);
    const key = cellKey(categoryId, date);
    const hours = hoursOrNull(dayText[key]);
    // 0 and empty both mean "no typed plan"
    const next = hours === 0 ? null : hours;
    if (next === (typed[key] ?? null)) {
      return;
    }
    setDayStatus((current) => ({ ...current, [key]: "saving" }));
    const result = await saveDayPlan(date, categoryId, next);
    setDayStatus((current) => ({ ...current, [key]: result.error ? "error" : "saved" }));
    if (!result.error) {
      clearSavedLater(setDayStatus, key);
    }
  }

  const selectedDay = days.find((day) => day.date === selected.date) ?? days[0];
  const selectedIndex = days.indexOf(selectedDay);
  const selectedKind = kindOf(selectedDay.date);
  const selectedCategory = categories.find((c) => c.id === selected.categoryId) ?? null;
  const selectedKey = selectedCategory ? cellKey(selectedCategory.id, selectedDay.date) : null;

  return (
    <div className="mt-6">
      {/* Header: the week's two facts (done, planned ahead), and goal progress beside them */}
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex gap-x-10">
          <div>
            <p className="text-sm text-stone-500">Done this week</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-accent">{formatHours(doneTotal)}</p>
          </div>
          <div>
            <p className="text-sm text-stone-500">Planned ahead</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-400">
              {formatHours(aheadTotal)}
            </p>
          </div>
        </div>

        {/* Goal progress, beside the numbers (under them on narrow screens) */}
        {progress ? (
          <div className="min-w-64 flex-1 md:border-l md:border-stone-100 md:pl-10">
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
          <p className="min-w-64 flex-1 text-sm text-stone-500 md:border-l md:border-stone-100 md:pl-10">
            Set a weekly goal below to see your progress here.
          </p>
        )}
      </div>

      <p className="mt-6 text-sm text-stone-600">
        Type a weekly goal for each category, and the hours you plan for each day. Both save on their own.
      </p>

      {/* One card: the grid, then the selected day's calendar attached right after the days
          (below the grid on phones) */}
      <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white md:grid md:grid-cols-[auto_minmax(14rem,1fr)]">
        <div className="overflow-x-auto">
          <div className="p-4">
            {/* The "now" line: past days show what happened, later days show what's planned */}
            <NowBand dates={[selected.date]} today={today} className="grid xl:hidden" />
            <NowBand dates={days.map((day) => day.date)} today={today} className="hidden xl:grid" />

            {/* Headers. Clicking a day selects it without a category. */}
            <div className={`${GRID} pb-2 text-sm text-stone-500`}>
              <span />
              <span className="text-center font-medium text-accent">Goal ✎</span>
              <span className="pl-1">Week</span>
              {days.map((day) => (
                <span key={day.date} className={dayClass(day.date)}>
                  <button
                    type="button"
                    onClick={() => setSelected({ date: day.date, categoryId: null })}
                    className={`w-full rounded-md py-1 text-center ${
                      day.date === today ? "bg-accent-soft font-semibold text-accent" : "hover:bg-stone-100"
                    } ${day.date === selected.date ? "ring-2 ring-accent/40" : ""}`}
                  >
                    {day.weekday} {day.dayNumber}
                  </button>
                </span>
              ))}
            </div>

            {groups.map((group) => (
              <div key={group.id} className="border-t border-stone-100 pt-2">
                <p className="px-1 pt-1 text-sm font-semibold">{group.name}</p>

                {group.categories.map((category) => {
                  const goal = goalOrNull(category.id);
                  const done = weekTotal(category.id, actualAt);
                  const ahead = weekTotal(category.id, aheadAt);
                  const weekly = goal === null ? null : goalStatus(goal, done, ahead);
                  const fieldStatus = goalStatusById[category.id];

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
                      <HoursField
                        value={goalText[category.id] ?? ""}
                        onChange={(value) => setGoalText((current) => ({ ...current, [category.id]: value }))}
                        onFocus={() => setEditingKey(category.id)}
                        onBlur={() => saveGoalField(category.id)}
                        max={168}
                        placeholder="Set"
                        label={`Weekly goal for ${category.name}, in hours`}
                        status={fieldStatus}
                        tinted
                      />

                      {/* Week: done of goal, the bar, then the status (gray text, colored dot) */}
                      <div className="pl-1 text-sm leading-snug">
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
                              <span className="font-medium text-stone-900">{num(done)}</span>
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

                      {/* Days: type today's and later days' plans; past days show what happened */}
                      {days.map((day) => {
                        const key = cellKey(category.id, day.date);
                        const kind = kindOf(day.date);
                        const isSelected = selected.date === day.date && selected.categoryId === category.id;
                        const select = () => setSelected({ date: day.date, categoryId: category.id });
                        const dayPlan = plannedAt(key);

                        if (kind === "past") {
                          return (
                            <PastCell
                              key={day.date}
                              label={`${category.name}, ${day.label}`}
                              done={actualAt(key)}
                              planned={dayPlan}
                              selected={isSelected}
                              className={dayClass(day.date, "xl:flex")}
                              onSelect={select}
                            />
                          );
                        }

                        return (
                          <div
                            key={day.date}
                            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 ${
                              kind === "today" ? "bg-accent-soft/60" : ""
                            } ${isSelected ? "ring-2 ring-accent" : ""} ${dayClass(day.date, "xl:flex")}`}
                          >
                            <HoursField
                              value={dayText[key] ?? ""}
                              onChange={(value) => setDayText((current) => ({ ...current, [key]: value }))}
                              onFocus={() => {
                                setEditingKey(key);
                                select();
                              }}
                              onBlur={() => saveDayField(category.id, day.date)}
                              max={24}
                              // A day with blocks but nothing typed shows the scheduled hours in gray
                              placeholder={scheduledAt(key) > 0 ? num(scheduledAt(key)) : "–"}
                              label={`${category.name}, ${day.label}: hours planned`}
                              status={dayStatus[key]}
                              compact
                            />
                            <DayNote
                              kind={kind}
                              planned={dayPlan}
                              scheduled={scheduledAt(key)}
                              done={actualAt(key)}
                              typedSomething={hoursOrNull(dayText[key]) !== null}
                            />
                          </div>
                        );
                      })}

                    </div>
                  );
                })}
              </div>
            ))}

            {/* Totals per day: done for past days and today, planned for later days */}
            <div className={`${GRID} border-t border-stone-200 pt-2 text-sm font-semibold`}>
              <span className="px-1">Total</span>
              <span className="pr-5 text-right tabular-nums">{formatHours(goalTotal)}</span>
              <span />
              {days.map((day) => {
                const future = kindOf(day.date) === "future";
                const total = categories.reduce((sum, category) => {
                  const key = cellKey(category.id, day.date);
                  return sum + (future ? plannedAt(key) : actualAt(key));
                }, 0);
                return (
                  <span
                    key={day.date}
                    className={`text-center tabular-nums ${dayClass(day.date)} ${future ? "font-normal text-stone-400" : ""}`}
                  >
                    {total > 0 ? formatHours(total) : "–"}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* The day calendar: the selected day, with every category, to plan around */}
        <aside className="flex flex-col border-t border-stone-200 p-3 md:border-l md:border-t-0">
          <div className="flex items-center gap-1">
            <ArrowButton
              direction="previous"
              onClick={selectedIndex > 0 ? () => stepDay(-1) : undefined}
            />
            <h2 className="flex-1 text-center text-sm font-semibold">
              {selectedKind === "today" ? "Today · " : ""}
              {selectedDay.label}
            </h2>
            <ArrowButton
              direction="next"
              onClick={selectedIndex < days.length - 1 ? () => stepDay(1) : undefined}
            />
          </div>

          {selectedCategory && selectedKey && (
            <div className="mt-2 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
                {selectedCategory.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                {daySummary(
                  selectedKind,
                  actualAt(selectedKey),
                  plannedAt(selectedKey),
                  scheduledAt(selectedKey)
                )}
              </p>
            </div>
          )}

          {/* As tall as the grid on wider screens (scrolls, starting just before now); fixed on phones */}
          <div className="relative mt-2 h-[28rem] md:h-auto md:min-h-[22rem] md:flex-1">
            <div className="absolute inset-0">
              <WeekCalendar
                key={selectedDay.date}
                days={[{ ...selectedDay }]}
                today={today}
                mobileDates={[selectedDay.date]}
                nowMinutes={selectedKind === "today" ? nowMinutes : null}
                blocks={blocks}
                canAddBlocks={canAddBlocks && selectedKind !== "past"}
                groups={groups}
                timeZone={timeZone}
                fillHeight
                defaultCategoryId={selected.categoryId ?? undefined}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-400">Plan on the left, done on the right.</p>
        </aside>
      </div>
    </div>
  );
}

// Show "Saved" for a moment, then clear it
function clearSavedLater(
  setStatus: (update: (current: Record<string, SaveStatus>) => Record<string, SaveStatus>) => void,
  key: string
) {
  setTimeout(() => {
    setStatus((current) => {
      if (current[key] !== "saved") {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, 2000);
}

type HoursFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  max: number;
  placeholder: string;
  label: string;
  status?: SaveStatus;
  // The goal field: tinted and outlined. Day fields are lighter.
  tinted?: boolean;
  compact?: boolean;
};

// A number field for hours that saves when it loses focus (Enter does the same)
function HoursField({ value, onChange, onFocus, onBlur, max, placeholder, label, status, tinted, compact }: HoursFieldProps) {
  return (
    <div className="relative w-full">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        min={0}
        max={max}
        step={0.25}
        placeholder={placeholder}
        aria-label={label}
        className={`w-full rounded-md border text-right text-sm font-medium tabular-nums outline-none placeholder:font-normal placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-accent/30 ${
          compact ? "py-0.5 pl-1 pr-4" : "py-1 pl-2 pr-5"
        } ${tinted ? "bg-accent-soft/50" : "bg-white"} ${
          status === "error" ? "border-red-400" : tinted ? "border-accent/40" : "border-stone-200"
        }`}
      />
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">
        h
      </span>
      {/* Day fields are too small for the words; their red border shows a failed save */}
      {status && !compact && (
        <span
          className={`absolute -bottom-3.5 right-0 text-[10px] ${status === "error" ? "text-red-600" : "text-stone-400"}`}
        >
          {status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Not saved"}
        </span>
      )}
    </div>
  );
}

// The small line under a typed day: how the day's plan compares with its blocks (and, today, what's done)
function DayNote({
  kind,
  planned,
  scheduled,
  done,
  typedSomething,
}: {
  kind: "today" | "future";
  planned: number;
  scheduled: number;
  done: number;
  typedSomething: boolean;
}) {
  let text = "";
  let tone = "text-stone-400";

  if (planned > scheduled) {
    text = `${num(planned - scheduled)}h to schedule`;
    tone = "text-amber-600";
  } else if (kind === "today" && done > 0) {
    text = `${num(done)}h done`;
    tone = "text-accent";
  } else if (scheduled > 0) {
    // Blocks cover the plan: "all scheduled" if you typed it, otherwise just how much is scheduled
    text = typedSomething ? "all scheduled" : "scheduled";
    tone = typedSomething ? "text-accent" : "text-stone-400";
  }

  if (!text) {
    return null;
  }
  return <span className={`whitespace-nowrap text-[11px] leading-none ${tone}`}>{text}</span>;
}

// A past day for one category, in words: done, compared with the plan if there was one
function PastCell({
  label,
  done,
  planned,
  selected,
  className,
  onSelect,
}: {
  label: string;
  done: number;
  planned: number;
  selected: boolean;
  className: string;
  onSelect: () => void;
}) {
  let main = done > 0 ? `${num(done)}h` : "–";
  let note: { text: string; tone: string } | null = null;

  if (planned > 0) {
    if (done >= planned) {
      note = { text: "all done", tone: "text-accent" };
    } else {
      main = `${num(done)} of ${num(planned)}h`;
      note = { text: `${num(planned - done)}h missed`, tone: "text-amber-600" };
    }
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${label}: ${main}${note ? `, ${note.text}` : ""}. Show this day.`}
      aria-pressed={selected}
      className={`flex min-h-12 flex-col items-center justify-center rounded-md px-1 py-1 text-center tabular-nums leading-tight hover:bg-stone-50 ${
        selected ? "ring-2 ring-accent" : ""
      } ${className}`}
    >
      <span className={`whitespace-nowrap text-sm ${main === "–" ? "text-stone-300" : "text-stone-900"}`}>{main}</span>
      {note && <span className={`whitespace-nowrap text-[11px] ${note.tone}`}>{note.text}</span>}
    </button>
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
      <span />
      {past > 0 && (
        <span style={span(past)} className="truncate border-b-2 border-accent/60 pb-0.5 text-center text-stone-500">
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
    </div>
  );
}

// ‹ or ›, grayed out (and doing nothing) at the start or end of the week
function ArrowButton({ direction, onClick }: { direction: "previous" | "next"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={direction === "previous" ? "Previous day" : "Next day"}
      className="flex size-8 items-center justify-center rounded-md text-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:text-stone-200 disabled:hover:bg-transparent"
    >
      {direction === "previous" ? "‹" : "›"}
    </button>
  );
}