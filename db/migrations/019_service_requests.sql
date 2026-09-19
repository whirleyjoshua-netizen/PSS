-- Customer-filed service requests.
-- Every statement is safe to re-run: scripts/migrate.mjs applies every migration on every run.

-- A service request creates a new job that points back at the original.
alter table leads add column if not exists parent_job_id uuid references leads(id);

create index if not exists leads_parent_job_id_idx on leads (parent_job_id);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds
-- (identical to 021_contract_signing.sql), because migrate.mjs re-applies every file on every
-- run and a shorter list here would fail against rows holding newer kinds.
-- 'message' is a customer's message from their project page, 'service' a service request.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature')
);
