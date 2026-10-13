-- Hunter Douglas order confirmations (spec docs/superpowers/specs/2026-10-12-dc-order-confirmation-design.md)
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments.

-- 'ordered' is an HD order confirmation recorded on a job. 'receipt' is DC's Confirming Receipt email, kept so a
-- submission HD never confirms can be flagged. 024 declared this check inline, so Postgres named it ingested_messages_outcome_check.
-- Every migration that defines ingested_messages_outcome_check lists the CURRENT FULL set of outcomes.
alter table ingested_messages drop constraint if exists ingested_messages_outcome_check;

alter table ingested_messages add constraint ingested_messages_outcome_check check (
  outcome in ('imported','unchanged','no-po','no-match','no-costs','incomplete','unreadable','failed','ordered','receipt')
);

-- A receipt's PO as printed, so the stale check can pair it with its confirmation.
alter table ingested_messages add column if not exists po_reference text;

-- Set once the owners were told a receipt has had no confirmation for a day, so they are told once.
alter table ingested_messages add column if not exists warned_at timestamptz;

-- One row per HD order. The quoted figure is the option's dealer total (before tax) when the order arrived,
-- kept beside HD's own figures so a difference shows. Nothing here changes a quote version.
create table if not exists dc_orders (
  id                        uuid primary key,
  lead_id                   uuid not null references leads(id) on delete cascade,
  option                    text not null check (option ~ '^[A-Z]$'),
  po_reference              text not null,
  hd_order_no               text not null unique,
  order_date                date not null,
  subtotal_cents            integer not null,
  oversize_cents            integer not null,
  handling_cents            integer not null,
  tax_cents                 integer not null,
  total_cents               integer not null,
  quoted_dealer_total_cents integer,
  quote_version_id          uuid references dc_quote_versions(id) on delete set null,
  file_id                   uuid references job_files(id) on delete set null,
  message_id                text not null references ingested_messages(message_id),
  received_at               timestamptz not null,
  created_at                timestamptz not null default now(),
  check (subtotal_cents + oversize_cents + handling_cents + tax_cents = total_cents)
);

create index if not exists dc_orders_lead_idx on dc_orders (lead_id);
