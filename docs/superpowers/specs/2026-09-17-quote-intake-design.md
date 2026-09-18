# Filing a Hunter Douglas Quote From Email — Design

**Date:** 2026-09-17
**Status:** Approved in conversation, pending the owner's review. **Build waits on the Direct Connect account existing**, so the parsing can be written against real emails rather than a guess.
**Scope:** A quote emailed from Direct Connect to `support@premiershadesolutions.com` is filed automatically against the right job as an unshared document. The owner decides when the customer sees it.

## 1. Purpose

**The problem.** The owners build a quote in Direct Connect, email it to themselves, then download it and upload it to the job by hand. It is typing work that a computer should do, and it is the step most likely to be skipped when they are busy.

**The fix.** DC emails the quote to `support@`. The system reads that mailbox, matches the quote to a job, and files it on that job as a Quote document — **unshared**. The owner ticks share when ready, and the customer is emailed that their quote is ready.

**Success means:**
- A quote reaches the right job without anyone typing.
- A quote NEVER reaches the wrong customer.
- The owners keep the decision about when a customer sees a price.

## 2. The decision that makes this safe: an exact key

**The quote carries the project number in Direct Connect's reference / PO line: `PSS-1002`.**

This is the whole design. Matching on a customer's name would eventually attach one John's quote to a different John — the same failure this codebase spent a day defending against on the portal, and with names it is a matter of time rather than chance. A project number is exact, already printed on the customer's own page, and costs the owner one paste per quote.

**Rules that follow from it:**
- No project number in the reference line → **not filed**. The owners are told; nothing is guessed.
- A number that matches no job → **not filed**, same treatment.
- A number that matches a job → filed against that job and no other.

There is no fuzzy fallback, deliberately. A feature that is right 95% of the time here is worse than one that refuses, because the 5% is a customer seeing another household's prices.

## 3. Trust: who is allowed to put a document on a job

**An email arriving at `support@` is not evidence of anything.** Anyone can send one, attach a PDF, and write `PSS-1002` in the subject.

So:
- **Only mail from Direct Connect's sending domain is considered.** The exact domain is confirmed from a real DC email before this is built; it is configuration, not code.
- Everything else in the mailbox is ignored entirely — not filed, not flagged, not parsed.
- **Nothing is ever auto-shared.** Even a perfectly matched quote lands unshared. The share tick (already built, already reviewed) remains the only way a document becomes visible to a customer.

That last rule is what makes a mistake recoverable. A misfiled quote sitting unshared is an annoyance; a misfiled quote already visible cannot be taken back.

## 4. How it runs

A scheduled job, following the repo's existing cron pattern (`vercel.json` already runs `/api/cron/calendar` daily):

1. **Read** unprocessed messages from `support@` via Microsoft Graph. This reuses the app registration built for the calendar — same tenant, same client, same secret — with **`Mail.Read` (application)** added and admin-consented. No new credentials, no new mailbox.
2. **Filter** to the DC sender domain. Skip everything else.
3. **Extract** the project number from the reference line, and the PDF attachment.
4. **Match** to a job by `project_no`. No match → record the outcome and stop.
5. **File** the PDF through the existing `createFile` path as `kind = 'document'`, `doc_type = 'quote'`, **`shared_at` null**.
6. **Record** the message as handled, so a second run cannot file it twice.
7. **Tell the owners** by email: which job, which quote, and a link to it.

**Idempotency is not optional.** The same message will be seen on every run until it is recorded as handled. Filing the same quote three times is a visible mess on a customer-facing job.

## 5. Data

Migration `db/migrations/021_quote_intake.sql` — idempotent, whole-line `--` comments only, no `;` inside a comment:

```
create table if not exists ingested_messages (
  message_id   text primary key,
  received_at  timestamptz not null,
  processed_at timestamptz not null default now(),
  outcome      text not null,
  lead_id      uuid references leads (id) on delete set null,
  detail       text
);
```

- `message_id` is Graph's immutable id, and being the primary key is what makes reprocessing harmless.
- `outcome` records what happened: filed, no-reference, no-match, not-dc, no-attachment, failed. This is the audit trail when an owner asks "why didn't John's quote appear?".
- `lead_id` is `on delete set null` so deleting a job does not destroy the record that a quote once arrived — and does not block the delete, which `parent_job_id` taught us to think about.

## 6. Telling the customer

**Sharing a document is silent today.** `lib/admin/files.ts` sends no email, and there is no customer notification when paperwork appears. So this is new work, and it belongs to the share tick rather than to the intake:

> When an owner shares a **document** with a customer, the customer is emailed that it is ready, with a link to their project page.

It fires on the owner's tick, not on the filing — which is what keeps the owner in control of when a price is seen. Photos are excluded; a photo appearing is not news.

## 7. Error handling

- **Unreadable PDF, wrong attachment type, or no attachment**: recorded with its outcome, owners told, nothing filed.
- **Graph unavailable**: the run fails and retries on the next schedule. Nothing is recorded as handled, so nothing is lost.
- **A filed quote whose job is later deleted**: the `job_files` row cascades away; `ingested_messages.lead_id` nulls.
- **Two quotes for one job**: both are filed. Revising a quote is normal, and the owner decides which to share.
- **The mailbox is a working inbox**, not a queue we own — never delete or move a customer's mail. Read only.

## 8. Testing

**Unit**
- A message with no reference line is not filed and is recorded `no-reference`.
- A reference naming a job that does not exist is recorded `no-match`, and nothing is written to `job_files`.
- A message from any other sender is ignored entirely.
- A filed quote is `kind='document'`, `doc_type='quote'`, and **`shared_at` is null** — asserted explicitly, because this is the property that protects the customer.
- The same message processed twice files one document.

**End-to-end (Neon test branch)**
- A DC-shaped message with `PSS-####` files against that job and no other, unshared.
- **The release gate:** a message whose reference names job A must never attach to job B. Prove it by deliberately weakening the match and watching the test fail — a gate nobody has watched fail is not known to work.

**Before the build:** the parsing is written against **real DC emails**, not invented ones. The owner forwards two or three once the account exists.

## 9. Out of scope

- Reading anything from the mailbox other than DC quotes.
- Replying to or filing customer correspondence.
- Auto-sharing to the customer, under any condition.
- Parsing prices out of the PDF. The document is filed, not interpreted. Money on the customer's page remains a separate, deliberate decision.
- Purchase orders and invoices. Quotes first; the same machinery extends if it works.
