-- Customer-filed service requests.
-- Every statement is safe to re-run: scripts/migrate.mjs applies every migration on every run.

-- A service request creates a new job that points back at the original.
alter table leads add column if not exists parent_job_id uuid references leads(id);

create index if not exists leads_parent_job_id_idx on leads (parent_job_id);

-- 011_stages_contact_log.sql last defined this check. Every migration that touches it
-- lists every kind, so run order can never narrow it. 'message' is a customer's message
-- from their project page, 'service' is a customer's service request.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service')
);
