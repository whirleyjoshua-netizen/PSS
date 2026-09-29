# Documents: Templates, Per-Client Documents, and Portal Guides — Design

**Date:** 2026-09-28
**Status:** Design approved in conversation by the owner, pending review of this written spec.
**Migration:** `db/migrations/026_documents.sql` (claimed with the other active sessions).

## 1. Purpose

**The problem.**
- Contract terms are a PDF uploaded in Settings. Changing them means editing elsewhere and re-uploading.
- There's no way to send a client any other document to sign or acknowledge: a service agreement, a change order.
- Standing information, such as how to prepare for install or how to care for the product, isn't anywhere a client can find it.

**The fix.**
- **Templates.** The owner writes templates in the admin with a simple editor. Templates contain fill-in fields.
- **Per-client documents.** From any job, the owner creates a document from a template, adjusts it for that client, and sends it. The client **signs**, **acknowledges** or **views** it on their project page, depending on the template.
- **Terms.** The contract terms become the first template, and generated contracts print them.
- **Portal guides.** Two owner-edited guides appear on the portal at the right stage: install prep, and warranty & care.

**Success means:**
- The owner changes the terms, or writes a service agreement, in the app, with no files involved.
- A document sent to a client carries the client's real details, and can never go out with an unfilled field.
- Every signed or acknowledged document is a frozen PDF, fingerprinted, with who, when and from where.
- A client sees only their own documents, and only once the owner sends them.

**Owner decisions (2026-09-28):**
- Per-client document types: **service agreement** and **change order**. Warranty/care and install/measure notices are **portal guides**, not per-client documents.
- The client's response is set **per template**: sign, acknowledge or view.
- Editing uses a **simple formatted editor**: headings, bold, bullets, fields, and a live preview.
- **Terms live as a template**, replacing the Settings upload.

## 2. The formatting language ("doc text")

Templates and documents are stored as plain text in a small, strict subset of Markdown. The editor's buttons write it, so the owner never has to learn it.

| Written | Means |
|---|---|
| `## Heading` | section heading |
| `### Subheading` | smaller heading |
| blank line | paragraph break |
| `- item` | bullet (one level only) |
| `**bold**` | bold, inline |
| `{{client_name}}` | fill-in field |

Rules:
- Anything else is literal text. There are no links, images, tables, HTML or nesting.
- It is rendered in exactly two places, from **one parser** (`lib/docs/parse.ts` → typed blocks):
  - **PDF**: by pdf-lib, reusing the contract generator's wrapping and WinAnsi handling.
  - **React**: the admin preview and the portal guides. Rendered as React elements, **never** `dangerouslySetInnerHTML`, so nothing a template contains can run in a browser.
- A `{{field}}` that isn't in the field list (§3) is a **template error**. The editor shows it, and the template can't be saved while it has one.

## 3. Fill-in fields

A fixed list, resolved from the job and business constants at the moment a document is created. Unknown keys are rejected.

| Key | Value |
|---|---|
| `client_name` | job name |
| `client_first_name` | first word of the job name |
| `client_email` | job email |
| `client_phone` | job phone, formatted |
| `address` | street address |
| `city` | city |
| `project_no` | `PSS-####` |
| `today` | date the document is created, Las Vegas time, e.g. "Sep 28, 2026" |
| `contract_total` | sold amount, else quoted amount, formatted money |
| `deposit` | deposit amount, formatted money |
| `balance_due` | sold amount − deposit |
| `install_date` | install date |
| `company_name` | business legal name |
| `company_phone` | business phone |
| `company_email` | business email |

**Filling:**
- The template's text is copied into the document with fields replaced by their values.
- A field **with no value**, e.g. no email yet, is left in the document text as a visible marker: `{{deposit}}` stays literally.
- The document editor highlights every remaining marker.
- **Send is blocked** while any `{{…}}` remains. The owner types the value or fixes the job details and re-creates.

Terms templates are the exception, because they are printed inside every contract. Terms may use only fields that exist at contract time: `client_name`, `project_no`, `today`, `company_*`. They are filled when the contract is generated.

## 4. Data (`026_documents.sql`)

The migration is idempotent, with whole-line comments and no `;` inside comments.

### `document_templates`

| Column | Type / rule |
|---|---|
| `id` | uuid primary key |
| `name` | text not null |
| `kind` | text not null, check in (`terms`, `service_agreement`, `change_order`, `other`, `guide_install`, `guide_care`) |
| `response` | text not null, check in (`sign`, `acknowledge`, `view`) |
| `body` | text not null |
| `archived_at` | timestamptz |
| `created_by`, `updated_by` | text |
| `created_at`, `updated_at` | timestamptz |

