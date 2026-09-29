# Importing a Direct Connect Quote and Sending It as a Contract — Design

**Date:** 2026-09-27
**Status:** Approved in conversation, section by section. Pending the owner's review of this written spec.
**Supersedes:** `2026-09-17-quote-intake-design.md` (never built). Its safety rules are kept here (§3). Its core idea, filing DC's PDF for the customer to see, is replaced: DC's document shows dealer cost and must never reach a customer.
**Migration:** `db/migrations/024_dc_quote_import.sql` (claimed. 024 is unused on every branch and worktree as of this date).

## 1. Purpose

The owners price every window in Hunter Douglas Direct Connect (DC), because only DC knows HD's product rules and costs. Today nothing connects DC to PSS. The price the customer sees is typed by hand, and the contract is a separate upload.

**The goal is one flow:** the owner builds the quote in DC and emails it to support@ in three clicks. PSS reads it, applies the owners' own markup, adds installation, and sends the customer one priced contract to sign. The signed total is exactly what was on screen.

**Success means:**
- A DC quote reaches the right job with no retyping, and never reaches the wrong one.
- The customer sees only PSS prices, never HD cost, cost factor or margin.
- Every figure saved, sent or signed equals the figure the owner saw.
- Pricing policy (markup per product line) lives in PSS and can change over time without touching DC.

**Decisions made by the owner (2026-09-27):**

