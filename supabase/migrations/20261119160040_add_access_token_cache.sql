-- Cache the short-lived Google access token so we only refresh it about once an hour.
alter table public.google_tokens
  add column access_token text,
  add column access_token_expires_at timestamptz;