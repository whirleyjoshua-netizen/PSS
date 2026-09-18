# Signing the Contract — Design

**Date:** 2026-09-18
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:** A customer signs their purchase contract from their project page, and both sides get a stamped PDF of what was signed.

This is the first half of what the owner described as the step after approval: *"after the quote is approved then the client is sent official paperwork or the purchase contract to sign and after that we take payment."* **Taking payment is a separate project and is out of scope here** — see §11.

## 1. Purpose

**The problem.** Today the contract is entirely manual: email a PDF, hope it comes back signed, chase it if it does not. The owners have no record of when a customer agreed or to exactly which version of the document, and the customer has nothing to keep.

**The fix.** The contract is shared to the customer's project page like a quote. They read it, type their name, confirm, and sign. Both sides end up holding the same stamped PDF and the app holds the evidence behind it.

**Success means:**
- A customer can sign the moment they have read the contract, without printing anything.
- The owners can say, years later, who signed, exactly when, and **which version of the document** they agreed to.
- The customer keeps a copy without asking for one.
- A signed contract cannot be quietly altered afterwards.

## 2. Decisions made in conversation

- **The contract is a PDF the owner uploads per job.** The app never composes legal text. The owner's wording stays the owner's.
- **The signature is captured in the app**, not through a third-party e-signature service. Electronic signatures are valid under federal ESIGN and Nevada's UETA; the difference a paid service buys is *evidence quality*, so §5 specifies what must be recorded to make this stand up.
- **One signer:** the customer signed into the portal. No multi-signer flow.
- **Signing changes no stage.** The owners are told, and move the job themselves. A gate that blocks the owners' own work gets routed around, and a rule that gets routed around is worse than no rule.
- **The output is a stamped PDF** — the owner's original with a signature block appended — not only a database record. It is what a customer expects to receive and what an owner would want to produce in a dispute.
- **A signed contract is frozen.** It cannot be replaced, unshared or deleted. New terms mean a new contract and a new signature.
- **One new dependency, `pdf-lib`**, approved by the owner. Pure JavaScript, no native binaries, works on Vercel. The alternative (a headless browser) is heavy and fragile on serverless.
- **The Nevada three-day right-to-cancel notice belongs in the owner's uploaded PDF**, written by whoever does their paperwork. The app must not generate or imply legal text.

## 3. What already exists, and is reused

Verified in the codebase rather than assumed:

- `job_files` with `doc_type`, `shared_at`, and `blob_pathname`; `setDocType`, `setShared`, `listSharedDocuments(leadId)`, and `readFile(file)` returning `{ stream, contentType }` from private Vercel Blob storage.
- The customer file route's `DOWNLOADABLE = ["photo","document"]` allowlist, which is how a shared document reaches the customer at all.
- `requireCustomer()` and the ownership pattern from approve, acknowledge, messages and service requests: re-derive the caller's jobs from the session, refuse a foreign id **identically to one that does not exist**, before any database handle.
- The redirect-and-re-derive rule established on the approve branch: an action redirects to `/project/<id>?<param>=…` and the page renders a sentence **re-derived from the job's real state**, never printed from the query param.
- `Resend` 6.25.0, used as in `lib/portal/send-approval-email.ts`: plain text, throws when unconfigured, always called *after* the write so a failed email cannot undo the record. Its `attachments` option takes `{ content: Buffer, filename: string, contentType?: string }`, max 40MB per email.
- `job_events` for the owners' timeline; `formatShortDate` / `formatTime` for Las Vegas times.

## 4. The flow

**The owner:** uploads the contract PDF to the job, sets its type to **Contract**, shares it. Identical to sharing a quote.

**The customer**, on their project page, under the documents section:

> **Your contract is ready to sign.**
> [ Read the contract ] — opens the PDF.
>
> Full name: `[__________]`
> ☐ I agree to sign this contract electronically.
> [ Sign this contract ]

Both the typed name and the checkbox are required. The button posts `jobId` and `fileId` and nothing else that matters — see §7.

**What the action does, in order:**

1. `requireCustomer()`, then refuse a `jobId` not among the caller's own jobs.
2. Re-derive the file server-side via `listSharedDocuments(job.id)`; refuse unless it is shared, belongs to that job, and has `doc_type = 'contract'`.
3. Refuse if a signature already exists for that file — except that a **repeat submission answers with the same success** (§8).
4. Read the file's bytes with `readFile`, and compute their SHA-256. This is the fingerprint of exactly what was signed.
5. Write the signature row (§5) in one statement, together with its `job_events` row.
6. Generate the stamped PDF and store it (§6). A failure here does **not** undo the signature.
7. Email the owners, and email the customer their copy.
8. Revalidate `/project` and `/project/<jobId>`, then redirect to `/project/<jobId>?signed=1`.

**Afterwards** the customer's page reads: *Signed on Sep 18, 2026 at 2:05 PM* with a link to download the signed PDF. The sign form is gone.

## 5. What is recorded, and why

A new table, `contract_signatures`:

| column | meaning |
| --- | --- |
| `id` | uuid primary key |
| `lead_id` | the job, `references leads(id) on delete cascade` |
| `file_id` | the contract file, `references job_files(id)`, **unique** |
| `signed_name` | exactly what the customer typed |
| `signed_email` | the portal account they were signed in as |
| `signed_at` | `timestamptz not null default now()` |
| `ip` | the request's client address, nullable |
| `user_agent` | nullable |
| `doc_sha256` | SHA-256 of the bytes served to them |
| `signed_file_id` | the stamped PDF's own `job_files` row, `references job_files(id)`, **nullable** — null when stamping failed |

