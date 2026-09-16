-- Installation pricing: rates the owner edits, and immutable priced snapshots.
-- Every statement is safe to re-run. Rates are deliberately not seeded: a missing
-- row means "not configured yet", which the calculator must say out loud rather
-- than price at zero.

create table if not exists install_rates (
  treatment text primary key,
  basis text not null,
  rate_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table install_rates drop constraint if exists install_rates_basis_check;
alter table install_rates add constraint install_rates_basis_check check (
  basis in ('window','linear_ft','sq_ft')
);

alter table install_rates drop constraint if exists install_rates_rate_check;
alter table install_rates add constraint install_rates_rate_check check (rate_cents >= 0);

-- One row, enforced by the primary key plus a check that it is always true.
create table if not exists install_settings (
  id boolean primary key default true,
  minimum_cents integer not null default 0,
  hard_surface_cents integer not null default 0,
  high_ladder_cents integer not null default 0,
  motorized_cents integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint install_settings_single check (id)
);

alter table install_settings add column if not exists updated_by text;

insert into install_settings (id) values (true) on conflict (id) do nothing;

alter table install_settings drop constraint if exists install_settings_cents_check;
alter table install_settings add constraint install_settings_cents_check check (
  minimum_cents >= 0 and hard_surface_cents >= 0 and high_ladder_cents >= 0 and motorized_cents >= 0
);

create table if not exists install_quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  kind text not null,
  minimum_cents integer not null,
  subtotal_cents integer not null,
  total_cents integer not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

alter table install_quotes drop constraint if exists install_quotes_kind_check;
alter table install_quotes add constraint install_quotes_kind_check check (
  kind in ('estimate','final')
);

alter table install_quotes drop constraint if exists install_quotes_cents_check;
alter table install_quotes add constraint install_quotes_cents_check check (
  minimum_cents >= 0 and subtotal_cents >= 0 and total_cents >= 0
);

-- basis and rate_cents are copied in, never joined back to install_rates:
-- a snapshot that looked up its rate would change when a rate changed.
create table if not exists install_quote_lines (
  id uuid primary key default gen_random_uuid(),
  install_quote_id uuid not null references install_quotes(id) on delete cascade,
  position integer not null,
  treatment text not null,
  basis text not null,
  quantity integer not null,
  rate_cents integer not null,
  hard_surface boolean not null default false,
  high_ladder boolean not null default false,
  motorized boolean not null default false,
  amount_cents integer not null
);

alter table install_quote_lines drop constraint if exists install_quote_lines_basis_check;
alter table install_quote_lines add constraint install_quote_lines_basis_check check (
  basis in ('window','linear_ft','sq_ft')
);

alter table install_quote_lines drop constraint if exists install_quote_lines_numbers_check;
alter table install_quote_lines add constraint install_quote_lines_numbers_check check (
  quantity >= 0 and rate_cents >= 0 and amount_cents >= 0 and position >= 0
);

create index if not exists install_quotes_lead_idx on install_quotes (lead_id, created_at desc);
create index if not exists install_quote_lines_quote_idx on install_quote_lines (install_quote_id, position);