| Question | Decision |
|---|---|
| Where markup lives | PSS, not DC's Pricing Setup. DC's client price is ignored. |
| Markup basis | **Client pays X% of MSRP**, set per product line (DC "Collection"). Percentages are not decided yet, so they are editable settings. |
| HD handling fee | **Passed to the client** as its own line, at the exact amount DC prints, with a per-job **Waive** switch. |
| Installation | Included, so the client sees **one total**. |
| Who emails the client | PSS, through its own flow. DC's Client Proposal is not used. |
| Contract | **The generated proposal is the contract** (the owner's terms appended, signed on the portal). |
| How PSS receives the quote | **Reads support@ directly** through the existing Microsoft Graph app. No forwarding rule. |
| Job key in DC | **PO Reference** holds the project number `PSS-####`. Sidemark stays free for the box name. |

## 2. What DC actually produces (verified 2026-09-27)

These are facts from the live DC account (dealer 10193399), Test quote 22250749. Two real Dealer Copies were produced: 1 line, then 4 lines.

**Email**
- The sender is `retailer@hunterdouglas.com`, with the display name "Premier Shade Solutions Llc". DC's own Sent Emails log wrongly shows support@ as the sender.
- The subject is `DEALER COPY #22250749, PO PSS-1042`.
- The body is a short note. The report is an **HTML attachment** named `DEALER COPY 22250749.html` (about 8 KB).
- It lands in the Focused inbox.

**How the owner sends it:** Quote → Reports → Dealer Copy → Type **Email**, Format **HTML**, tick **Owner** (support@) and **Include dealer costs** → Generate. DC does **not** remember the "Other" address or the checkboxes between sends. Using the Owner tick avoids typing an address.

**PO Reference:** field `Po`, maxlength **20**. `PSS-1042` saves, shows in the quote list's PO column, and is found by DC's search. `leads.project_no` formatted `PSS-%04d` (`lib/portal/project-no.ts`) fits.

**Report structure** (plain nested tables, no scripts):
- **Header:** Quote #, Date Entered, Client, PO Reference, Sidemark, Client PO, Sold To, Ship To.
- **Columns** depend on the options chosen. With dealer costs only: Item, Qty, Description, Base Amt, Promotion, Options, Cost Factor, Unit, Extended. "Include client costs" adds more columns. So columns are located by header text, never by position.
- **One row per line**, followed by a nested label/value table of every option, e.g. `Collection: Duette`, `Order Width: 48 1/2`, `Mount Type: Inside Mount`.
- **Totals:** Product Sub-Total, Handling Fees, Oversized Fees, Dealer Total, plus DC's own profit and margin lines (ignored).
- Contains a hidden SES tracking image.

**Pricing facts that shape the design**
- **Line MSRP = Base Amt + Promotion + Options.** In the test quote, a PowerView motor is 690.00 in Options, and the Gateway is Base 0.01 + Options 205.00. A markup on Base alone would badly underprice motorized products.
- **Dealer cost cannot be recomputed.** The Silhouette line has MSRP 2,309.00 × 0.4940 = 1,140.65, but DC charges 1,186.83, because options are discounted differently. Unit and Extended cost are always taken as printed.
- **Qty > 1:** Base, Options and Unit are per unit; Extended = qty × Unit.
- **Every test line carried `Collection:`** (Duette, Silhouette, Palm Beach Shutters, Motorization). This is the product-line key.
- **Incomplete lines are allowed by DC** and print `*** Error: L-Frame Cover Strip - is required ***`.
- `*** Information: … ***` lines and the shutter square-foot summary rows are noise.
- Numbers use thousands separators (`1,619.00`), and sizes use spaced fractions (`48 1/2`).
- **Handling fees are not a flat $33 per line** in practice: 1 line = 33.00, 4 lines = 144.00. PSS passes on the printed total, never a computed one.

Real samples become test fixtures under `tests/fixtures/dc/`. `dealer-copy-1-line.html` is the emailed attachment. The 4-line sample is captured from the second emailed copy.

## 3. Safety rules (kept from the 2026-09-17 design)

1. **Exact key only.** The job is found by `PO Reference` = `PSS-####` → `leads.project_no`. No PO, a malformed PO, or a PO naming no job → **not imported**, and the owners are told. There is never a fuzzy fallback by client name. Attaching one household's prices to another is the failure this design exists to prevent.
2. **Only DC mail counts.** The sender must be `retailer@hunterdouglas.com`, the subject must match `^DEALER COPY #(\d+), PO (.+)$`, and there must be exactly one `.html` attachment. Anything else is skipped without being opened.
3. **The mailbox is read-only.** Nothing is moved, deleted or marked read. support@ is a working inbox.
4. **Nothing reaches a customer automatically.** An import creates a *draft*. Only the owner's **Send** shares anything.
5. **The Dealer Copy can never be shared.** This is enforced by the database (§5), not just hidden in the UI.
6. **Idempotent.** A Graph message id is processed at most once. Reprocessing is harmless.

## 4. The flow

**Owner in DC**
1. On the PSS job page, **Create quote in Direct Connect** opens `https://dc.picbusiness.com/Orders/Orders/clientForm.pic?ORDa=a&a=a` in a new tab and copies the job's `PSS-####` to the clipboard, with a note: "PSS-1042 copied. Paste it into PO Reference." DC cannot be pre-filled from outside, so this is the one manual paste.
2. The owner builds the quote (Client → Header, pasting the PO → Products) and emails the Dealer Copy as in §2.

**PSS imports** (cron, every 15 minutes)
3. Reads new support@ messages, filters them (§3), matches the job, and parses the attachment.
4. Stores the original HTML on the job as a `dealer_copy` file (never shareable).
5. Creates the next **quote version** as a draft, with its lines, and emails the owners "PSS-1042: quote v1 ready to review".

**Owner in PSS** (job page, admin only)
6. Reviews the lines (§6), adjusts percentages if needed, waives the handling fee if wanted, and checks installation.
7. Presses **Send contract**. PSS freezes the figures, generates the contract PDF, shares it as a `contract`, and emails the client.

**Client**
8. Opens their project page and signs. The existing signing flow stamps and fingerprints the PDF.
9. Signing a *generated* contract moves the job to **Sold** and marks the version signed.

**Owner, after signing**
10. The job shows **Signed — ready to order** with **Open DC quote 22250749** (`…/Orders/Orders/Items/?Wo=<quote>&ORDa=c&view=C`). The owner presses **Submit Order** in DC. Ordering always stays a human action in DC.

## 5. Data — `024_dc_quote_import.sql`

Idempotent, with whole-line `--` comments only and no `;` inside comments (`scripts/migrate.mjs` re-runs every file and splits on `;`). All money is **integer cents**, as in `018_install_pricing.sql`.

**`ingested_messages`**: one row per DC-shaped message considered.
- `message_id text primary key` (Graph immutable id)
- `received_at timestamptz not null`
- `processed_at timestamptz not null default now()`
- `outcome text not null check (outcome in ('imported','unchanged','no-po','no-match','no-costs','incomplete','unreadable','failed'))`
- `lead_id uuid references leads(id) on delete set null`
- `dc_quote_no text`, `detail text`

**`dc_quote_versions`**
- `id uuid pk`, `lead_id uuid not null references leads(id) on delete cascade`, `version int not null`, `unique (lead_id, version)`
- `dc_quote_no text not null`, `po_reference text not null`
- `source_file_id uuid not null references job_files(id)`: the stored Dealer Copy
- `source_sha256 text not null`: detects a resend with no changes
- `message_id text references ingested_messages(message_id)`
- `status text not null check (status in ('draft','sent','signed','superseded'))`
- `dealer_subtotal_cents`, `handling_fee_cents`, `oversized_fee_cents`, `dealer_total_cents`: **as printed**
- Frozen at send (null while draft):
  - `handling_fee_waived boolean`
  - `install_quote_id uuid references install_quotes(id)`, `install_cents`
  - `products_cents`, `client_total_cents`
  - `contract_file_id uuid references job_files(id)`
  - `sent_at`, `sent_by`
- `signed_at timestamptz`, `created_at`

**`dc_quote_lines`**
- `version_id uuid references dc_quote_versions(id) on delete cascade`, `position int`, `primary key (version_id, position)`
- `qty int not null check (qty > 0)`, `room text` (empty for accessories), `description text not null`, `collection text not null`
- `base_cents`, `promotion_cents`, `options_cents`, `msrp_unit_cents` (= base + promotion + options), `cost_factor numeric(6,4)`, `cost_unit_cents`, `cost_extended_cents`
- `options jsonb not null`: an ordered `[label, value]` array, exactly as printed
- `markup_pct numeric(6,2)`, `sell_unit_cents`, `markup_overridden boolean not null default false`: set on review, **frozen at send**

**`markup_rules`**: keyed by DC collection name.
- `collection text primary key`, `pct_of_msrp numeric(6,2) not null check (pct_of_msrp > 0)`, `updated_by text`, `updated_at timestamptz`

**`dc_settings`**: single row (`id boolean primary key default true check (id)`, the repo pattern).
- `terms_file_pathname text`: the owner's terms PDF, appended to every contract. Replacing it affects only contracts sent afterwards.
- `last_polled_at timestamptz`: the reader's high-water mark

**Changes to existing constraints.** Each redefinition lists the **full current set** (enforced by `tests/db/migration-checks-consistent.test.ts`):
- `job_files_doc_type_check` adds `'dealer_copy'`: `('quote','po','invoice','other','contract','dealer_copy')`. `lib/admin/doc-types.ts` gains the value, but it is **excluded from the owner's type menu**.
- New `job_files_dealer_copy_never_shared` check: `doc_type is distinct from 'dealer_copy' or shared_at is null`. The share action also refuses, but the database is the guarantee.
- `job_events_kind_check` adds `'quote'`, for import, send and signed-version events. The full list is the one in `021_contract_signing.sql` plus `'quote'`.

## 6. Pricing — what the owner reviews

For each line:
- **% of MSRP**: from `markup_rules[collection]`. The owner may override it on this line, and the row is marked *adjusted*.
- **Sell unit** = round-half-up(`msrp_unit_cents` × pct / 100), in cents.
- **Line sell** = qty × sell unit.
- **Line margin** = line sell − `cost_extended_cents` (shown to owners only).

The version totals:
- **Products** = Σ line sell.
- **HD handling fee** = `handling_fee_cents` as printed, or 0 if waived. A waived fee still counts in the owner's cost.
- **Oversized fees** are passed through like handling. They are 0 in every sample, and are shown only when non-zero.
- **Installation** = the job's latest `install_quotes` row of kind `final`, else of kind `estimate`. The owner can instead tick **No installation on this job**.
- **Client total** = Products + handling (unless waived) + oversized + Installation.
- **Owner view only:** Your cost = `dealer_total_cents` (HD's product cost plus its fees, as printed). Product margin = Client total − Installation − Your cost. Installer labour cost is out of scope (§13).

**Send is blocked, with a plain reason, while:**
- a line's collection has no markup rule ("Set a markup for Silhouette first", linking to Settings)
- any line came from an `*** Error` (such a version is never imported, so this is defence in depth)
- there is no install quote and "No installation" is not ticked
- a newer version exists for this job
- no terms PDF is set in Settings

**Saved equals shown.** The figures the Send action freezes are recomputed on the server from the stored lines and settings, and are compared field by field with the figures the owner's screen submitted. Any difference refuses the send ("Prices changed since you opened this page; review again"). No total is ever trusted from the browser.

## 7. The contract PDF

Generated with `pdf-lib` (already a dependency via `lib/portal/stamp.ts`).

- **First pages:** the company name and address, "Contract PSS-1042", the date, and the client's name and address from the job. Then a table of Room, Product (the DC description), key options (size W × H, fabric/color, control system, mount), Qty, Unit price, Line total. Then Installation, HD handling fee (unless waived), and **Total**.
- **Never on it:** cost, cost factor, MSRP, percentage, margin, DC quote number.
- **Then:** the owner's terms PDF pages, copied in unchanged.
- **Signing:** unchanged. The existing flow fingerprints the served bytes and stamps the signature (`lib/portal/sign.ts`, `stamp.ts`).
- **Filing:** `createFile` as `kind='document'`, `doc_type='contract'`, then shared. The name is `Contract PSS-1042 v1.pdf`.
- **Client email:** "Your proposal is ready to review and sign", linking to their project page. This reuses the existing portal email sending.

**On signing:** when a signature is recorded on a file that is some version's `contract_file_id`, the same statement marks that version `signed` and moves the job to `sold` (only from `new`, `visit_booked` or `quoted`; later stages are left alone). It writes a `stage` job_event. Contracts uploaded by hand behave exactly as today.

**Sending also** moves the job to `quoted` if it is at `new` or `visit_booked`.

## 8. Versions and revisions

- Each import for a job creates version N+1 as a `draft`.
- If the new file's sha256 equals the latest version's, the outcome is `unchanged`: no new version, and the owners are not emailed.
- **Sending vN while an earlier version is `sent` and unsigned:** that earlier contract is un-shared and its version becomes `superseded`. A client can only ever sign the latest.
- **When a version is already `signed`:** a newer draft shows "Client signed v1 for $X; this version is $Y". Sending it creates a new contract to sign (a change order). The signed version, its PDF and its signature are never altered.
- The review screen lists earlier versions read-only, with what changed per line (added, removed, price changed).

## 9. Reading the mailbox

- **Route:** `app/api/cron/dc-quotes/route.ts`, `Bearer ${CRON_SECRET}`, the same as the existing crons. It is scheduled in `vercel.json` every 15 minutes.
- **Auth:** the existing app-only Graph client (`lib/calendar/graph.ts`, `graphFetch`), reused by a new `lib/dc/` module. The app registration gains **Mail.Read (Application)** with admin consent. An Exchange application access policy restricting the app to support@ is recommended.
- **Query:** `/users/{support@}/messages?$filter=receivedDateTime ge {last_polled_at − 1h}&$select=id,subject,from,receivedDateTime,hasAttachments`, then attachments only for DC-shaped messages. The one-hour overlap plus `ingested_messages` makes late-arriving mail safe.
- **Graph unavailable:** the run fails, nothing is recorded, and the next run retries.
- **Outcomes and owner emails:**

| Outcome | Owners are emailed |
|---|---|
| `imported` | "PSS-1042: quote v2 ready to review", with a link |
| `unchanged` | no email |
| `no-po` / `no-match` | "Dealer Copy for DC quote 22250749 has no valid PSS number in PO Reference" |
| `no-costs` | "Resend it with 'Include dealer costs' ticked" |
| `incomplete` | "Line 3 has an error in Direct Connect: L-Frame Cover Strip is required" |
| `unreadable` | "The Dealer Copy format wasn't recognised". The file is kept for a developer. |
| `failed` | Only after it has also failed on the next run |

## 10. Parsing

A pure function `parseDealerCopy(html: string)` in `lib/dc/parse.ts` returns either a typed quote or a typed refusal. It has no I/O.

- It parses the HTML as a document; it never runs scripts and never fetches images.
- **Header:** read by label (`Quote #:`, `PO Reference:` …), not by position.
- **Columns:** found by header text. A missing `DEALER COSTS` → `no-costs`.
- **Line rows:** the first cell is an integer item number. The following nested label/value table holds the options.
- **Amounts:** strip `,`, parse to integer cents exactly, never via floating point.
- **`*** Error:` anywhere** → `incomplete`, naming the item and message. `*** Information` lines and rows after the last item that are not totals (SQFT summaries) are ignored.
- **Totals:** read by label. **The parser checks its own work:** Σ Extended must equal Product Sub-Total, and Sub-Total + Handling + Oversized must equal Dealer Total. A mismatch → `unreadable`, rather than importing a figure that may be wrong.
- The PO must match `^PSS-\d{4,}$` after trimming. Otherwise → `no-po`.

## 11. Settings and job page UI

**Settings** (`app/admin/settings/`, following `InstallRatesSection` / `LeadDefaultsSection`):
- **Markup by product line:** a table of collection → % of MSRP. Collections appear automatically once seen in any import, marked "not set" until given a percentage. Example text: "Duette 60% → a $655 MSRP sells for $393.00."
- **Contract terms:** upload or replace the terms PDF, and preview it.

**Job page** (`app/admin/jobs/[id]/`), a new **Direct Connect** panel:
- **Create quote in Direct Connect** / **Open DC quote #**, as in §4.
- The review table and totals (§6), with the handling fee **Waive** switch, the install source shown ("Final install quote, 26 Sep"), and a **No installation** tick.
- **Send contract**, disabled with its reason while any block in §6 applies.
- Version history, and after signing, the **Signed — ready to order** banner.

The DC panel and every cost figure are admin-only. Nothing in `app/(portal)` reads the `dc_*` tables.

## 12. Testing

**Parser (unit, real fixtures)**
- The 1-line fixture gives exact cents for every field and `Collection = Duette`.
- The 4-line fixture:
  - MSRP = base + promotion + options (Silhouette 230900, Gateway 20501)
  - qty 2 extended = 2 × unit
  - an accessory with no room
  - `48 1/2` preserved
  - noise ignored
- The fixture with `*** Error` → `incomplete`, naming line 3.
- Costs missing → `no-costs`.
- Altering one Extended so the totals don't reconcile → `unreadable`.

**Pricing**
- Sell = round-half-up(MSRP × pct).
- Waiving drops the fee from the client total only.
- Installation is picked final-first.
- A missing rule blocks send.
- A client-submitted total that differs from the server's recomputation is refused.

**Safety gates** (each proven by breaking the guard and watching the test fail)
- A Dealer Copy with PO PSS-1042 never attaches to any other job.
- Mail from any other sender is never opened.
- Sharing a `dealer_copy` is refused by the database itself. Tested on a Neon branch, not a mock.
- The same message processed twice creates one version.

**Database:** migration 024 is applied twice on a Neon test branch (idempotence). The new SQL (version numbering, sign-marks-signed-and-sold in one statement) runs against real Postgres.

**End to end:** a fixture message → import → review → send → the client signs on the portal → the job is Sold, the version is `signed`, and the PDF contains no cost.

## 13. Out of scope

- Submitting orders to HD. This is always done by hand in DC.
- Reading anything else from support@, or replying to mail.
- Tracking order status or shipping from DC (a possible later phase using the same PO key).
- Repairs, parts and swatch quotes.
- DC's own client pricing, proposals and QuickBooks export.
- Installer cost and profit accounting.

## 14. Prerequisites the owner must do

1. Choose the markup percentages per collection (they can start "not set", which blocks sending).
2. Upload the contract terms PDF.
3. Grant **Mail.Read (Application)** to the existing Azure app registration, with admin consent. Optionally, restrict it to support@ with an application access policy.
4. Adopt the DC habit of putting **PO Reference = PSS-####** and sending with **Owner + Include dealer costs**.
