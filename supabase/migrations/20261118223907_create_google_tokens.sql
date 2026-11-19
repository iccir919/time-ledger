-- Stores each user's Google refresh token.
-- RLS is on with NO policies, and signed-in users get NO grants,
-- so the browser can never read this table.
-- Only server code using the secret key (service_role) can.

create table public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

grant select, insert, update, delete on public.google_tokens to service_role;