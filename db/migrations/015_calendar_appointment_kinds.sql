-- Outlook now holds an event for every appointment kind, not just visits and installs.
-- The link table's kind matches lib/admin/appointment-kinds.ts, and the old 'visit' links
-- become 'consultation' so each existing event keeps pointing at the same appointment.
--
-- Every statement is safe to re-run: the migrate script applies all files.

alter table job_calendar_events drop constraint if exists job_calendar_events_kind_check;

update job_calendar_events set kind = 'consultation' where kind = 'visit';

alter table job_calendar_events add constraint job_calendar_events_kind_check check (
  kind in ('consultation', 'measure', 'install', 'service')
);
