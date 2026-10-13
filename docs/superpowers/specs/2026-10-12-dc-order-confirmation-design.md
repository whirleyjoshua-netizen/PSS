# Hunter Douglas order confirmation moves a job to Ordered

Status: built 2026-10-12 on `feat/dc-orders`. Decisions by Joshua, 2026-10-12.

## Why

Submitting an order in Direct Connect is the last manual step before production, and the owners then had to move the job to Ordered by hand. HD already emails support@ when an order is placed. The daily mailbox run that imports Dealer Copies (`/api/cron/dc-quotes`) now reads those emails too.

## The two emails (verified on Jennie Biesinger's order, 2026-10-12)

| | DC receipt | HD order confirmation |
|---|---|---|
| From | `retailer@hunterdouglas.com` | `donotreply@hunterdouglas.com` |
| Subject | `Confirming Receipt of Quote #22293638 / Sidemark: …` | `New Order # 14286505 for Sidemark: …` |
| Arrives | when the owner presses Submit Order | about 30 minutes later |
| Carries | a sentence with the quote number and PO; Client and Dealer copies attached | HD order number, PO Number, Order Status, Order Date, every line, subtotal, oversize, handling, tax, total; a printable PDF |

Both carry the PO Reference (`PSS-1016-E`), so the job and the quote option are found by the same release gate as a Dealer Copy: the exact printed PSS number, and an option that was added on the job.

## Decisions

1. **The confirmation is the trigger** (owner's choice). It is HD's own word that the order is placed, and it carries the HD order number and the final cost with tax. The receipt only says DC received it.
2. **The cost is recorded alongside the quote, never replacing it** (owner's choice). HD's figure before tax (subtotal + oversize + handling) is compared with the option's dealer total: its signed version, else its newest live version. A difference is flagged on the job's Order card and in the owners' email. Tax is shown separately: a Dealer Copy has none.
3. **The stage only moves forward, from Signed, Sold or Official measure.** A job already at Ordered or later keeps its stage. A job before Signed, or Lost, keeps its stage and the email says to check it. The order is recorded either way.
4. **The order date fills `ordered_on` only when it is empty**, so a date an owner typed is kept. That date drives the customer's "In Production" step.
5. **HD's PDF is filed on the job** as an internal PO document (`HD ORDER <no>.pdf`), never shared, and linked from the Order card.
6. **The receipt is the safety net.** Receipts are recorded quietly. A receipt with no confirmation for the same job and PO a day later is emailed to the owners once.
7. **Refusals ask the owners to move the job by hand**: no PSS number in the PO, a number that matches no job or option, totals that do not add up, or a status other than Confirmed.

## Data (migration 045)

- `dc_orders`: one row per HD order number (unique), with its job, option, PO, order date, the five figures (checked to add up), the quoted dealer total and version it was compared with, the PDF file and the message.
- `ingested_messages`: outcomes `ordered` and `receipt` added; `po_reference` and `warned_at` columns for the safety net.
- Activity: a stage move logs a `stage` event; an order on a job that did not move logs a `quote` event. No new event kind.

## Not in scope

- HD's later shipping emails ("You will receive an additional email confirmation as your order is processed and shipped"). Same sender and PO key, a natural next step. Until it is built, any other mail from `donotreply@hunterdouglas.com` is recorded unread and the owners are emailed its subject once, so the first shipping notice is not missed (added 2026-10-12). Owner's plan for it: "Shipped <date>" inside the existing In Production step (no new step), on the Order card, and a shipping email to the client saying PSS will reach out to schedule the install.
- Checking more than once a day. The cron runs at 15:00 UTC, so an afternoon order shows the next morning.
- Sender authentication beyond the From address, as for Dealer Copies. Both test emails passed SPF, DKIM and DMARC at Microsoft.
