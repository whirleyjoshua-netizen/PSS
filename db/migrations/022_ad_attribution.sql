-- Ad attribution: which ad click, if any, brought in a lead.
-- Every statement is safe to re-run.
--
-- The gclid is what Google Ads needs to credit a booked or sold job back to the click.
-- gbraid and wbraid stand in for it on iOS traffic. Existing leads read null: none were tracked.

alter table leads add column if not exists gclid text;
alter table leads add column if not exists gbraid text;
alter table leads add column if not exists wbraid text;
alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_campaign text;
alter table leads add column if not exists utm_term text;
alter table leads add column if not exists landing_page text;
alter table leads add column if not exists ad_clicked_at timestamptz;