**At most one live template of each singleton kind.** A unique partial index on `(kind) where archived_at is null and kind in ('terms','guide_install','guide_care')`.
- Terms and guides are singletons. Other kinds can have many templates.
- `terms` and guides are forced to `response = 'view'` (check). They aren't sent on their own.

### `job_documents`

| Column | Type / rule |
|---|---|
| `id` | uuid primary key |
| `lead_id` | uuid, references leads, on delete cascade |
| `template_id` | uuid, references document_templates, on delete set null |
| `title` | text not null |
| `kind`, `response` | copied from the template when created |
| `body` | the filled text, editable while a draft |
| `status` | text check in (`draft`, `sent`, `completed`, `void`) |
| `file_id` | uuid, references job_files: the rendered PDF, set on send |
| `sent_at`, `sent_by`, `completed_at`, `voided_at` | |
| `created_by`, `created_at`, `updated_at` | |

**Status meanings:**
- **Completed:**
  - for `sign`: signed
  - for `acknowledge`: acknowledged
  - for `view`: set when sent (nothing to wait for)
- **Void:** the owner withdrew a sent document before completion. Its file is un-shared.

### `document_acknowledgements`

| Column | Type / rule |
|---|---|
| `id` | uuid primary key |
| `lead_id` | uuid |
| `file_id` | uuid, references job_files, **unique** |
| `acknowledged_name` | text |
| `acknowledged_email` | text |
| `ip`, `user_agent` | text |
| `doc_sha256` | text not null |
| `acknowledged_at` | timestamptz |

This mirrors `contract_signatures`. The fingerprint is of the bytes served, so it proves which version was acknowledged.

### Other schema changes

- **Doc types:** `job_files.doc_type` is unchanged. Sign documents are rendered with doc_type `contract`, so they flow through the existing signing path unchanged. Acknowledge and view documents use `other`.
- **Kind check:** `job_events.kind` gains `document`. Every migration that defines `job_events_kind_check` is updated to the identical full list, as `tests/db/migration-checks-consistent.test.ts` requires.
- **Freezing:**
  - Once a file is named by a `document_acknowledgements` row, it is frozen like a signed contract: it can't be unshared, relabelled or deleted.
  - A `job_documents` row that is `sent` or `completed` can't be edited.

## 5. Admin: the Documents page (`/admin/documents`)

A new item in the admin menu, **Documents**, listing live templates grouped as **Contract terms · Client documents · Portal guides**.

- **New template:**
  - Choose the kind.
  - Name it.
  - Choose the response (sign / acknowledge / view). This is fixed to view for terms and guides.
- **Editor (template and document):**
  - A text area with a toolbar: Heading, Subheading, Bold, Bullet, **Insert field ▾** (the §3 list, with a plain-English label for each).
  - A **live preview** beside it, or below it on a phone, rendered from the same parser as the PDF.
  - A **Preview PDF** button opens the real PDF.
- **Validation on save:** the name is required, no unknown fields, the body is not empty, and there is at most one live terms/guide template of each kind.
- **Starter content:** when there is no terms template, the page offers **"Start from the Premier Shade starter terms"**. That creates the terms template from `lib/docs/starter-terms.ts`, tonight's draft. The draft carries a visible "Have a Nevada attorney review" banner line that the owner deletes when ready.
- **Archive:** archiving a template doesn't affect documents already made from it.

## 6. Admin: a job's Documents

On the job page, a **Documents** tab next to Files.

- **Create from template ▾:** lists the live service-agreement, change-order and other templates.
  - Creating one fills the fields (§3) and opens the document editor.
  - The title defaults to "{template name} — PSS-####".
- **Draft:** edit freely. **Send** is disabled while any `{{…}}` marker remains, the job has no client email, or the job is Lost. Each reason is shown plainly.
- **Send**, as one statement plus side effects in order:
  1. Render the PDF: company header, title, client block, body. For `sign` documents, a closing line says "Signed electronically on the client's project page", and the stamp adds the signature page.
  2. `createFile` the PDF: doc_type `contract` for sign, `other` otherwise.
  3. In one statement: set the document to `sent` (to `completed` for view), link `file_id`, share the file, and log a `document` job event.
  4. Email the client: "Your {title} is ready to review/sign", with a sign-in link, using the pattern of the existing contract email. A failed email leaves the document sent, and the owner is told.
- **List:** title · response · status (Draft, Sent, Signed/Acknowledged {date}, Void) · the PDF · **Void** (sent and not completed only).
- **Void** un-shares the file, sets the document to `void`, and logs it. It is refused once completed.

