-- Customer signatures on a contract shared to their project page.
-- Every statement is safe to re-run: scripts/migrate.mjs applies every migration on every run.

-- 016_project_page.sql last defined this check. Every migration that touches it lists every
-- type, so run order can never narrow it. 'contract' is a document a customer can sign.
alter table job_files drop constraint if exists job_files_doc_type_check;

alter table job_files add constraint job_files_doc_type_check check (
  doc_type is null or doc_type in ('quote','po','invoice','other','contract','dealer_copy')
);

-- 019_service_requests.sql last defined this check. Every migration that touches it lists
-- every kind, so run order can never narrow it. 'signature' is a customer signing a contract.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')
);

-- One signature per contract file. doc_sha256 is the fingerprint of the exact bytes the
-- customer was served: it is what proves the document the owners hold is the one agreed to.
-- signed_file_id is the stamped copy, and stays null when stamping failed.
create table if not exists contract_signatures (
  id             uuid primary key,
  lead_id        uuid not null references leads(id) on delete cascade,
  file_id        uuid not null references job_files(id) unique,
  signed_name    text not null,
  signed_email   text not null,
  signed_at      timestamptz not null default now(),
  ip             text,
  user_agent     text,
  doc_sha256     text not null,
  signed_file_id uuid references job_files(id)
);

create index if not exists contract_signatures_lead_id_idx on contract_signatures (lead_id);
