-- A short, human-friendly project number for the customer page, and a type label for documents.
-- Every statement is safe to re-run. The backfill only touches rows that have no number yet.

create sequence if not exists project_no_seq start with 1001;

alter table leads add column if not exists project_no integer;

update leads set project_no = nextval('project_no_seq') where project_no is null;

alter table leads alter column project_no set default nextval('project_no_seq');

create unique index if not exists leads_project_no_key on leads (project_no);

alter table job_files add column if not exists doc_type text;

-- Every migration that defines job_files_doc_type_check lists the CURRENT FULL set of types
-- (identical to 021_contract_signing.sql), because migrate.mjs re-applies every file on every
-- run and a shorter list here would fail against rows holding newer types.
alter table job_files drop constraint if exists job_files_doc_type_check;

alter table job_files add constraint job_files_doc_type_check check (
  doc_type is null or doc_type in ('quote','po','invoice','other','contract')
);
