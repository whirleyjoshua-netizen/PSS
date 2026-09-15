create table if not exists job_files (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads (id) on delete cascade,
  created_at    timestamptz not null default now(),
  uploaded_by   text not null,
  kind          text not null check (kind in ('photo','document')),
  name          text not null,
  content_type  text not null,
  size_bytes    integer not null,
  blob_pathname text not null
);

create index if not exists job_files_lead_idx on job_files (lead_id, created_at desc);

create table if not exists window_measurements (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  measured_by    text not null,
  position       integer not null,
  room           text not null,
  label          text,
  width_eighths  integer not null check (width_eighths > 0),
  height_eighths integer not null check (height_eighths > 0),
  depth_eighths  integer check (depth_eighths > 0),
  mount          text not null check (mount in ('inside','outside')),
  requirements   text[] not null default '{}',
  notes          text,
  photo_file_id  uuid references job_files (id) on delete set null
);

create index if not exists window_measurements_lead_idx on window_measurements (lead_id, position);

-- The job_events kind list is shared with 004_referrals_reviews.sql (portal step 2 branch) and must stay identical in both files.
-- Must match 011_stages_contact_log.sql, which added 'contact'.
alter table job_events drop constraint if exists job_events_kind_check;
alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact')
);
