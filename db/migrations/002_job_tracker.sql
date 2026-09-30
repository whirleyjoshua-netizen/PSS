-- The owners' job tracker. Leads from the website become jobs; the status
-- column that 001_leads.sql left open now holds the stage.
--
-- Every statement is safe to re-run: the migrate script applies all files.

-- Lists the CURRENT FULL set of stages, identical to 011 and 012: migrate.mjs re-applies every
-- file, so every definition must match. 'contacted' was retired by 011.
alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check check (
  status in ('new','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')
);

-- Hand-entered jobs (a phone call, a referral) may arrive without an email.
alter table leads alter column email drop not null;

alter table leads add column if not exists stage_changed_at timestamptz not null default now();
alter table leads add column if not exists visit_at        timestamptz;
alter table leads add column if not exists quote_cents     integer;
alter table leads add column if not exists sold_cents      integer;
alter table leads add column if not exists deposit_cents   integer;
alter table leads add column if not exists brands          text[] not null default '{}';
alter table leads add column if not exists ordered_on      date;
alter table leads add column if not exists install_on      date;
alter table leads add column if not exists lost_reason     text;
alter table leads add column if not exists updated_at      timestamptz not null default now();

create index if not exists leads_stage_changed_idx on leads (stage_changed_at desc);

create table if not exists job_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads (id) on delete cascade,
  created_at  timestamptz not null default now(),
  actor       text not null,
  kind        text not null check (kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')),
  from_status text,
  to_status   text,
  body        text
);

create index if not exists job_events_lead_idx on job_events (lead_id, created_at desc);

update leads set stage_changed_at = created_at where status = 'new' and stage_changed_at > created_at and not exists (select 1 from job_events where job_events.lead_id = leads.id);

create table if not exists admin_login_tokens (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists admin_login_tokens_email_idx on admin_login_tokens (email, created_at desc);

create table if not exists admin_sessions (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
