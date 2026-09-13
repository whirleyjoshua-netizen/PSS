# Admin Pipeline Board and Client Panel — Design

**Date:** 2026-09-13
**Status:** Approved in conversation, pending spec review
**Scope:** A refresh of the owners' job board at `/admin`. It flags jobs that have sat too long in a stage, and opens a client panel beside the board. It builds on the job tracker (`2026-09-10-job-tracker-design.md`), portal step 2 (`2026-09-11-referrals-and-reviews-design.md`) and the measuring screen and job files (`2026-09-11-measure-and-files-design.md`), all merged on `main`.

## 1. Purpose

The owners live on the pipeline board. Today, seeing a client means leaving the board for the full job page and coming back. This change keeps the board in view, answers "who do I need to chase?" at a glance, and puts the client information used day to day one click away.

Success means:
- A stalled job stands out on the board without anyone counting days.
- One click on a card shows the client's contact, money, stage and dates, and measurements and files without scrolling, while the board stays usable beside it.
- A link to an open panel, or a refresh, lands back on the board with that panel open.

A reference screenshot inspired the look. It is not a feature list: nothing here is included only because the screenshot had it.

## 2. Decisions made in conversation

- **Client view:** a side panel over the board, not a restyled job page. The full job page stays for everything else.
- **Stages:** the existing 7 (plus Lost). No stage changes and no database change.
- **Panel contents:** contact and address, money, stage and key dates, and measurements and files.
- **Cards:** today's content, plus a flag when a job is overdue in its stage.
- **Overdue limits:** set per stage (§4).
- **Look:** the admin area stays black and white, with no stage colors and no accent color.
- **Build approach:** the panel is part of the board page and is driven by a `job` search parameter.

Rejected approaches:
- **Next.js intercepting and parallel routes.** The board would not reload when a panel opens. But a direct link or a refresh renders the full job page instead of the board with the panel, and the pattern adds extra files (`default.tsx`, a catch-all to close).
- **A panel that loads its own data in the browser.** It duplicates the server-rendered page and cannot reuse the admin's Server Action form patterns.

## 3. URLs and navigation

- `/admin` is the board, with no panel.
- `/admin?job=<id>` is the board with that job's panel open. `lost=1` combines with it: `/admin?lost=1&job=<id>`.
- Clicking a card is a normal link to the board URL with `job=<id>` added. Existing parameters are kept.
- Closing the panel is a link to the same URL without `job`. The browser's Back button also closes it, because opening was a navigation.
- The full job page at `/admin/jobs/<id>` is unchanged. Links that already point at it, such as "Referred by" and referral rows, keep working.
- An unknown, malformed or deleted `job` id renders the board with a short panel that reads "That job no longer exists" and has a close link. It is never an error page.

## 4. The board

Unchanged:
- One column per stage in order: New lead, Contacted, Visit booked, Quoted, Sold, Ordered, Installed. Lost appears behind "Show lost".
- The per-stage count strip on top.
- On phones, stacked columns.
- Card content: name, city, interests, days in stage, and the Referral badge.

New:
- **The overdue flag.** An overdue card gets a heavier border and the word "Overdue" beside its days in stage. Its accessible name includes "overdue" too.

  | Stage | Overdue when |
  |---|---|
  | New lead | more than 1 day in stage |
  | Contacted | more than 3 days in stage |
  | Visit booked | the Las Vegas calendar day after the visit date has started; never when no visit date is set |
  | Quoted | more than 7 days in stage |
  | Sold | more than 3 days in stage |
  | Ordered | more than 21 days in stage |
  | Installed | never |
  | Lost | never |

  "Days in stage" is the same whole-day count the card already shows, counted from `stage_changed_at`.
- **The selected card.** The card whose panel is open is visibly marked and has `aria-current="true"`.

## 5. The panel

**Placement:**
- From `lg` up, the panel is a column on the right, about 28rem wide. The board keeps the remaining width and scrolls horizontally as it does today.
- Below `lg`, the panel covers the screen, and closing it returns to the board. At tablet (`md`) widths the admin nav, board and panel together would leave the board too narrow to be usable side by side, so the overlay stays until `lg`.

**Header:**
- The client's name as a heading.
- A close link labelled "Close".
- A "Full page" link to `/admin/jobs/<id>`.

**Sections, top to bottom:**

1. **Contact and address:**
   - The phone number, as a `tel:` link.
   - The email, as a `mailto:` link, when there is one.
   - The address and city, linked to Google Maps the same way the job page does it today.
2. **Money:**
   - Quote, sold amount, deposit received, and balance due, formatted with the existing `formatCents`.
   - Balance due is the sold amount minus the deposit when both are set. Otherwise it shows "—".
3. **Stage and key dates:**
   - The current stage, with the existing stage controls: move to the next stage, set a stage, mark lost.
   - The visit date and time, order date and install date, each showing "—" when unset.
   - Days in stage, with the Overdue flag when it applies.
4. **Measurements and files:** the existing `JobFiles` component, fed the job's measurements and files.

Everything else stays on the full page only: job details editing, the review request, the referral link and referrals list, notes and activity.

When a panel action succeeds, it revalidates `/admin` as the existing actions already do. The board and panel refresh together.

## 6. Code layout

- `lib/admin/overdue.ts` (new): pure. `isOverdue(job, now)` implements the §4 table; `OVERDUE_DAYS` holds the per-stage limits. It reuses the existing days-in-stage calculation, moved out of `JobCard.tsx` into this module so the card and the rule share one definition, and `lasVegasDate` from `lib/admin/time.ts` for the Visit booked rule.
- `app/admin/JobCard.tsx`:
  - Cards link to the board URL with `job=<id>`. The card receives the href built by the page, so it stays a simple component.
  - The overdue flag and the selected state are added.
- `app/admin/page.tsx`:
  - Reads `job` from `searchParams` alongside `lost`.
  - When `job` is set, loads the job, its measurements and its files together, then renders the board and the panel side by side.
- `app/admin/JobPanel.tsx` (new): a server component that renders the §5 panel from the loaded data. It reuses `StageControls` and `JobFiles`.
- Admin pages keep calling `requireAdmin()` first. The board already does. The panel's data is loaded inside that same guarded page.

## 7. Errors

- An invalid, unknown or deleted job id shows the "That job no longer exists" panel (§3). `getJob` already returns null for a non-uuid id without querying.
- If loading measurements or files fails, the page errors as the full job page does today. There is no new error handling layer.

## 8. Testing

- **Unit (Vitest):**
  - `isOverdue` for every row of the §4 table, just under and just over each limit.
  - Visit booked with and without a visit date, and on each side of the Las Vegas day boundary.
  - Installed and Lost never overdue.
- **Components:**
  - A card links to `/admin?job=<id>` and keeps `lost=1` when it is present.
  - An overdue card shows "Overdue". The selected card has `aria-current`.
  - The panel shows all four sections with the right values, including balance due and "—" when amounts are missing.
  - The close link drops `job`. The Full page link points at `/admin/jobs/<id>`.
  - A missing job shows the "no longer exists" panel.
- **E2E (Playwright, against a Neon branch, when one is available):**
  - Open a card and see the panel.
  - Reload and see the panel still open.
  - Close it and see the board without the panel.
- All existing tests continue to pass.

## 9. Out of scope

- New stages, stage colors or accent colors.
- Next actions, tasks, dashboards, KPI tiles or a search box.
- Drag-and-drop between columns.
- Any database change.
- Editing job details, reviews or referrals from the panel.
- Customer-facing pages.
