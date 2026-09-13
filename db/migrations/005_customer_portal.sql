-- Portal step 3: the customer project page.
-- Every statement is safe to re-run. job_events_kind_check is unchanged.

alter table job_files add column if not exists shared_at timestamptz;

alter table leads add column if not exists portal_invited_at timestamptz;

create index if not exists leads_email_norm_idx on leads (lower(trim(email)));

create table if not exists customer_login_tokens (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists customer_login_tokens_email_idx on customer_login_tokens (email, created_at);

create table if not exists customer_sessions (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
