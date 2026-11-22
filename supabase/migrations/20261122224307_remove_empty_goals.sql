-- Empty goal fields used to save as 0. Now an empty field means "no goal" (no row),
-- and 0 is a real goal of zero hours, like a limit. Clear out the old placeholder zeros.
delete from public.weekly_budgets where planned_hours = 0;