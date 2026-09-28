-- Direct Connect quote import (spec docs/superpowers/specs/2026-09-27-dc-quote-import-design.md)
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments.

create table if not exists ingested_messages (
  message_id   text primary key,
  received_at  timestamptz not null,
  processed_at timestamptz not null default now(),
  outcome      text not null check (outcome in ('imported','unchanged','no-po','no-match','no-costs','incomplete','unreadable','failed')),
  lead_id      uuid references leads(id) on delete set null,
  dc_quote_no  text,
  detail       text
);

create table if not exists dc_quote_versions (
  id                    uuid primary key,
  lead_id               uuid not null references leads(id) on delete cascade,
  version               integer not null check (version > 0),
  dc_quote_no           text not null,
  po_reference          text not null,
  source_file_id        uuid not null references job_files(id),
  source_sha256         text not null,
  message_id            text references ingested_messages(message_id),
  status                text not null check (status in ('draft','sent','signed','superseded')),
  dealer_subtotal_cents integer not null,
  handling_fee_cents    integer not null,
  oversized_fee_cents   integer not null,
  dealer_total_cents    integer not null,
  waive_handling        boolean not null default false,
  no_install            boolean not null default false,
  install_quote_id      uuid references install_quotes(id),
  install_cents         integer,
  products_cents        integer,
  client_total_cents    integer,
  contract_file_id      uuid references job_files(id),
  sent_at               timestamptz,
  sent_by               text,
  signed_at             timestamptz,
  created_at            timestamptz not null default now(),
  unique (lead_id, version)
);

create index if not exists dc_quote_versions_contract_idx on dc_quote_versions (contract_file_id);

create table if not exists dc_quote_lines (
  version_id          uuid not null references dc_quote_versions(id) on delete cascade,
  position            integer not null,
  qty                 integer not null check (qty > 0),
  room                text not null default '',
  description         text not null,
  collection          text not null,
  base_cents          integer not null,
  promotion_cents     integer not null,
  options_cents       integer not null,
  msrp_unit_cents     integer not null,
  cost_factor         numeric(6,4),
  cost_unit_cents     integer not null,
  cost_extended_cents integer not null,
  options             jsonb not null,
  pct_override        numeric(6,2) check (pct_override is null or pct_override > 0),
  markup_pct          numeric(6,2),
  sell_unit_cents     integer,
  markup_overridden   boolean not null default false,
  primary key (version_id, position)
);

create table if not exists markup_rules (
  collection  text primary key,
  pct_of_msrp numeric(6,2) not null check (pct_of_msrp > 0 and pct_of_msrp <= 1000),
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table if not exists dc_settings (
  id                  boolean primary key default true check (id),
  terms_file_pathname text,
  terms_updated_by    text,
  terms_updated_at    timestamptz,
  last_polled_at      timestamptz
);

insert into dc_settings (id) values (true) on conflict (id) do nothing;

-- Every migration that defines job_files_doc_type_check lists the CURRENT FULL set of types
alter table job_files drop constraint if exists job_files_doc_type_check;

alter table job_files add constraint job_files_doc_type_check check (
  doc_type is null or doc_type in ('quote','po','invoice','other','contract','dealer_copy')
);

-- A Dealer Copy shows dealer cost, so the database itself refuses to share one
alter table job_files drop constraint if exists job_files_dealer_copy_never_shared;

alter table job_files add constraint job_files_dealer_copy_never_shared check (
  doc_type is distinct from 'dealer_copy' or shared_at is null
);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote')
);
