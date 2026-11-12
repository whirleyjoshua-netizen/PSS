-- Where a quote version came from (owner 2026-11-12: the shutter price guide makes official quotes).
-- 'direct_connect' is a Hunter Douglas Dealer Copy import. 'shutter_guide' is a Norman or Onyx quote
-- made from the price guide, whose source file is a cost sheet filed as a dealer copy (never shared).
-- Existing rows are all Direct Connect imports. Safe to re-run.
alter table dc_quote_versions add column if not exists source text not null default 'direct_connect';

alter table dc_quote_versions drop constraint if exists dc_quote_versions_source_check;
alter table dc_quote_versions add constraint dc_quote_versions_source_check check (
  source in ('direct_connect','shutter_guide')
);
