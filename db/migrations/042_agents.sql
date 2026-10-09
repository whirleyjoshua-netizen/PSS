-- Agent dashboard (docs/superpowers/specs/2026-10-09-agent-dashboard-design.md).
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

create table if not exists agents (
  slug            text primary key,
  name            text not null,
  role            text not null default '',
  key_hash        text,
  stats_access    boolean not null default false,
  daily_send_cap  integer not null default 10,
  last_run_at     timestamptz,
  last_run_status text,
  last_run_note   text,
  created_at      timestamptz not null default now()
);
alter table agents drop constraint if exists agents_slug_check;
alter table agents add constraint agents_slug_check check (slug ~ '^[a-z][a-z0-9-]{1,30}$');
alter table agents drop constraint if exists agents_cap_check;
alter table agents add constraint agents_cap_check check (daily_send_cap between 0 and 50);
alter table agents drop constraint if exists agents_run_status_check;
alter table agents add constraint agents_run_status_check check (last_run_status is null or last_run_status in ('ok', 'failed'));
alter table agents drop constraint if exists agents_key_hash_check;
alter table agents add constraint agents_key_hash_check check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists agents_key_hash_idx on agents (key_hash) where key_hash is not null;

create table if not exists agent_items (
  id                  uuid primary key default gen_random_uuid(),
  agent_slug          text not null references agents (slug) on delete cascade,
  external_id         text not null,
  kind                text not null,
  title               text not null,
  summary             text,
  report_type         text,
  body_md             text,
  email_to            text,
  email_subject       text,
  email_body          text,
  reason              text,
  status              text not null,
  owner_note          text,
  final_to            text,
  final_subject       text,
  final_body          text,
  sent_body           text,
  decided_by          text,
  decided_at          timestamptz,
  sent_at             timestamptz,
  graph_message_id    text,
  conversation_id     text,
  internet_message_id text,
  error               text,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists agent_items_agent_external_idx on agent_items (agent_slug, external_id);
create index if not exists agent_items_agent_created_idx on agent_items (agent_slug, created_at desc);
create index if not exists agent_items_open_idx on agent_items (status) where status in ('pending', 'failed', 'unread');
create index if not exists agent_items_conversation_idx on agent_items (conversation_id) where conversation_id is not null;

alter table agent_items drop constraint if exists agent_items_kind_status_check;
alter table agent_items add constraint agent_items_kind_status_check check (
  (kind = 'report'   and status in ('unread', 'read')) or
  (kind = 'email'    and status in ('pending', 'approved', 'sent', 'failed', 'declined')) or
  (kind = 'decision' and status in ('pending', 'approved', 'declined', 'answered'))
);
alter table agent_items drop constraint if exists agent_items_external_id_check;
alter table agent_items add constraint agent_items_external_id_check check (external_id ~ '^[A-Za-z0-9._-]{1,100}$');
alter table agent_items drop constraint if exists agent_items_title_check;
alter table agent_items add constraint agent_items_title_check check (char_length(title) between 1 and 200);
alter table agent_items drop constraint if exists agent_items_report_type_check;
alter table agent_items add constraint agent_items_report_type_check check (
  (kind = 'report' and report_type is not null and report_type in ('daily', 'weekly', 'monthly', 'brief', 'other')) or (kind <> 'report' and report_type is null)
);
alter table agent_items drop constraint if exists agent_items_body_size_check;
alter table agent_items add constraint agent_items_body_size_check check (body_md is null or octet_length(body_md) <= 204800);
alter table agent_items drop constraint if exists agent_items_email_fields_check;
alter table agent_items add constraint agent_items_email_fields_check check (
  kind <> 'email' or (email_to is not null and email_subject is not null and email_body is not null)
);

create table if not exists agent_replies (
  id                  uuid primary key default gen_random_uuid(),
  item_id             uuid not null references agent_items (id) on delete cascade,
  internet_message_id text not null,
  from_address        text not null,
  received_at         timestamptz not null,
  subject             text,
  body_text           text not null default '',
  delivered_at        timestamptz,
  seen_at             timestamptz,
  created_at          timestamptz not null default now()
);
create unique index if not exists agent_replies_message_idx on agent_replies (internet_message_id);
alter table agent_replies drop constraint if exists agent_replies_body_size_check;
alter table agent_replies add constraint agent_replies_body_size_check check (octet_length(body_text) <= 51200);

create table if not exists email_suppressions (
  address    text primary key,
  reason     text,
  source     text not null,
  created_at timestamptz not null default now()
);
alter table email_suppressions drop constraint if exists email_suppressions_address_check;
alter table email_suppressions add constraint email_suppressions_address_check check (address = lower(btrim(address)) and address like '%_@_%');
alter table email_suppressions drop constraint if exists email_suppressions_source_check;
alter table email_suppressions add constraint email_suppressions_source_check check (source in ('reply', 'owner'));

create table if not exists agent_settings (
  id                 boolean primary key default true,
  mailing_address    text,
  signature          text,
  last_digest_at     timestamptz,
  last_reply_poll_at timestamptz,
  updated_by         text,
  updated_at         timestamptz not null default now()
);
alter table agent_settings drop constraint if exists agent_settings_single_row;
alter table agent_settings add constraint agent_settings_single_row check (id);
insert into agent_settings (id) values (true) on conflict do nothing;

-- The two agents that exist today. Keys are created in Settings, never here.
insert into agents (slug, name, role, stats_access) values ('tara', 'Tara', 'Marketing strategist', true) on conflict do nothing;
insert into agents (slug, name, role, stats_access) values ('tobi', 'Tobi', 'B2B commercial outreach', false) on conflict do nothing;
