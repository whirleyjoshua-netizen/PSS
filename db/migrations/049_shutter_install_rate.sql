-- The shutter price guide's own install charge per sq ft (owner 2026-11-11: $6, entered on the
-- Rates screen). Kept apart from Settings → Installation rates, which prices install-only jobs.
-- Null until set. Safe to re-run.
alter table shutter_settings add column if not exists install_cents_per_sqft integer;

alter table shutter_settings drop constraint if exists shutter_settings_install_check;
alter table shutter_settings add constraint shutter_settings_install_check check (
  install_cents_per_sqft is null or install_cents_per_sqft >= 0
);
