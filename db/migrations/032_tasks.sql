-- Internal task board: docs/superpowers/specs/2026-10-01-task-board-design.md.
-- Anyone with admin sign-in creates tasks, assigns them to each other, and emails reminders.
-- Every statement is safe to re-run.

create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  notes            text,
  status           text not null default 'todo',
  assignee_email   text,
  due_on           date,
  created_by       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  last_reminded_at timestamptz,
  last_reminded_by text
);

alter table tasks drop constraint if exists tasks_title_check;
alter table tasks add constraint tasks_title_check check (char_length(btrim(title)) between 1 and 200);

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check check (status in ('todo', 'doing', 'done'));

-- Assignees are compared with signed-in emails, which are lower-case and trimmed.
alter table tasks drop constraint if exists tasks_assignee_normalized_check;
alter table tasks add constraint tasks_assignee_normalized_check check (assignee_email is null or assignee_email = lower(btrim(assignee_email)));

-- The board hides Done after 14 days by completed_at, so a done task must have one.
alter table tasks drop constraint if exists tasks_completed_check;
alter table tasks add constraint tasks_completed_check check ((status = 'done') = (completed_at is not null));

alter table tasks drop constraint if exists tasks_reminded_check;
alter table tasks add constraint tasks_reminded_check check ((last_reminded_at is null) = (last_reminded_by is null));

create index if not exists tasks_status_due_idx on tasks (status, due_on);
