# The Installation Price Calculator — Design

**Date:** 2026-09-16
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:** PSS calculates its own installation labour price per job, from a rate table the owner edits in Settings. An **Install** tab on the job page prices a job from hand-entered lines, or from the saved measurements once they exist.

This is the first slice of moving the commercial flow off Direct Connect. It builds on the job tracker, measurements and Settings, all of which are live.

## 1. Purpose

**The problem.**
- Installation is priced inside Direct Connect, Hunter Douglas's ordering platform. PSS has no idea what its own labour is worth on any job.
- Because the number lives elsewhere, nothing downstream in PSS — a quote, a deposit, a balance — has a labour figure to work from.
- Direct Connect's real value is the Hunter Douglas product price. Installation is the owner's own pricing and does not belong in a vendor's system.

**The fix.** A rate table the owner maintains, and a calculator that turns a job's scope of work into a labour total. The total is a saved, immutable snapshot, so what was quoted stays what was quoted.

**Success means:**
- The owner sets a roller shade rate of $25 per window once, in Settings, without a deploy.
- A designer prices a consultation estimate in seconds: pick a treatment, type a count, read the total.
- After the sale, the installer's real measurements produce a second priced snapshot beside the estimate, so the two can be compared.
- Raising a rate next spring never changes a price already quoted.

## 2. Decisions made in conversation

- **Fabric never affects installation.** A roller shade is the same labour whether the fabric costs $1,500 or $3,000. Fabric drives the Hunter Douglas product price only, and that price keeps coming from Direct Connect.
- **Rates are data, not code.** They live in the database and are edited in Settings. The build does not wait on official numbers.
- **Every calculation is an immutable snapshot** that stores the rates it used. Recalculating creates a new snapshot; it never edits an old one.
- **Hand-entered lines are the main path.** Quoting happens at the consultation, before precise measurements exist. Pulling from measurements is an upgrade for later in the job, not a prerequisite.
- **Most jobs are a count of windows at a flat rate.** The common case must be two fields — treatment and a count.
- **Round up, per window.** Square feet and linear feet both round up to a whole unit, and the rounding happens per window, not once per job. Three windows at 8.33 sq ft bill as 9 + 9 + 9 = 27, not 25.
- **The minimum covers the trip.** There is no separate trip fee. There are no job-level fees at all, so none are built.
- **The calculator does not touch `quote_cents`.** The install total is labour only. The customer-facing quote is labour plus the Hunter Douglas price, and that belongs to a later slice.
- **Its own tab, not a card on Overview.** `app/admin/jobs/[id]/` is being rewritten by another session; a new tab is almost entirely new files. The calculator will also grow into the quote builder, which deserves its own room.

## 3. Data model

### Rates — one row per treatment

```
install_rates
  treatment      text primary key    one of the seven TREATMENT_TYPES keys
  basis          text                'window' | 'linear_ft' | 'sq_ft'
  rate_cents     integer             not null, >= 0
  updated_at     timestamptz
```

`not_sure` is a questionnaire answer, not a treatment that can be installed, and is excluded.

### Settings — one row, the job-level numbers

```
install_settings
  id                    boolean primary key default true   single row, enforced by a check
  minimum_cents         integer
  hard_surface_cents    integer      per window
  high_ladder_cents     integer      per window
  motorized_cents       integer      per window
  updated_at            timestamptz
```

Surcharges are flat amounts per window, not percentages. A percentage of a labour line is a percentage of a number the owner already chose, which is a second way to say the same thing.

### Snapshots — what a job was priced at

```
install_quotes
  id             uuid primary key
  lead_id        uuid references leads on delete cascade
  kind           text        'estimate' | 'final'
  minimum_cents  integer     the minimum in force when priced
  subtotal_cents integer     lines plus surcharges, before the minimum
  total_cents    integer     what the job's labour costs
  created_by     text
  created_at     timestamptz

install_quote_lines
  id                 uuid primary key
  install_quote_id   uuid references install_quotes on delete cascade
  position           integer
  treatment          text
  basis              text            copied from the rate, not looked up later
  quantity           integer         windows, or whole feet, or whole square feet
  rate_cents         integer         copied from the rate, not looked up later
  hard_surface       boolean
  high_ladder        boolean
  motorized          boolean
  amount_cents       integer         the line's contribution, surcharges included
```

`basis` and `rate_cents` are copied onto the line deliberately. A snapshot that joined back to `install_rates` would silently change when a rate changed, which is the exact failure this design exists to prevent.

Surcharge flags sit on the line and apply to every window in it. Six rollers where only two need a high ladder are two lines: four plain, two flagged. This keeps hand entry fast in the common case, where a whole line shares its circumstances.

