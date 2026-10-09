-- A discount on a quote version (owner, 2026-10-09: the holiday special, 10% off 3 or more shades).
-- The owner sets a percent or a dollar amount, never both, and a label the client sees on the quote and contract.
-- Send quote freezes the amount taken off in discount_cents, and client_total_cents is the total after it.
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

alter table dc_quote_versions add column if not exists discount_pct numeric(5,2);
alter table dc_quote_versions add column if not exists discount_amount_cents integer;
alter table dc_quote_versions add column if not exists discount_label text;
alter table dc_quote_versions add column if not exists discount_cents integer;

alter table dc_quote_versions drop constraint if exists dc_quote_versions_discount_check;
alter table dc_quote_versions add constraint dc_quote_versions_discount_check check (
  (discount_pct is null or (discount_pct > 0 and discount_pct < 100))
  and (discount_amount_cents is null or discount_amount_cents > 0)
  and not (discount_pct is not null and discount_amount_cents is not null)
  and ((discount_pct is null and discount_amount_cents is null) = (discount_label is null))
  and (discount_label is null or length(trim(discount_label)) between 1 and 60)
  and (discount_cents is null or discount_cents >= 0)
);
