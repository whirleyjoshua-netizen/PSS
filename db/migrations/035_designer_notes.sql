-- Designer notes per appointment, and the hash of the Outlook event body the admin last wrote
-- (docs/superpowers/specs/2026-10-01-designer-notes-design.md).
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

alter table appointments add column if not exists designer_notes text;

alter table appointments drop constraint if exists appointments_designer_notes_check;

alter table appointments add constraint appointments_designer_notes_check check (
  designer_notes is null or char_length(designer_notes) <= 2000
);

alter table job_calendar_events add column if not exists body_hash text;
