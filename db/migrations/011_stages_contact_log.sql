-- Stages without Contacted, and the contact log's event kind.
-- Every statement is safe to re-run. Any Contacted job returns to New and keeps its day count.
-- The job_events kind list must stay identical to the ones in 003_measure_and_files.sql and 004_referrals_reviews.sql.

update leads set status = 'new' where status = 'contacted';

alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check check (
  status in ('new','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')
);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds
-- (identical to 021_contract_signing.sql), because migrate.mjs re-applies every file on every
-- run and a shorter list here would fail against rows holding newer kinds.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')
);
