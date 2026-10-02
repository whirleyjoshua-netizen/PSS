-- Sign-in by a 6-digit code as well as the link (docs/superpowers/specs/2026-10-01-pss-ops-app-design.md).
-- The code shares the link's row, so using either one uses both. Safe to re-run.
-- Whole-line comments only, and no semicolons in comments.

alter table admin_login_tokens add column if not exists code_hash text;
alter table admin_login_tokens add column if not exists code_attempts smallint not null default 0;

alter table admin_login_tokens drop constraint if exists admin_login_tokens_code_attempts_check;
alter table admin_login_tokens add constraint admin_login_tokens_code_attempts_check check (code_attempts between 0 and 5);
