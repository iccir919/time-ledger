-- Turn on Row Level Security for every Time Ledger table.
-- Without this, the policies in create_core_tables are not enforced.

alter table public.category_groups enable row level security;
alter table public.categories enable row level security;
alter table public.tracked_calendars enable row level security;
alter table public.weekly_budgets enable row level security;
alter table public.events enable row level security;