-- Who a new lead is assigned to when it arrives. Every statement is safe to re-run.
-- The default is deliberately not seeded with a person: the owner picks it in Settings,
-- and an empty default leaves new leads unassigned, exactly as before this migration.

-- One row, enforced by the primary key plus a check that it is always true (as install_settings, 018).
create table if not exists lead_settings (
  id boolean primary key default true,
  -- Removing that team member clears the default rather than blocking the removal.
  default_assignee uuid references team_members(id) on delete set null,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint lead_settings_single check (id)
);

insert into lead_settings (id) values (true) on conflict (id) do nothing;
