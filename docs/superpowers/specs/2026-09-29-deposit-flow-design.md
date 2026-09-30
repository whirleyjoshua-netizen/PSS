# Quote → approve → sign → deposit → sold — design

## Goal

After a Direct Connect quote is sent, the job moves on its own:

Quoted → client **approves** → contract sent automatically → client **signs** → client pays a **50% deposit** (Stripe, or the owner records it) → **Sold** → measure appointment booked → **Official measure** → Ordered → Installed → Completed.

Owner decisions (chat, 2026-09-29): approve/accept are the same thing and the existing Approve button stays; Direct Connect quotes only; Stripe (PSS already has an account); deposit is 50%, balance collected at install outside the app; stage names Approved, Signed, Official measure; Official measure starts when the measure appointment is booked; the deposit is taken right after signing and refunded in full if the client cancels inside the 3-business-day window.

## What stays the same

- Stages before Quoted and after Ordered, and every manual stage control.
- The consultation-confirm → Appointment booked move.
- The 3-business-day window (`lib/docs/business-days.ts`) and the "ready to order" message on the Quote tab.
- Contract content, signing evidence (hash, name, IP), the stamped signed copy and its emails.
- Uploaded (non-DC) quotes can still be shared and approved; approving one now moves the job to **Approved** (not Sold) and the owner sends paperwork by hand.

## 1. Stages and data — migration 030_deposit_flow.sql

030 is claimed (027 install extras, 028 measure quantity pss-7a, 029 visible signatures pss-dd).

**Stages** (`lib/admin/stages.ts`), in order: new, visit_booked, quoted, **approved** "Approved", **signed** "Signed", sold, **measure** "Official measure", ordered, installed, completed; plus lost.
- `leads_status_check` is defined identically in 002, 011 and 012; all three and 030 carry the full 11-value list (migrate.mjs re-runs every file, so an old short list would reject live rows).
- `STAGE_STYLE`, `BOARD_STAGES` (board gets the three columns), `WORKING_STAGES`, globals.css stage colours.
- Hard-coded stage checks updated: `lib/admin/overdue.ts` (approved 2 days, signed 2 days, measure 7 days), `lib/portal/progress.ts`, `PORTAL_STAGES`/`PORTAL_STATUSES` (portal access and autoInvite include approved, signed, measure), `app/admin/ad-conversions/route.ts` (sold list includes measure; booked list includes approved, signed), `OverviewTab.tsx` soldOrLater, `lib/portal/guides.ts` ORDERED_OR_LATER, `lib/admin/call.ts`, `ApproveQuote.tsx`/`ProjectView.tsx` rank checks, `lib/reviews/db.ts`, `lib/referrals/db.ts`.

**DC version status** gains `offered` (quote sent, awaiting approval): draft → offered → sent (contract) → signed; superseded as today. 024's CHECK and 030 carry `('draft','offered','sent','signed','superseded','cancelled')` — `cancelled` for a refunded, cancelled contract. A unique partial index allows at most one `offered` version per job (mirrors the sent index).

**deposits** (new):

```sql
create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  dc_quote_version_id uuid not null references dc_quote_versions(id),
  amount_cents integer not null,
  method text not null,            -- 'stripe' | 'check' | 'cash' | 'other'
  status text not null,            -- 'pending' | 'paid' | 'refunded' | 'expired'
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  recorded_by text,                -- owner email for a recorded payment
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
```
Named checks: method list, status list, amount_cents > 0; unique partial index: one `paid` deposit per version.

**job_events.kind** gains `payment`. The kind list is repeated in 002 (inline), 003, 004, 011, 019, 021, 024, 026 — every copy and 030 carry the identical list. The TS union in `lib/admin/jobs.ts` too.

`leads.deposit_cents` (existing, unused) is written when a deposit is paid; `leads.sold_cents` keeps being written at signing.

## 2. Send quote → Approve → contract

**Owner, Quote tab** (`QuoteReview.tsx`): the button becomes **Send quote**. Same review, blockers (terms present and final, markups, email, not Lost) and fingerprint check as today's Send, so nothing that could stop the contract later is left unchecked.

`sendQuote` (refactor of `lib/dc/send.ts`), one CTE after storing the PDF:
- builds a **quote PDF**: the contract layout's priced lines and totals, titled "Quote", no terms and no signature block; stored as doc_type `quote`, shared;
- version draft → `offered`, priced lines frozen (moved here from contract send, so the approved price is the contract price); other draft/offered versions → superseded;
- `quote_cents` set; new/visit_booked → quoted; 'stage' and 'quote' events;
- then emails the client "Your quote is ready" with a portal link (`issueCustomerLink`).

