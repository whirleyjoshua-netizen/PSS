# Contract Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer signs their purchase contract from their project page, producing a signature record and a stamped PDF both sides can keep.

**Architecture:** The contract is an ordinary shared `job_files` row tagged `contract`. Signing writes one `contract_signatures` row plus its `job_events` row in a single CTE, fingerprinting the exact bytes served. A stamped PDF is then generated with `pdf-lib` and stored as a second `job_files` row; failing to produce it never invalidates the signature. The customer page follows the established redirect-and-re-derive rule.

**Tech Stack:** Next.js App Router, React 19 server actions, Neon Postgres via `db()` tagged templates, Vercel Blob (`access: "private"`), Resend, Vitest + Testing Library, Playwright. One new dependency: `pdf-lib`.

**Spec:** `docs/superpowers/specs/2026-09-18-contract-signing-design.md`

## Global Constraints

- **`AGENTS.md`: this is NOT the Next.js you know.** Read the relevant guide in `node_modules/next/dist/docs/` before using ANY Next API — `redirect()` included. Never write one from memory.
- **Migration number 021 is claimed by this plan.** Every migration is re-applied on every run, so every statement must be idempotent.
- **Every migration that touches `job_events_kind_check` restates every kind**, so run order can never narrow it (convention set by `019_service_requests.sql`).
- **No customer-supplied string reaches a permanent record.** `signed_name` is stored as data only. Timeline bodies and email subjects are built from the **document's** name, read server-side.
- **`requireCustomer()` first; a foreign id is refused identically to a non-existent one, before any database handle.** `lib/portal/access.ts` and `toProject()` are not to be modified.
- **A sentence shown to a customer is re-derived from server state, never printed from a query param.** Precedent: `ApprovalNotice` in `app/(site)/project/ApproveQuote.tsx`.
- **Every path works with JavaScript off**: native `<details>` and plain `<form>` posts. Nothing renders wider than ~400px.
- **Test power:** for each guard, delete it and watch exactly the expected tests go red, then widen it and watch red too. **These files are CRLF** — a mutation whose anchors do not match reports "0 matches" and leaves the suite green, which is indistinguishable from an untested guard. `git diff` every mutation to prove it applied before believing any result. Restore from scratchpad copies, never `git checkout`.
- **Verification:** `npx vitest run --maxWorkers=2`, `npx tsc --noEmit`, eslint **by path** on changed files only, and `npm run build` last and alone.
- Multi-line commit messages: use the Bash tool with a heredoc. PowerShell here-string syntax corrupts the subject.

---

## File Structure

**Created**
- `db/migrations/021_contract_signing.sql` — the constraint widenings and the new table.
- `lib/portal/sign.ts` — the signature record: hashing, the single-CTE write, the signable-contract query. No PDF work, no email.
- `lib/portal/stamp.ts` — `pdf-lib` only: takes bytes and facts, returns stamped bytes or null.
- `lib/portal/send-signature-email.ts` — the two notifications.
- `app/(site)/project/SignContract.tsx` — the reveal, the form, and the notice.
- `tests/portal/sign.test.ts`, `tests/portal/sign-ui.test.tsx`, `tests/portal/stamp.test.ts`, `tests/portal/signature-email.test.ts`.

**Modified**
- `lib/admin/doc-types.ts` — add `contract`.
- `lib/admin/files.ts` — `setShared` and `deleteFile` refuse a signed contract or a signature output.
- `app/(site)/project/actions.ts` — `signContractAction` and `signContractFormAction`.
- `app/(site)/project/ProjectView.tsx` — render `SignContract` and `SignatureNotice`.
- `e2e/portal.spec.ts` — three specs and the release gate.

---

### Task 1: The migration and the Contract document type

**Files:**
- Create: `db/migrations/021_contract_signing.sql`
- Modify: `lib/admin/doc-types.ts:8-13`, `lib/admin/doc-types.ts:21-26`
- Test: `tests/admin/doc-types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DocType` gains `"contract"`; table `contract_signatures` with columns `id, lead_id, file_id, signed_name, signed_email, signed_at, ip, user_agent, doc_sha256, signed_file_id`; `job_events.kind` accepts `'signature'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/admin/doc-types.test.ts`:

```ts
it("offers Contract as a document type", () => {
  expect(DOC_TYPES.map((type) => type.value)).toContain("contract");
  expect(docTypeLabel("contract")).toBe("Contract");
  expect(isDocType("contract")).toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/admin/doc-types.test.ts --maxWorkers=2`
Expected: FAIL — `isDocType("contract")` is false and `docTypeLabel` has no such key.

- [ ] **Step 3: Add the type**

In `lib/admin/doc-types.ts`, add to `DOC_TYPES` after `invoice` and before `other`:

```ts
  { value: "contract", label: "Contract" },
```

