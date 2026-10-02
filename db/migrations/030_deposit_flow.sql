-- Deposit flow (spec docs/superpowers/specs/2026-09-29-deposit-flow-design.md)
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments.

-- Stages. 002, 011, 012, this file and 033 all define leads_status_check, so all five list the CURRENT FULL set.
alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check check (
  status in ('new','contacted','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')
);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds.
-- 'payment' is a deposit paid, recorded or refunded.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')
);

-- A DC version goes draft, offered (quote sent), sent (contract sent), signed. cancelled is a refunded, cancelled contract.
-- 024 declared this check inline, so Postgres named it dc_quote_versions_status_check.
alter table dc_quote_versions drop constraint if exists dc_quote_versions_status_check;

alter table dc_quote_versions add constraint dc_quote_versions_status_check check (
  status in ('draft','offered','sent','signed','superseded','cancelled')
);

-- The quote PDF Send quote shared, and when the quote was offered, approved and cancelled.
alter table dc_quote_versions add column if not exists quote_file_id uuid references job_files(id) on delete set null;
alter table dc_quote_versions add column if not exists offered_at timestamptz;
alter table dc_quote_versions add column if not exists offered_by text;
alter table dc_quote_versions add column if not exists approved_at timestamptz;
alter table dc_quote_versions add column if not exists approved_by text;
alter table dc_quote_versions add column if not exists cancelled_at timestamptz;

-- At most one offered version per job. An exclusion constraint deferred to commit rather than a unique
-- index, because Send quote supersedes the old offered version and offers the new one in ONE statement,
-- and a unique index would be checked row by row in whichever order Postgres runs the two updates.
alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered;

alter table dc_quote_versions add constraint dc_quote_versions_one_offered
  exclude using btree (lead_id with =) where (status = 'offered') deferrable initially deferred;

-- One row per deposit attempt. method is stripe, check, cash or other. status is pending, paid, refunded or expired.
-- recorded_by is the owner's email for a payment recorded by hand.
create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  dc_quote_version_id uuid not null references dc_quote_versions(id),
  amount_cents integer not null,
  method text not null,
  status text not null,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  recorded_by text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

alter table deposits drop constraint if exists deposits_method_check;

alter table deposits add constraint deposits_method_check check (
  method in ('stripe','check','cash','other')
);

alter table deposits drop constraint if exists deposits_status_check;

alter table deposits add constraint deposits_status_check check (
  status in ('pending','paid','refunded','expired')
);

alter table deposits drop constraint if exists deposits_amount_check;

alter table deposits add constraint deposits_amount_check check (
  amount_cents > 0
);

alter table deposits drop constraint if exists deposits_paid_at_check;

alter table deposits add constraint deposits_paid_at_check check (
  status not in ('paid','refunded') or paid_at is not null
);

-- One paid deposit per version, and one open card checkout per version (a double-click lands on one).
create unique index if not exists deposits_one_paid_per_version on deposits (dc_quote_version_id) where status = 'paid';

create unique index if not exists deposits_one_pending_per_version on deposits (dc_quote_version_id) where status = 'pending';

create index if not exists deposits_lead_idx on deposits (lead_id);
