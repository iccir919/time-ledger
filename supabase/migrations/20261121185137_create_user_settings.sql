-- One row of settings per user. For now: the Plan calendar Time Ledger created.

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plan_calendar_id text,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

grant select, insert, update, delete on public.user_settings to authenticated;

create policy "Users manage their own settings"
  on public.user_settings
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());