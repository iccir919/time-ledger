-- A week's number for a category is its goal (or limit), not "planned hours".
-- daily_plans.planned_hours keeps its name: those really are planned hours.
alter table public.weekly_budgets rename column planned_hours to goal;