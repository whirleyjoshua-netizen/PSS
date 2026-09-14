# Lead Call Flow — Design

**Date:** 2026-09-14
**Status:** Approved in conversation, pending spec review
**Scope:** A faster path from a new website lead to a booked visit. The owners' new-lead email links straight to the job. Every job gets a "Call" button that opens a call screen, where the owner records interest, window count, budget tier and notes, then picks how the call went. Picking the outcome moves the job to the right stage. It builds on the job tracker (`2026-09-10-job-tracker-design.md`) and the admin PSS look (`2026-09-13-admin-pss-look-design.md`), both live.

## 1. Purpose

Today an owner gets the new-lead email, opens the admin, finds the lead on the board, calls from the phone link, then writes notes and moves the stage by hand in separate places. This change turns that into one guided flow that works whether the owner is on a phone or at a computer with the phone beside it.

Success means:
- From the new-lead email, one tap opens that lead.
- From the lead, one tap starts the call on a phone (or opens the call screen on a computer).
- Saving the call screen records what was learned and moves the job to Visit booked or Contacted without any other step, and a missed call is logged without moving the job.

## 2. Decisions made in conversation

- **Outcome buttons decide the stage:** "Booked a visit" (with date and time) → Visit booked; "Talked, no visit yet" → Contacted; "No answer" → stage unchanged, attempt logged.
- **Fields on the call screen:** Interest (the same treatment options as the website consultation form), Windows (the form's ranges), Budget, Notes.
- **Budget is three tiers:** Value, Mid-range, Premium. (They line up with the three supplier levels: Superior Blinds MFG, Alta, Hunter Douglas. The customer never sees these labels.)
- **Phone and computer both work.** On a touch device the button calls and opens the call screen. On a computer it opens the call screen only, with the number shown large to dial on the phone.
- **The new-lead email's first line links to the job.**

## 3. Approach

A dedicated call screen at `/admin/jobs/<id>/call`, inside the existing admin (same sign-in, same `requireAdmin()` guard, same look). One server action saves the answers, the outcome and the stage change together.

Rejected:
- **A pop-up on the job page.** Cramped on a phone, and the board's side panel would need a second copy.
- **Just adding fields to Job details.** No guided flow and no outcome buttons, which is the point of the request.

## 4. The new-lead email

- The consultation API route (`app/api/consultation/route.ts`) creates the lead's id up front with `randomUUID()` and passes it to both `insertLead` and `sendLeadNotification`, which still run in parallel as today.
- `insertLead` inserts that id instead of letting the database generate one.
- The notification's first line becomes `Open in tracker: <origin>/admin/jobs/<id>` followed by a blank line, then the existing lines unchanged. The origin comes from `ADMIN_BASE_URL` (falling back to `business.domain`), trailing slashes stripped, never the request's Host.
- If the database write fails but the email succeeds (the existing "either may fail" rule), the link opens the admin's normal "not found" page. The email still has every detail, as today.

## 5. The Call button

Shown at the top of the job page (`app/admin/jobs/[id]/page.tsx`, directly under the name) and in the board's client panel (`app/admin/JobPanel.tsx`).

- **Touch devices** (`@media (pointer: coarse)`): the button reads **"Call <First name>"**. It is a link to `tel:+1<phone>`; tapping it also navigates the current tab to the call screen (a click handler that lets the `tel:` link proceed, then pushes `/admin/jobs/<id>/call`). The phone starts the call; the call screen is waiting when the owner returns to Safari.
- **Computers** (`@media (pointer: fine)`): the button reads **"Log a call"** and only opens the call screen.
- Both labels are rendered and one is hidden by CSS, so it works without JavaScript detection and never flickers. Each is a real link, so keyboard and screen-reader users get the same actions.
- Jobs marked Lost still show the button (the call is logged; see §7).

## 6. The call screen

`/admin/jobs/<id>/call` — `requireAdmin()`; a missing job shows the admin "not found" page.

Top of the screen:
- The customer's name, and their phone number large as a `tel:` link (so a computer paired with an iPhone can place the call, and so it can be read off to dial by hand).
- City and current stage, small.
- "← Back to job" link.

Fields, pre-filled from the job:
- **Interest** — checkboxes, one per product category name, the same list the consultation form uses (`content/products.ts` categories). Pre-checked from `treatments`.
- **Windows** — radio buttons from `WINDOW_COUNTS` in `lib/leads/schema.ts` (1-5, 6-10, 11-20, 20+), plus nothing selected. Pre-selected from `window_count`.
- **Budget** — radio buttons: Value, Mid-range, Premium, plus nothing selected. Pre-selected from `budget_tier`.
- **Notes** — optional text, up to 2,000 characters. Not pre-filled (it is this call's note).

Outcome — three submit buttons, each labelled for what happens:
- **"Booked a visit"** — reveals a required date-and-time input (`datetime-local`, Las Vegas time) before it can submit. Pre-filled from `visit_at` if one is already set.
- **"Talked, no visit yet"**
- **"No answer"**

On success the owner lands on the job page. On a validation error (for example, "Booked a visit" without a date) the screen shows the message and keeps everything typed, like the other admin forms.

## 7. What saving does

One server action, `logCall(jobId, formData)`, after `requireAdmin()`:

1. Validates the input with zod (`callSchema` in `lib/admin/schema.ts`): outcome is one of `booked | talked | no_answer`; interest items are known category names; windows is one of `WINDOW_COUNTS` or empty; budget is one of `value | mid | premium` or empty; notes ≤ 2,000; visit time required and valid only for `booked`.
2. In one statement (a data-modifying CTE, like the rest of `lib/admin/jobs.ts`):
   - Updates `treatments`, `window_count` and `budget_tier` to the submitted values (for every outcome, including No answer — whatever was learned is kept). For `booked`, also sets `visit_at`.
   - Moves the stage when the outcome calls for it and the move is forward:
     - `booked` → `visit_booked`, only if the current stage is `new` or `contacted`.
     - `talked` → `contacted`, only if the current stage is `new`.
     - `no_answer` → never moves.
     - A job at a later stage, or Lost, keeps its stage.
   - When the stage moves, also sets `stage_changed_at`, as `setStage` does, and writes the usual `kind = 'stage'` event (so the board and "days in stage" behave exactly as for a manual move).
   - Writes one `kind = 'note'` event: the call summary (below), followed by the notes on a new line if any.
3. Revalidates the board and the job page, then redirects to the job page.

**Call summary format** (one line, built by a pure function `callSummary()` so it can be tested):
- `Call: booked visit Tue 10/14, 2:00 PM · Shutters, Shades · 6-10 windows · Mid-range`
- `Call: talked, no visit yet · Blinds · Value`
- `Call: no answer`
Parts that are empty are left out. The visit time is formatted in Las Vegas time.

No change to the `job_events` kind list. No automatic customer email is sent by this flow (the portal invite still goes out only when a job reaches Quoted).

## 8. Budget on the job page

- `DetailsForm` gains a **Budget** select (none, Value, Mid-range, Premium), saved by the existing `saveDetails` action.
- The job page's summary list shows **Budget** under "Windows".
- The customer project page never shows budget (it renders only from `toProject()`, which is unchanged).

## 9. Data changes

One new migration, `db/migrations/006_budget_tier.sql`:
- `alter table leads add column if not exists budget_tier text`
- A check constraint allowing only `value`, `mid`, `premium` or null, added idempotently (drop if exists, then add).

`Job` gains `budgetTier?: "value" | "mid" | "premium" | null` (optional, so existing test fixtures still type-check); `JOB_COLUMNS` and `toJob` include it. Like migration 005, 006 must be applied to production before the code that reads it is deployed.

## 10. Error handling

- Validation errors: message on the call screen, values kept.
- Job deleted meanwhile: "That job no longer exists."
- Stage not moved because the job is further along: not an error — the call is logged and the owner lands on the job page, which shows the real stage.
- Email link to a job that was never saved: the admin "not found" page.

## 11. Testing

Unit tests (Vitest, mocked `db`, as the existing admin tests do):
- `callSchema`: each outcome; booked without a visit time fails; unknown interest, window or budget values fail; notes limit.
- `callSummary()`: each outcome, empty parts dropped, Las Vegas time formatting.
- `logCall` stage rules: booked from new and from contacted → visit_booked; booked from quoted, sold, lost → unchanged; talked from new → contacted; talked from contacted or later → unchanged; no answer never moves; fields saved for every outcome; `requireAdmin()` runs first.
- Consultation route: the same id goes to `insertLead` and the notification; the email's first line is the tracker link on the configured origin.
- Call button: renders both labels with the right links; touch/pointer classes present.
- Budget in `DetailsForm` and the job page summary.
- Migration 006 parses under `migrate.mjs`'s rules and is idempotent in shape (like `tests/portal/migration-005.test.ts`).

End-to-end (Playwright, Neon test branch only, production build, desktop): an owner opens a new lead, taps "Log a call", picks Shutters, 6-10, Mid-range, chooses "Booked a visit" with a date, saves, and sees the job in Visit booked with the visit date and the call line in Activity. A second pass with "No answer" leaves the stage unchanged and logs the attempt.

## 12. Out of scope

Recording or timing calls; call reminders or follow-up tasks; texting the customer; showing call attempts on board cards; changing the website consultation form (it keeps its fields, and does not ask about budget); a customer-facing budget; automatic calls or dialers.
