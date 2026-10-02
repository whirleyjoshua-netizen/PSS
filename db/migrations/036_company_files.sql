-- The owner-only Resources library (docs/superpowers/specs/2026-10-02-logo-and-resources-design.md, Part B).
-- Each row is one file in private Blob storage under resources/<id>/.
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

create table if not exists company_files (
  id            uuid primary key,
  name          text not null,
  category      text not null,
  content_type  text not null,
  size_bytes    bigint not null,
  blob_pathname text not null,
  uploaded_by   text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Names and categories are stored trimmed, as lib/admin/resource-rules.ts cleans them.
alter table company_files drop constraint if exists company_files_name_check;
alter table company_files add constraint company_files_name_check check (
  name = btrim(name) and char_length(name) between 1 and 200
);

alter table company_files drop constraint if exists company_files_category_check;
alter table company_files add constraint company_files_category_check check (
  category = btrim(category) and char_length(category) between 1 and 60
);

-- 1 byte to 200 MB, the upload token's own limit.
alter table company_files drop constraint if exists company_files_size_check;
alter table company_files add constraint company_files_size_check check (size_bytes between 1 and 209715200);

-- A row only ever points into its own folder, so deleting one file can never reach another.
alter table company_files drop constraint if exists company_files_pathname_check;
alter table company_files add constraint company_files_pathname_check check (
  blob_pathname ~ '^resources/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
  and split_part(blob_pathname, '/', 2) = id::text
);

create unique index if not exists company_files_pathname_idx on company_files (blob_pathname);
create index if not exists company_files_category_name_idx on company_files (category, name);
