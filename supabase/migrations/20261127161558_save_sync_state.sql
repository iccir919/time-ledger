-- The user's Google time zone and when their calendars last synced. Pages read the time
-- zone from here instead of asking Google, and syncs moments apart are skipped.
alter table public.user_settings
  add column time_zone text,
  add column last_synced_at timestamptz;