**Client, portal**: `ProjectView` shows `ApproveQuote` for the shared quote while the job is Quoted (DC or uploaded). `approveQuoteAction`:
- DC path (an `offered` version exists): `approveDcQuote` moves quoted → approved ('stage' event "Approved quote version N"), then calls `sendContract` for that version (builds and shares the contract PDF exactly as today, version offered → sent, emails the sign link). Owners are emailed "Quote approved — contract sent".
- Uploaded path: quoted → approved; owners emailed as today.
- If the contract step fails after the approval is saved (PDF or Blob error), the job stays Approved, owners are emailed "contract not sent", and the Quote tab shows **Send contract** for the offered version. Approving twice is a no-op.

## 3. Signing → Signed

`recordSignature` (`lib/portal/sign.ts`) keeps its single CTE; only the stage step changes: the job moves to **signed** (from quoted or approved), not sold, and the event reads "Signed contract version N". `sold_cents` is still set there.

After signing, the portal shows **Pay 50% deposit — $X** with the amount and the cancellation date. The signed-copy and owner emails are unchanged; the client's signed-copy email adds the deposit link.

**Coordination:** pss-dd owns `sign.ts`, `SignContract.tsx` and `signContractAction` for visible signatures (029). This work starts after 029 merges and changes only the stage target in `recordSignature`'s `sold` step and the post-sign portal view.

## 4. Deposit and Sold

**Amount**: `round(sold_cents / 2)` (half cent up), from the signed version.

**Stripe** (server SDK `stripe`, secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; test-mode keys first):
- `startDepositAction` (portal, signed-in client, job Signed, no paid deposit): reuses an open pending session for the version or creates a Checkout Session — mode payment, one line "50% deposit — PSS-####", `customer_email`, metadata `{ depositId, leadId }`, success URL `/project/<job>?deposit=done`, cancel URL `/project/<job>` — inserts the `pending` deposit row, redirects to Stripe. The success page shows "Payment received — thank you" only once the webhook has marked it paid, else "Processing".
- `app/api/stripe/webhook/route.ts`: raw body, `stripe.webhooks.constructEvent` with the webhook secret (reject 400 otherwise). Handles `checkout.session.completed` (when `payment_status = 'paid'`) and `checkout.session.async_payment_succeeded` → `markDepositPaid`; `checkout.session.expired` → pending → expired. Returns 200 fast; emails in `after()`.
- `markDepositPaid`, one CTE, idempotent (acts only on a `pending` row): deposit → paid (paid_at, payment intent id); `leads.deposit_cents`; job signed → sold; 'payment' event "Deposit $X paid by card" and 'stage' event. Then owners and client are emailed a receipt.

**Owner, Quote tab**:
- **Payment received** (job Signed): amount prefilled with the deposit, method check/cash/other → same `markDepositPaid` path with a new paid row, `recorded_by`.
- **Cancel & refund** (job Signed or Sold, deposit paid): confirm dialog shows whether the 3-day window is still open. Stripe deposits are refunded in full via the API; recorded deposits are marked refunded (owner returns the money). One CTE: deposit → refunded, version → cancelled, job → lost, 'payment' + 'stage' events; client and owners emailed.

The portal never trusts the success redirect: only a verified webhook or an owner marks a deposit paid.

## 5. Official measure

`confirmSchedule` (`appointment-actions.ts`) gains, next to the consultation rule: a confirmed **measure** appointment on a **Sold** job → `setStage(... "measure")`. Ordered stays manual.

**Client progress bar** (`lib/portal/progress.ts`, minStage never decreases): Consultation, Measurements, Quote ready (quoted), Contract signed (signed), Deposit paid (sold), Final measure (measure), In production (ordered), Ready to install, Installed.

## Testing

- Unit: stage lists and rank order; overdue days; progress steps; sendQuote CTE (bind order, statuses, one statement); approveDcQuote both paths and the failure path; recordSignature moves to signed (not sold); deposit amount rounding; startDepositAction (reuses open session, refuses unsigned/paid); webhook (bad signature 400, completed/unpaid, async success, expired, duplicate delivery no-op); markDepositPaid CTE; payment received; cancel & refund (Stripe and recorded); measure confirm → measure only from sold.
- Real SQL on a Neon test branch (owner OK each time): 030 run twice; every CTE executed; all old migration lists still pass on a DB holding the new stages.
- e2e (`next start`, test branch, Stripe **test** keys): send quote → approve → contract appears → sign → deposit via a signed test webhook event (`stripe.webhooks.generateTestHeaderString`) → Sold → confirm measure → Official measure; every stored field compared. A second path with Payment received, and one with Cancel & refund.

## Rollout

1. Owner adds `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test mode) in Vercel and registers the webhook endpoint `https://premiershadesolutions.com/api/stripe/webhook` for the three events.
2. Migration 030 on production before the push (main auto-deploys).
3. Merge after pss-dd's 029; tell pss-dd and pss-7a.
4. One real test-mode deposit end to end, then switch to live keys.

## Out of scope

Balance payment (collected at install), QuickBooks sync, partial refunds, automatic ordering, deposit percentages other than 50%.