`signed_email` is the identity the app actually verified; `signed_name` is what the human typed. Both are kept because they answer different questions.

`doc_sha256` is the load-bearing field: it proves the document the owner holds is the one the customer agreed to, unchanged. Without it, "they signed the contract" is a claim about a file that could have been swapped.

`unique (file_id)` is what makes a second submission a no-op rather than a second signature.

## 6. The stamped PDF

`pdf-lib` loads the original and **appends a new page** — it does not overlay the owner's own layout, which risks covering text. The page states: signed by (typed name), account email, the date and time in Las Vegas, the document's SHA-256, and the project number.

The result is stored as a **new `job_files` row** — `doc_type = 'contract'`, shared, named `<original name> (signed).pdf` — so it reaches the customer through the existing file route with no new download path. That row's id is written to `contract_signatures.signed_file_id`.

**A signature output is never itself signable.** It is a shared file with `doc_type = 'contract'`, so without this rule the page would offer to sign the signed copy, and then to sign *that* copy, forever. Both the page and the action must exclude any file whose id appears as a `signed_file_id` on this job. The exclusion belongs in one server-side helper that both use, so the page and the guard cannot drift apart — the page hiding a control is a convenience, and the action refusing is the guard.

**When stamping fails** (an encrypted or malformed PDF, which `pdf-lib` cannot open):

- The signature stays recorded and valid. It is the legal record; the stamped file is a convenience.
- `signed_file_id` stays null, and no second `job_files` row is created.
- The owners' email says plainly that the stamped copy could not be produced, and names the reason.
- The customer's email omits the attachment and links to their project page instead.
- The customer's page still says the contract is signed, with the time.

Nothing about the customer's experience implies failure, because nothing about their act failed.

## 7. The security boundary

- `requireCustomer()` first; a `jobId` not among the caller's jobs is refused **identically to one that does not exist**, before any database handle.
- The file is **re-derived server-side** from that job's shared documents. A `fileId` naming another job's file is refused the same way. No file name, document type or path is ever taken from the post.
- `signed_email` comes from the session, never from the form. The only customer-supplied value that is stored is `signed_name`, and it is stored as data — never interpolated into the timeline body or an email subject.
- A signed contract is **frozen**: `setShared(..., false)` and `deleteFile` must refuse for a file that has a signature row. This is a change to existing functions and must be tested as its own gate.
- `toProject()` is unchanged; no new field reaches `ProjectSummary`. The page decides what to show from the shared documents and the signature it already loads.

## 8. Errors and edge cases

- **A second submission** for an already-signed contract answers with the same success the first did, writes nothing, emails nobody. `unique (file_id)` is the backstop.
- **No contract shared, or it is not `doc_type = 'contract'`:** the form does not render, and the action refuses if posted anyway.
- **An empty name or an unticked box:** the form re-renders with what they typed and says which field is missing. Nothing is written.
- **Email failure** never undoes the signature: the record is written first, the emails sent after, failures logged.
- **A job deleted between page load and submission** refuses exactly as a foreign id does.
- Every path works with JavaScript off: a plain `<form>` post and a redirect.

## 9. The migration

**`db/migrations/021_contract_signing.sql`** — number claimed; 020 is the current highest.

1. Widen `job_files_doc_type_check` to `('quote','po','invoice','other','contract')`.
2. Widen `job_events_kind_check` to the current list from 019 **plus `'signature'`**: `('stage','note','edit','email','reward','measure','file','contact','message','service','signature')`.
3. Create `contract_signatures` as in §5, with `unique (file_id)` and an index on `lead_id`.

Idempotent like every migration here (`drop constraint if exists` then add; `create table if not exists`), because `scripts/migrate.mjs` re-applies every migration on every run.

## 10. Testing

**Unit**
- The action refuses a job the customer does not own, and a file belonging to another job, **writing nothing** — asserted against the writers that stand between the action and the database, not against the return value alone.
- It refuses a file that is not shared, and one whose `doc_type` is not `contract`.
- It records `signed_email` from the session even when the form carries a different address.
- `doc_sha256` matches the bytes actually read.
- A second submission writes no second row and sends no second email.
- Stamping failure leaves the signature intact, `signed_blob_pathname` null, and the customer's page still reading Signed.
- `setShared(false)` and `deleteFile` both refuse for a signed contract.
- The page shows the sign form only for a shared, unsigned contract, and the signed line only once a signature exists.
- **A signature output is never signable:** with a signed contract and its stamped copy both shared on the same job, the page offers no sign form, and the action refuses a post naming the stamped copy's id. Both halves are tested — the page hiding it is not the guard.

**End-to-end (Neon test branch)**
- A customer signs; the owners' job shows the timeline row and the signed file; the customer can download it.
- A customer with a signed contract sees no form and cannot produce a second signature.
- An owner cannot unshare or delete a signed contract.
- **The release gate:** a customer signing must not sign, or reach, another customer's contract. Prove it by weakening the ownership match and watching the gate **fail on its own assertion** — a spec that dies on a selector or a fixture proves nothing.

## 11. Out of scope

- **Taking payment.** A separate project, specced separately, after this ships.
- Multi-signer contracts, countersigning by the owners, or signature images.
- App-generated contract text, including the Nevada cancellation notice.
- Any customer-side undo of a signature. If it was signed in error, the owners handle it out of band; a visible "unsign" turns a commitment into a toggle.
- Reminders or chasing unsigned contracts.
