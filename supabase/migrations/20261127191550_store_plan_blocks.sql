-- Plan calendar blocks, copied from Google by the sync like tracked events, so pages
-- read them from here instead of asking Google on every load. Kept apart from events,
-- since plans never count as done time.
create table public.plan_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  google_event_id text not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  unique (user_id, google_event_id)
);

create index plan_blocks_user_start on public.plan_blocks (user_id, start_at);

alter table public.plan_blocks enable row level security;

grant select, insert, update, delete on public.plan_blocks to authenticated;

create policy "Users manage their own plan blocks"
  on public.plan_blocks
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Which stretch of time the stored blocks cover (outside it, pages ask Google), and
-- whether the Plan calendar was found missing in Google at the last sync
alter table public.user_settings
  add column plan_synced_from timestamptz,
  add column plan_synced_until timestamptz,
  add column plan_calendar_missing boolean not null default false;