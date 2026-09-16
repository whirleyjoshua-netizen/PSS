-- The route creator: arrival windows and lengths, geocoded addresses, route settings and saved routes.
-- Every statement is safe to re-run.

alter table appointments add column if not exists window_start time;

alter table appointments add column if not exists window_end time;

alter table appointments add column if not exists duration_minutes integer;

alter table appointments drop constraint if exists appointments_duration_minutes_check;

alter table appointments add constraint appointments_duration_minutes_check check (
  duration_minutes is null or duration_minutes between 15 and 720
);

alter table appointments drop constraint if exists appointments_window_check;

alter table appointments add constraint appointments_window_check check (
  (window_start is null and window_end is null)
  or (window_start is not null and window_end is not null and window_start < window_end)
);

-- All-day installs were stored at 08:00 Las Vegas time. The working day now starts at 09:00.
-- updated_at is left alone so this never looks like an owner edit. A second run matches nothing.

update appointments
   set starts_at = starts_at + interval '1 hour'
 where all_day
   and (starts_at at time zone 'America/Los_Angeles')::time = '08:00';

alter table leads add column if not exists lat double precision;

alter table leads add column if not exists lng double precision;

alter table leads add column if not exists geocoded_at timestamptz;

alter table leads add column if not exists geocode_status text;

alter table leads drop constraint if exists leads_geocode_status_check;

alter table leads add constraint leads_geocode_status_check check (
  geocode_status is null or geocode_status in ('ok','not_found','error')
);

create table if not exists route_settings (
  id boolean primary key default true check (id),
  day_start time not null default '09:00',
  day_end time not null default '18:00',
  consultation_minutes integer not null default 60,
  measure_minutes integer not null default 60,
  install_minutes integer not null default 240,
  service_minutes integer not null default 90
);

insert into route_settings (id) values (true) on conflict (id) do nothing;

create table if not exists route_stops (
  id uuid primary key default gen_random_uuid(),
  route_date date not null,
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  position integer not null,
  planned_arrival timestamptz not null,
  drive_minutes integer not null,
  -- Stops plus didn't-fit appointments when the day was saved. The day is out of date when its
  -- count of appointments with coordinates no longer matches, so a cancel or a new job shows.
  saved_count integer not null default 0,
  saved_at timestamptz not null default now(),
  unique (route_date, team_member_id, position)
);

create index if not exists route_stops_date_idx on route_stops (route_date);
