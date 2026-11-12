-- Shutter quick-quote rates (Resources → Shutter pricing). These are dealer costs from
-- Norman and Onyx, entered by the owners on the Rates screen: no numbers are seeded here,
-- because this repository is public. Every statement is safe to re-run.

create table if not exists shutter_lines (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  name text not null,
  cost_cents_per_sqft integer not null,
  min_sqft integer not null default 0,
  position integer not null default 0
);

alter table shutter_lines drop constraint if exists shutter_lines_supplier_check;
alter table shutter_lines add constraint shutter_lines_supplier_check check (supplier in ('norman','onyx'));
alter table shutter_lines drop constraint if exists shutter_lines_numbers_check;
alter table shutter_lines add constraint shutter_lines_numbers_check check (cost_cents_per_sqft > 0 and min_sqft >= 0 and position >= 0);

-- amount is basis points for kind 'percent' (1000 = 10%), otherwise cents per unit.
create table if not exists shutter_options (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  name text not null,
  kind text not null,
  amount integer not null,
  position integer not null default 0
);

alter table shutter_options drop constraint if exists shutter_options_supplier_check;
alter table shutter_options add constraint shutter_options_supplier_check check (supplier in ('norman','onyx'));
alter table shutter_options drop constraint if exists shutter_options_kind_check;
alter table shutter_options add constraint shutter_options_kind_check check (
  kind in ('percent','per_window','per_panel','per_sqft','per_linear_ft','each','per_order')
);
alter table shutter_options drop constraint if exists shutter_options_numbers_check;
alter table shutter_options add constraint shutter_options_numbers_check check (amount >= 0 and position >= 0);

create index if not exists shutter_lines_supplier_idx on shutter_lines (supplier, position);
create index if not exists shutter_options_supplier_idx on shutter_options (supplier, position);

-- One freight rule per supplier. All zeros means "no freight entered".
create table if not exists shutter_freight (
  supplier text primary key,
  first_cents integer not null default 0,
  additional_cents integer not null default 0,
  oversize_width_eighths integer not null default 0,
  oversize_first_cents integer not null default 0,
  oversize_additional_cents integer not null default 0,
  per_sqft_cents integer not null default 0,
  min_sqft integer not null default 0
);

alter table shutter_freight drop constraint if exists shutter_freight_supplier_check;
alter table shutter_freight add constraint shutter_freight_supplier_check check (supplier in ('norman','onyx'));
alter table shutter_freight drop constraint if exists shutter_freight_numbers_check;
alter table shutter_freight add constraint shutter_freight_numbers_check check (
  first_cents >= 0 and additional_cents >= 0 and oversize_width_eighths >= 0 and oversize_first_cents >= 0
  and oversize_additional_cents >= 0 and per_sqft_cents >= 0 and min_sqft >= 0
);

-- The single settings row. markup_hundredths: 191 = 1.91× cost; null until the owner sets it.
create table if not exists shutter_settings (
  id boolean primary key default true,
  markup_hundredths integer,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table shutter_settings drop constraint if exists shutter_settings_single_row;
alter table shutter_settings add constraint shutter_settings_single_row check (id);
alter table shutter_settings drop constraint if exists shutter_settings_markup_check;
alter table shutter_settings add constraint shutter_settings_markup_check check (
  markup_hundredths is null or markup_hundredths between 100 and 1000
);

insert into shutter_settings (id) values (true) on conflict (id) do nothing;
