-- Leads captured by the public consultation forms.
--
-- This table is deliberately the seam between the marketing website and the
-- internal order management system. The website only ever inserts; the order
-- system will read these rows and advance `status`. Do not constrain `status`
-- with an enum yet — the set of states belongs to the order system's spec.

create extension if not exists "pgcrypto";

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text        not null,
  phone         text        not null,
  email         text        not null,
  address       text,
  city          text        not null,
  treatments    text[]      not null default '{}',
  window_count  text,
  heard_via     text,
  notes         text,
  source        text        not null,
  status        text        not null default 'new'
);

create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_status_idx     on leads (status);
