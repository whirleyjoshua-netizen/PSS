-- Sign-in by a 6-digit code as well as the link (docs/superpowers/specs/2026-10-01-pss-ops-app-design.md).
-- The code shares the link's row, so using either one uses both. Safe to re-run.
-- Whole-line comments only, and no semicolons in comments.

alter table admin_login_tokens add column if not exists code_hash text;
alter table admin_login_tokens add column if not exists code_attempts smallint not null default 0;

alter table admin_login_tokens drop constraint if exists admin_login_tokens_code_attempts_check;
alter table admin_login_tokens add constraint admin_login_tokens_code_attempts_check check (code_attempts between 0 and 5);

-- Face ID sign-in (passkeys). One row per registered device, keyed by its credential id.
-- The public key and counter are what each sign-in is verified against.
create table if not exists admin_passkeys (
  id            text primary key,
  email         text not null,
  public_key    bytea not null,
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  label         text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  constraint admin_passkeys_email_normalized check (email = lower(btrim(email)))
);
create index if not exists admin_passkeys_email_idx on admin_passkeys (email);

-- A challenge is used once and expires after 5 minutes. Email is set for register, null for sign-in.
create table if not exists admin_webauthn_challenges (
  id          text primary key,
  challenge   text not null,
  purpose     text not null,
  email       text,
  expires_at  timestamptz not null,
  constraint admin_webauthn_challenges_purpose_check check (purpose in ('register', 'sign-in'))
);

-- A register challenge always carries the address it binds to. Dropped first so a re-run, or a
-- branch that already has the table, ends with exactly this check.
alter table admin_webauthn_challenges drop constraint if exists admin_webauthn_challenges_email_check;
alter table admin_webauthn_challenges add constraint admin_webauthn_challenges_email_check check (purpose = 'sign-in' or email is not null);
-- The sweep of expired challenges and the count of waiting sign-ins both filter on expiry.
create index if not exists admin_webauthn_challenges_expires_idx on admin_webauthn_challenges (expires_at);
