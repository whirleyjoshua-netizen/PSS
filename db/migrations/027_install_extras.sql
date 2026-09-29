-- Installation extras: takedown of what is on the windows now, and motorization app set-up.
-- Every statement is safe to re-run. Checks are their own named constraints (see 020 for why).

-- The rates as the owner sets them in Settings. 0 means "not set", and pricing refuses to use it.
alter table install_settings add column if not exists takedown_cents integer not null default 0;
alter table install_settings add column if not exists shutter_takedown_cents integer not null default 0;
alter table install_settings add column if not exists app_setup_small_cents integer not null default 0;
alter table install_settings add column if not exists app_setup_large_cents integer not null default 0;

alter table install_settings drop constraint if exists install_settings_extras_cents_check;
alter table install_settings add constraint install_settings_extras_cents_check check (
  takedown_cents >= 0 and shutter_takedown_cents >= 0 and app_setup_small_cents >= 0 and app_setup_large_cents >= 0
);

-- What a saved price charged in extras. Prices saved before extras existed read 0, which is true.
alter table install_quotes add column if not exists extras_cents integer not null default 0;

alter table install_quotes drop constraint if exists install_quotes_extras_cents_check;
alter table install_quotes add constraint install_quotes_extras_cents_check check (extras_cents >= 0);

-- Each extra a saved price charged. rate_cents is copied in, never joined back to install_settings.
-- For app set-up rows, quantity is the motor count and amount_cents equals the flat rate_cents.
create table if not exists install_quote_extras (
  id uuid primary key default gen_random_uuid(),
  install_quote_id uuid not null references install_quotes(id) on delete cascade,
  position integer not null,
  kind text not null,
  quantity integer not null,
  rate_cents integer not null,
  amount_cents integer not null
);

alter table install_quote_extras drop constraint if exists install_quote_extras_kind_check;
alter table install_quote_extras add constraint install_quote_extras_kind_check check (
  kind in ('takedown','shutter_takedown','app_setup_small','app_setup_large','app_setup_custom')
);

alter table install_quote_extras drop constraint if exists install_quote_extras_numbers_check;
alter table install_quote_extras add constraint install_quote_extras_numbers_check check (
  position >= 0 and quantity >= 0 and rate_cents >= 0 and amount_cents >= 0
);

create index if not exists install_quote_extras_quote_idx on install_quote_extras (install_quote_id, position);
