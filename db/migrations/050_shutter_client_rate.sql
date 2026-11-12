-- A line's own client price per sq ft, installed and shipped (owner 2026-11-12: Woodlore
-- Americas at a flat $27). When set it replaces the markup for that line; add-ons on it are
-- marked up by the same multiple the price implies. Null keeps the markup. Safe to re-run.
alter table shutter_lines add column if not exists client_cents_per_sqft integer;

alter table shutter_lines drop constraint if exists shutter_lines_client_rate_check;
alter table shutter_lines add constraint shutter_lines_client_rate_check check (
  client_cents_per_sqft is null or client_cents_per_sqft > 0
);
