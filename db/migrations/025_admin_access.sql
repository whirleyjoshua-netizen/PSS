-- People an admin gave sign-in to from Settings. Safe to re-run.
-- Owners are not stored here: they live in ADMIN_EMAILS and cannot be removed from the site.
create table if not exists admin_access (
  email      text primary key,
  added_by   text not null,
  created_at timestamptz not null default now(),
  constraint admin_access_email_normalized check (email = lower(btrim(email)) and email like '%_@_%')
);
