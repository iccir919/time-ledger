-- Each week's goal points one way: "at least" (work toward it) or "at most" (a limit).
alter table public.weekly_budgets
  add column direction text not null default 'at_least'
  check (direction in ('at_least', 'at_most'));

-- Goals of 0 were always limits
update public.weekly_budgets set direction = 'at_most' where planned_hours = 0;