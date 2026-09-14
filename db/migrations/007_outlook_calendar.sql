-- Outlook calendar sync: which Outlook event belongs to which job date,
-- and the Graph subscription that tells us when those events change.
--
-- Every statement is safe to re-run: the migrate script applies all files.

create table if not exists job_calendar_events (
  lead_id    uuid not null references leads (id) on delete cascade,
  kind       text not null check (kind in ('visit', 'install')),
  event_id   text not null unique,
  change_key text not null,
  synced_at  timestamptz not null default now(),
  primary key (lead_id, kind)
);

-- A single row (id = 1).
create table if not exists calendar_sync_state (
  id              int primary key default 1 check (id = 1),
  subscription_id text,
  expires_at      timestamptz,
  last_error      text,
  last_error_at   timestamptz,
  updated_at      timestamptz not null default now()
);

insert into calendar_sync_state (id) values (1) on conflict (id) do nothing;