Migration number: the next free one at implementation time. 015 is taken and another session holds work in flight, so it must be checked rather than assumed.

## 4. The pricing engine

A pure function in `lib/admin/install-pricing.ts`. No database access, no dates, no I/O — rates and lines in, cents out. This is where the money rules live and it must be testable without a database.

```
line quantity
  window      → the count as entered
  linear_ft   → ceil(width_inches ÷ 12)          per window, then × count
  sq_ft       → ceil((width × height) ÷ 144)     per window, then × count

line amount   = (rate_cents × quantity)
              + (count × sum of the line's flagged surcharges)

subtotal      = sum of line amounts
total         = max(subtotal, minimum_cents)    — but a job with no lines totals 0
```

A job with no lines is not a job, so the minimum does not turn an empty calculator into a $150 charge. The minimum applies only once there is something to price.

Everything is integer cents throughout, matching `quote_cents` and `sold_cents` already in the schema. No floating point touches a price at any point.

Rounding is applied to each window's measurement before multiplying, never to the money. Money is exact by construction because it never leaves integers.

## 5. The screens

### Settings — Installation rates

A section listing the seven treatments, each with a basis select and a rate field, then the minimum and the three surcharges. Saving writes the rates and logs who changed them. Nothing here is per-job.

### The job page — a new Install tab

`Overview | Measurements | Files | Activity` gains **Install**.

- **Add a line:** treatment, count, and three tick boxes. For a `linear_ft` or `sq_ft` treatment, width and height fields appear, because the basis needs them.
- **The total** and its subtotal, with the minimum shown when it is the number that applied — a job that priced at $50 against a $150 minimum should say so, not silently read $150.
- **Save as estimate** or **Save as final.**
- **Past snapshots**, newest first, each with its kind, total, author and date. Estimate and final sit side by side so a difference is visible.
- **Fill from measurements** appears only when the job has measurements. It pre-fills one line per measured window — `hard_surface` and `high_ladder` map from each window's `requirements`. Windows are deliberately not merged into shared lines: a line holds one width and height, so merging windows of different sizes would misprice anything sold by the foot or square foot. It is a starting point the owner can edit before saving, never an automatic save.

Measurements do not currently record a treatment, so filling from them asks the owner which treatment applies. Putting a treatment on the measurement is a better long-term answer and is noted as out of scope below.

## 6. Out of scope

Named here so the boundary is explicit, not because they do not matter:

- **The Hunter Douglas product price.** Still read from Direct Connect and typed in. PSS does not model fabrics or a price book.
- **The customer-facing quote,** its PDF, and the total that combines labour with product.
- **Portal acceptance and acknowledgement.** Specced by the other session as Phase 2 of the customer project page.
- **Payments.** Deposit and balance are their own project, with their own provider decision.
- **A treatment on each measurement.** Wanted, but it changes a schema another session is working near.

## 7. Testing

- **The engine, exhaustively and without a database.** Each basis; rounding at exact boundaries such as 12″ and 144 sq in; a job under the minimum; a job over it; a job exactly at it; every surcharge alone and combined; zero-count and empty-line cases; a line whose rate is zero.
- **Snapshot immutability.** Price a job, change the rate in Settings, re-read the snapshot, assert every stored figure is unchanged. This is the single most important test in the feature.
- **Settings round-trip.** Saving rates and reading them back, including a basis change.
- **The tab**, rendered with and without measurements, and with no rates configured at all — which must say so plainly rather than price everything at zero.
- **End to end:** set a rate, open a job, add two lines, save an estimate, see it listed.

A job with no rates configured is a real state on day one, before the owner's numbers are entered. It must be obvious, not a silent zero.

## 8. Open items

These do not block the build. The schema holds them; the values are entered in Settings.

- The official per-treatment rates and bases.
- The three surcharge amounts.
- The minimum job cost.

## 9. How this fits what comes next

```
Direct Connect ──(HD product price, typed in)──┐
                                               ▼
  scope of work ──► install calculator ──► labour total
                                               │
                                               ▼
                                        quote (labour + product)
                                               │
                                     PDF ──────┼────── portal: accept
                                               │
                                               ▼
                                       deposit ─► order ─► install
                                               │
                                               ▼
                                  complete ─► acknowledge ─► balance
```

This slice builds the second box. Everything downstream needs a labour number and cannot start without one, which is why it is first.

The quote PDF has a short path: `createFile()` already accepts a body, writes to private Blob storage and registers the row, and the other session's work makes documents shareable with a `Quote` type. Generating a PDF and sharing it needs no new storage, portal page or email plumbing — only a renderer, which is the one genuinely new dependency and deserves a throwaway spike before it is committed to.
