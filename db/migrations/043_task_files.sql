-- Files on tasks (docs/superpowers/specs/2026-10-09-task-files-design.md).
-- One row per attachment: a file uploaded to the task (in private Blob storage under task-files/<task id>/<id>/)
-- or a link to a Resources file. Deleting the task or the Resources file removes the row.
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

create table if not exists task_files (
  id            uuid primary key,
  task_id       uuid not null references tasks (id) on delete cascade,
  resource_id   uuid references company_files (id) on delete cascade,
  name          text,
  content_type  text,
  size_bytes    bigint,
  blob_pathname text,
  added_by      text not null,
  created_at    timestamptz not null default now()
);

-- Exactly one kind: a link carries only the Resources id, an upload carries all four of its own columns.
alter table task_files drop constraint if exists task_files_kind_check;
alter table task_files add constraint task_files_kind_check check (
  (resource_id is not null and name is null and content_type is null and size_bytes is null and blob_pathname is null)
  or (resource_id is null and name is not null and content_type is not null and size_bytes is not null and blob_pathname is not null)
);

-- Names are stored trimmed, as uploadName in lib/admin/resource-rules.ts cleans them.
alter table task_files drop constraint if exists task_files_name_check;
alter table task_files add constraint task_files_name_check check (
  name is null or (name = btrim(name) and char_length(name) between 1 and 200)
);

-- 1 byte to 200 MB, the upload token's own limit.
alter table task_files drop constraint if exists task_files_size_check;
alter table task_files add constraint task_files_size_check check (
  size_bytes is null or size_bytes between 1 and 209715200
);

-- A Resources file is linked to a task once, and each stored file belongs to one row.
create unique index if not exists task_files_task_resource_idx on task_files (task_id, resource_id) where resource_id is not null;
create unique index if not exists task_files_blob_idx on task_files (blob_pathname) where blob_pathname is not null;
create index if not exists task_files_task_idx on task_files (task_id);
create index if not exists task_files_resource_idx on task_files (resource_id);
