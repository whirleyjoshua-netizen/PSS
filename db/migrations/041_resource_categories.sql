-- Resources categories as their own rows (docs/superpowers/specs/2026-10-07-resource-categories-design.md).
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

create table if not exists resource_categories (
  name       text primary key,
  created_at timestamptz not null default now()
);

-- Stored trimmed, 1 to 60 characters, as lib/admin/resource-rules.ts cleans them.
alter table resource_categories drop constraint if exists resource_categories_name_check;
alter table resource_categories add constraint resource_categories_name_check check (
  name = btrim(name) and char_length(name) between 1 and 60
);

-- One category per name whatever the case, so Licenses and licenses can never both exist.
create unique index if not exists resource_categories_lower_name_idx on resource_categories (lower(name));

-- Where a deleted category's files go. The app never renames or deletes it.
insert into resource_categories (name) values ('Uncategorized') on conflict do nothing;

-- Every category files use today, one spelling per name (the first A-Z when only the case differs).
insert into resource_categories (name)
  select distinct on (lower(category)) category from company_files order by lower(category), category
  on conflict do nothing;

-- Files spelled another way than their category's row take its spelling, so the reference below holds.
update company_files f set category = c.name
  from resource_categories c
  where lower(f.category) = lower(c.name) and f.category <> c.name;

-- A rename carries the files with it, and a delete drops them to Uncategorized, each in the one statement.
alter table company_files alter column category set default 'Uncategorized';
alter table company_files drop constraint if exists company_files_category_fkey;
alter table company_files add constraint company_files_category_fkey
  foreign key (category) references resource_categories (name) on update cascade on delete set default;
