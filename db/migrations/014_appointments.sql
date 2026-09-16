-- Appointments: one row per job per kind, pending until confirmed.
-- Every statement is safe to re-run. leads.visit_at and leads.install_on stay as mirrors of the confirmed rows.

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  kind text not null,
  starts_at timestamptz not null,
  all_day boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table appointments drop constraint if exists appointments_kind_check;

alter table appointments add constraint appointments_kind_check check (
  kind in ('consultation','measure','install','service')
);

create unique index if not exists appointments_lead_kind_key on appointments (lead_id, kind);

-- Backfill the dates the tracker already holds, as confirmed appointments. Re-running inserts nothing.

insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
select id, 'consultation', visit_at, false, now(), 'backfill' from leads l
 where visit_at is not null
   and not exists (select 1 from appointments a where a.lead_id = l.id and a.kind = 'consultation');

insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
select id, 'install', (install_on::text || ' 08:00')::timestamp at time zone 'America/Los_Angeles', true, now(), 'backfill' from leads l
 where install_on is not null
   and not exists (select 1 from appointments a where a.lead_id = l.id and a.kind = 'install');
