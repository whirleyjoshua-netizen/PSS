-- Installation built into the line prices, divided evenly per shade (owner, 2026-10-02: no installation line on quotes).
-- Send quote freezes the amount built in. Null on versions sent before, which print installation as its own line.
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

alter table dc_quote_versions add column if not exists install_folded_cents integer;

alter table dc_quote_versions drop constraint if exists dc_quote_versions_install_folded_check;
alter table dc_quote_versions add constraint dc_quote_versions_install_folded_check check (
  install_folded_cents is null or install_folded_cents >= 0
);
