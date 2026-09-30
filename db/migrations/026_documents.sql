-- Documents: templates, per-client documents and acknowledgements.
-- Spec docs/superpowers/specs/2026-09-28-documents-design.md section 4.
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments or string literals.

-- Templates the owner writes on the Documents page. Terms and the two guides are singletons
-- and always view only. Archiving never touches documents already made from a template.
create table if not exists document_templates (
  id          uuid primary key,
  name        text not null check (btrim(name) <> ''),
  kind        text not null check (kind in ('terms','service_agreement','change_order','other','guide_install','guide_care')),
  response    text not null check (response in ('sign','acknowledge','view')),
  body        text not null,
  archived_at timestamptz,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (kind not in ('terms','guide_install','guide_care') or response = 'view')
);

-- At most one live template of each singleton kind
create unique index if not exists document_templates_one_live_singleton on document_templates (kind) where archived_at is null and kind in ('terms','guide_install','guide_care');

-- One document made for one job. kind and response are copied from the template. file_id is the
-- rendered PDF, set on send, so a sent, completed or void document always names its file.
create table if not exists job_documents (
  id           uuid primary key,
  lead_id      uuid not null references leads(id) on delete cascade,
  template_id  uuid references document_templates(id) on delete set null,
  title        text not null check (btrim(title) <> ''),
  kind         text not null check (kind in ('service_agreement','change_order','other')),
  response     text not null check (response in ('sign','acknowledge','view')),
  body         text not null,
  status       text not null default 'draft' check (status in ('draft','sent','completed','void')),
  file_id      uuid references job_files(id),
  sent_at      timestamptz,
  sent_by      text,
  completed_at timestamptz,
  voided_at    timestamptz,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status = 'draft' or file_id is not null)
);

create index if not exists job_documents_lead_id_idx on job_documents (lead_id);

-- A file is the PDF of at most one document
create unique index if not exists job_documents_file_key on job_documents (file_id) where file_id is not null;

-- A client acknowledging a document, mirroring contract_signatures. doc_sha256 is the
-- fingerprint of the exact bytes served, which proves the version that was acknowledged.
create table if not exists document_acknowledgements (
  id                 uuid primary key,
  lead_id            uuid not null references leads(id) on delete cascade,
  file_id            uuid not null references job_files(id) unique,
  acknowledged_name  text not null,
  acknowledged_email text not null,
  ip                 text,
  user_agent         text,
  doc_sha256         text not null,
  acknowledged_at    timestamptz not null default now()
);

create index if not exists document_acknowledgements_lead_id_idx on document_acknowledgements (lead_id);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds.
-- 'document' is a job document drafted, sent, voided, discarded or acknowledged.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')
);
