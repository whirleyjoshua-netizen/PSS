-- Google Ads lead form leads (docs/superpowers/specs/2026-10-02-google-lead-webhook-design.md, Part A).
-- google_lead_id is Google's lead_id. The unique index lets a resent webhook insert nothing (on conflict do nothing).
-- Null on every other lead, which the partial index leaves out.
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

alter table leads add column if not exists google_lead_id text;

create unique index if not exists leads_google_lead_id_key on leads (google_lead_id) where google_lead_id is not null;
