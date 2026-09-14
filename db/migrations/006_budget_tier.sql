-- Lead call flow: the budget tier heard on the first call.
-- Every statement is safe to re-run.

alter table leads add column if not exists budget_tier text;

alter table leads drop constraint if exists leads_budget_tier_check;

alter table leads add constraint leads_budget_tier_check check (budget_tier is null or budget_tier in ('value', 'mid', 'premium'));
