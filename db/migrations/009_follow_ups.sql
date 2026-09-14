-- Call-back reminders: one next follow-up per job.
-- Every statement is safe to re-run.

alter table leads add column if not exists follow_up_at timestamptz;

alter table leads add column if not exists follow_up_note text;

alter table leads drop constraint if exists leads_follow_up_note_check;

alter table leads add constraint leads_follow_up_note_check check (follow_up_note is null or char_length(follow_up_note) <= 200);

create index if not exists leads_follow_up_at_idx on leads (follow_up_at) where follow_up_at is not null;