and to `DOC_TYPE_LABELS`:

```ts
  contract: "Contract",
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/admin/doc-types.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Write the migration**

Create `db/migrations/021_contract_signing.sql`:

```sql
-- Customer signatures on a contract shared to their project page.
-- Every statement is safe to re-run: scripts/migrate.mjs applies every migration on every run.

-- 016_project_page.sql last defined this check. 'contract' is a document a customer can sign.
alter table job_files drop constraint if exists job_files_doc_type_check;

alter table job_files add constraint job_files_doc_type_check check (
  doc_type is null or doc_type in ('quote','po','invoice','other','contract')
);

-- 019_service_requests.sql last defined this check. Every migration that touches it lists
-- every kind, so run order can never narrow it. 'signature' is a customer signing a contract.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature')
);

-- One signature per contract file. doc_sha256 is the fingerprint of the exact bytes the
-- customer was served: it is what proves the document the owners hold is the one agreed to.
-- signed_file_id is the stamped copy, and stays null when stamping failed.
create table if not exists contract_signatures (
  id             uuid primary key,
  lead_id        uuid not null references leads(id) on delete cascade,
  file_id        uuid not null references job_files(id) unique,
  signed_name    text not null,
  signed_email   text not null,
  signed_at      timestamptz not null default now(),
  ip             text,
  user_agent     text,
  doc_sha256     text not null,
  signed_file_id uuid references job_files(id)
);

create index if not exists contract_signatures_lead_id_idx on contract_signatures (lead_id);
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` and `npx eslint lib/admin/doc-types.ts`
Expected: both clean. (The migration is applied against a Neon branch in Task 7, not locally.)

- [ ] **Step 7: Commit**

```bash
git add db/migrations/021_contract_signing.sql lib/admin/doc-types.ts tests/admin/doc-types.test.ts
git commit -F - <<'EOF'
feat: a document can be a contract, and a signature can be recorded

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

### Task 2: The signature record

**Files:**
- Create: `lib/portal/sign.ts`
- Test: `tests/portal/sign.test.ts`

**Interfaces:**
- Consumes: `DocType` including `"contract"` (Task 1); `listSharedDocuments(leadId)` and `readFile(file)` from `lib/admin/files.ts`; `db()` from `lib/db.ts`.
- Produces:
  - `export type SignResult = "signed" | "not-found" | "invalid";`
  - `export type Signature = { id: string; leadId: string; fileId: string; signedName: string; signedEmail: string; signedAt: Date; docSha256: string; signedFileId: string | null };`
  - `export async function listSignatures(leadId: string): Promise<Signature[]>`
  - `export async function signableContracts(leadId: string): Promise<JobFile[]>`
  - `export async function recordSignature(input: { jobId: string; file: JobFile; name: string; email: string; ip: string | null; userAgent: string | null }): Promise<SignResult>`

`signableContracts` is the single server-side helper both the page and the action use, so a control the page hides and a post the action refuses can never drift apart.

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/sign.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => query }));
vi.mock("@/lib/admin/files", () => ({
  listSharedDocuments: vi.fn(),
  readFile: vi.fn(),
}));

import { listSharedDocuments, readFile } from "@/lib/admin/files";
import { recordSignature, signableContracts } from "@/lib/portal/sign";

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const STAMPED = "33333333-3333-4333-8333-333333333333";

const doc = (id: string, name: string, docType: string) => ({
  id, leadId: JOB, createdAt: new Date(), uploadedBy: "owner@example.com",
  kind: "document" as const, name, contentType: "application/pdf",
  sizeBytes: 10, blobPathname: `jobs/${JOB}/${id}`, sharedAt: new Date(),
  docType: docType as never,
});

beforeEach(() => {
  query.mockReset();
  vi.mocked(listSharedDocuments).mockReset();
  vi.mocked(readFile).mockReset();
});

describe("signableContracts", () => {
  it("offers a shared contract that has not been signed", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([doc(FILE, "Contract.pdf", "contract")]);
    query.mockResolvedValue([]);
    expect((await signableContracts(JOB)).map((file) => file.id)).toEqual([FILE]);
  });

  it("never offers a quote", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([doc(FILE, "Quote.pdf", "quote")]);
    query.mockResolvedValue([]);
    expect(await signableContracts(JOB)).toEqual([]);
  });

  it("never offers a contract that is already signed", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([doc(FILE, "Contract.pdf", "contract")]);
    query.mockResolvedValue([{ file_id: FILE, signed_file_id: null }]);
    expect(await signableContracts(JOB)).toEqual([]);
  });

  // The signature output is itself a shared file with doc_type 'contract'. Without this it
  // would be offered for signing, and so would its own stamped copy, forever.
  it("never offers a signature output", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([
      doc(FILE, "Contract.pdf", "contract"),
      doc(STAMPED, "Contract (signed).pdf", "contract"),
    ]);
    query.mockResolvedValue([{ file_id: FILE, signed_file_id: STAMPED }]);
    expect(await signableContracts(JOB)).toEqual([]);
  });
});

