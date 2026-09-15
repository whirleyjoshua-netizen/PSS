# Completed Stage and the Job List — Design

**Date:** 2026-09-15
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:**
- Add a final **Completed** stage after Installed.
- Remove the stage tiles above the board.
- The board (Kanban) shows current work only.
- A new job list under the board is the archive of every job, filtered by a stage dropdown.

This builds on the stages / contact log work (migration 011), which is live.

## 1. Purpose

**The problem.** The row of stage tiles above the board repeats the column headers, and the owner doesn't like it. Finished jobs sit on the board forever, and Lost jobs are hidden behind a "Show lost" toggle.

**The fix.**
- The board is the current job tracker: New lead through Installed.
- The list below it is the archive: every job, any stage, including Completed and Lost.

**Success means:**
- No tiles above the board.
- Moving an Installed job to Completed takes it off the board, and it appears in the list under "Completed".
- The list's dropdown offers All jobs, each working stage, Completed and Lost.

## 2. Decisions made in conversation

- **Completed is a real stage**, not a filter. It comes after Installed. Completed jobs leave the board.
- **Lost jobs leave the board too.** They live in the list. "Show lost" is removed.
- **A Completed job still counts as installed** for reviews, referral rewards and the customer portal.
- **The list's default filter is All jobs.**

## 3. Stages (lib/admin/stages.ts)

- `STAGES` gains `{ value: "completed", label: "Completed" }` after `installed`. `nextStage("installed")` therefore returns `completed`, so the job page's next-stage button and the Set-stage list offer it automatically.
- `WORKING_STAGES` gains `completed`, so the new-job form accepts it (for entering old jobs).
- New export `BOARD_STAGES = ["new", "visit_booked", "quoted", "sold", "ordered", "installed"]`: the board's columns.
- New export `INSTALLED_STATUSES = ["installed", "completed"]` and `isInstalled(status)`: the one definition of "the install has happened".
- `STAGE_STYLE.completed`: icon `check` (new path in components/admin/icons.tsx), color token `--color-stage-completed` in globals.css (a muted green distinct from Sold, e.g. `#3F7D6B`), with all four fields (`icon`, `edge`, `tint`, `left`).
- The job page stepper's `FILL` gains `completed: "bg-stage-completed"`.
- `OVERDUE_DAYS` has no entry for `completed` (never overdue).

## 4. Everywhere that means "installed"

Each check becomes "installed or completed", via `isInstalled` in TypeScript or `status in ('installed','completed')` in SQL:

- `lib/reviews/eligibility.ts` — `isDueForReview`.
- `lib/reviews/db.ts` — `listReviewCandidates`.
- `app/admin/jobs/actions.ts` — the review-request guard.
- `app/admin/jobs/[id]/ReviewSection.tsx` — which view it shows.
- `lib/referrals/codes.ts` — reward is "owed" once installed or completed.
- `lib/referrals/db.ts` — `markReferralPaid`.
- `lib/admin/jobs.ts` `createJob` — a job entered as Installed **or Completed** gets its review request turned off and the "(review request off)" note.

## 5. Customer portal

Customers never see the word Completed. A Completed job shows exactly as Installed.

- `lib/portal/progress.ts`:
  - `PORTAL_STAGES` stays `quoted, sold, ordered, installed` (the steps customers see).
  - New `PORTAL_STATUSES = [...PORTAL_STAGES, "completed"]`: the statuses whose jobs a customer may see.
  - `isPortalStage` is replaced by `isPortalStatus(status)` (accepts `completed`), and a new `toPortalStage(status)` maps `completed` → `installed`.
- `lib/portal/access.ts` `visibleJobs` and `lib/portal/invite.ts` `autoInvite` query with `PORTAL_STATUSES`. `toProject` uses `toPortalStage`.
- The callers of `isPortalStage` (`app/admin/jobs/actions.ts` twice, `OverviewTab.tsx`) use `isPortalStatus`.

