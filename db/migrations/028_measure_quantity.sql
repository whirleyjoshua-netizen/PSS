-- Quantity on a measured window: one line can stand for several identical windows (same room,
-- size, mount and requirements), so ten matching windows are measured once, not ten times.
-- Every statement is safe to re-run. Lines measured before this read 1, which is what they were.

alter table window_measurements add column if not exists quantity integer not null default 1;

alter table window_measurements drop constraint if exists window_measurements_quantity_check;
alter table window_measurements add constraint window_measurements_quantity_check check (quantity between 1 and 99);