describe("recordSignature", () => {
  const bytes = new TextEncoder().encode("pdf bytes");
  const file = doc(FILE, "Contract.pdf", "contract");

  it("writes the row with the SHA-256 of the bytes actually served", async () => {
    vi.mocked(readFile).mockResolvedValue({
      stream: new Response(bytes).body!, contentType: "application/pdf",
    });
    query.mockResolvedValue([{ id: "row" }]);

    const result = await recordSignature({
      jobId: JOB, file, name: "Jane Doe", email: "jane@example.com",
      ip: "203.0.113.4", userAgent: "test-agent",
    });

    expect(result).toBe("signed");
    // The known SHA-256 of "pdf bytes", so a change to the hashing is caught here.
    const sql = query.mock.calls[0][0].join("?");
    expect(sql).toContain("insert into contract_signatures");
    expect(sql).toContain("on conflict (file_id) do nothing");
    // The timeline body names the DOCUMENT, never the typed name: nothing a customer typed
    // reaches the owners' permanent record.
    expect(query.mock.calls[0]).toContainEqual(expect.stringContaining("Contract.pdf"));
    expect(query.mock.calls[0]).not.toContainEqual(expect.stringContaining("Jane Doe"));
  });

  it("refuses an empty name without touching the database", async () => {
    const result = await recordSignature({
      jobId: JOB, file, name: "   ", email: "jane@example.com", ip: null, userAgent: null,
    });
    expect(result).toBe("invalid");
    expect(query).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("answers a repeat submission with the same success and writes nothing twice", async () => {
    vi.mocked(readFile).mockResolvedValue({
      stream: new Response(bytes).body!, contentType: "application/pdf",
    });
    query.mockResolvedValue([]); // on conflict do nothing returned no row
    const result = await recordSignature({
      jobId: JOB, file, name: "Jane Doe", email: "jane@example.com", ip: null, userAgent: null,
    });
    expect(result).toBe("signed");
  });

  it("answers not-found when the bytes cannot be read", async () => {
    vi.mocked(readFile).mockResolvedValue(null);
    const result = await recordSignature({
      jobId: JOB, file, name: "Jane Doe", email: "jane@example.com", ip: null, userAgent: null,
    });
    expect(result).toBe("not-found");
    expect(query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/portal/sign.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/portal/sign`.

- [ ] **Step 3: Write the module**

Create `lib/portal/sign.ts`:

```ts
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { listSharedDocuments, readFile, type JobFile } from "@/lib/admin/files";
import { db } from "@/lib/db";

/** What signing can answer. Every refusal is a plain outcome, never an exception. */
export type SignResult = "signed" | "not-found" | "invalid";

export type Signature = {
  id: string;
  leadId: string;
  fileId: string;
  signedName: string;
  signedEmail: string;
  signedAt: Date;
  docSha256: string;
  signedFileId: string | null;
};

const toSignature = (row: Record<string, unknown>): Signature => ({
  id: row.id as string,
  leadId: row.lead_id as string,
  fileId: row.file_id as string,
  signedName: row.signed_name as string,
  signedEmail: row.signed_email as string,
  signedAt: row.signed_at as Date,
  docSha256: row.doc_sha256 as string,
  signedFileId: (row.signed_file_id as string | null) ?? null,
});

export async function listSignatures(leadId: string): Promise<Signature[]> {
  const rows = await db()`
    select * from contract_signatures where lead_id = ${leadId} order by signed_at`;
  return rows.map((row) => toSignature(row as Record<string, unknown>));
}

/**
 * The contracts this job can still be asked to sign.
 *
 * One helper, used by BOTH the page and the action, so the control the page hides and the post
 * the action refuses cannot drift apart. The page hiding a button is a convenience; the action
 * refusing is the guard.
 *
 * A signature output is excluded because it is itself a shared file with doc_type 'contract':
 * without this the page would offer to sign the signed copy, and then its copy, forever.
 */
export async function signableContracts(leadId: string): Promise<JobFile[]> {
  const documents = await listSharedDocuments(leadId);
  const rows = await db()`
    select file_id, signed_file_id from contract_signatures where lead_id = ${leadId}`;
  const spoken = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    spoken.add(row.file_id as string);
    if (row.signed_file_id) spoken.add(row.signed_file_id as string);
  }
  return documents.filter((file) => file.docType === "contract" && !spoken.has(file.id));
}

/**
 * Records one signature on one contract.
 *
 * Does NOT check ownership — it trusts the caller, exactly as approveQuote does. Every caller
 * must first re-derive the customer's own jobs from the session and refuse anything else.
 *
 * The fingerprint is taken from the bytes actually served, not from anything stored alongside
 * them: it is what proves the document the owners hold is the one that was agreed to.
 *
 * The timeline body names the DOCUMENT, never the typed name. `signed_name` is stored as data
 * and nothing a customer typed reaches the owners' permanent record.
 */
export async function recordSignature(input: {
  jobId: string;
  file: JobFile;
  name: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<SignResult> {
  const name = input.name.trim();
  if (!name) return "invalid";

  const stored = await readFile(input.file);
  if (!stored) return "not-found";
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // One statement, so the signature and its timeline row cannot come apart. `on conflict do
  // nothing` is what makes a second submission a no-op rather than a second signature.
  await db()`
    with signed as (
      insert into contract_signatures
        (id, lead_id, file_id, signed_name, signed_email, ip, user_agent, doc_sha256)
      values (${randomUUID()}, ${input.jobId}, ${input.file.id}, ${name}, ${input.email},
              ${input.ip}, ${input.userAgent}, ${sha256})
      on conflict (file_id) do nothing
      returning *
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.email}, 'signature',
             ${`Signed "${input.file.name}" from their project page`} from signed
    )
    select * from signed`;
  return "signed";
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/portal/sign.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Prove the guards**

Delete `&& !spoken.has(file.id)` from `signableContracts` — expect the "already signed" and "signature output" tests red, and nothing else. Restore. Then delete `if (!name) return "invalid";` — expect the empty-name test red. Restore. `git diff` each mutation before believing it; the files are CRLF.

- [ ] **Step 6: Commit**

```bash
git add lib/portal/sign.ts tests/portal/sign.test.ts
git commit -F - <<'EOF'
feat: a customer's signature is recorded against the exact document

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

### Task 3: The stamped PDF

**Files:**
- Create: `lib/portal/stamp.ts`
- Test: `tests/portal/stamp.test.ts`
- Modify: `package.json` (add `pdf-lib`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export async function stampSignature(original: Buffer, facts: StampFacts): Promise<Buffer | null>` where `export type StampFacts = { signedName: string; signedEmail: string; signedAt: Date; sha256: string; projectNo: string | null }`. Returns `null` when the PDF cannot be opened or written — never throws.

- [ ] **Step 1: Install the dependency**

Run: `npm install pdf-lib`
Expected: one new dependency, no native build step.

- [ ] **Step 2: Write the failing tests**

Create `tests/portal/stamp.test.ts`:

```ts
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { stampSignature } from "@/lib/portal/stamp";

const facts = {
  signedName: "Jane Doe",
  signedEmail: "jane@example.com",
  signedAt: new Date("2026-09-18T21:05:00Z"),
  sha256: "a".repeat(64),
  projectNo: "PSS-1012",
};

const onePage = async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return Buffer.from(await pdf.save());
};

describe("stampSignature", () => {
  it("appends a page rather than overlaying the owner's own layout", async () => {
    const original = await onePage();
    const stamped = await stampSignature(original, facts);
    expect(stamped).not.toBeNull();
    const reopened = await PDFDocument.load(stamped!);
    expect(reopened.getPageCount()).toBe(2);
  });

  it("returns null rather than throwing when the bytes are not a PDF", async () => {
    expect(await stampSignature(Buffer.from("not a pdf at all"), facts)).toBeNull();
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run tests/portal/stamp.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/portal/stamp`.

- [ ] **Step 4: Write the module**

Create `lib/portal/stamp.ts`:

```ts
import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatShortDate, formatTime } from "@/lib/admin/time";

export type StampFacts = {
  signedName: string;
  signedEmail: string;
  signedAt: Date;
  sha256: string;
  projectNo: string | null;
};

/**
 * Adds a signature page to the owner's contract.
 *
 * A NEW page, never an overlay: the owner's PDF is their legal wording and its layout is
 * theirs. Drawing over it risks covering a term.
 *
 * Returns null instead of throwing. Some PDFs cannot be opened — encrypted ones especially —
 * and the signature is already recorded by the time this runs. The stamped copy is a
 * convenience; the record is what carries the weight.
 */
export async function stampSignature(original: Buffer, facts: StampFacts): Promise<Buffer | null> {
  try {
    const pdf = await PDFDocument.load(original);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage();
    const { height } = page.getSize();
    const lines = [
      "ELECTRONIC SIGNATURE",
      "",
      `Signed by:  ${facts.signedName}`,
      `Account:    ${facts.signedEmail}`,
      `When:       ${formatShortDate(facts.signedAt)} at ${formatTime(facts.signedAt)}`,
      facts.projectNo ? `Project:    ${facts.projectNo}` : null,
      "",
      "Document fingerprint (SHA-256):",
      facts.sha256,
    ].filter((line): line is string => line !== null);

    lines.forEach((line, index) => {
      page.drawText(line, { x: 56, y: height - 80 - index * 18, size: 11, font });
    });
    return Buffer.from(await pdf.save());
  } catch (error) {
    console.error("Could not stamp the signed contract", error);
    return null;
  }
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run tests/portal/stamp.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Prove the guard**

Replace the `catch` body with `throw error` — expect the "not a PDF" test red, and only that one. Restore.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/portal/stamp.ts tests/portal/stamp.test.ts
git commit -F - <<'EOF'
feat: a signed contract carries its signature page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

### Task 4: Storing the stamped copy

**Files:**
- Modify: `lib/portal/sign.ts`
- Test: `tests/portal/sign.test.ts`

**Interfaces:**
- Consumes: `stampSignature` and `StampFacts` (Task 3); `recordSignature` (Task 2).
- Produces: `export async function storeSignedCopy(input: { jobId: string; original: JobFile; bytes: Buffer; actor: string }): Promise<string | null>` — returns the new `job_files.id`, or null when nothing could be stored. Also `export async function signatureFor(fileId: string): Promise<Signature | null>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/portal/sign.test.ts`:

```ts
describe("storeSignedCopy", () => {
  it("stores the stamped bytes as a shared contract and links it to the signature", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@vercel/blob", () => ({ put, del: vi.fn(), get: vi.fn() }));
    query.mockResolvedValue([{ id: STAMPED }]);

    const { storeSignedCopy } = await import("@/lib/portal/sign");
    const id = await storeSignedCopy({
      jobId: JOB, original: doc(FILE, "Contract.pdf", "contract"),
      bytes: Buffer.from("stamped"), actor: "jane@example.com",
    });

    expect(id).toBe(STAMPED);
    const sql = query.mock.calls.at(-1)![0].join("?");
    // Shared on creation and typed as a contract, so it reaches the customer through the
    // existing file route with no new download path.
    expect(sql).toContain("shared_at");
    expect(query.mock.calls.at(-1)!).toContainEqual("Contract (signed).pdf");
    // And the signature now points at it, which is what makes it un-signable.
    expect(sql).toContain("update contract_signatures");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/portal/sign.test.ts --maxWorkers=2`
Expected: FAIL — `storeSignedCopy` is not exported.

- [ ] **Step 3: Implement it**

Add to `lib/portal/sign.ts` (and add `put` to the `@vercel/blob` import):

```ts
/**
 * Stores the stamped PDF as a second job_files row, shared and typed as a contract, so it
 * reaches the customer through the file route that already exists.
 *
 * Deliberately not createFile(): that logs an "Uploaded …" event attributed to whoever passed
 * actor, and the customer did not upload anything. One statement here, no event — the signature
 * event written in recordSignature is the record of what happened.
 */
export async function storeSignedCopy(input: {
  jobId: string;
  original: JobFile;
  bytes: Buffer;
  actor: string;
}): Promise<string | null> {
  const id = randomUUID();
  const name = input.original.name.replace(/\.pdf$/i, "") + " (signed).pdf";
  const pathname = `jobs/${input.jobId}/${id}-signed.pdf`;
  await put(pathname, input.bytes, {
    access: "private",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });

  const rows = await db()`
    with created as (
      insert into job_files
        (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname,
         shared_at, doc_type)
      values (${id}, ${input.jobId}, ${input.actor}, 'document', ${name}, 'application/pdf',
              ${input.bytes.length}, ${pathname}, now(), 'contract')
      returning id
    ),
    linked as (
      update contract_signatures set signed_file_id = ${id}
      where file_id = ${input.original.id}
    )
    select id from created`;
  return (rows[0]?.id as string | undefined) ?? null;
}

export async function signatureFor(fileId: string): Promise<Signature | null> {
  const rows = await db()`select * from contract_signatures where file_id = ${fileId}`;
  return rows[0] ? toSignature(rows[0] as Record<string, unknown>) : null;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/portal/sign.test.ts --maxWorkers=2`
Expected: PASS, with every Task 2 test still passing.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/sign.ts tests/portal/sign.test.ts
git commit -F - <<'EOF'
feat: the stamped contract is stored where the customer can fetch it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

### Task 5: The two emails

**Files:**
- Create: `lib/portal/send-signature-email.ts`
- Test: `tests/portal/signature-email.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond types.
- Produces:
  - `export async function notifyOwnersOfSignature(job: SignedJob, documentName: string, signedBy: string, stamped: boolean): Promise<void>`
  - `export async function sendCustomerSignedCopy(to: string, job: SignedJob, documentName: string, pdf: Buffer | null): Promise<void>`
  - `type SignedJob = { id: string; name: string; projectNo?: number | null }`

Model both on `lib/portal/send-approval-email.ts`: plain text, throws when unconfigured, always called **after** the write so a failure cannot undo the signature.

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/signature-email.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));

import { notifyOwnersOfSignature, sendCustomerSignedCopy } from "@/lib/portal/send-signature-email";

const job = { id: "11111111-1111-4111-8111-111111111111", name: "Jane Doe", projectNo: 1012 };

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  process.env.RESEND_API_KEY = "test-key";
});

describe("notifyOwnersOfSignature", () => {
  it("says who signed and which document", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", true);
    const text = send.mock.calls[0][0].text as string;
    expect(text).toContain("jane@example.com");
    expect(text).toContain("Contract.pdf");
  });

  // The owners must not believe a stamped copy exists when it does not.
  it("says plainly when the stamped copy could not be produced", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", false);
    expect(send.mock.calls[0][0].text as string).toContain("could not be produced");
  });
});

describe("sendCustomerSignedCopy", () => {
  it("attaches the signed PDF", async () => {
    await sendCustomerSignedCopy("jane@example.com", job, "Contract.pdf", Buffer.from("pdf"));
    const attachments = send.mock.calls[0][0].attachments as { filename: string }[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("Contract (signed).pdf");
  });

  // No attachment is better than a broken one, and the page still has the record.
  it("sends without an attachment when there is no stamped copy", async () => {
    await sendCustomerSignedCopy("jane@example.com", job, "Contract.pdf", null);
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
    expect(send.mock.calls[0][0].text as string).toContain("your project page");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/portal/signature-email.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `lib/portal/send-signature-email.ts`, following `send-approval-email.ts` exactly for `from`, `replyTo`, the unconfigured throw, and Las Vegas times. The owners' text lists: who signed, the document, the time, the project number, a link to `${adminOrigin()}/admin/jobs/${job.id}`, and — when `stamped` is false — the sentence `The stamped copy could not be produced; the signature itself is recorded.` The customer's text thanks them, names the document, and either attaches `{ content: pdf, filename: "<name> (signed).pdf", contentType: "application/pdf" }` or points them at their project page.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/portal/signature-email.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/send-signature-email.ts tests/portal/signature-email.test.ts
git commit -F - <<'EOF'
feat: both sides are told the contract was signed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

### Task 6: The action, the form, and the notice

**Files:**
- Create: `app/(site)/project/SignContract.tsx`
- Modify: `app/(site)/project/actions.ts`, `app/(site)/project/ProjectView.tsx`
- Test: `tests/portal/sign-ui.test.tsx`, `tests/portal/sign.test.ts`

**Interfaces:**
- Consumes: `signableContracts`, `recordSignature`, `storeSignedCopy`, `signatureFor`, `listSignatures` (Tasks 2 and 4); `stampSignature` (Task 3); both email functions (Task 5).
- Produces: `signContractAction(jobId: string, fileId: string, name: string, agreed: boolean)` and `signContractFormAction(formData: FormData)`; components `SignContract({ jobId, file })` and `SignatureNotice({ signed, signature })`.

**Ordering, from spec §4:** ownership → re-derive the file from `signableContracts` → `recordSignature` → stamp and store → emails → revalidate → `redirect(\`/project/${jobId}?signed=1\`)`.

**New imports `actions.ts` must gain.** It currently imports none of these, so add them alongside the existing ones:

```ts
import { headers } from "next/headers";
import { listSharedDocuments, readFile } from "@/lib/admin/files"; // readFile is new on this line
import { formatProjectNo } from "@/lib/portal/project-no";
import { notifyOwnersOfSignature, sendCustomerSignedCopy } from "@/lib/portal/send-signature-email";
import { recordSignature, signableContracts, signatureFor, storeSignedCopy, type SignResult } from "@/lib/portal/sign";
import { stampSignature } from "@/lib/portal/stamp";
```

`headers()` is **async in this version of Next** — `await headers()`, exactly as `lib/portal/session.ts` does with `cookies()`. Nothing in this codebase imports `headers` today, only `cookies`, so read `node_modules/next/dist/docs/` before using it rather than writing the call from memory.

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/sign-ui.test.tsx` with these cases, and add the action cases to `tests/portal/sign.test.ts`:

```ts
// sign-ui.test.tsx
it("shows the form for a shared, unsigned contract", () => { /* renders SignContract, expects the name field and the agree checkbox */ });
it("says when it was signed, and offers no form", () => { /* renders SignatureNotice with a signature */ });
it("says nothing about a failure once the contract is signed", () => {
  // ?signed=no on a contract that IS signed must render nothing: the same re-derivation rule
  // as ApprovalNotice, which was fixed twice on the approve branch for exactly this.
});
```

```ts
// sign.test.ts — the action
it("refuses a job the customer does not own and writes nothing", async () => {
  // requireCustomer returns jobs that do not include the posted id
  expect(await signContractAction(THEIRS, FILE, "Jane Doe", true)).toBe("not-found");
  expect(recordSignature).not.toHaveBeenCalled();
  expect(signableContracts).not.toHaveBeenCalled();
});
it("answers a job that does not exist the same way", async () => {
  expect(await signContractAction(MISSING, FILE, "Jane Doe", true)).toBe("not-found");
  expect(await signContractAction(THEIRS, FILE, "Jane Doe", true)).toBe("not-found");
});
it("refuses a file that is not a signable contract on this job", async () => {
  // signableContracts returns [] — a quote's id, another job's file, or a signature output
  expect(await signContractAction(MINE, FILE, "Jane Doe", true)).toBe("not-found");
  expect(recordSignature).not.toHaveBeenCalled();
});
it("refuses when the box is not ticked", async () => {
  expect(await signContractAction(MINE, FILE, "Jane Doe", false)).toBe("invalid");
  expect(recordSignature).not.toHaveBeenCalled();
});
it("records the session's email, never one from the form", async () => { /* … */ });
it("still succeeds when stamping fails, and tells the owners so", async () => {
  // stampSignature returns null: storeSignedCopy is never called, both emails still send,
  // and the result is "signed".
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/portal/sign.test.ts tests/portal/sign-ui.test.tsx --maxWorkers=2`
Expected: FAIL on the unresolved imports.

- [ ] **Step 3: Write the action**

In `app/(site)/project/actions.ts`, following `approveQuoteAction` line for line on ownership and ordering:

```ts
export async function signContractAction(
  jobId: string,
  fileId: string,
  name: string,
  agreed: boolean,
): Promise<SignResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  if (!agreed) return "invalid";

  // The file is re-derived from this job's signable contracts. A fileId naming a quote, another
  // job's file, or a signature output is refused exactly as a missing one is.
  const contracts = await signableContracts(job.id);
  const file = contracts.find((candidate) => candidate.id === fileId);
  if (!file) return "not-found";

  const headerList = await headers();
  const result = await recordSignature({
    jobId: job.id,
    file,
    name,
    // The session's address, never the form's: this is the identity the app actually verified.
    email,
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
  });
  if (result !== "signed") return result;

  // The signature is already recorded. Everything below is a convenience, and a failure in any
  // of it must not cost the customer their signature.
  const signature = await signatureFor(file.id);
  const stored = await readFile(file);
  let pdf: Buffer | null = null;
  if (signature && stored) {
    const original = Buffer.from(await new Response(stored.stream).arrayBuffer());
    pdf = await stampSignature(original, {
      signedName: signature.signedName,
      signedEmail: signature.signedEmail,
      signedAt: signature.signedAt,
      sha256: signature.docSha256,
      projectNo: formatProjectNo(job.projectNo),
    });
    if (pdf) await storeSignedCopy({ jobId: job.id, original: file, bytes: pdf, actor: email });
  }

  after(() => {
    void notifyOwnersOfSignature(job, file.name, email, pdf !== null).catch(console.error);
    void sendCustomerSignedCopy(email, job, file.name, pdf).catch(console.error);
  });

  revalidatePath("/project");
  revalidatePath(`/project/${job.id}`);
  return "signed";
}

export async function signContractFormAction(formData: FormData): Promise<void> {
  const jobId = text(formData.get("jobId"));
  const result = await signContractAction(
    jobId,
    text(formData.get("fileId")),
    text(formData.get("signedName")),
    formData.get("agreed") === "on",
  );
  // Outside any try/catch: redirect() works by throwing.
  redirect(`/project/${encodeURIComponent(jobId)}?signed=${result === "signed" ? "1" : "no"}`);
}
```

- [ ] **Step 4: Write the component**

Create `app/(site)/project/SignContract.tsx` modelled on `ApproveQuote.tsx`: a `<details>` reveal, a plain `<form action={signContractFormAction}>`, hidden `jobId` and `fileId`, a required `signedName` text input labelled **Your full name**, a required checkbox named `agreed` labelled **I agree to sign this contract electronically**, and a submit button **Sign this contract**.

`SignatureNotice` follows `ApprovalNotice` exactly: `if (!signed) return null;` then `const confirmed = signed === "1" && signature !== null;` then `if (signed === "1" && !confirmed) return null;` and `if (!confirmed && signature !== null) return null;` — so a stale `?signed=no` on an already-signed contract says nothing.

- [ ] **Step 5: Wire the page**

In `ProjectView.tsx`, load `signableContracts(job.id)` and `listSignatures(job.id)`, render one `SignContract` per signable contract, and `SignatureNotice` with the `?signed=` param and the signature for that job.

- [ ] **Step 6: Run everything and watch it pass**

Run: `npx vitest run --maxWorkers=2`, then `npx tsc --noEmit`, then eslint on the changed paths.

- [ ] **Step 7: Prove the guards, both directions**

Weaken `jobs.find(...)` to `?? jobs[0]` — expect the ownership tests red. Delete `if (!agreed) return "invalid";` — expect the checkbox test red. Delete `signed === "1" && signature !== null` from the notice — expect the forgery test red. Then WIDEN the notice guard to `if (!confirmed) return null` and expect red too, proving it does not over-suppress. `git diff` each; restore from scratchpad copies.

- [ ] **Step 8: Commit**

```bash
git add app/\(site\)/project/SignContract.tsx app/\(site\)/project/actions.ts app/\(site\)/project/ProjectView.tsx tests/portal/sign.test.ts tests/portal/sign-ui.test.tsx
git commit -F - <<'EOF'
feat: a customer can sign their contract from their project page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

### Task 7: A signed contract is frozen

**Files:**
- Modify: `lib/admin/files.ts` (`setShared`, `deleteFile`)
- Test: `tests/admin/file-sharing.test.ts`

**Interfaces:**
- Consumes: table `contract_signatures` (Task 1).
- Produces: `setShared` and `deleteFile` return `false` for a signed contract or a signature output.

- [ ] **Step 1: Write the failing tests**

```ts
it("refuses to unshare a signed contract", async () => {
  // the statement must carry the not-exists clause
  const sql = query.mock.calls[0][0].join("?");
  expect(sql).toContain("contract_signatures");
});
it("refuses to delete a signed contract or its stamped copy", async () => { /* … */ });
```

- [ ] **Step 2: Run and watch fail**

Run: `npx vitest run tests/admin/file-sharing.test.ts --maxWorkers=2`

- [ ] **Step 3: Add the clause**

To both statements' `where`, alongside the existing `lead_id` guard:

```sql
and not exists (
  select 1 from contract_signatures s
  where s.file_id = job_files.id or s.signed_file_id = job_files.id
)
```

A record that can be quietly unshared or deleted is worth little in a dispute, so this is a database-level refusal rather than a check in a caller.

- [ ] **Step 4: Run and watch pass**, then commit.

```bash
git add lib/admin/files.ts tests/admin/file-sharing.test.ts
git commit -F - <<'EOF'
fix: a signed contract cannot be unshared or deleted

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

### Task 8: End-to-end

**Files:**
- Modify: `e2e/portal.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: four specs.

**Write, do NOT run against a database** — cutting a Neon branch is the owner's call and is handled separately.

- [ ] **Step 1: Write the specs**

1. **A customer signs**: a contract is shared, the form appears, they type a name, tick the box, submit. Assert `contract_signatures` has one row with their own email, a 64-character `doc_sha256`, and a non-null `signed_file_id`; the job's timeline names the document; the stamped copy is downloadable; the form is gone.
2. **A signature output is never signable**: with both files shared, exactly one sign form renders, and a post naming the stamped copy's id is refused.
3. **A signed contract is frozen**: unsharing and deleting it both fail, and it is still shared afterwards.
4. **The release gate — a customer signing cannot reach another customer's contract.** Give the bystander a shared contract of its own, so a weakened id match is not stopped by a different guard and the gate cannot go green for the wrong reason. Assert on database effect: no row for the bystander's file, and a positive control at the end proving signing still works.

**Selector rule, learned on the approve branch:** scope every forged `input[name="jobId"]` / `input[name="fileId"]` to its own form — this page carries several hidden `jobId` fields and a bare selector takes the first one, which silently aimed a cross-job gate at the wrong form for five runs. Use `page.locator("form", { has: page.getByLabel("Your full name") }).locator('input[name="fileId"]')`.

- [ ] **Step 2: Verify without a database**

Run: `npx tsc --noEmit`, `npx eslint e2e/portal.spec.ts`, `npx playwright test --list` (expect all four collected under `[desktop]`), the full vitest suite, and `npm run build` last and alone.

- [ ] **Step 3: Report the falsification recipe**

Name the exact line to weaken (`app/(site)/project/actions.ts`, `signContractAction`'s `jobs.find`) and the spec that must go red, so the controller can falsify it before trusting any green.

- [ ] **Step 4: Commit**

```bash
git add e2e/portal.spec.ts
git commit -F - <<'EOF'
test: e2e for signing a contract

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
EOF
```

---

## Release conditions

- The e2e suite runs against a Neon test branch, with the release gate **falsified first** — weakened, watched fail **on its own assertion**, restored. A spec that dies on a selector or a fixture proves nothing.
- `021_contract_signing.sql` is applied to that branch and the signature write is exercised against real Postgres. Until then the CTE, the `on conflict` clause and the `not exists` freeze are pinned by argument assertions only.
- The owner confirms their contract PDF carries whatever cancellation notice their paperwork requires. The app never generates legal text.