## 6. The board (app/admin/page.tsx)

- The stage tiles (`<nav aria-label="Stages">`) are removed.
- Columns are `BOARD_STAGES` only. `groupByStage` loses its `includeLost` argument and takes the stages to group by.
- The "Show lost" / "Hide lost" link is removed, and so is the `lost` URL parameter (`boardHref` loses `lost`).
- Search still filters the board's cards.
- The job panel still opens beside the board, from a card or a list row.

## 7. The job list (new app/admin/JobList.tsx)

Placed under the board, headed **"All jobs"**.

**Filter**
- A `<select>` labelled "Stage" with options, in order: All jobs, New lead, Appointment booked, Quoted, Sold, Ordered, Installed, Completed, Lost.
- It lives in a GET form so the choice is in the URL: `?list=<stage>`. No `list` means All jobs. An unknown value is treated as All jobs.
- A tiny client component submits the form on change. A visually hidden submit button keeps it working without JavaScript.
- The form carries `q` (and `job`, if open) as hidden inputs so changing the filter keeps the search and the open panel.
- `boardHref` gains `list`, so every board link (cards, rows, close panel, clear search) keeps the filter.

**Rows**
- Data: `listJobs` now always includes Lost (its `includeLost` option goes away); the page filters in memory for the list, and uses `BOARD_STAGES` for the board. One query serves both.
- Order: most recent stage change first (the query's existing order).
- Columns: Customer (name, plus a "Referral" tag like the card), City, Stage (a colored pill using `STAGE_STYLE` tint and `left` border), and "In stage" (`DaysInStage`, which already shows Overdue).
- The whole row is a link to `boardHref({ q, list, job: job.id })`, opening the side panel. The selected row is marked with `aria-current`.
- On phones the table sits in an `overflow-x-auto` container.
- Empty state: "No jobs in this stage", or "No jobs match" when a search is active.
- A count shows beside the heading: "All jobs · 12".

## 8. Data

Migration `db/migrations/012_completed_stage.sql`, idempotent, following the migrate.mjs rules (whole-line comments, no `;` in comments):

1. Drop and re-add `leads_status_check` with `('new','visit_booked','quoted','sold','ordered','installed','completed','lost')`.

migrate.mjs re-applies every file in order on each run. 002 and 011 also set `leads_status_check`, and re-running them would fail once a Completed row exists. So `completed` is also added to the status lists in `002_job_tracker.sql` and `011_stages_contact_log.sql`. A comment in 012 says the lists must stay in step.

No existing rows change.

## 9. Error handling

- An unknown `?list=` value falls back to All jobs.
- Legacy event text (`installed → completed`) renders through `stageLabel` as usual.

## 10. Testing

**Unit (Vitest)**
- Stages: `completed` is in `STAGES` after `installed`, `nextStage("installed") === "completed"`, `nextStage("completed") === null`, label, `BOARD_STAGES` excludes completed and lost, `isInstalled`.
- Reviews eligibility and referral status treat completed like installed.
- Portal: `isPortalStatus("completed")`, `toPortalStage("completed") === "installed"`, and `toProject` of a Completed job shows Installed.
- `createJob` with stage completed turns the review request off.
- `boardHref` keeps `list` and no longer emits `lost`.
- Board page: no stage tiles, no "Show lost", no Completed or Lost columns.
- JobList: renders rows, filters by the chosen stage, marks the selected row, shows the empty states and the count, and keeps `q` in the form.
- The migration parses under the migrate.mjs rules and the three status lists are identical.

**End-to-end (Neon test branch, production build, desktop)**
- Move an Installed job to Completed; it leaves the board and appears in the list under Completed.
- Choose Lost in the dropdown; a lost job appears.
- Update existing specs that use "Show lost" or the stage tiles.

## 11. Out of scope

- Sorting or paging the list. The job count is small.
- Bulk actions from the list.
- A separate archive page.
