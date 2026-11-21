-- Planned hours for one category on one day.
-- Replaces weekly_budgets for planning (that table stays unused for now).

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  plan_date date not null,
  planned_hours numeric(4, 2) not null default 0 check (planned_hours >= 0 and planned_hours <= 24),
  created_at timestamptz not null default now(),
  unique (category_id, plan_date)
);

create index daily_plans_user_id_plan_date_idx on public.daily_plans (user_id, plan_date);

alter table public.daily_plans enable row level security;

grant select, insert, update, delete on public.daily_plans to authenticated;

create policy "Users manage their own daily plans"
  on public.daily_plans
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());