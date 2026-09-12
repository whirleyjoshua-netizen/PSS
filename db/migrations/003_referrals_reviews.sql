-- Portal step 2: customer referral links, referral rewards, and review requests.
--
-- Every statement is safe to re-run: the migrate script applies all files.

alter table leads add column if not exists referral_code       text;
alter table leads add column if not exists referred_by         uuid references leads (id) on delete set null;
alter table leads add column if not exists referral_paid_at    timestamptz;
alter table leads add column if not exists review_requested_at timestamptz;
alter table leads add column if not exists review_opt_out      boolean not null default false;

create unique index if not exists leads_referral_code_idx on leads (referral_code) where referral_code is not null;
create index if not exists leads_referred_by_idx on leads (referred_by);

-- 002 declared the check inline, so Postgres named it job_events_kind_check.
alter table job_events drop constraint if exists job_events_kind_check;
alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward')
);
