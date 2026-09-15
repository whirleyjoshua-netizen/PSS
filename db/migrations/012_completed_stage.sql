-- Adds the Completed stage after Installed. No rows change.
-- migrate.mjs re-applies every file, so the status lists in 002 and 011 include completed too. Keep all three in step.

alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check check (
  status in ('new','visit_booked','quoted','sold','ordered','installed','completed','lost')
);
