-- Column sends back the calls and emails it logs against a lead, and they land on the lead's timeline.
-- column_id is Column's own id for each one, so a resend never logs it twice.
-- Every statement is safe to re-run. Whole-line comments only, and no semicolons in comments.

alter table job_events add column if not exists column_id text;
create unique index if not exists job_events_column_id_idx on job_events (column_id) where column_id is not null;