## 7. Client portal

- **Needs your attention**, at the top of the project page, lists:
  - contracts and sign documents: the existing signable list, reworded from "Sign your contract" to "Documents to sign"
  - acknowledge documents that are sent and not yet acknowledged: a link to open the PDF, a typed name, a required tick "I have read {title}", and an **Acknowledge** button
- **Acknowledge** follows the signing action's rules exactly:
  - ownership is re-derived from the session
  - the file is re-derived from the list of acknowledgeable documents, never trusted from the form
  - identity comes from the session email
  - the bytes served are hashed
  - one insert, where a repeat is a no-op
  - the document is marked completed and a job event logged, in the same statement
  - after the response, the owners are emailed
- **Guides:**
  - **Getting ready for your install**, from the `guide_install` template: shown from the moment an install appointment is booked, or the job is Ordered or later.
  - **Caring for your shades**, from `guide_care`: shown once the job is Installed or Completed.
  - Both are rendered with the React renderer. Fields aren't allowed in guides, since they are the same for every client.

## 8. Contracts use the terms template

- `buildContractPdf` takes terms as either `{ text }` (the terms template body, fields filled) or `{ pdf }` (the legacy upload).
  - Text terms are drawn by the doc-text PDF renderer as pages following the contract, in the same fonts and margins.
  - The signed contract PDF then contains the exact terms signed. The fingerprint and stamp are unchanged.
- **Source of terms in `sendContract`:**
  - the live `terms` template if there is one
  - otherwise the uploaded PDF
  - otherwise the existing "Upload your contract terms" blocker, reworded to "Add your contract terms on the Documents page"
- **Settings:** the Contract terms section is replaced by a line linking to Documents. It shows "Using the uploaded PDF until you create terms on the Documents page" while only an upload exists.

## 9. Cancellation window on generated contracts

Home sales very likely carry a 3-business-day right to cancel (FTC Cooling-Off Rule / Nevada home-solicitation law). The owner's attorney confirms the wording. The terms draft says the order isn't placed until the window has passed. The system supports this:

- The Quote tab's **Signed — ready to order** banner changes:
  - **during the window:** "Signed {date}. Cancellation window ends {end} — place the Direct Connect order after that."
  - **after it ends:** the existing banner, "Signed — ready to order".
- **Business days** are every day except Sundays and US federal holidays: New Year's, MLK, Presidents, Memorial, Juneteenth, Independence, Labor, Columbus, Veterans, Thanksgiving, Christmas.
- **Window end** = midnight at the end of the 3rd business day after the signing date, Las Vegas time. This is a pure function with tests.

## 10. Security and integrity

- **Admin:**
  - every Server Action and route calls `requireAdmin()` before reading input
  - templates and job documents are admin-only
  - cost figures never appear in documents unless the owner types them
- **Portal:**
  - clients see only shared files on their own jobs, through the existing file route
  - acknowledgement is re-derived server-side, as signing is
- **Rendering:** template text is untrusted input to the renderers. The React renderer emits only text nodes and fixed elements. The PDF renderer passes every string through `winAnsiSafe`.
- **Frozen once sent or completed:** documents, and acknowledged or signed files, are frozen (§4).

## 11. Testing

- **Parser:** every construct, the literal fallback, unknown-field detection, and the one-level bullets.
- **Field filling:** every key, missing values left as markers, first-name derivation, money and date formatting, and unknown keys rejected.
- **PDF renderer:**
  - page breaks
  - bold runs
  - bullets wrap with a hanging indent
  - characters WinAnsi can't encode don't throw (the Task 7 lessons)
- **React renderer:** no HTML injection. `<script>` in a template renders as text.
- **Business-day window:** Sundays, holidays, a signing on a Saturday, and the end-of-year boundary.
- **Store:**
  - one-statement send, void and acknowledge
  - draft-only edits
  - the singleton index
  - frozen files
  - SQL proven against the Neon test branch with a hand-run script, as `scripts/verify-dc-quote-import.ts` does
- **Actions:** requireAdmin first, and blockers.
- **Portal acknowledge:** ownership, re-derivation, the repeat no-op, and a release gate: acknowledging on job A never touches job B.
- **E2E:** create a service agreement from a template, send it, acknowledge or sign it as the client, and check its status in the admin. Also the contract uses the terms template text.

## 12. Out of scope

- Per-client documents generated from the Direct Connect quote. Those stay on the Quote tab.
- Payments or deposits collected through a document.
- Rich formatting beyond §2, such as images, tables or fonts.
- Multiple signers per document.
- Editing a document after it's sent. Void it and create a new one.
