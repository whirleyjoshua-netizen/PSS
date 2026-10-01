-- Designer measure vs Official measure. A job is measured by the designer at the consult (for the
-- quote) and officially later (the numbers that are ordered). Each window says which it belongs to.
-- When the designer is confident, the job records that its designer measure IS the official one
-- (who and when) instead of copying rows, so there is only ever one set of numbers to edit.
-- Every statement is safe to re-run. Rows measured before this read 'designer'.

alter table window_measurements add column if not exists kind text not null default 'designer';
alter table window_measurements drop constraint if exists window_measurements_kind_check;
alter table window_measurements add constraint window_measurements_kind_check check (kind in ('designer', 'official'));

alter table leads add column if not exists designer_kept_official_at timestamptz;
alter table leads add column if not exists designer_kept_official_by text;
alter table leads drop constraint if exists leads_designer_kept_official_check;
alter table leads add constraint leads_designer_kept_official_check
  check ((designer_kept_official_at is null) = (designer_kept_official_by is null));
