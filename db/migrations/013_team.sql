-- The team the owners assign jobs to. Names only, never sign-in.
-- Every statement is safe to re-run. Removing a person leaves their jobs unassigned.

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  created_at timestamptz not null default now()
);

alter table team_members drop constraint if exists team_members_role_check;

alter table team_members add constraint team_members_role_check check (
  role in ('designer','installer')
);

alter table team_members drop constraint if exists team_members_name_check;

alter table team_members add constraint team_members_name_check check (
  length(trim(name)) between 1 and 60
);

alter table leads add column if not exists assigned_to uuid references team_members(id) on delete set null;
