-- Contacted is a stage again (docs/superpowers/specs/2026-10-01-contacted-stage-design.md).
-- 002, 011, 012, 030 and this file all define leads_status_check, so all five list the CURRENT FULL set.
-- Whole-line comments only, and no semicolons in comments.

alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check check (
  status in ('new','contacted','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')
);
