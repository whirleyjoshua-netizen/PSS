-- Column, the team's work app, reads leads and the do-not-contact list through /api/column with one key.
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

-- Keys for apps that connect to the site. Only the sha256 of a key is stored.
create table if not exists integration_keys (
  name         text primary key,
  key_hash     text not null,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table integration_keys drop constraint if exists integration_keys_name_check;
alter table integration_keys add constraint integration_keys_name_check check (name in ('column'));
alter table integration_keys drop constraint if exists integration_keys_hash_check;
alter table integration_keys add constraint integration_keys_hash_check check (key_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists integration_keys_hash_idx on integration_keys (key_hash);

-- One unsubscribe link per address. The token is random, so a link can't be worked out from an address.
create table if not exists email_unsubscribe_links (
  token      text primary key,
  address    text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists email_unsubscribe_links_address_idx on email_unsubscribe_links (address);
alter table email_unsubscribe_links drop constraint if exists email_unsubscribe_links_address_check;
alter table email_unsubscribe_links add constraint email_unsubscribe_links_address_check check (address = lower(btrim(address)) and address like '%_@_%');
alter table email_unsubscribe_links drop constraint if exists email_unsubscribe_links_token_check;
alter table email_unsubscribe_links add constraint email_unsubscribe_links_token_check check (token ~ '^[A-Za-z0-9_-]{32,64}$');

-- Unsubscribing from a link adds the address to email_suppressions with source 'link', allowed in 044.
