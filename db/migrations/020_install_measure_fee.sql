-- Measurement fee: a flat price for an installer's measuring visit, charged per job by choice.
-- Every statement is safe to re-run.
--
-- The checks here are their own named constraints rather than a widened version of 018's.
-- migrate.mjs re-runs every file in order, so redefining 018's check here would be undone
-- by 018 on the next run before this file restored it.

-- The fee as the owner sets it in Settings.
alter table install_settings add column if not exists measure_cents integer not null default 0;

alter table install_settings drop constraint if exists install_settings_measure_cents_check;
alter table install_settings add constraint install_settings_measure_cents_check check (measure_cents >= 0);

-- The fee a saved price actually charged: 0 when that job was not charged for measuring.
-- Existing saved prices read 0, which is true: none of them charged one.
alter table install_quotes add column if not exists measure_cents integer not null default 0;

alter table install_quotes drop constraint if exists install_quotes_measure_cents_check;
alter table install_quotes add constraint install_quotes_measure_cents_check check (measure_cents >= 0);
