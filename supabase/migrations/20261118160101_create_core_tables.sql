-- ============================================================
-- Time Ledger: core tables
-- Every table has a user_id. RLS policies make sure each user
-- can only see and change their own rows.
-- user_id defaults to auth.uid(), so the app doesn't need to send it.
-- ============================================================


-- ------------------------------------------------------------
-- category_groups: e.g. "Health", "Work"
-- ------------------------------------------------------------
create table public.category_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.category_groups to authenticated;

create policy "Users manage their own category groups"
  on public.category_groups
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
-- categories: e.g. "Exercise", "Sleep". Each belongs to a group.
-- Deleting a group deletes its categories.
-- ------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id uuid not null references public.category_groups (id) on delete cascade,
  name text not null,
  color text not null default '#2f6f68',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index categories_group_id_idx on public.categories (group_id);

grant select, insert, update, delete on public.categories to authenticated;

create policy "Users manage their own categories"
  on public.categories
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
-- tracked_calendars: which Google calendars count toward the budget.
-- default_category_id auto-assigns events from this calendar.
-- If that category is deleted, the default is cleared (not the calendar).
-- ------------------------------------------------------------
create table public.tracked_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  google_calendar_id text not null,
  name text not null,
  default_category_id uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, google_calendar_id)
);

grant select, insert, update, delete on public.tracked_calendars to authenticated;

create policy "Users manage their own tracked calendars"
  on public.tracked_calendars
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
-- weekly_budgets: planned hours for one category in one week.
-- One row per category per week.
-- ------------------------------------------------------------
create table public.weekly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  week_start date not null,
  planned_hours numeric(5, 2) not null default 0 check (planned_hours >= 0),
  created_at timestamptz not null default now(),
  unique (category_id, week_start)
);

grant select, insert, update, delete on public.weekly_budgets to authenticated;

create policy "Users manage their own weekly budgets"
  on public.weekly_budgets
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
-- events: calendar events imported from Google.
-- category_id is empty until assigned (those show in the inbox).
-- google_event_id + tracked_calendar_id prevents duplicate imports.
-- ------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tracked_calendar_id uuid not null references public.tracked_calendars (id) on delete cascade,
  google_event_id text not null,
  category_id uuid references public.categories (id) on delete set null,
  title text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tracked_calendar_id, google_event_id),
  check (end_at >= start_at)
);

create index events_user_id_start_at_idx on public.events (user_id, start_at);

grant select, insert, update, delete on public.events to authenticated;

create policy "Users manage their own events"
  on public.events
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());