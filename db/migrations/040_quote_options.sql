-- Quote options (spec docs/superpowers/specs/2026-10-02-quote-options-design.md)
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments.

-- One row per extra quote option of a job, B to Z. Option A is never stored: every job has it.
create table if not exists quote_options (
  lead_id    uuid not null references leads(id) on delete cascade,
  letter     text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (lead_id, letter)
);

alter table quote_options drop constraint if exists quote_options_letter_check;
alter table quote_options add constraint quote_options_letter_check check (
  letter ~ '^[B-Z]$'
);

-- Every DC version belongs to an option. Existing rows become option A, so every existing quote reads as before.
alter table dc_quote_versions add column if not exists option text not null default 'A';

alter table dc_quote_versions drop constraint if exists dc_quote_versions_option_check;
alter table dc_quote_versions add constraint dc_quote_versions_option_check check (
  option ~ '^[A-Z]$'
);

-- Versions are numbered within an option. 024 declared unique (lead_id, version) inline, so Postgres named it
-- dc_quote_versions_lead_id_version_key (confirmed on the Neon test branch before this file was written).
alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_id_version_key;
alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_option_version_key;
alter table dc_quote_versions add constraint dc_quote_versions_lead_option_version_key unique (lead_id, option, version);

-- At most one offered version per option of a job. Deferred to commit, because Send quote supersedes the old
-- offered version and offers the new one in ONE statement (see 030 for the history).
-- This file is the only one that defines the rule. 030 defined it per job until 2026-10-02, and re-adding that
-- on every migrate run would fail once a job has two options offered at once. Never migrate production from a
-- checkout without this file (the stale-worktree rule).
alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered;
alter table dc_quote_versions add constraint dc_quote_versions_one_offered
  exclude using btree (lead_id with =, option with =) where (status = 'offered') deferrable initially deferred;
