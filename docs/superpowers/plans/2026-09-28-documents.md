# Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner writes contract terms, client documents (service agreements, change orders) and two portal guides as templates in the admin; creates a filled document from any job and sends it; the client signs, acknowledges or views it on their project page; generated contracts print the terms template; the Quote tab shows the 3-business-day cancellation window.

**Architecture:** One strict "doc text" format (a Markdown subset) parsed by `lib/docs/parse.ts` into typed blocks (`lib/docs/types.ts`), rendered by exactly two renderers: pdf-lib (`lib/docs/pdf.ts`, reusing the contract generator's wrapping and `winAnsiSafe`) and React (`components/docs/DocText.tsx`, text nodes only). Templates and job documents live in two new tables (migration 026) behind small stores whose every write is one data-modifying statement. Sign documents are rendered with doc_type `contract`, so they flow through the existing signing path unchanged; acknowledge documents get their own record table that mirrors `contract_signatures`.

**Tech Stack:** Next.js 16.3.3 (App Router, Server Actions, route handlers), React 19.2, TypeScript, Neon Postgres via `@neondatabase/serverless` tagged templates, `@vercel/blob` (private), pdf-lib 1.17, Resend, Vitest 4 + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-documents-design.md` (binding). Starter terms source: `docs/superpowers/specs/assets/starter-terms-draft.md` (current working-tree version: the trip charge and service visit price are filled at $175).

## Global Constraints

- Next.js is 16.3.3: before writing a Server Action or route handler read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` and `15-route-handlers.md`; a route handler's `params` is a `Promise`; Server Actions are reachable by direct POST, so each one authenticates itself.
- Every admin Server Action and route handler calls `await requireAdmin()` (from `@/lib/admin/session`) before reading any input. Every portal action calls `await requireCustomer()` first and re-derives the job from `jobs`.
- `db/migrations/026_documents.sql`: idempotent (`create ... if not exists`, `drop constraint if exists` before `add constraint`), whole-line `--` comments only, no `;` inside any comment or string literal (`scripts/migrate.mjs` re-runs every file and splits on `;`).
- `job_events_kind_check` is redefined with the IDENTICAL full list in every migration that defines it: 003, 004, 011, 019, 021, 024 and 026. The list becomes `('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document')`.
- One data-modifying statement (a CTE) per logical write. Never `sql.transaction()`. Precedents: `createFile` in `lib/admin/files.ts`, the freeze in `lib/dc/send.ts`.
- Money is integer cents in the database; it becomes text only through `formatCents`.
- Template and document text is untrusted input. The React renderer emits only text nodes and fixed elements (never `dangerouslySetInnerHTML`). Every string the PDF renderer draws passes through `winAnsiSafe`.
- Doc text is exactly spec §2: `## `, `### `, blank line, `- ` (one level), `**bold**`, `{{field}}`. Anything else is literal.
- Fields are exactly the 15 keys of spec §3. Terms may use only `client_name`, `project_no`, `today`, `company_name`, `company_phone`, `company_email`. Guides may use none.
- Send is blocked while any `{{…}}` remains, while the job has no client email, and while the job is Lost.
- Sign documents are stored with `doc_type = 'contract'`; acknowledge and view documents with `doc_type = 'other'`.
- Business days are every day except Sundays and the 11 US federal holidays of spec §9; the window ends at midnight after the 3rd business day after the Las Vegas signing date.
- No phone number literal anywhere under `app/`, `components/` or `lib/` (`tests/business.test.ts` fails on one): use `business.phone.display` or the `{{company_phone}}` field.
- Nothing the client sees shows a cost figure unless the owner typed it.
- Focused test runs: `npx vitest run --maxWorkers=2 <paths>`. Never the whole suite without `--maxWorkers=2`.
- Every worktree: `git rev-parse --show-toplevel` must print that worktree before any edit; run `npm ci` once (worktrees have no `node_modules`); copy `.env.test.local` from `C:\Users\whirl\pss\.claude\worktrees\documents\` when a task needs the Neon test branch, and never print its values. Never touch `C:\Users\whirl\pss` (the main checkout).
- Every commit message ends with exactly:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj
```

## Review Focus

1. **A job value that looks like doc-text syntax** (a client name containing `**`, `{{`, `}}`, or an address typed as `## 12 Palm Way`): it must fill in as plain text, never becoming bold, a heading, a bullet or a new marker. Pinned in Task 3 ("a value can never become syntax").
2. **The owner saves a draft edit in another tab while Send is building the PDF**: the send must be refused, never a PDF that differs from the stored body. Pinned in Task 6 (`markSent` compares the rendered title and body in its WHERE) and Task 13 (the race answer and the orphan file removed).
3. **Void racing an acknowledgement, and the Files tab re-sharing a voided document**: an acknowledged or signed file can never be voided, unshared, relabelled or deleted, and a voided document's file can never be shared again from the Files tab. Pinned in Task 6 (`voidDocument` clauses) and Task 8 (`setShared` refuses any file a job document names, in both directions).
4. **Signing late in the evening, on a Saturday, or before a Monday holiday**: the window counts from the Las Vegas calendar date and skips Sundays and observed holidays. Pinned in Task 4.
5. **A legacy uploaded terms PDF and a new terms template both exist**: the template wins, and Settings says which one contracts use. Pinned in Task 14 ("prefers the template") and Task 18.

## Parallel Waves

Each wave starts only after the previous wave's tasks are merged into `feat/documents`. Tasks in one wave touch disjoint files and can be built at the same time in separate worktrees cut from `feat/documents`. **Task 1 is the only exception to parallelism: it is a five-minute commit made on `feat/documents` itself before Wave 1 fans out, because every Wave 1 task imports its types and constants.**

| Wave | Tasks | Theme |
|---|---|---|
| 1a (before fan-out) | 1 | shared vocabulary: block types, field list, kinds |
| 1 | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | pure modules, migration, stores, renderers, emails |
| 2 | 13, 14, 15, 16, 17, 18 | send workflow, contracts, editor, portal, Quote tab, Settings |
| 3 | 19, 20, 21 | Documents page, job Documents tab, real-DB verification |
| 4 | 22 | end-to-end tests and the release gate |

File ownership (a file appears under exactly one task per wave):

- **Task 1:** `lib/docs/types.ts`, `lib/docs/fields.ts`, `lib/docs/kinds.ts`, `tests/docs/kinds.test.ts`
- **Task 2:** `lib/docs/parse.ts`, `lib/docs/validate.ts`, `tests/docs/parse.test.ts`, `tests/docs/validate.test.ts`
- **Task 3:** `lib/docs/fill.ts`, `tests/docs/fill.test.ts`
- **Task 4:** `lib/docs/business-days.ts`, `tests/docs/business-days.test.ts`
- **Task 5:** `db/migrations/026_documents.sql`, `db/migrations/003_measure_and_files.sql`, `db/migrations/004_referrals_reviews.sql`, `db/migrations/011_stages_contact_log.sql`, `db/migrations/019_service_requests.sql`, `db/migrations/021_contract_signing.sql`, `db/migrations/024_dc_quote_import.sql`, `lib/admin/jobs.ts`, `tests/db/migration-026.test.ts`, `tests/db/migration-011.test.ts`
- **Task 6:** `lib/docs/templates.ts`, `lib/docs/job-documents.ts`, `tests/docs/templates.test.ts`, `tests/docs/job-documents.test.ts`
- **Task 7:** `lib/portal/acknowledge-document.ts`, `lib/portal/sign.ts`, `tests/portal/acknowledge-document.test.ts`, `tests/portal/sign.test.ts`
- **Task 8:** `lib/admin/files.ts`, `app/admin/jobs/[id]/JobFiles.tsx`, `tests/admin/files-job-documents.test.ts`, `tests/admin/job-files-share.test.tsx`
- **Task 9:** `lib/pdf/text.ts`, `lib/dc/contract-pdf.ts` (import swap only), `lib/docs/pdf.ts`, `tests/pdf/text.test.ts`, `tests/docs/pdf.test.ts`
- **Task 10:** `components/docs/DocText.tsx`, `tests/docs/doc-text.test.tsx`
- **Task 11:** `lib/docs/starter-terms.ts`, `tests/docs/starter-terms.test.ts`
- **Task 12:** `lib/docs/emails.ts`, `tests/docs/emails.test.ts`
- **Task 13:** `lib/docs/workflow.ts`, `tests/docs/workflow.test.ts`
- **Task 14:** `lib/dc/contract-pdf.ts`, `lib/dc/send.ts`, `lib/dc/pricing.ts`, `tests/dc/contract.test.ts`, `tests/dc/send.test.ts`, `tests/dc/pricing.test.ts`
- **Task 15:** `lib/docs/edit.ts`, `app/admin/documents/DocEditor.tsx`, `app/admin/documents/preview/route.ts`, `tests/docs/edit.test.ts`, `tests/docs/doc-editor.test.tsx`, `tests/docs/preview-route.test.ts`
- **Task 16:** `lib/portal/guides.ts`, `app/(site)/project/actions.ts`, `app/(site)/project/AcknowledgeDocument.tsx`, `app/(site)/project/ProjectView.tsx`, `app/(site)/project/page.tsx`, `app/(site)/project/[jobId]/page.tsx`, `tests/portal/guides.test.ts`, `tests/portal/acknowledge-document-action.test.ts`, `tests/portal/acknowledge-document-ui.test.tsx`, `tests/portal/project-view.test.tsx`
- **Task 17:** `app/admin/jobs/[id]/QuoteReview.tsx`, `app/admin/jobs/[id]/QuoteTab.tsx`, `tests/dc/quote-review.test.tsx`
- **Task 18:** `app/admin/settings/TermsSection.tsx`, `app/admin/settings/page.tsx`, delete `app/admin/settings/terms/route.ts`, delete `lib/dc/terms.ts`, delete `tests/dc/terms-route.test.ts`, `tests/dc/terms-section.test.tsx`, `tests/admin/settings-page.test.tsx`
- **Task 19:** `app/admin/documents/page.tsx`, `app/admin/documents/actions.ts`, `app/admin/documents/TemplateForm.tsx`, `app/admin/documents/new/page.tsx`, `app/admin/documents/[id]/page.tsx`, `app/admin/AdminNav.tsx`, `tests/admin/admin-nav.test.tsx`, `tests/docs/template-actions.test.ts`, `tests/docs/documents-page.test.tsx`
- **Task 20:** `app/admin/jobs/[id]/tabs.ts`, `app/admin/jobs/[id]/page.tsx`, `app/admin/jobs/[id]/DocumentsTab.tsx`, `app/admin/jobs/[id]/CreateDocumentForm.tsx`, `app/admin/jobs/[id]/DocumentPanel.tsx`, `app/admin/jobs/[id]/VoidDocumentButton.tsx`, `app/admin/jobs/[id]/document-actions.ts`, `tests/admin/job-tabs.test.tsx`, `tests/docs/document-actions.test.ts`, `tests/docs/documents-tab.test.tsx`
- **Task 21:** `scripts/verify-documents.ts`, `scripts/verify-documents.config.mts`
- **Task 22:** `e2e/documents.spec.ts`, `e2e/fixtures/pdf-text.ts`, `e2e/dc-quote.spec.ts`, `e2e/portal.spec.ts`, `playwright.config.ts`

Dependencies (all on earlier waves): 2→1; 3→1; 5→1; 6→1; 7→5 at run time only; 9→1; 10→1; 11→1; 13→1,2,3,6,9,12; 14→2,3,6,9; 15→1,2,9,10; 16→1,2,6,7,10,12; 17→4; 18→6; 19→1,2,6,11,15; 20→1,6,13,15; 21→5,6,7,8,13; 22→all.

**Migration coordination:** number 026 is claimed for this feature. Apply it only to the Neon test branch (Task 5). Other sessions running an older checkout's migrations against the same test branch after 026 has written a `document` event will fail on the narrower kind list: tell the controller before running it, per the "coordinate with parallel sessions" rule.

---

## File Structure

**Shared vocabulary (client-safe, no server imports)**
- `lib/docs/types.ts` — `Inline`, `Block`: the parsed form both renderers consume.
- `lib/docs/fields.ts` — the 15 fields with labels, `TERMS_FIELDS`, the one marker regex source shared by the app and SQL.
- `lib/docs/kinds.ts` — template kinds, groups, responses, statuses, `allowedFields(kind)`.

**Pure logic**
- `lib/docs/parse.ts` — doc text → `Block[]`; marker and field finders.
- `lib/docs/validate.ts` — `templateErrors()` for save.
- `lib/docs/fill.ts` — field values from a job, `fillFields()`.
- `lib/docs/business-days.ts` — federal holidays and the cancellation window.
- `lib/docs/edit.ts` — the editor toolbar's text transforms.
- `lib/portal/guides.ts` — which guides a job's stage shows.

**Rendering**
- `lib/pdf/text.ts` — `LETTER`, `MARGIN`, `breakWord`, `wrap` (moved out of `lib/dc/contract-pdf.ts`), `wrapRuns` for mixed bold text.
- `lib/docs/pdf.ts` — `renderBlocks()` onto any pdf-lib document, `buildDocumentPdf()` for a job document.
- `components/docs/DocText.tsx` — React renderer.

**Data**
- `db/migrations/026_documents.sql` — three tables, the singleton index, the kind check.
- `lib/docs/templates.ts` — template store.
- `lib/docs/job-documents.ts` — job document store: draft, send, void, discard.
- `lib/portal/acknowledge-document.ts` — acknowledgeable list, acknowledgement record.
- `lib/docs/workflow.ts` — create a document from a template; send one.
- `lib/docs/emails.ts` — client "ready" email, owners' acknowledgement email.
- `lib/docs/starter-terms.ts` — the starter terms body.

**Admin UI**
- `app/admin/documents/*` — templates list, new/edit forms, `DocEditor`, PDF preview route, actions.
- `app/admin/jobs/[id]/DocumentsTab.tsx` (+ `CreateDocumentForm`, `DocumentPanel`, `VoidDocumentButton`, `document-actions.ts`) — the job's Documents tab.

**Portal UI**
- `app/(site)/project/AcknowledgeDocument.tsx` and changes to `ProjectView.tsx`, `actions.ts`, both project pages.

**Changed**
- `lib/dc/contract-pdf.ts`, `lib/dc/send.ts`, `lib/dc/pricing.ts` — terms from the template.
- `lib/portal/sign.ts` — signing a sign document completes it.
- `lib/admin/files.ts`, `JobFiles.tsx` — files a document names are managed from the Documents tab.
- `QuoteReview.tsx`, `QuoteTab.tsx` — cancellation window banner.
- `app/admin/settings/TermsSection.tsx`, `page.tsx` — the upload becomes a line linking to Documents.
- `app/admin/AdminNav.tsx` — Documents menu item.

---
## Wave 1a

### Task 1: Shared vocabulary (types, fields, kinds)

Committed directly on `feat/documents` before Wave 1 fans out.

**Files:**
- Create: `lib/docs/types.ts`
- Create: `lib/docs/fields.ts`
- Create: `lib/docs/kinds.ts`
- Test: `tests/docs/kinds.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact, every later task relies on these names):
  - `lib/docs/types.ts`: `type Inline = { type: "text"; text: string; bold: boolean } | { type: "field"; key: string; bold: boolean }`; `type Block = { type: "heading"; level: 2 | 3; inlines: Inline[] } | { type: "paragraph"; inlines: Inline[] } | { type: "bullets"; items: Inline[][] }`.
  - `lib/docs/fields.ts`: `FIELDS` (readonly `{ key, label }[]`), `type FieldKey`, `FIELD_KEYS: readonly FieldKey[]`, `isFieldKey(v: unknown): v is FieldKey`, `fieldLabel(key: FieldKey): string`, `TERMS_FIELDS: readonly FieldKey[]`, `MARKER_SOURCE: string` (= `"\\{\\{([^{}]*)\\}\\}"`, capture 1 is the untrimmed key), `markerPattern(): RegExp` (fresh global regex).
  - `lib/docs/kinds.ts`: `TEMPLATE_KINDS`, `type TemplateKind`, `type ClientDocKind = "service_agreement" | "change_order" | "other"`, `type SingletonKind = "terms" | "guide_install" | "guide_care"`, `CLIENT_DOC_KINDS`, `SINGLETON_KINDS`, `isTemplateKind`, `isClientDocKind`, `isSingletonKind`, `templateKindLabel(kind: TemplateKind): string`, `TEMPLATE_GROUPS`, `type TemplateGroup = "terms" | "client" | "guide"`, `templateGroup(kind: TemplateKind): TemplateGroup`, `DOC_RESPONSES`, `type DocResponse = "sign" | "acknowledge" | "view"`, `isDocResponse`, `docResponseLabel(r: DocResponse): string`, `type DocStatus = "draft" | "sent" | "completed" | "void"`, `allowedFields(kind: TemplateKind): readonly FieldKey[]`.

- [ ] **Step 1: Write the failing test**

`tests/docs/kinds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FIELDS, FIELD_KEYS, TERMS_FIELDS, fieldLabel, isFieldKey, markerPattern } from "@/lib/docs/fields";
import {
  CLIENT_DOC_KINDS, SINGLETON_KINDS, TEMPLATE_KINDS, allowedFields, docResponseLabel, isClientDocKind, isDocResponse,
  isSingletonKind, isTemplateKind, templateGroup, templateKindLabel,
} from "@/lib/docs/kinds";

describe("fields", () => {
  it("lists exactly the fifteen keys of spec §3, in order, each with a label", () => {
    expect(FIELD_KEYS).toEqual([
      "client_name", "client_first_name", "client_email", "client_phone", "address", "city", "project_no", "today",
      "contract_total", "deposit", "balance_due", "install_date", "company_name", "company_phone", "company_email",
    ]);
    for (const field of FIELDS) expect(field.label.trim()).not.toBe("");
    expect(fieldLabel("project_no")).toBe("Project number (PSS-####)");
  });
  it("lets terms use only what exists when a contract is generated", () => {
    expect(TERMS_FIELDS).toEqual(["client_name", "project_no", "today", "company_name", "company_phone", "company_email"]);
  });
  it("recognises its own keys and nothing else", () => {
    expect(isFieldKey("deposit")).toBe(true);
    expect(isFieldKey("Deposit")).toBe(false);
    expect(isFieldKey(7)).toBe(false);
  });
  it("finds every marker, including ones that are not fields", () => {
    const keys = [..."a {{client_name}} b {{ nope }} {{x y}} {{}}".matchAll(markerPattern())].map((m) => m[1]);
    expect(keys).toEqual(["client_name", " nope ", "x y", ""]);
  });
});

describe("kinds", () => {
  it("has the six template kinds of spec §4 in order", () => {
    expect(TEMPLATE_KINDS.map((k) => k.value)).toEqual(["terms", "service_agreement", "change_order", "other", "guide_install", "guide_care"]);
    expect(CLIENT_DOC_KINDS).toEqual(["service_agreement", "change_order", "other"]);
    expect(SINGLETON_KINDS).toEqual(["terms", "guide_install", "guide_care"]);
  });
  it("groups kinds as Contract terms, Client documents and Portal guides", () => {
    expect(templateGroup("terms")).toBe("terms");
    expect(templateGroup("change_order")).toBe("client");
    expect(templateGroup("guide_care")).toBe("guide");
    expect(templateKindLabel("guide_install")).toBe("Getting ready for your install");
  });
  it("allows the terms fields in terms, none in guides, all in client documents", () => {
    expect(allowedFields("terms")).toEqual(TERMS_FIELDS);
    expect(allowedFields("guide_install")).toEqual([]);
    expect(allowedFields("guide_care")).toEqual([]);
    expect(allowedFields("service_agreement")).toEqual(FIELD_KEYS);
  });
  it("guards its values", () => {
    expect(isTemplateKind("terms")).toBe(true);
    expect(isTemplateKind("contract")).toBe(false);
    expect(isClientDocKind("terms")).toBe(false);
    expect(isSingletonKind("guide_care")).toBe(true);
    expect(isDocResponse("acknowledge")).toBe(true);
    expect(isDocResponse("approve")).toBe(false);
    expect(docResponseLabel("sign")).toBe("Sign");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/kinds.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/docs/fields"".

- [ ] **Step 3: Write the three modules**

`lib/docs/types.ts`:

```ts
/**
 * The parsed form of "doc text" (spec §2). The parser produces it; the PDF and React renderers
 * consume it and nothing else. Types only: safe to import anywhere, including client components.
 */
export type Inline =
  | { type: "text"; text: string; bold: boolean }
  /** A `{{key}}` marker. `key` is trimmed; it may not be a real field (the validator reports those). */
  | { type: "field"; key: string; bold: boolean };

export type Block =
  | { type: "heading"; level: 2 | 3; inlines: Inline[] }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "bullets"; items: Inline[][] };
```

`lib/docs/fields.ts`:

```ts
/**
 * The fill-in fields of spec §3, in the order the editor offers them. No imports: this runs in the
 * browser (the editor) as well as on the server. Unknown keys are rejected everywhere.
 */
export const FIELDS = [
  { key: "client_name", label: "Client name" },
  { key: "client_first_name", label: "Client first name" },
  { key: "client_email", label: "Client email" },
  { key: "client_phone", label: "Client phone" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "project_no", label: "Project number (PSS-####)" },
  { key: "today", label: "Today's date" },
  { key: "contract_total", label: "Contract total" },
  { key: "deposit", label: "Deposit" },
  { key: "balance_due", label: "Balance due" },
  { key: "install_date", label: "Install date" },
  { key: "company_name", label: "Company name" },
  { key: "company_phone", label: "Company phone" },
  { key: "company_email", label: "Company email" },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];

export const FIELD_KEYS: readonly FieldKey[] = FIELDS.map((field) => field.key);

export const isFieldKey = (value: unknown): value is FieldKey =>
  typeof value === "string" && (FIELD_KEYS as readonly string[]).includes(value);

export const fieldLabel = (key: FieldKey): string => FIELDS.find((field) => field.key === key)!.label;

/** Terms are printed inside every contract, so they may use only what exists at contract time. */
export const TERMS_FIELDS: readonly FieldKey[] = [
  "client_name", "project_no", "today", "company_name", "company_phone", "company_email",
];

/**
 * One marker: `{{`, anything but braces, `}}`. Capture 1 is the key, untrimmed. The same source is
 * bound into SQL (`body !~ $n`) by lib/docs/job-documents.ts, so the app and the database agree on
 * what "a marker remains" means. Postgres's regex dialect reads it identically.
 */
export const MARKER_SOURCE = "\\{\\{([^{}]*)\\}\\}";

/** A fresh global regex each call: a shared `g` regex carries lastIndex between uses. */
export const markerPattern = (): RegExp => new RegExp(MARKER_SOURCE, "g");
```

`lib/docs/kinds.ts`:

```ts
import { FIELD_KEYS, TERMS_FIELDS, type FieldKey } from "./fields";

/**
 * Template kinds, in the order the New template menu shows them. These values match the
 * document_templates.kind check in db/migrations/026_documents.sql; change both together.
 */
export const TEMPLATE_KINDS = [
  { value: "terms", label: "Contract terms", group: "terms" },
  { value: "service_agreement", label: "Service agreement", group: "client" },
  { value: "change_order", label: "Change order", group: "client" },
  { value: "other", label: "Other document", group: "client" },
  { value: "guide_install", label: "Getting ready for your install", group: "guide" },
  { value: "guide_care", label: "Caring for your shades", group: "guide" },
] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number]["value"];
export type ClientDocKind = "service_agreement" | "change_order" | "other";
export type SingletonKind = "terms" | "guide_install" | "guide_care";
export type TemplateGroup = "terms" | "client" | "guide";

export const CLIENT_DOC_KINDS: readonly ClientDocKind[] = ["service_agreement", "change_order", "other"];
/** At most one live template of each (the unique partial index in migration 026). Always response 'view'. */
export const SINGLETON_KINDS: readonly SingletonKind[] = ["terms", "guide_install", "guide_care"];

export const TEMPLATE_GROUPS: readonly { value: TemplateGroup; label: string }[] = [
  { value: "terms", label: "Contract terms" },
  { value: "client", label: "Client documents" },
  { value: "guide", label: "Portal guides" },
];

export const isTemplateKind = (value: unknown): value is TemplateKind =>
  TEMPLATE_KINDS.some((kind) => kind.value === value);
export const isClientDocKind = (value: unknown): value is ClientDocKind =>
  (CLIENT_DOC_KINDS as readonly unknown[]).includes(value);
export const isSingletonKind = (value: unknown): value is SingletonKind =>
  (SINGLETON_KINDS as readonly unknown[]).includes(value);

export const templateKindLabel = (kind: TemplateKind): string => TEMPLATE_KINDS.find((k) => k.value === kind)!.label;
export const templateGroup = (kind: TemplateKind): TemplateGroup => TEMPLATE_KINDS.find((k) => k.value === kind)!.group;

export const DOC_RESPONSES = [
  { value: "sign", label: "Sign" },
  { value: "acknowledge", label: "Acknowledge" },
  { value: "view", label: "View" },
] as const;

export type DocResponse = (typeof DOC_RESPONSES)[number]["value"];
export const isDocResponse = (value: unknown): value is DocResponse => DOC_RESPONSES.some((r) => r.value === value);
export const docResponseLabel = (response: DocResponse): string => DOC_RESPONSES.find((r) => r.value === response)!.label;

export type DocStatus = "draft" | "sent" | "completed" | "void";

/** Terms: only contract-time fields. Guides: none (the same for every client). Client documents: all. */
export function allowedFields(kind: TemplateKind): readonly FieldKey[] {
  if (kind === "terms") return TERMS_FIELDS;
  if (kind === "guide_install" || kind === "guide_care") return [];
  return FIELD_KEYS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/docs/kinds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/docs/types.ts lib/docs/fields.ts lib/docs/kinds.ts tests/docs/kinds.test.ts
git commit -m "feat: doc text block types, the fill-in field list and template kinds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

## Wave 1

### Task 2: Doc-text parser and template validation

**Files:**
- Create: `lib/docs/parse.ts`
- Create: `lib/docs/validate.ts`
- Test: `tests/docs/parse.test.ts`, `tests/docs/validate.test.ts`

**Interfaces:**
- Consumes: `Block`, `Inline` from `lib/docs/types.ts`; `markerPattern`, `isFieldKey`, `FieldKey` from `lib/docs/fields.ts`; `isTemplateKind`, `isDocResponse`, `isSingletonKind`, `allowedFields`, `templateKindLabel` from `lib/docs/kinds.ts`.
- Produces:
  - `parseInline(text: string): Inline[]`
  - `parseDocText(source: string): Block[]`
  - `findFieldKeys(text: string): string[]` — unique trimmed keys of every marker, in order of first appearance.
  - `unknownFields(text: string, allowed: readonly string[]): string[]` — unique keys not in `allowed`.
  - `remainingMarkers(text: string): string[]` — unique markers as written, e.g. `["{{deposit}}"]`.
  - `lib/docs/validate.ts`: `NAME_MAX = 120`, `BODY_MAX = 100_000`, `type TemplateInput = { name: string; kind: string; response: string; body: string }`, `templateErrors(input: TemplateInput): string[]`.
  - Both modules are client-safe (no server imports): the editor runs them in the browser.

- [ ] **Step 1: Write the failing parser test**

`tests/docs/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findFieldKeys, parseDocText, parseInline, remainingMarkers, unknownFields } from "@/lib/docs/parse";

const t = (text: string, bold = false) => ({ type: "text" as const, text, bold });
const f = (key: string, bold = false) => ({ type: "field" as const, key, bold });

describe("parseInline", () => {
  it("reads plain text as one run", () => expect(parseInline("Hello there")).toEqual([t("Hello there")]));
  it("reads **bold** runs", () => expect(parseInline("Pay **50%** now")).toEqual([t("Pay "), t("50%", true), t(" now")]));
  it("keeps an unmatched ** literal", () => expect(parseInline("a **b")).toEqual([t("a **b")]));
  it("pairs the first ** marks and leaves a trailing odd one literal", () =>
    expect(parseInline("**a** **b")).toEqual([t("a", true), t(" **b")]));
  it("reads a field, trimming its key, bold inside bold", () => {
    expect(parseInline("Hi {{ client_name }}!")).toEqual([t("Hi "), f("client_name"), t("!")]);
    expect(parseInline("**{{deposit}}** due")).toEqual([f("deposit", true), t(" due")]);
  });
  it("reads an unknown or malformed key as a field, so the validator can report it", () =>
    expect(parseInline("{{client name}}")).toEqual([f("client name")]));
  it("treats anything else, including HTML, as literal text", () =>
    expect(parseInline('<script>alert("x")</script> [link](http://x) *one*')).toEqual([t('<script>alert("x")</script> [link](http://x) *one*')]));
});

describe("parseDocText", () => {
  it("reads headings, subheadings, paragraphs and bullets", () => {
    const source = "## Scope\n\nWe install **two** shades.\nSecond line joins.\n\n### Notes\n- one\n- two {{city}}\n\nEnd.";
    expect(parseDocText(source)).toEqual([
      { type: "heading", level: 2, inlines: [t("Scope")] },
      { type: "paragraph", inlines: [t("We install "), t("two", true), t(" shades. Second line joins.")] },
      { type: "heading", level: 3, inlines: [t("Notes")] },
      { type: "bullets", items: [[t("one")], [t("two "), f("city")]] },
      { type: "paragraph", inlines: [t("End.")] },
    ]);
  });
  it("accepts Windows line endings", () =>
    expect(parseDocText("## A\r\n\r\nb")).toEqual([{ type: "heading", level: 2, inlines: [t("A")] }, { type: "paragraph", inlines: [t("b")] }]));
  it("falls back to literal text for everything outside the grammar", () => {
    expect(parseDocText("# Title")).toEqual([{ type: "paragraph", inlines: [t("# Title")] }]);
    expect(parseDocText("#### Deep")).toEqual([{ type: "paragraph", inlines: [t("#### Deep")] }]);
    expect(parseDocText("##NoSpace")).toEqual([{ type: "paragraph", inlines: [t("##NoSpace")] }]);
    expect(parseDocText("-no space")).toEqual([{ type: "paragraph", inlines: [t("-no space")] }]);
    expect(parseDocText("## ")).toEqual([{ type: "paragraph", inlines: [t("##")] }]);
    expect(parseDocText("1. numbered")).toEqual([{ type: "paragraph", inlines: [t("1. numbered")] }]);
  });
  it("keeps bullets one level deep: an indented bullet joins the same list", () =>
    expect(parseDocText("- a\n  - b\n    - c")).toEqual([{ type: "bullets", items: [[t("a")], [t("b")], [t("c")]] }]));
  it("keeps the rest of a bullet line literal, so '- - x' is one item reading '- x'", () =>
    expect(parseDocText("- - x")).toEqual([{ type: "bullets", items: [[t("- x")]] }]));
  it("ends a list at a plain line and a paragraph at a bullet", () =>
    expect(parseDocText("a\n- b\nc")).toEqual([
      { type: "paragraph", inlines: [t("a")] },
      { type: "bullets", items: [[t("b")]] },
      { type: "paragraph", inlines: [t("c")] },
    ]));
  it("answers no blocks for empty or blank text", () => {
    expect(parseDocText("")).toEqual([]);
    expect(parseDocText(" \n\n  ")).toEqual([]);
  });
});

describe("markers", () => {
  const text = "{{client_name}} owes {{deposit}}. {{client_name}} again, {{ nope }} and {{a b}}.";
  it("finds each field key once, in order", () => expect(findFieldKeys(text)).toEqual(["client_name", "deposit", "nope", "a b"]));
  it("names the keys that are not allowed", () =>
    expect(unknownFields(text, ["client_name", "deposit"])).toEqual(["nope", "a b"]));
  it("lists the markers still in the text, as written", () =>
    expect(remainingMarkers(text)).toEqual(["{{client_name}}", "{{deposit}}", "{{ nope }}", "{{a b}}"]));
  it("finds nothing in text without markers", () => expect(remainingMarkers("Just { braces } and }} {{")).toEqual([]));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/parse.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/parse`.

- [ ] **Step 3: Write `lib/docs/parse.ts`**

```ts
import { markerPattern } from "./fields";
import type { Block, Inline } from "./types";

/** Splits one bold-or-not piece into text and `{{field}}` runs. Empty text is dropped. */
function pushPieces(out: Inline[], text: string, bold: boolean): void {
  let last = 0;
  for (const match of text.matchAll(markerPattern())) {
    if (match.index > last) out.push({ type: "text", text: text.slice(last, match.index), bold });
    out.push({ type: "field", key: match[1].trim(), bold });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last), bold });
}

/** Adjacent text runs of the same weight become one. */
function merge(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    const prev = out[out.length - 1];
    if (inline.type === "text" && prev?.type === "text" && prev.bold === inline.bold) prev.text += inline.text;
    else out.push({ ...inline });
  }
  return out;
}

/**
 * `**bold**` pairs first, then `{{field}}` markers inside each piece. `**` marks pair from the
 * left; an unmatched last one stays literal, joined back onto the text after it.
 */
export function parseInline(text: string): Inline[] {
  const parts = text.split("**");
  const paired = parts.length % 2 === 1 ? parts : [...parts.slice(0, -2), parts.slice(-2).join("**")];
  const out: Inline[] = [];
  paired.forEach((part, index) => pushPieces(out, part, index % 2 === 1));
  return merge(out);
}

/**
 * Doc text (spec §2) into blocks. Lines are trimmed, so an indented bullet is still a bullet:
 * lists are one level deep. Consecutive plain lines join into one paragraph with a space.
 * Anything outside the grammar is literal text; nothing here can produce markup.
 */
export function parseDocText(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: Inline[][] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length > 0) blocks.push({ type: "bullets", items: bullets });
    bullets = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    const heading = /^(#{2,3}) (.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push({ type: "heading", level: heading[1].length === 2 ? 2 : 3, inlines: parseInline(heading[2].trim()) });
      continue;
    }
    const bullet = /^- (.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(parseInline(bullet[1].trim()));
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

const unique = (values: string[]): string[] => [...new Set(values)];

/** Every marker's trimmed key, once each, in order of first appearance. */
export const findFieldKeys = (text: string): string[] =>
  unique([...text.matchAll(markerPattern())].map((match) => match[1].trim()));

/** The keys used in `text` that `allowed` does not contain. */
export const unknownFields = (text: string, allowed: readonly string[]): string[] =>
  findFieldKeys(text).filter((key) => !allowed.includes(key));

/** The markers still in `text`, exactly as written, once each. Send is blocked while any remain. */
export const remainingMarkers = (text: string): string[] =>
  unique([...text.matchAll(markerPattern())].map((match) => match[0]));
```

Note: `"## "` trims to `"##"`, which does not match `/^(#{2,3}) (.+)$/`, so it is literal as the test requires.

- [ ] **Step 4: Run the parser test**

Run: `npx vitest run --maxWorkers=2 tests/docs/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing validation test**

`tests/docs/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BODY_MAX, NAME_MAX, templateErrors } from "@/lib/docs/validate";

const ok = { name: "Service agreement", kind: "service_agreement", response: "acknowledge", body: "## Scope\n\nHi {{client_name}}." };

describe("templateErrors", () => {
  it("accepts a good template", () => expect(templateErrors(ok)).toEqual([]));
  it("requires a name, at most 120 characters", () => {
    expect(templateErrors({ ...ok, name: "   " })).toEqual(["Give the template a name."]);
    expect(templateErrors({ ...ok, name: "x".repeat(NAME_MAX + 1) })).toEqual(["Name must be 120 characters or fewer."]);
  });
  it("requires a known kind and response", () => {
    expect(templateErrors({ ...ok, kind: "contract" })).toEqual(["Choose what kind of template this is."]);
    expect(templateErrors({ ...ok, response: "approve" })).toEqual(["Choose how the client responds: sign, acknowledge or view."]);
  });
  it("keeps terms and guides view-only", () =>
    expect(templateErrors({ ...ok, kind: "terms", response: "sign", body: "x" })).toEqual(["Contract terms and portal guides are view only."]));
  it("refuses an empty or oversized body", () => {
    expect(templateErrors({ ...ok, body: " \n " })).toEqual(["The template is empty."]);
    expect(templateErrors({ ...ok, body: "x".repeat(BODY_MAX + 1) })).toEqual(["The template is too long."]);
  });
  it("names every unknown field", () =>
    expect(templateErrors({ ...ok, body: "{{nope}} and {{client name}} and {{deposit}}" }))
      .toEqual(["Unknown field {{nope}}.", "Unknown field {{client name}}."]));
  it("refuses a real field the kind cannot use", () => {
    expect(templateErrors({ name: "Terms", kind: "terms", response: "view", body: "Deposit {{deposit}} for {{client_name}}" }))
      .toEqual(["{{deposit}} can't be used in Contract terms."]);
    expect(templateErrors({ name: "Care", kind: "guide_care", response: "view", body: "Hi {{client_first_name}}" }))
      .toEqual(["{{client_first_name}} can't be used in Caring for your shades."]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/validate.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/validate`.

- [ ] **Step 7: Write `lib/docs/validate.ts`**

```ts
import { isFieldKey } from "./fields";
import { allowedFields, isDocResponse, isSingletonKind, isTemplateKind, templateKindLabel } from "./kinds";
import { findFieldKeys } from "./parse";

export const NAME_MAX = 120;
export const BODY_MAX = 100_000;

/** Raw form values: every field is a string, and none is trusted. */
export type TemplateInput = { name: string; kind: string; response: string; body: string };

/** Everything that stops a template being saved (spec §5), in the order the form shows them. */
export function templateErrors(input: TemplateInput): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push("Give the template a name.");
  else if (name.length > NAME_MAX) errors.push(`Name must be ${NAME_MAX} characters or fewer.`);
  if (!isTemplateKind(input.kind)) errors.push("Choose what kind of template this is.");
  if (!isDocResponse(input.response)) errors.push("Choose how the client responds: sign, acknowledge or view.");
  else if (isSingletonKind(input.kind) && input.response !== "view") errors.push("Contract terms and portal guides are view only.");
  if (!input.body.trim()) errors.push("The template is empty.");
  else if (input.body.length > BODY_MAX) errors.push("The template is too long.");
  if (isTemplateKind(input.kind)) {
    const allowed = allowedFields(input.kind);
    for (const key of findFieldKeys(input.body)) {
      if (!isFieldKey(key)) errors.push(`Unknown field {{${key}}}.`);
      else if (!allowed.includes(key)) errors.push(`{{${key}}} can't be used in ${templateKindLabel(input.kind)}.`);
    }
  }
  return errors;
}
```

- [ ] **Step 8: Run both tests**

Run: `npx vitest run --maxWorkers=2 tests/docs/parse.test.ts tests/docs/validate.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/docs/parse.ts lib/docs/validate.ts tests/docs/parse.test.ts tests/docs/validate.test.ts
git commit -m "feat: parse doc text into blocks, and validate templates before they are saved

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 3: Field filling

**Files:**
- Create: `lib/docs/fill.ts`
- Test: `tests/docs/fill.test.ts`

**Interfaces:**
- Consumes: `Job` (type only) from `lib/admin/jobs.ts`; `balanceCents`, `formatCents` from `lib/admin/money.ts`; `formatDateOnly`, `formatShortDate` from `lib/admin/time.ts`; `formatPhone` from `lib/leads/schema.ts`; `formatProjectNo` from `lib/portal/project-no.ts`; `business` from `content/business.ts`; `markerPattern`, `isFieldKey`, `FieldKey` from `lib/docs/fields.ts`.
- Produces:
  - `type FillJob = Pick<Job, "name" | "email" | "phone" | "address" | "city" | "projectNo" | "soldCents" | "quoteCents" | "depositCents" | "installOn">`
  - `type FieldValues = Record<FieldKey, string | null>`
  - `type FillResult = { text: string; missing: FieldKey[]; unknown: string[] }`
  - `fieldValues(job: FillJob, now: Date): FieldValues`
  - `cleanValue(value: string): string`
  - `fillFields(body: string, values: FieldValues): FillResult` — a known field with a value is replaced; a known field without one stays as `{{key}}` and is listed in `missing`; an unknown key stays as written and is listed in `unknown`.

- [ ] **Step 1: Write the failing test**

`tests/docs/fill.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { business } from "@/content/business";
import { cleanValue, fieldValues, fillFields, type FillJob } from "@/lib/docs/fill";

const job: FillJob = {
  name: "  Maria  Lopez ", email: "maria@example.com", phone: "7025550100", address: "12 Palm Way", city: "Henderson",
  projectNo: 1048, soldCents: 450050, quoteCents: 400000, depositCents: 100000, installOn: "2026-10-12",
};
// 19:00 UTC is noon in Las Vegas.
const NOW = new Date("2026-09-28T19:00:00Z");

describe("fieldValues", () => {
  it("resolves every key from the job and the business constants", () => {
    expect(fieldValues(job, NOW)).toEqual({
      client_name: "Maria  Lopez", client_first_name: "Maria", client_email: "maria@example.com",
      client_phone: "(702) 555-0100", address: "12 Palm Way", city: "Henderson", project_no: "PSS-1048",
      today: "Sep 28, 2026", contract_total: "$4,500.50", deposit: "$1,000", balance_due: "$3,500.50",
      install_date: "Oct 12, 2026", company_name: business.legalName, company_phone: business.phone.display,
      company_email: business.email,
    });
  });
  it("dates today in Las Vegas, not UTC", () =>
    expect(fieldValues(job, new Date("2026-09-29T05:00:00Z")).today).toBe("Sep 28, 2026"));
  it("falls back to the quoted amount before a sale, with no balance yet", () => {
    const values = fieldValues({ ...job, soldCents: null }, NOW);
    expect(values.contract_total).toBe("$4,000");
    expect(values.balance_due).toBeNull();
  });
  it("answers null for every value the job does not have", () => {
    const values = fieldValues({ ...job, email: "  ", phone: "", address: null, city: "", projectNo: null,
      soldCents: null, quoteCents: null, depositCents: null, installOn: null }, NOW);
    for (const key of ["client_email", "client_phone", "address", "city", "project_no", "contract_total", "deposit", "balance_due", "install_date"] as const) {
      expect(values[key], key).toBeNull();
    }
  });
});

describe("fillFields", () => {
  const values = fieldValues({ ...job, depositCents: null }, NOW);
  it("replaces every field that has a value, spaces inside the braces allowed", () =>
    expect(fillFields("Hi {{client_first_name}}, total {{ contract_total }}.", values))
      .toEqual({ text: "Hi Maria, total $4,500.50.", missing: [], unknown: [] }));
  it("leaves a field with no value as a visible marker and says which", () =>
    expect(fillFields("Deposit: {{deposit}}. Again {{ deposit }}.", values))
      .toEqual({ text: "Deposit: {{deposit}}. Again {{deposit}}.", missing: ["deposit"], unknown: [] }));
  it("rejects unknown keys: left as written and reported", () =>
    expect(fillFields("{{nope}} and {{Client_Name}}", values))
      .toEqual({ text: "{{nope}} and {{Client_Name}}", missing: [], unknown: ["nope", "Client_Name"] }));
  it("a value can never become syntax: no bold, marker, heading or bullet", () => {
    const hostile = fieldValues({ ...job, name: "## **Bob** {{deposit}}", address: "- 12\nPalm {{x}}" }, NOW);
    const { text } = fillFields("{{client_name}}\n{{address}}", hostile);
    expect(text).toBe("*Bob* deposit\n12 Palm x");
  });
});

describe("cleanValue", () => {
  it("collapses whitespace, drops braces, shortens star runs and strips a leading heading or bullet", () => {
    expect(cleanValue("  a \n b ")).toBe("a b");
    expect(cleanValue("{{{x}}}")).toBe("x");
    expect(cleanValue("a***b")).toBe("a*b");
    expect(cleanValue("### - Title")).toBe("Title");
    expect(cleanValue("#12 Unit")).toBe("#12 Unit");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/fill.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/fill`.

- [ ] **Step 3: Write `lib/docs/fill.ts`**

```ts
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { balanceCents, formatCents } from "@/lib/admin/money";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import { formatPhone } from "@/lib/leads/schema";
import { formatProjectNo } from "@/lib/portal/project-no";
import { isFieldKey, markerPattern, type FieldKey } from "./fields";

export type FillJob = Pick<Job, "name" | "email" | "phone" | "address" | "city" | "projectNo" | "soldCents" | "quoteCents" | "depositCents" | "installOn">;
export type FieldValues = Record<FieldKey, string | null>;
export type FillResult = { text: string; missing: FieldKey[]; unknown: string[] };

const present = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Spec §3: every field's value for this job at `now`. Null means "no value": the marker stays. */
export function fieldValues(job: FillJob, now: Date): FieldValues {
  const name = present(job.name);
  const phone = present(job.phone);
  const sold = job.soldCents ?? null;
  const total = sold ?? job.quoteCents ?? null;
  const balance = balanceCents(sold, job.depositCents ?? null);
  return {
    client_name: name,
    client_first_name: name ? name.split(/\s+/)[0] : null,
    client_email: present(job.email),
    client_phone: phone ? formatPhone(phone) : null,
    address: present(job.address),
    city: present(job.city),
    project_no: formatProjectNo(job.projectNo),
    today: formatShortDate(now),
    contract_total: total === null ? null : formatCents(total),
    deposit: job.depositCents == null ? null : formatCents(job.depositCents),
    balance_due: balance === null ? null : formatCents(balance),
    install_date: job.installOn ? formatDateOnly(job.installOn) : null,
    company_name: business.legalName,
    company_phone: business.phone.display,
    company_email: business.email,
  };
}

/**
 * A value is plain text wherever it lands: one line, no braces (so no new marker), no `**` (so no
 * bold), and nothing at its start that would read as a heading or bullet if the marker began a line.
 */
export function cleanValue(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\*{2,}/g, "*")
    .trim()
    .replace(/^(?:#+\s+|-\s+)+/, "")
    .trim();
}

/** Replaces every marker it can. Spec §3: a field with no value stays `{{key}}`; unknown keys are reported. */
export function fillFields(body: string, values: FieldValues): FillResult {
  const missing = new Set<FieldKey>();
  const unknown = new Set<string>();
  const text = body.replace(markerPattern(), (marker: string, raw: string) => {
    const key = raw.trim();
    if (!isFieldKey(key)) {
      unknown.add(key);
      return marker;
    }
    const value = values[key];
    const cleaned = value === null ? "" : cleanValue(value);
    if (!cleaned) {
      missing.add(key);
      return `{{${key}}}`;
    }
    return cleaned;
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}
```

Check against the hostile test: name `"## **Bob** {{deposit}}"` → whitespace kept, braces removed → `"## **Bob** deposit"` → `**` → `*` → `"## *Bob* deposit"` → leading `"## "` stripped → `"*Bob* deposit"`. Address `"- 12\nPalm {{x}}"` → `"- 12 Palm {{x}}"` → `"- 12 Palm x"` → `"12 Palm x"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/docs/fill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/docs/fill.ts tests/docs/fill.test.ts
git commit -m "feat: fill document fields from the job, leaving a visible marker where a value is missing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 4: Business-day cancellation window

**Files:**
- Create: `lib/docs/business-days.ts`
- Test: `tests/docs/business-days.test.ts`

**Interfaces:**
- Consumes: `fromLocalInput`, `lasVegasDate` from `lib/admin/time.ts`.
- Produces:
  - `federalHolidays(year: number): string[]` — sorted `YYYY-MM-DD`, including the weekday a fixed-date holiday is observed on when it falls on a weekend (Saturday → the Friday before, Sunday → the Monday after).
  - `isFederalHoliday(day: string): boolean`
  - `isBusinessDay(day: string): boolean`
  - `CANCEL_BUSINESS_DAYS = 3`
  - `cancellationWindowLastDay(signedAt: Date): string` — the 3rd business day after the Las Vegas signing date.
  - `cancellationWindowEnd(signedAt: Date): Date` — midnight (Las Vegas) at the end of that day.
  - `inCancellationWindow(signedAt: Date, now: Date): boolean`

- [ ] **Step 1: Write the failing test**

`tests/docs/business-days.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cancellationWindowEnd, cancellationWindowLastDay, federalHolidays, inCancellationWindow, isBusinessDay, isFederalHoliday,
} from "@/lib/docs/business-days";

// Las Vegas is UTC-7 in summer (PDT) and UTC-8 in winter (PST).
const end = (signedAtUtc: string) => cancellationWindowEnd(new Date(signedAtUtc)).toISOString();

describe("federal holidays", () => {
  it("lists 2026's eleven holidays plus Independence Day observed on Friday Jul 3", () => {
    expect(federalHolidays(2026)).toEqual([
      "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-07-04",
      "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
    ]);
  });
  it("observes next year's Saturday New Year's Day on this year's Dec 31", () => {
    expect(isFederalHoliday("2027-12-31")).toBe(true);
    expect(isFederalHoliday("2027-12-24")).toBe(true); // Christmas 2027 is a Saturday
    expect(isFederalHoliday("2027-12-30")).toBe(false);
  });
  it("counts every day but Sundays and holidays as a business day", () => {
    expect(isBusinessDay("2026-10-03")).toBe(true); // Saturday
    expect(isBusinessDay("2026-10-04")).toBe(false); // Sunday
    expect(isBusinessDay("2026-10-12")).toBe(false); // Columbus Day
  });
});

describe("cancellation window", () => {
  it("ends at midnight after the third business day: signed Monday, ends Thursday night", () => {
    expect(cancellationWindowLastDay(new Date("2026-09-28T17:00:00Z"))).toBe("2026-10-01");
    expect(end("2026-09-28T17:00:00Z")).toBe("2026-10-02T07:00:00.000Z");
  });
  it("skips Sunday", () => expect(end("2026-10-01T17:00:00Z")).toBe("2026-10-06T07:00:00.000Z"));
  it("skips a Monday holiday", () => expect(end("2026-10-09T17:00:00Z")).toBe("2026-10-15T07:00:00.000Z"));
  it("counts from a Saturday signing", () => expect(end("2026-10-03T17:00:00Z")).toBe("2026-10-08T07:00:00.000Z"));
  it("uses the Las Vegas date: 11:30 PM on Oct 1 is an Oct 1 signing", () =>
    expect(end("2026-10-02T06:30:00Z")).toBe("2026-10-06T07:00:00.000Z"));
  it("skips an observed holiday and the holiday itself", () =>
    expect(end("2026-07-02T17:00:00Z")).toBe("2026-07-09T07:00:00.000Z"));
  it("skips Thanksgiving, ending in standard time", () =>
    expect(end("2026-11-25T18:00:00Z")).toBe("2026-12-01T08:00:00.000Z"));
  it("crosses the year end over New Year's Day", () =>
    expect(end("2026-12-30T18:00:00Z")).toBe("2027-01-05T08:00:00.000Z"));
  it("is open until that instant and closed from it", () => {
    const signed = new Date("2026-09-28T17:00:00Z");
    expect(inCancellationWindow(signed, new Date("2026-10-02T06:59:59Z"))).toBe(true);
    expect(inCancellationWindow(signed, new Date("2026-10-02T07:00:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/business-days.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/business-days`.

- [ ] **Step 3: Write `lib/docs/business-days.ts`**

```ts
import { fromLocalInput, lasVegasDate } from "@/lib/admin/time";

const DAY_MS = 86_400_000;
const noonUtc = (day: string) => new Date(`${day}T12:00:00Z`);
const addDays = (day: string, n: number) => new Date(noonUtc(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);
/** 0 is Sunday. */
const weekday = (day: string) => noonUtc(day).getUTCDay();
const ymd = (year: number, month: number, date: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;

/** The nth `dow` (0 = Sunday) of a month, 1-based; n = -1 is the last one. */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  if (n > 0) {
    const first = weekday(ymd(year, month, 1));
    return ymd(year, month, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekday(ymd(year, month, lastDate));
  return ymd(year, month, lastDate - ((last - dow + 7) % 7));
}

/**
 * The eleven US federal holidays of spec §9 for `year`, plus the weekday a fixed-date one is
 * observed on when it falls on a weekend. Counting the observed day too can only lengthen the
 * window, which is the safe direction: the order is never placed early.
 */
export function federalHolidays(year: number): string[] {
  const fixed = [ymd(year, 1, 1), ymd(year, 6, 19), ymd(year, 7, 4), ymd(year, 11, 11), ymd(year, 12, 25)];
  const floating = [
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Presidents' Day
    nthWeekday(year, 5, 1, -1), // Memorial Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 10, 1, 2), // Columbus Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
  ];
  const observed = fixed
    .map((day) => (weekday(day) === 6 ? addDays(day, -1) : weekday(day) === 0 ? addDays(day, 1) : null))
    .filter((day): day is string => day !== null);
  return [...new Set([...fixed, ...floating, ...observed])].sort();
}

/** Next year's list too: a Saturday New Year's Day is observed on this year's Dec 31. */
export function isFederalHoliday(day: string): boolean {
  const year = Number(day.slice(0, 4));
  return federalHolidays(year).includes(day) || federalHolidays(year + 1).includes(day);
}

/** Spec §9: every day except Sundays and federal holidays. Saturdays count. */
export const isBusinessDay = (day: string): boolean => weekday(day) !== 0 && !isFederalHoliday(day);

export const CANCEL_BUSINESS_DAYS = 3;

/** The 3rd business day after the signing date, the signing date read in Las Vegas time. */
export function cancellationWindowLastDay(signedAt: Date): string {
  let day = lasVegasDate(signedAt);
  let counted = 0;
  while (counted < CANCEL_BUSINESS_DAYS) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) counted += 1;
  }
  return day;
}

/** Midnight in Las Vegas at the end of the last day of the window. */
export const cancellationWindowEnd = (signedAt: Date): Date =>
  fromLocalInput(`${addDays(cancellationWindowLastDay(signedAt), 1)}T00:00`);

export const inCancellationWindow = (signedAt: Date, now: Date): boolean =>
  now.getTime() < cancellationWindowEnd(signedAt).getTime();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/docs/business-days.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/docs/business-days.ts tests/docs/business-days.test.ts
git commit -m "feat: the 3-business-day cancellation window, skipping Sundays and federal holidays

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 5: Migration 026 and the `document` event kind

**Files:**
- Create: `db/migrations/026_documents.sql`
- Modify: `db/migrations/003_measure_and_files.sql:40`, `004_referrals_reviews.sql:20`, `011_stages_contact_log.sql:19`, `019_service_requests.sql:16`, `021_contract_signing.sql:17`, `024_dc_quote_import.sql:112` (the kind list line only)
- Modify: `lib/admin/jobs.ts:80` (the `JobEvent["kind"]` union)
- Test: `tests/db/migration-026.test.ts` (new), `tests/db/migration-011.test.ts:8` (the `KINDS` constant)

**Interfaces:**
- Consumes: `TEMPLATE_KINDS`, `CLIENT_DOC_KINDS`, `SINGLETON_KINDS` from `lib/docs/kinds.ts`.
- Produces (schema every store relies on):
  - `document_templates(id uuid pk, name text not null, kind text not null, response text not null, body text not null, archived_at timestamptz, created_by text, updated_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`, unique partial index `document_templates_one_live_singleton`.
  - `job_documents(id uuid pk, lead_id uuid not null → leads on delete cascade, template_id uuid → document_templates on delete set null, title text not null, kind text not null, response text not null, body text not null, status text not null default 'draft', file_id uuid → job_files, sent_at, sent_by, completed_at, voided_at, created_by text not null, created_at, updated_at)`, unique partial index on `file_id`.
  - `document_acknowledgements(id uuid pk, lead_id uuid not null → leads on delete cascade, file_id uuid not null unique → job_files, acknowledged_name text not null, acknowledged_email text not null, ip text, user_agent text, doc_sha256 text not null, acknowledged_at timestamptz not null default now())`.
  - `job_events.kind` accepts `'document'`; `JobEvent["kind"]` includes `"document"`.

- [ ] **Step 1: Write the failing migration test**

`tests/db/migration-026.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLIENT_DOC_KINDS, SINGLETON_KINDS, TEMPLATE_KINDS } from "@/lib/docs/kinds";

const source = readFileSync("db/migrations/026_documents.sql", "utf8");
const statements = source.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));
const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");
const KINDS = "'stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document'";

describe("migration 026", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
  it("never puts a semicolon inside a string literal (every statement has balanced quotes)", () => {
    for (const s of statements) expect(s.split("'").length % 2, s).toBe(1);
  });
  it("is re-runnable: every statement creates if missing, or drops before it adds", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists|create (unique )?index if not exists|alter table job_events (drop constraint if exists|add constraint))/);
    }
  });
  it("allows exactly the app's template kinds and responses, view-only for terms and guides", () => {
    const table = find("create table if not exists document_templates")!;
    expect(table).toContain(`kind in (${list(TEMPLATE_KINDS.map((k) => k.value))})`);
    expect(table).toContain("response in ('sign','acknowledge','view')");
    expect(table).toContain(`check (kind not in (${list(SINGLETON_KINDS)}) or response = 'view')`);
  });
  it("allows at most one live terms or guide template", () => {
    expect(find("document_templates_one_live_singleton")).toBe(
      `create unique index if not exists document_templates_one_live_singleton on document_templates (kind) where archived_at is null and kind in (${list(SINGLETON_KINDS)})`,
    );
  });
  it("keeps job documents to client kinds and four statuses, with a file once sent", () => {
    const table = find("create table if not exists job_documents")!;
    expect(table).toContain("lead_id uuid not null references leads(id) on delete cascade");
    expect(table).toContain("template_id uuid references document_templates(id) on delete set null");
    expect(table).toContain(`kind in (${list(CLIENT_DOC_KINDS)})`);
    expect(table).toContain("status in ('draft','sent','completed','void')");
    expect(table).toContain("check (status = 'draft' or file_id is not null)");
    expect(find("job_documents_file_key")).toBe(
      "create unique index if not exists job_documents_file_key on job_documents (file_id) where file_id is not null",
    );
  });
  it("keeps one fingerprinted acknowledgement per file", () => {
    const table = find("create table if not exists document_acknowledgements")!;
    expect(table).toContain("file_id uuid not null references job_files(id) unique");
    expect(table).toContain("doc_sha256 text not null");
    expect(table).toContain("lead_id uuid not null references leads(id) on delete cascade");
  });
  it("adds document to the kind check, keeping every earlier kind, after dropping it", () => {
    const drop = statements.indexOf("alter table job_events drop constraint if exists job_events_kind_check");
    const add = statements.findIndex((s) => s.startsWith("alter table job_events add constraint job_events_kind_check"));
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
    expect(statements[add]).toBe(`alter table job_events add constraint job_events_kind_check check ( kind in (${KINDS}) )`);
  });
  it("stores no money", () => expect(source).not.toMatch(/cents|numeric/));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-026.test.ts`
Expected: FAIL, ENOENT for `db/migrations/026_documents.sql`.

- [ ] **Step 3: Write `db/migrations/026_documents.sql`**

```sql
-- Documents: templates, per-client documents and acknowledgements.
-- Spec docs/superpowers/specs/2026-09-28-documents-design.md section 4.
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments or string literals.

-- Templates the owner writes on the Documents page. Terms and the two guides are singletons
-- and always view only. Archiving never touches documents already made from a template.
create table if not exists document_templates (
  id          uuid primary key,
  name        text not null check (btrim(name) <> ''),
  kind        text not null check (kind in ('terms','service_agreement','change_order','other','guide_install','guide_care')),
  response    text not null check (response in ('sign','acknowledge','view')),
  body        text not null,
  archived_at timestamptz,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (kind not in ('terms','guide_install','guide_care') or response = 'view')
);

-- At most one live template of each singleton kind
create unique index if not exists document_templates_one_live_singleton on document_templates (kind) where archived_at is null and kind in ('terms','guide_install','guide_care');

-- One document made for one job. kind and response are copied from the template. file_id is the
-- rendered PDF, set on send, so a sent, completed or void document always names its file.
create table if not exists job_documents (
  id           uuid primary key,
  lead_id      uuid not null references leads(id) on delete cascade,
  template_id  uuid references document_templates(id) on delete set null,
  title        text not null check (btrim(title) <> ''),
  kind         text not null check (kind in ('service_agreement','change_order','other')),
  response     text not null check (response in ('sign','acknowledge','view')),
  body         text not null,
  status       text not null default 'draft' check (status in ('draft','sent','completed','void')),
  file_id      uuid references job_files(id),
  sent_at      timestamptz,
  sent_by      text,
  completed_at timestamptz,
  voided_at    timestamptz,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status = 'draft' or file_id is not null)
);

create index if not exists job_documents_lead_id_idx on job_documents (lead_id);

-- A file is the PDF of at most one document
create unique index if not exists job_documents_file_key on job_documents (file_id) where file_id is not null;

-- A client acknowledging a document, mirroring contract_signatures. doc_sha256 is the
-- fingerprint of the exact bytes served, which proves the version that was acknowledged.
create table if not exists document_acknowledgements (
  id                 uuid primary key,
  lead_id            uuid not null references leads(id) on delete cascade,
  file_id            uuid not null references job_files(id) unique,
  acknowledged_name  text not null,
  acknowledged_email text not null,
  ip                 text,
  user_agent         text,
  doc_sha256         text not null,
  acknowledged_at    timestamptz not null default now()
);

create index if not exists document_acknowledgements_lead_id_idx on document_acknowledgements (lead_id);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds.
-- 'document' is a job document drafted, sent, voided, discarded or acknowledged.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document')
);
```

- [ ] **Step 4: Put the identical list in every earlier definition**

Run (bash, from the worktree root):

```bash
for f in db/migrations/003_measure_and_files.sql db/migrations/004_referrals_reviews.sql db/migrations/011_stages_contact_log.sql db/migrations/019_service_requests.sql db/migrations/021_contract_signing.sql db/migrations/024_dc_quote_import.sql; do
  sed -i "s/'service','signature','quote')/'service','signature','quote','document')/" "$f"
done
grep -c "'signature','quote','document')" db/migrations/*.sql | grep -v ":0"
```

Expected: exactly seven files print `:1` — 003, 004, 011, 019, 021, 024 and 026.

In `tests/db/migration-011.test.ts` line 8, change the constant to:

```ts
const KINDS = "kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document')";
```

In `lib/admin/jobs.ts` line 80, change the union to end `| "signature" | "quote" | "document";`.

- [ ] **Step 5: Run the migration tests**

Run: `npx vitest run --maxWorkers=2 tests/db`
Expected: PASS, including `migration-checks-consistent.test.ts` ("job_events_kind_check is identical in every file that defines it").

- [ ] **Step 6: Apply it to the Neon test branch twice (idempotency proof)**

Tell the controller first (migration coordination above). Then, in PowerShell from the worktree root, without printing any value:

```powershell
if (-not (Test-Path .env.local)) { New-Item -ItemType File .env.local | Out-Null }
Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*E2E_POSTGRES_URL\s*=\s*(.*)$') { $v = $matches[1].Trim(); if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) { $v = $v.Substring(1, $v.Length - 2) }; $env:MIGRATE_DATABASE_URL = $v } }
if ($env:MIGRATE_DATABASE_URL -match 'cold-term') { throw "That is production. Stop." }
node scripts/migrate.mjs | Select-String "026_documents|Using"
node scripts/migrate.mjs | Select-String "026_documents|Using"
Remove-Item Env:MIGRATE_DATABASE_URL
```

Expected: both runs print `Using MIGRATE_DATABASE_URL -> ep-...` (a host that does NOT contain `cold-term`) and the 026 statements, with no error on the second run. The empty `.env.local` exists only because `migrate.mjs` reads that file unconditionally; it is gitignored, never commit it.

- [ ] **Step 7: Commit**

```bash
git add db/migrations lib/admin/jobs.ts tests/db/migration-026.test.ts tests/db/migration-011.test.ts
git commit -m "feat: migration 026, document templates, job documents and acknowledgements

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---
### Task 6: Template and job-document stores

**Files:**
- Create: `lib/docs/templates.ts`
- Create: `lib/docs/job-documents.ts`
- Test: `tests/docs/templates.test.ts`, `tests/docs/job-documents.test.ts`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`; `isUuid` from `lib/admin/ids.ts`; `MARKER_SOURCE` from `lib/docs/fields.ts`; `isSingletonKind`, `templateKindLabel`, `TemplateKind`, `SingletonKind`, `ClientDocKind`, `DocResponse`, `DocStatus` from `lib/docs/kinds.ts`. Tables from Task 5.
- Produces:
  - `lib/docs/templates.ts` (server-only):
    - `type DocumentTemplate = { id: string; name: string; kind: TemplateKind; response: DocResponse; body: string; archivedAt: Date | null; createdBy: string | null; updatedBy: string | null; createdAt: Date; updatedAt: Date }`
    - `listTemplates(): Promise<DocumentTemplate[]>` — live only, ordered by kind then name.
    - `getTemplate(id: string): Promise<DocumentTemplate | null>` — archived ones too; callers check `archivedAt`.
    - `liveTemplateOfKind(kind: SingletonKind): Promise<DocumentTemplate | null>`
    - `createTemplate(input: { name: string; kind: TemplateKind; response: DocResponse; body: string; actor: string }): Promise<{ id: string } | { error: string }>` — forces `view` for singleton kinds; a second live singleton answers `{ error: "There is already a live <Kind label> template. Edit that one instead." }`.
    - `updateTemplate(input: { id: string; name: string; response: DocResponse; body: string; actor: string }): Promise<boolean>` — live templates only; kind never changes.
    - `archiveTemplate(id: string, actor: string): Promise<boolean>`
  - `lib/docs/job-documents.ts` (server-only):
    - `type JobDocument = { id: string; leadId: string; templateId: string | null; title: string; kind: ClientDocKind; response: DocResponse; body: string; status: DocStatus; fileId: string | null; sentAt: Date | null; sentBy: string | null; completedAt: Date | null; voidedAt: Date | null; createdBy: string; createdAt: Date; updatedAt: Date }`
    - `listJobDocuments(leadId: string): Promise<JobDocument[]>` — newest first.
    - `getJobDocument(leadId: string, documentId: string): Promise<JobDocument | null>`
    - `insertDraft(input: { leadId: string; templateId: string | null; title: string; kind: ClientDocKind; response: DocResponse; body: string; actor: string }): Promise<string | null>` — the new id, or null when the job does not exist.
    - `updateDraft(input: { leadId: string; documentId: string; title: string; body: string }): Promise<boolean>` — drafts only.
    - `discardDraft(leadId: string, documentId: string, actor: string): Promise<boolean>` — drafts only.
    - `markSent(input: { leadId: string; documentId: string; fileId: string; title: string; body: string; actor: string }): Promise<boolean>` — THE send statement.
    - `voidDocument(leadId: string, documentId: string, actor: string): Promise<boolean>`

- [ ] **Step 1: Write the failing template-store test**

`tests/docs/templates.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/docs/templates");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const ID = "11111111-1111-4111-8111-111111111111";
const row = { id: ID, name: "Terms", kind: "terms", response: "view", body: "## A", archived_at: null, created_by: "o@x.com",
  updated_by: "o@x.com", created_at: "2026-09-28T18:00:00Z", updated_at: "2026-09-28T19:00:00Z" };

beforeEach(() => sql.mockReset());

describe("template store", () => {
  it("lists live templates only, by kind then name, and maps the row", async () => {
    sql.mockResolvedValueOnce([row]);
    const [template] = await store.listTemplates();
    expect(text(sql.mock.calls[0])).toContain("where archived_at is null order by kind, lower(name)");
    expect(template).toEqual({ id: ID, name: "Terms", kind: "terms", response: "view", body: "## A", archivedAt: null,
      createdBy: "o@x.com", updatedBy: "o@x.com", createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
  });
  it("finds the live template of a singleton kind", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.liveTemplateOfKind("guide_care")).toBeNull();
    expect(text(sql.mock.calls[0])).toContain("where kind = ? and archived_at is null");
    expect(sql.mock.calls[0]).toContain("guide_care");
  });
  it("never queries for a malformed id", async () => {
    expect(await store.getTemplate("nope")).toBeNull();
    expect(await store.updateTemplate({ id: "nope", name: "a", response: "view", body: "b", actor: "o" })).toBe(false);
    expect(await store.archiveTemplate("nope", "o")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
  it("creates with a trimmed name, forcing view for terms and guides", async () => {
    sql.mockResolvedValueOnce([]);
    const created = await store.createTemplate({ name: "  Terms ", kind: "terms", response: "sign", body: "x", actor: "o@x.com" });
    expect(created).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(text(sql.mock.calls[0])).toContain("insert into document_templates (id, name, kind, response, body, created_by, updated_by)");
    expect(sql.mock.calls[0].slice(1, 6)).toEqual([(created as { id: string }).id, "Terms", "terms", "view", "x"]);
  });
  it("keeps the chosen response for client documents", async () => {
    sql.mockResolvedValueOnce([]);
    await store.createTemplate({ name: "SA", kind: "service_agreement", response: "acknowledge", body: "x", actor: "o" });
    expect(sql.mock.calls[0][4]).toBe("acknowledge");
  });
  it("turns a second live singleton into a plain refusal", async () => {
    sql.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }));
    expect(await store.createTemplate({ name: "T2", kind: "terms", response: "view", body: "x", actor: "o" }))
      .toEqual({ error: "There is already a live Contract terms template. Edit that one instead." });
  });
  it("rethrows any other database error", async () => {
    sql.mockRejectedValueOnce(Object.assign(new Error("down"), { code: "57P01" }));
    await expect(store.createTemplate({ name: "T", kind: "other", response: "view", body: "x", actor: "o" })).rejects.toThrow("down");
  });
  it("updates only a live template, never its kind, keeping singletons view-only", async () => {
    sql.mockResolvedValueOnce([{ id: ID }]);
    expect(await store.updateTemplate({ id: ID, name: " New ", response: "sign", body: "b", actor: "o" })).toBe(true);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("where id = ? and archived_at is null");
    expect(s).toContain("case when kind in ('terms','guide_install','guide_care') then 'view' else ? end");
    expect(s).not.toContain("kind =");
    expect(sql.mock.calls[0]).toContain("New");
    sql.mockResolvedValueOnce([]);
    expect(await store.updateTemplate({ id: ID, name: "x", response: "view", body: "b", actor: "o" })).toBe(false);
  });
  it("archives a live template once", async () => {
    sql.mockResolvedValueOnce([{ id: ID }]).mockResolvedValueOnce([]);
    expect(await store.archiveTemplate(ID, "o")).toBe(true);
    expect(await store.archiveTemplate(ID, "o")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("set archived_at = now()");
    expect(text(sql.mock.calls[0])).toContain("where id = ? and archived_at is null");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/templates.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/templates`.

- [ ] **Step 3: Write `lib/docs/templates.ts`**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { isSingletonKind, templateKindLabel, type DocResponse, type SingletonKind, type TemplateKind } from "./kinds";

export type DocumentTemplate = {
  id: string; name: string; kind: TemplateKind; response: DocResponse; body: string;
  archivedAt: Date | null; createdBy: string | null; updatedBy: string | null; createdAt: Date; updatedAt: Date;
};

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null);

const toTemplate = (row: Record<string, unknown>): DocumentTemplate => ({
  id: row.id as string,
  name: row.name as string,
  kind: row.kind as TemplateKind,
  response: row.response as DocResponse,
  body: row.body as string,
  archivedAt: date(row.archived_at),
  createdBy: (row.created_by as string | null) ?? null,
  updatedBy: (row.updated_by as string | null) ?? null,
  createdAt: new Date(row.created_at as string),
  updatedAt: new Date(row.updated_at as string),
});

const UNIQUE_VIOLATION = "23505";

export async function listTemplates(): Promise<DocumentTemplate[]> {
  const rows = await db()`select * from document_templates where archived_at is null order by kind, lower(name)`;
  return rows.map((row) => toTemplate(row as Record<string, unknown>));
}

export async function getTemplate(id: string): Promise<DocumentTemplate | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`select * from document_templates where id = ${id}`;
  return rows[0] ? toTemplate(rows[0] as Record<string, unknown>) : null;
}

export async function liveTemplateOfKind(kind: SingletonKind): Promise<DocumentTemplate | null> {
  const rows = await db()`select * from document_templates where kind = ${kind} and archived_at is null limit 1`;
  return rows[0] ? toTemplate(rows[0] as Record<string, unknown>) : null;
}

/**
 * The unique partial index document_templates_one_live_singleton is what refuses a second live
 * terms or guide template, so two owners racing cannot both succeed. Its violation becomes a
 * plain answer here; every other error still throws.
 */
export async function createTemplate(input: {
  name: string; kind: TemplateKind; response: DocResponse; body: string; actor: string;
}): Promise<{ id: string } | { error: string }> {
  const id = randomUUID();
  const response = isSingletonKind(input.kind) ? "view" : input.response;
  try {
    await db()`
      insert into document_templates (id, name, kind, response, body, created_by, updated_by)
      values (${id}, ${input.name.trim()}, ${input.kind}, ${response}, ${input.body}, ${input.actor}, ${input.actor})`;
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return { error: `There is already a live ${templateKindLabel(input.kind)} template. Edit that one instead.` };
    }
    throw error;
  }
  return { id };
}

/** Name, response and body of a live template. The kind is fixed at creation. */
export async function updateTemplate(input: {
  id: string; name: string; response: DocResponse; body: string; actor: string;
}): Promise<boolean> {
  if (!isUuid(input.id)) return false;
  const rows = await db()`
    update document_templates
    set name = ${input.name.trim()},
      response = case when kind in ('terms','guide_install','guide_care') then 'view' else ${input.response} end,
      body = ${input.body}, updated_by = ${input.actor}, updated_at = now()
    where id = ${input.id} and archived_at is null
    returning id`;
  return rows.length > 0;
}

/** Documents already made from it keep their own copy of the text (spec §5). */
export async function archiveTemplate(id: string, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    update document_templates set archived_at = now(), updated_by = ${actor}, updated_at = now()
    where id = ${id} and archived_at is null
    returning id`;
  return rows.length > 0;
}
```

- [ ] **Step 4: Run the template test**

Run: `npx vitest run --maxWorkers=2 tests/docs/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing job-document-store test**

`tests/docs/job-documents.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKER_SOURCE } from "@/lib/docs/fields";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/docs/job-documents");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const TEMPLATE = "44444444-4444-4444-8444-444444444444";

beforeEach(() => sql.mockReset());

describe("reading", () => {
  it("maps a row, newest first, for one job", async () => {
    sql.mockResolvedValueOnce([{ id: DOC, lead_id: JOB, template_id: null, title: "SA", kind: "service_agreement", response: "sign",
      body: "b", status: "sent", file_id: FILE, sent_at: "2026-09-28T18:00:00Z", sent_by: "o", completed_at: null, voided_at: null,
      created_by: "o", created_at: "2026-09-28T17:00:00Z", updated_at: "2026-09-28T18:00:00Z" }]);
    const [doc] = await store.listJobDocuments(JOB);
    expect(text(sql.mock.calls[0])).toContain("where lead_id = ? order by created_at desc");
    expect(doc).toMatchObject({ id: DOC, leadId: JOB, templateId: null, status: "sent", fileId: FILE, sentAt: new Date("2026-09-28T18:00:00Z"), completedAt: null });
  });
  it("reads one document only within its job", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.getJobDocument(JOB, DOC)).toBeNull();
    expect(text(sql.mock.calls[0])).toContain("where id = ? and lead_id = ?");
    expect(await store.getJobDocument(JOB, "nope")).toBeNull();
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("insertDraft", () => {
  it("inserts the draft and its event in ONE statement, only for a job that exists", async () => {
    sql.mockResolvedValueOnce([{ id: "new" }]);
    const id = await store.insertDraft({ leadId: JOB, templateId: TEMPLATE, title: "SA — PSS-1048", kind: "service_agreement",
      response: "acknowledge", body: "Hi", actor: "o@x.com" });
    expect(id).toBe("new");
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of ["insert into job_documents", "from leads where id = ?", "'draft'", "insert into job_events", "'document'", "'Drafted \"' || title || '\"'"]) {
      expect(s).toContain(part);
    }
  });
  it("answers null when the job does not exist", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.insertDraft({ leadId: JOB, templateId: null, title: "t", kind: "other", response: "view", body: "b", actor: "o" })).toBeNull();
  });
});

describe("drafts only", () => {
  it("updateDraft touches a draft of this job and nothing else", async () => {
    sql.mockResolvedValueOnce([{ id: DOC }]).mockResolvedValueOnce([]);
    expect(await store.updateDraft({ leadId: JOB, documentId: DOC, title: "T", body: "B" })).toBe(true);
    expect(await store.updateDraft({ leadId: JOB, documentId: DOC, title: "T", body: "B" })).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("where id = ? and lead_id = ? and status = 'draft'");
  });
  it("discardDraft deletes a draft and logs it in one statement", async () => {
    sql.mockResolvedValueOnce([{ lead_id: JOB }]);
    expect(await store.discardDraft(JOB, DOC, "o")).toBe(true);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("delete from job_documents where id = ? and lead_id = ? and status = 'draft'");
    expect(s).toContain("'Discarded draft \"' || title || '\"'");
  });
});

describe("markSent", () => {
  const input = { leadId: JOB, documentId: DOC, fileId: FILE, title: "SA", body: "Final text", actor: "o@x.com" };
  it("sends, links, shares and logs in ONE statement", async () => {
    sql.mockResolvedValueOnce([{ lead_id: JOB }]);
    expect(await store.markSent(input)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "set status = case when response = 'view' then 'completed' else 'sent' end",
      "completed_at = case when response = 'view' then now() else null end",
      "where id = ? and lead_id = ? and status = 'draft'",
      "and title = ? and body = ?",
      "and body !~ ?",
      "status <> 'lost' and nullif(trim(email), '') is not null",
      "update job_files set shared_at = now() where id = ? and lead_id = ? and exists (select 1 from sent)",
      "'Sent \"' || title || '\"'",
    ]) expect(s).toContain(part);
  });
  it("binds the rendered title and body and the shared marker pattern", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.markSent(input)).toBe(false);
    const binds = sql.mock.calls[0].slice(1);
    expect(binds).toContain("Final text");
    expect(binds).toContain(MARKER_SOURCE);
  });
  it("never queries for malformed ids", async () => {
    expect(await store.markSent({ ...input, fileId: "x" })).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("voidDocument", () => {
  it("voids a sent, unanswered document, unshares its file and logs, in ONE statement", async () => {
    sql.mockResolvedValueOnce([{ file_id: FILE }]);
    expect(await store.voidDocument(JOB, DOC, "o")).toBe(true);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "set status = 'void', voided_at = now()",
      "where id = ? and lead_id = ? and status = 'sent'",
      "not exists (select 1 from document_acknowledgements a where a.file_id = job_documents.file_id)",
      "not exists (select 1 from contract_signatures s where s.file_id = job_documents.file_id)",
      "update job_files set shared_at = null where id = (select file_id from voided) and lead_id = ?",
      "'Voided \"' || title || '\"'",
    ]) expect(s).toContain(part);
  });
  it("answers false when nothing was voided (completed, draft, or another job's)", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.voidDocument(JOB, DOC, "o")).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/job-documents.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/job-documents`.

- [ ] **Step 7: Write `lib/docs/job-documents.ts`**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { MARKER_SOURCE } from "./fields";
import type { ClientDocKind, DocResponse, DocStatus } from "./kinds";

export type JobDocument = {
  id: string; leadId: string; templateId: string | null; title: string; kind: ClientDocKind; response: DocResponse;
  body: string; status: DocStatus; fileId: string | null; sentAt: Date | null; sentBy: string | null;
  completedAt: Date | null; voidedAt: Date | null; createdBy: string; createdAt: Date; updatedAt: Date;
};

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null);

const toDocument = (row: Record<string, unknown>): JobDocument => ({
  id: row.id as string,
  leadId: row.lead_id as string,
  templateId: (row.template_id as string | null) ?? null,
  title: row.title as string,
  kind: row.kind as ClientDocKind,
  response: row.response as DocResponse,
  body: row.body as string,
  status: row.status as DocStatus,
  fileId: (row.file_id as string | null) ?? null,
  sentAt: date(row.sent_at),
  sentBy: (row.sent_by as string | null) ?? null,
  completedAt: date(row.completed_at),
  voidedAt: date(row.voided_at),
  createdBy: row.created_by as string,
  createdAt: new Date(row.created_at as string),
  updatedAt: new Date(row.updated_at as string),
});

export async function listJobDocuments(leadId: string): Promise<JobDocument[]> {
  if (!isUuid(leadId)) return [];
  const rows = await db()`select * from job_documents where lead_id = ${leadId} order by created_at desc`;
  return rows.map((row) => toDocument(row as Record<string, unknown>));
}

export async function getJobDocument(leadId: string, documentId: string): Promise<JobDocument | null> {
  if (!isUuid(leadId) || !isUuid(documentId)) return null;
  const rows = await db()`select * from job_documents where id = ${documentId} and lead_id = ${leadId}`;
  return rows[0] ? toDocument(rows[0] as Record<string, unknown>) : null;
}

/** The draft and its timeline row together; nothing is written for a job that does not exist. */
export async function insertDraft(input: {
  leadId: string; templateId: string | null; title: string; kind: ClientDocKind; response: DocResponse; body: string; actor: string;
}): Promise<string | null> {
  if (!isUuid(input.leadId)) return null;
  const rows = await db()`
    with created as (
      insert into job_documents (id, lead_id, template_id, title, kind, response, body, status, created_by)
      select ${randomUUID()}, id, ${input.templateId}, ${input.title}, ${input.kind}, ${input.response}, ${input.body}, 'draft', ${input.actor}
      from leads where id = ${input.leadId}
      returning id, lead_id, title
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'document', 'Drafted "' || title || '"' from created
    )
    select id from created`;
  return (rows[0]?.id as string | undefined) ?? null;
}

/** Spec §4: a sent or completed document can't be edited. Saves are not logged: they are drafts. */
export async function updateDraft(input: { leadId: string; documentId: string; title: string; body: string }): Promise<boolean> {
  if (!isUuid(input.leadId) || !isUuid(input.documentId)) return false;
  const rows = await db()`
    update job_documents set title = ${input.title}, body = ${input.body}, updated_at = now()
    where id = ${input.documentId} and lead_id = ${input.leadId} and status = 'draft'
    returning id`;
  return rows.length > 0;
}

export async function discardDraft(leadId: string, documentId: string, actor: string): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(documentId)) return false;
  const rows = await db()`
    with removed as (
      delete from job_documents where id = ${documentId} and lead_id = ${leadId} and status = 'draft'
      returning lead_id, title
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'document', 'Discarded draft "' || title || '"' from removed
    )
    select lead_id from removed`;
  return rows.length > 0;
}

/**
 * Spec §6 step 3, one statement: the draft becomes sent (completed for a view document, which has
 * nothing to wait for), names its PDF, the PDF is shared, and the event is logged.
 *
 * Every blocker is re-checked where it is stored: still a draft; the title and body are exactly
 * the ones the PDF was rendered from (an edit saved in another tab after the render refuses the
 * send rather than leaving a PDF that differs from the record); no `{{…}}` marker, using the
 * same pattern the app uses; the job is not Lost and has an email; the file is this job's.
 */
export async function markSent(input: {
  leadId: string; documentId: string; fileId: string; title: string; body: string; actor: string;
}): Promise<boolean> {
  if (!isUuid(input.leadId) || !isUuid(input.documentId) || !isUuid(input.fileId)) return false;
  const rows = await db()`
    with sent as (
      update job_documents
      set status = case when response = 'view' then 'completed' else 'sent' end,
        file_id = ${input.fileId}, sent_at = now(), sent_by = ${input.actor},
        completed_at = case when response = 'view' then now() else null end,
        updated_at = now()
      where id = ${input.documentId} and lead_id = ${input.leadId} and status = 'draft'
        and title = ${input.title} and body = ${input.body}
        and body !~ ${MARKER_SOURCE}
        and exists (select 1 from leads where id = ${input.leadId} and status <> 'lost' and nullif(trim(email), '') is not null)
        and exists (select 1 from job_files where id = ${input.fileId} and lead_id = ${input.leadId})
      returning lead_id, title
    ),
    shared as (
      update job_files set shared_at = now() where id = ${input.fileId} and lead_id = ${input.leadId} and exists (select 1 from sent)
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'document', 'Sent "' || title || '"' from sent
    )
    select lead_id from sent`;
  return rows.length > 0;
}

/**
 * Spec §6: withdraws a sent document before it is answered. Refused once completed, and refused
 * while any signature or acknowledgement names its file, so a void racing the client's answer
 * can never unshare an answered document.
 */
export async function voidDocument(leadId: string, documentId: string, actor: string): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(documentId)) return false;
  const rows = await db()`
    with voided as (
      update job_documents set status = 'void', voided_at = now(), updated_at = now()
      where id = ${documentId} and lead_id = ${leadId} and status = 'sent'
        and not exists (select 1 from document_acknowledgements a where a.file_id = job_documents.file_id)
        and not exists (select 1 from contract_signatures s where s.file_id = job_documents.file_id)
      returning lead_id, file_id, title
    ),
    unshared as (
      update job_files set shared_at = null where id = (select file_id from voided) and lead_id = ${leadId}
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'document', 'Voided "' || title || '"' from voided
    )
    select file_id from voided`;
  return rows.length > 0;
}
```

- [ ] **Step 8: Run both store tests**

Run: `npx vitest run --maxWorkers=2 tests/docs/templates.test.ts tests/docs/job-documents.test.ts`
Expected: PASS. (These prove SQL text only; Task 21 proves the SQL against the real database.)

- [ ] **Step 9: Commit**

```bash
git add lib/docs/templates.ts lib/docs/job-documents.ts tests/docs/templates.test.ts tests/docs/job-documents.test.ts
git commit -m "feat: template and job document stores, one statement per send, void and discard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 7: Acknowledgement store, and signing completes a sign document

**Files:**
- Create: `lib/portal/acknowledge-document.ts`
- Modify: `lib/portal/sign.ts` (`recordSignature`'s statement and its doc comment)
- Test: `tests/portal/acknowledge-document.test.ts` (new), `tests/portal/sign.test.ts` (add one case)

**Interfaces:**
- Consumes: `readFile`, `toFile`, `JobFile` from `lib/admin/files.ts`; `isUuid` from `lib/admin/ids.ts`; `db`. Tables from Task 5.
- Produces:
  - `type AcknowledgeableDocument = { id: string; title: string; file: JobFile }` (`id` is the job document's id)
  - `type Acknowledgement = { id: string; leadId: string; fileId: string; acknowledgedName: string; acknowledgedEmail: string; acknowledgedAt: Date; docSha256: string }`
  - `type AckRecordResult = "acknowledged" | "already-acknowledged" | "not-found" | "invalid"`
  - `acknowledgeableDocuments(leadId: string): Promise<AcknowledgeableDocument[]>` — the ONE helper both the page and the action use.
  - `acknowledgementFor(fileId: string): Promise<Acknowledgement | null>`
  - `recordAcknowledgement(input: { jobId: string; document: AcknowledgeableDocument; name: string; email: string; ip: string | null; userAgent: string | null }): Promise<AckRecordResult>` — does NOT check ownership; the caller must.
  - `recordSignature` (unchanged signature) now also sets a `sent` sign job document naming the signed file to `completed` in the same statement.

- [ ] **Step 1: Write the failing acknowledgement test**

`tests/portal/acknowledge-document.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => query }));
const readFile = vi.fn();
vi.mock("@/lib/admin/files", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/files")>("@/lib/admin/files");
  return { toFile: actual.toFile, readFile };
});
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));

const { acknowledgeableDocuments, acknowledgementFor, recordAcknowledgement } = await import("@/lib/portal/acknowledge-document");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
// The known SHA-256 of the ASCII bytes "pdf bytes".
const PDF_BYTES_SHA256 = "d1cb546b102fab8362de413fdacc187b05be10df72b72db3b3e50b4953f6a555";
const file = { id: FILE, leadId: JOB, createdAt: new Date(), uploadedBy: "o", kind: "document" as const, name: "SA.pdf",
  contentType: "application/pdf", sizeBytes: 9, blobPathname: `jobs/${JOB}/x`, sharedAt: new Date(), docType: "other" as const };
const document = { id: DOC, title: "Service agreement — PSS-1048", file };
const input = { jobId: JOB, document, name: "  Jane Doe ", email: "jane@example.com", ip: "1.2.3.4", userAgent: "UA" };

beforeEach(() => {
  query.mockReset();
  // A fresh stream per call: a test that records twice would otherwise read a consumed body.
  readFile.mockReset().mockImplementation(async () => ({ stream: new Response("pdf bytes").body, contentType: "application/pdf" }));
});

describe("acknowledgeableDocuments", () => {
  it("lists sent, shared, unanswered acknowledge documents of this job only", async () => {
    query.mockResolvedValueOnce([{ document_id: DOC, title: "SA", id: FILE, lead_id: JOB, created_at: new Date().toISOString(),
      uploaded_by: "o", kind: "document", name: "SA.pdf", content_type: "application/pdf", size_bytes: 9,
      blob_pathname: "p", shared_at: new Date().toISOString(), doc_type: "other" }]);
    const [doc] = await acknowledgeableDocuments(JOB);
    expect(doc).toMatchObject({ id: DOC, title: "SA", file: { id: FILE, leadId: JOB, name: "SA.pdf" } });
    const s = text(query.mock.calls[0]);
    for (const part of ["d.lead_id = ?", "f.lead_id = ?", "d.response = 'acknowledge'", "d.status = 'sent'", "f.shared_at is not null",
      "not exists (select 1 from document_acknowledgements a where a.file_id = f.id)"]) expect(s).toContain(part);
  });
  it("never queries for a malformed job id", async () => {
    expect(await acknowledgeableDocuments("nope")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("recordAcknowledgement", () => {
  it("fingerprints the bytes served and writes record, completion and event in ONE statement", async () => {
    query.mockResolvedValueOnce([{ file_id: FILE }]);
    expect(await recordAcknowledgement(input)).toBe("acknowledged");
    expect(query).toHaveBeenCalledTimes(1);
    const s = text(query.mock.calls[0]);
    for (const part of [
      "insert into document_acknowledgements",
      "d.response = 'acknowledge' and d.status = 'sent' and f.shared_at is not null",
      "on conflict (file_id) do nothing",
      "update job_documents set status = 'completed', completed_at = now()",
      "insert into job_events", "'document'",
    ]) expect(s).toContain(part);
    const values = query.mock.calls[0].slice(1);
    expect(values.slice(1, 8)).toEqual([JOB, FILE, "Jane Doe", "jane@example.com", "1.2.3.4", "UA", PDF_BYTES_SHA256]);
    expect(values.at(-1)).toBe('Acknowledged "Service agreement — PSS-1048" from their project page');
    // The typed name is data only: never in the permanent timeline sentence.
    expect(values.filter((v) => String(v).includes("Jane Doe"))).toEqual(["Jane Doe"]);
  });
  it("refuses a blank name without touching the database", async () => {
    expect(await recordAcknowledgement({ ...input, name: "  " })).toBe("invalid");
    expect(query).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });
  it("answers not-found when the bytes cannot be read", async () => {
    readFile.mockResolvedValue(null);
    expect(await recordAcknowledgement(input)).toBe("not-found");
    expect(query).not.toHaveBeenCalled();
  });
  it("tells a repeat (this job's own record exists) from a refusal", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "a", lead_id: JOB, file_id: FILE, acknowledged_name: "J",
      acknowledged_email: "j@x", acknowledged_at: new Date().toISOString(), doc_sha256: "s" }]);
    expect(await recordAcknowledgement(input)).toBe("already-acknowledged");
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await recordAcknowledgement(input)).toBe("not-found");
  });
  it("never reports another job's record as this job's repeat", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "a", lead_id: "99999999-9999-4999-8999-999999999999", file_id: FILE,
      acknowledged_name: "J", acknowledged_email: "j@x", acknowledged_at: new Date().toISOString(), doc_sha256: "s" }]);
    expect(await recordAcknowledgement(input)).toBe("not-found");
  });
});

describe("acknowledgementFor", () => {
  it("maps the row and refuses a malformed id without a query", async () => {
    expect(await acknowledgementFor("x")).toBeNull();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValueOnce([{ id: "a", lead_id: JOB, file_id: FILE, acknowledged_name: "J", acknowledged_email: "j@x",
      acknowledged_at: "2026-09-28T18:00:00Z", doc_sha256: "s" }]);
    expect(await acknowledgementFor(FILE)).toEqual({ id: "a", leadId: JOB, fileId: FILE, acknowledgedName: "J",
      acknowledgedEmail: "j@x", acknowledgedAt: new Date("2026-09-28T18:00:00Z"), docSha256: "s" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/portal/acknowledge-document.test.ts`
Expected: FAIL, cannot resolve `@/lib/portal/acknowledge-document`.

- [ ] **Step 3: Write `lib/portal/acknowledge-document.ts`**

```ts
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile, toFile, type JobFile } from "@/lib/admin/files";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";

/** `id` is the job document; `file` is its shared PDF, the thing acknowledged. */
export type AcknowledgeableDocument = { id: string; title: string; file: JobFile };

export type Acknowledgement = {
  id: string; leadId: string; fileId: string; acknowledgedName: string; acknowledgedEmail: string;
  acknowledgedAt: Date; docSha256: string;
};

/** "already-acknowledged" is internal: nothing was written, so the caller must not email again. */
export type AckRecordResult = "acknowledged" | "already-acknowledged" | "not-found" | "invalid";

const toAcknowledgement = (row: Record<string, unknown>): Acknowledgement => ({
  id: row.id as string,
  leadId: row.lead_id as string,
  fileId: row.file_id as string,
  acknowledgedName: row.acknowledged_name as string,
  acknowledgedEmail: row.acknowledged_email as string,
  acknowledgedAt: new Date(row.acknowledged_at as string),
  docSha256: row.doc_sha256 as string,
});

/**
 * The documents this job can still be asked to acknowledge. ONE helper, used by both the page and
 * the action, exactly as signableContracts is, so the control the page shows and the post the
 * action accepts cannot drift apart. File columns are named, never starred: this feeds the portal.
 */
export async function acknowledgeableDocuments(leadId: string): Promise<AcknowledgeableDocument[]> {
  if (!isUuid(leadId)) return [];
  const rows = await db()`
    select d.id as document_id, d.title,
           f.id, f.lead_id, f.created_at, f.uploaded_by, f.kind, f.name, f.content_type, f.size_bytes,
           f.blob_pathname, f.shared_at, f.doc_type
    from job_documents d join job_files f on f.id = d.file_id
    where d.lead_id = ${leadId} and f.lead_id = ${leadId}
      and d.response = 'acknowledge' and d.status = 'sent' and f.shared_at is not null
      and not exists (select 1 from document_acknowledgements a where a.file_id = f.id)
    order by d.sent_at`;
  return rows.map((row) => ({
    id: row.document_id as string,
    title: row.title as string,
    file: toFile(row as Record<string, unknown>),
  }));
}

export async function acknowledgementFor(fileId: string): Promise<Acknowledgement | null> {
  if (!isUuid(fileId)) return null;
  const rows = await db()`select * from document_acknowledgements where file_id = ${fileId}`;
  return rows[0] ? toAcknowledgement(rows[0] as Record<string, unknown>) : null;
}

/**
 * Records one acknowledgement (spec §7). Does NOT check ownership: every caller first re-derives
 * the customer's jobs from the session and the document from acknowledgeableDocuments.
 *
 * The fingerprint is of the bytes actually served. One statement writes the record, completes
 * the document and logs the event; the insert happens only while the document is still a sent,
 * shared acknowledge document of this job (a void that won the race leaves nothing to write), and
 * `on conflict do nothing` makes a second submission a no-op. The timeline names the document,
 * never the typed name.
 */
export async function recordAcknowledgement(input: {
  jobId: string; document: AcknowledgeableDocument; name: string; email: string; ip: string | null; userAgent: string | null;
}): Promise<AckRecordResult> {
  const name = input.name.trim();
  if (!name) return "invalid";
  const stored = await readFile(input.document.file);
  if (!stored) return "not-found";
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileId = input.document.file.id;

  const rows = await db()`
    with acked as (
      insert into document_acknowledgements (id, lead_id, file_id, acknowledged_name, acknowledged_email, ip, user_agent, doc_sha256)
      select ${randomUUID()}, ${input.jobId}, ${fileId}, ${name}, ${input.email}, ${input.ip}, ${input.userAgent}, ${sha256}
      where exists (
        select 1 from job_documents d join job_files f on f.id = d.file_id
        where d.id = ${input.document.id} and d.lead_id = ${input.jobId} and d.file_id = ${fileId}
          and d.response = 'acknowledge' and d.status = 'sent' and f.shared_at is not null
      )
      on conflict (file_id) do nothing
      returning lead_id, file_id
    ),
    completed as (
      update job_documents set status = 'completed', completed_at = now(), updated_at = now()
      where id = ${input.document.id} and file_id = (select file_id from acked) and status = 'sent'
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.email}, 'document', ${`Acknowledged "${input.document.title}" from their project page`} from acked
    )
    select file_id from acked`;
  if (rows.length > 0) return "acknowledged";
  const existing = await acknowledgementFor(fileId);
  return existing && existing.leadId === input.jobId ? "already-acknowledged" : "not-found";
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run --maxWorkers=2 tests/portal/acknowledge-document.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the failing signing case**

In `tests/portal/sign.test.ts`, inside `describe("recordSignature", …)` (after the test named "in the SAME statement, marks a generated contract's version signed and moves the job to Sold"), add:

```ts
  it("in the SAME statement, completes a sent sign document whose PDF this is", async () => {
    vi.mocked(readFile).mockResolvedValue({ stream: new Response("pdf bytes").body!, contentType: "application/pdf" });
    query.mockResolvedValue([{ id: "sig" }]);
    await recordSignature({ jobId: JOB, file: doc(FILE, "Change order.pdf", "contract"), name: "Jane Doe", email: "jane@example.com", ip: null, userAgent: null });
    const s = (query.mock.calls[0][0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
    expect(s).toContain("update job_documents set status = 'completed', completed_at = now(), updated_at = now()");
    expect(s).toContain("where file_id = (select file_id from signed) and lead_id = (select lead_id from signed) and status = 'sent' and response = 'sign'");
    // The event body is still the statement's last value: the new CTE binds nothing.
    expect(query.mock.calls[0].slice(1).at(-1)).toBe('Signed "Change order.pdf" from their project page');
  });
```

Before writing it, read the existing tests at lines 76-125 of `tests/portal/sign.test.ts` and match how they mock `readFile` (they use `vi.mocked(readFile)`); adjust only the mocking lines if that file uses a helper.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/portal/sign.test.ts`
Expected: FAIL on the new case ("update job_documents" not found).

- [ ] **Step 7: Add the CTE to `recordSignature` in `lib/portal/sign.ts`**

Insert this CTE between `stage_logged` and `logged` (it binds no values, so `logged`'s body stays the last bind):

```sql
    document as (
      update job_documents set status = 'completed', completed_at = now(), updated_at = now()
      where file_id = (select file_id from signed) and lead_id = (select lead_id from signed)
        and status = 'sent' and response = 'sign'
      returning id
    ),
```

Append to `recordSignature`'s doc comment:

```ts
 * A sign job document (lib/docs/job-documents.ts) whose PDF is this file, still 'sent', becomes
 * 'completed' in the same statement. A contract or a hand-uploaded file matches no document.
```

- [ ] **Step 8: Run the portal store tests**

Run: `npx vitest run --maxWorkers=2 tests/portal/sign.test.ts tests/portal/acknowledge-document.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/portal/acknowledge-document.ts lib/portal/sign.ts tests/portal/acknowledge-document.test.ts tests/portal/sign.test.ts
git commit -m "feat: record a client's acknowledgement in one statement, and signing completes a sign document

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 8: Files a document names are frozen and managed from the Documents tab

**Files:**
- Modify: `lib/admin/files.ts` (`JobFile`, `toFile`, `listFiles`, `deleteFile`, `setShared`, `setDocType`)
- Modify: `app/admin/jobs/[id]/JobFiles.tsx` (a label in place of the controls)
- Test: `tests/admin/files-job-documents.test.ts` (new), `tests/admin/job-files-share.test.tsx` (add one case)

**Interfaces:**
- Consumes: tables from Task 5.
- Produces:
  - `JobFile.jobDocument?: boolean` — true when a `job_documents` row names the file; computed only by `listFiles`, `undefined` elsewhere.
  - `deleteFile`, `setDocType`: refuse (answer false) any file a job document or an acknowledgement names.
  - `setShared`: refuses any file a job document names, in BOTH directions (sharing is Send's, unsharing is Void's), and refuses unsharing an acknowledged file.
  - `JobFiles` shows `Document · managed from the Documents tab` in place of type, share and delete controls on such a file.

- [ ] **Step 1: Write the failing test**

`tests/admin/files-job-documents.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn().mockResolvedValue(undefined), get: vi.fn() }));
const files = await import("@/lib/admin/files");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const NAMED_BY_DOCUMENT = "not exists ( select 1 from job_documents d where d.file_id = job_files.id )";
const ACKNOWLEDGED = "not exists ( select 1 from document_acknowledgements a where a.file_id = job_files.id )";

beforeEach(() => sql.mockReset().mockResolvedValue([]));

describe("files a job document names", () => {
  it("listFiles marks them, and toFile leaves the flag undefined when not computed", async () => {
    sql.mockResolvedValueOnce([{ id: FILE, lead_id: JOB, created_at: new Date().toISOString(), size_bytes: 1, job_document: true }]);
    const [file] = await files.listFiles(JOB);
    expect(file.jobDocument).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("exists ( select 1 from job_documents d where d.file_id = job_files.id ) as job_document");
    expect(files.toFile({ id: FILE, size_bytes: 1 }).jobDocument).toBeUndefined();
  });
  it("deleteFile refuses them and acknowledged files, keeping the older guards", async () => {
    expect(await files.deleteFile(FILE, "o")).toBe(false);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain(NAMED_BY_DOCUMENT);
    expect(s).toContain(ACKNOWLEDGED);
    expect(s).toContain("select 1 from contract_signatures s");
    expect(s).toContain("select 1 from dc_quote_versions v");
  });
  it("setDocType refuses them and acknowledged files", async () => {
    await files.setDocType(JOB, FILE, "other", "o");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain(`and ${NAMED_BY_DOCUMENT}`);
    expect(s).toContain(`and ${ACKNOWLEDGED}`);
  });
  it("setShared refuses them in both directions, and never unshares an acknowledged file", async () => {
    for (const shared of [true, false]) {
      sql.mockClear();
      await files.setShared(JOB, FILE, shared, "o");
      const s = text(sql.mock.calls[0]);
      expect(s).toContain(`and ${NAMED_BY_DOCUMENT}`);
      expect(s).toContain(`and (? or ${ACKNOWLEDGED})`);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/files-job-documents.test.ts`
Expected: FAIL (no `job_document`, no new clauses).

- [ ] **Step 3: Change `lib/admin/files.ts`**

Add to `JobFile` after `quoteContract`:

```ts
  /**
   * True when a job document (lib/docs/job-documents.ts) names this file as its PDF. Only
   * listFiles computes it. Such a file is managed from the Documents tab: sharing is Send's,
   * unsharing is Void's, and setShared, setDocType and deleteFile refuse it.
   */
  jobDocument?: boolean;
```

Add to `toFile` after `quoteContract`:

```ts
    jobDocument: "job_document" in row ? row.job_document === true : undefined,
```

In `listFiles`, extend the select list after `as quote_contract`:

```sql
    ) as quote_contract, exists (
      select 1 from job_documents d where d.file_id = job_files.id
    ) as job_document
```

In `deleteFile`, after the `dc_quote_versions` `not exists (...)` clause and before `returning`, append (after the existing clauses, so the order the older tests read is unchanged):

```sql
        and not exists (
          select 1 from job_documents d where d.file_id = job_files.id
        )
        and not exists (
          select 1 from document_acknowledgements a where a.file_id = job_files.id
        )
```

In `setShared`, after the superseded-contract clause and before `returning`, append:

```sql
        and not exists (
          select 1 from job_documents d where d.file_id = job_files.id
        )
        and (${shared} or not exists (
          select 1 from document_acknowledgements a where a.file_id = job_files.id
        ))
```

In `setDocType`, after the `dc_quote_versions` clause and before `returning`, append:

```sql
        and not exists (
          select 1 from job_documents d where d.file_id = job_files.id
        )
        and not exists (
          select 1 from document_acknowledgements a where a.file_id = job_files.id
        )
```

Add one sentence to each of the three functions' doc comments: `A file a job document names, and an acknowledged file, are refused the same way (spec §4 Freezing): job_documents.file_id has no on-delete action, so without the clause a delete would raise instead of returning false.` (for `deleteFile`), and the equivalent "is managed from the Documents tab" sentence for `setShared` and `setDocType`.

- [ ] **Step 4: Label such a file in `JobFiles.tsx`**

Add below `QuoteContractLabel`:

```tsx
/**
 * Shown in place of the type, share and delete controls on a job document's PDF. Sending shares
 * it and Void unshares it, both on the Documents tab; the server refuses the Files-tab controls.
 */
function JobDocumentLabel() {
  return <span className="text-sm text-ink-soft">Document · managed from the Documents tab</span>;
}
```

and change the uploads row's condition to:

```tsx
{file.docType === "dealer_copy" ? <DealerCopyLabel /> : file.signed ? <SignedLabel /> : file.quoteContract ? <QuoteContractLabel /> : file.jobDocument ? <JobDocumentLabel /> : (
```

- [ ] **Step 5: Add the UI case to `tests/admin/job-files-share.test.tsx`**

After the existing `quoteContract` case (line ~146), add, reusing that file's `file(...)` helper and render pattern:

```tsx
  it("offers no type, share or delete control on a job document's PDF", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={[{ ...file("docpdf", "document", new Date(), "Service agreement — PSS-1048.pdf", null), jobDocument: true }]} />);
    const row = screen.getByText("Service agreement — PSS-1048.pdf").closest("li")!;
    expect(within(row).getByText("Document · managed from the Documents tab")).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(within(row).queryByRole("combobox")).toBeNull();
  });
```

Read the top of `tests/admin/job-files-share.test.tsx` first and use its exact `JOB` constant name, `file` helper signature and imports (`within`, `screen`); add `within` to the import if it is missing.

- [ ] **Step 6: Run the admin file tests**

Run: `npx vitest run --maxWorkers=2 tests/admin/files-job-documents.test.ts tests/admin/job-files-share.test.tsx tests/admin/files.test.ts tests/admin/file-sharing.test.ts tests/admin/files-dealer-copy.test.ts`
Expected: PASS. `file-sharing.test.ts` evaluates the first `not exists` clause of each statement; the new clauses come after the old ones, so it still reads the signature guard. If it fails, the new clauses were inserted before the old ones: move them after.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/files.ts "app/admin/jobs/[id]/JobFiles.tsx" tests/admin/files-job-documents.test.ts tests/admin/job-files-share.test.tsx
git commit -m "feat: a document's PDF and an acknowledged file are managed only from the Documents tab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---
### Task 9: PDF renderer (shared wrapping, `renderBlocks`, `buildDocumentPdf`)

**Files:**
- Create: `lib/pdf/text.ts` (moves `breakWord` and `wrap` out of `lib/dc/contract-pdf.ts`, adds `wrapRuns`)
- Modify: `lib/dc/contract-pdf.ts` (delete its private `LETTER`, `MARGIN`, `breakWord`, `wrap`; import them) — no behaviour change
- Create: `lib/docs/pdf.ts`
- Test: `tests/pdf/text.test.ts`, `tests/docs/pdf.test.ts`

**Interfaces:**
- Consumes: `Block`, `Inline` from `lib/docs/types.ts`; `DocResponse` from `lib/docs/kinds.ts`; `winAnsiSafe` from `lib/dc/contract-layout.ts`; `formatShortDate` from `lib/admin/time.ts`; `business`.
- Produces:
  - `lib/pdf/text.ts`: `LETTER: [number, number]` (= `[612, 792]`), `MARGIN = 54`, `breakWord(word: string, font: PDFFont, size: number, width: number): string[]`, `wrap(text: string, font: PDFFont, size: number, width: number): string[]`, `type Seg = { text: string; bold: boolean }`, `type Fonts = { regular: PDFFont; bold: PDFFont }`, `wrapRuns(runs: Seg[], fonts: Fonts, size: number, width: number): Seg[][]`.
  - `lib/docs/pdf.ts` (server-only): `type PdfPen = { doc: PDFDocument; page: PDFPage; y: number; regular: PDFFont; bold: PDFFont }` (mutable: `renderBlocks` moves `page` and `y`), `renderBlocks(pen: PdfPen, blocks: Block[]): void`, `SIGN_CLOSING = "Signed electronically on the client's project page."`, `type DocumentPdfInput = { title: string; projectNo: string | null; date: Date; client: { name: string; address: string | null; city: string; email: string | null }; blocks: Block[]; response: DocResponse }`, `buildDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array>`.
  - The renderer depends only on the block TYPES; callers parse (`parseDocText`) and pass blocks in.

- [ ] **Step 1: Write the failing wrapping test**

`tests/pdf/text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { LETTER, MARGIN, breakWord, wrap, wrapRuns, type Fonts, type Seg } from "@/lib/pdf/text";

async function fonts(): Promise<Fonts> {
  const doc = await PDFDocument.create();
  return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}
const widthOf = (f: Fonts, line: Seg[], size: number) =>
  line.reduce((sum, s) => sum + (s.bold ? f.bold : f.regular).widthOfTextAtSize(s.text, size), 0);
const plain = (lines: Seg[][]) => lines.map((line) => line.map((s) => s.text).join(""));

describe("page geometry and the moved helpers", () => {
  it("keeps the contract's letter page and margin", () => {
    expect(LETTER).toEqual([612, 792]);
    expect(MARGIN).toBe(54);
  });
  it("wrap and breakWord behave as they did inside contract-pdf", async () => {
    const { regular } = await fonts();
    expect(wrap("", regular, 9, 100)).toEqual([""]);
    expect(wrap("a  b\nc", regular, 9, 1000)).toEqual(["a b c"]);
    const pieces = breakWord("W".repeat(50), regular, 9, 60);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(regular.widthOfTextAtSize(piece, 9)).toBeLessThanOrEqual(60);
  });
});

describe("wrapRuns", () => {
  it("keeps punctuation glued to a bold word; a space is bold only between bold words", async () => {
    const f = await fonts();
    expect(wrapRuns([{ text: "Pay ", bold: false }, { text: "50%", bold: true }, { text: ", now.", bold: false }], f, 10, 500))
      .toEqual([[{ text: "Pay ", bold: false }, { text: "50%", bold: true }, { text: ", now.", bold: false }]]);
  });
  it("keeps a bold phrase in one segment", async () => {
    const f = await fonts();
    expect(wrapRuns([{ text: "within ", bold: false }, { text: "3 business days", bold: true }, { text: " of signing.", bold: false }], f, 10, 500))
      .toEqual([[{ text: "within ", bold: false }, { text: "3 business days", bold: true }, { text: " of signing.", bold: false }]]);
  });
  it("breaks at the width, never over it, losing no word", async () => {
    const f = await fonts();
    const runs = Array.from({ length: 60 }, (_, i) => ({ text: `word${i} `, bold: i % 3 === 0 }));
    const lines = wrapRuns(runs, f, 10, 200);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(widthOf(f, line, 10)).toBeLessThanOrEqual(200);
    expect(plain(lines).join(" ")).toBe(Array.from({ length: 60 }, (_, i) => `word${i}`).join(" "));
  });
  it("splits a word wider than the line", async () => {
    const f = await fonts();
    const lines = wrapRuns([{ text: "X".repeat(200), bold: true }], f, 10, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(widthOf(f, line, 10)).toBeLessThanOrEqual(100);
    expect(plain(lines).join("")).toBe("X".repeat(200));
  });
  it("collapses whitespace and maps what WinAnsi cannot encode", async () => {
    const f = await fonts();
    expect(plain(wrapRuns([{ text: "a\n\tb → 日", bold: false }], f, 10, 500))).toEqual(["a b ? ?"]);
  });
  it("answers one empty line for no text", async () => expect(wrapRuns([], await fonts(), 10, 100)).toEqual([[]]));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/pdf/text.test.ts`
Expected: FAIL, cannot resolve `@/lib/pdf/text`.

- [ ] **Step 3: Write `lib/pdf/text.ts`**

```ts
import type { PDFFont } from "pdf-lib";
import { winAnsiSafe } from "@/lib/dc/contract-layout";

/** US Letter in points, and the margin the contract uses. Shared so terms pages match contract pages. */
export const LETTER: [number, number] = [612, 792];
export const MARGIN = 54;

/** Splits one word wider than `width` into pieces that fit, so it cannot run into the next column. */
export function breakWord(word: string, font: PDFFont, size: number, width: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const ch of word) {
    if (piece && font.widthOfTextAtSize(piece + ch, size) > width) { pieces.push(piece); piece = ch; } else piece += ch;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = winAnsiSafe(text).split(/\s+/).filter(Boolean).flatMap((word) => breakWord(word, font, size, width));
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export type Seg = { text: string; bold: boolean };
export type Fonts = { regular: PDFFont; bold: PDFFont };
type Word = { segs: Seg[]; spaceBefore: boolean };

/**
 * `wrap` for mixed-weight text. A "word" is everything between spaces, so "**Bold**," stays one
 * word of two weights and never gains a space. Every piece passes through winAnsiSafe here, so
 * the widths measured are the widths drawn. A word wider than the line is broken with breakWord.
 * Returns lines of segments; adjacent segments of one weight are merged.
 */
export function wrapRuns(runs: Seg[], fonts: Fonts, size: number, width: number): Seg[][] {
  const fontOf = (bold: boolean) => (bold ? fonts.bold : fonts.regular);
  const widthOf = (segs: Seg[]) => segs.reduce((sum, s) => sum + fontOf(s.bold).widthOfTextAtSize(s.text, size), 0);

  const words: Word[] = [];
  let gap = false;
  for (const run of runs) {
    for (const part of winAnsiSafe(run.text).split(/( )/)) {
      if (part === "") continue;
      if (part === " ") { gap = true; continue; }
      const last = words[words.length - 1];
      if (last && !gap) last.segs.push({ text: part, bold: run.bold });
      else words.push({ segs: [{ text: part, bold: run.bold }], spaceBefore: words.length > 0 });
      gap = false;
    }
  }

  const fitted = words.flatMap((word): Word[] => {
    if (widthOf(word.segs) <= width) return [word];
    const pieces: Word[] = word.segs.flatMap((seg) =>
      breakWord(seg.text, fontOf(seg.bold), size, width).map((text) => ({ segs: [{ text, bold: seg.bold }], spaceBefore: false })));
    pieces[0].spaceBefore = word.spaceBefore;
    return pieces;
  });

  const lines: Seg[][] = [];
  let line: Seg[] = [];
  let used = 0;
  const append = (segs: Seg[]) => {
    for (const seg of segs) {
      const prev = line[line.length - 1];
      if (prev && prev.bold === seg.bold) prev.text += seg.text;
      else line.push({ ...seg });
    }
  };
  for (const word of fitted) {
    // A space is bold only between two bold words, so "**3 business days**" stays one bold
    // segment while "Pay **50%** now" draws "Pay " and " now" regular around a bold "50%".
    const space: Seg[] = line.length > 0 && word.spaceBefore
      ? [{ text: " ", bold: line[line.length - 1].bold && word.segs[0].bold }]
      : [];
    const needed = widthOf([...space, ...word.segs]);
    if (line.length > 0 && used + needed > width) {
      lines.push(line);
      line = [];
      append(word.segs);
      used = widthOf(word.segs);
      continue;
    }
    append([...space, ...word.segs]);
    used += needed;
  }
  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [[]];
}
```

- [ ] **Step 4: Swap `lib/dc/contract-pdf.ts` onto the shared helpers**

Delete its `LETTER`, `MARGIN`, `breakWord` and `wrap` definitions (lines 7-8 and 10-32), drop `type PDFFont` from its `pdf-lib` import (nothing in the file uses it any more, and lint fails on an unused import), and add `import { LETTER, MARGIN, wrap } from "@/lib/pdf/text";`. `COLS` stays (it reads `MARGIN`). Nothing else changes in this task.

- [ ] **Step 5: Run the wrapping and contract tests**

Run: `npx vitest run --maxWorkers=2 tests/pdf/text.test.ts tests/dc/contract.test.ts`
Expected: PASS (the contract tests prove the move changed nothing).

- [ ] **Step 6: Write the failing renderer test**

`tests/docs/pdf.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { business } from "@/content/business";
import { SIGN_CLOSING, buildDocumentPdf, type DocumentPdfInput } from "@/lib/docs/pdf";
import type { Block, Inline } from "@/lib/docs/types";

/** Every string drawn, with where and in which font, captured before pdf-lib encodes it. */
function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number; font: string }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, font: options?.font?.name ?? "" });
    return original.call(this, text, options);
  });
  return drawn;
}
afterEach(() => vi.restoreAllMocks());

const t = (text: string, bold = false): Inline => ({ type: "text", text, bold });
const input = (blocks: Block[], response: DocumentPdfInput["response"] = "acknowledge"): DocumentPdfInput => ({
  title: "Service agreement — PSS-1048", projectNo: "PSS-1048", date: new Date("2026-09-28T19:00:00Z"),
  client: { name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "maria@example.com" }, blocks, response,
});

describe("buildDocumentPdf", () => {
  it("draws the company header, title, date, client block and body", async () => {
    const drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "heading", level: 2, inlines: [t("Scope")] }, { type: "paragraph", inlines: [t("Two shades.")] }]));
    const texts = drawn.map((d) => d.text);
    for (const expected of [business.legalName, "Service agreement - PSS-1048", "Sep 28, 2026", "Maria Lopez", "12 Palm Way",
      "Henderson", "maria@example.com", "Project PSS-1048", "Scope", "Two shades."]) expect(texts).toContain(expected);
    expect(drawn.find((d) => d.text === "Scope")!.font).toBe("Helvetica-Bold");
  });
  it("draws bold runs in the bold font and plain runs in the regular one", async () => {
    const drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Pay "), t("50%", true), t(" now.")] }]));
    expect(drawn.find((d) => d.text === "50%")).toMatchObject({ font: "Helvetica-Bold" });
    expect(drawn.find((d) => d.text === "Pay ")).toMatchObject({ font: "Helvetica" });
  });
  it("draws a marker that is still a marker literally", async () => {
    const drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Deposit "), { type: "field", key: "deposit", bold: false }] }]));
    expect(drawn.map((d) => d.text)).toContain("Deposit {{deposit}}");
  });
  it("wraps a bullet with a hanging indent", async () => {
    const drawn = spyOnDrawText();
    const long = "Give us clear access to every window, with furniture and fragile items moved away from the glass and the frames.";
    await buildDocumentPdf(input([{ type: "bullets", items: [[t(long)]] }]));
    const bullets = drawn.filter((d) => d.text === "•");
    expect(bullets).toHaveLength(1);
    expect(bullets[0].x).toBe(54 + 4);
    const lines = drawn.filter((d) => long.includes(d.text) && d.text.length > 3);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.x).toBe(54 + 16);
    expect(lines[0].y).toBe(bullets[0].y);
  });
  it("breaks onto new pages instead of drawing below the margin", async () => {
    const drawn = spyOnDrawText();
    const blocks: Block[] = Array.from({ length: 120 }, (_, i) => ({ type: "paragraph", inlines: [t(`Paragraph ${i} of the agreement text.`)] }));
    const doc = await PDFDocument.load(await buildDocumentPdf(input(blocks)));
    expect(doc.getPageCount()).toBeGreaterThan(1);
    for (const { y, text } of drawn) expect(y, text).toBeGreaterThanOrEqual(54);
  });
  it("never throws on characters WinAnsi cannot encode, and draws only encodable text", async () => {
    const drawn = spyOnDrawText();
    const odd = "→ 日本 🙂 ✓ Zoë “quoted” ½″ ";
    const bytes = await buildDocumentPdf({ ...input([{ type: "heading", level: 3, inlines: [t(odd, true)] }, { type: "bullets", items: [[t(odd)]] }]),
      title: odd, client: { name: odd, address: odd, city: odd, email: odd } });
    expect(bytes.length).toBeGreaterThan(0);
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    for (const { text } of drawn) expect(() => font.encodeText(text), text).not.toThrow();
  });
  it("ends a sign document with the signing line, and only a sign document", async () => {
    let drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Body")] }], "sign"));
    expect(drawn.map((d) => d.text)).toContain(SIGN_CLOSING);
    vi.restoreAllMocks();
    drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Body")] }], "acknowledge"));
    expect(drawn.map((d) => d.text)).not.toContain(SIGN_CLOSING);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/pdf.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/pdf`.

- [ ] **Step 8: Write `lib/docs/pdf.ts`**

```ts
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { business } from "@/content/business";
import { formatShortDate } from "@/lib/admin/time";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { LETTER, MARGIN, wrapRuns, type Seg } from "@/lib/pdf/text";
import type { DocResponse } from "./kinds";
import type { Block, Inline } from "./types";

/** Where the next line goes. renderBlocks moves `page` and `y` as it draws. */
export type PdfPen = { doc: PDFDocument; page: PDFPage; y: number; regular: PDFFont; bold: PDFFont };

export const SIGN_CLOSING = "Signed electronically on the client's project page.";

const INK = rgb(0.1, 0.1, 0.1);
const BODY = 10;
const LEAD = 13;
const GAP = 6;
const BULLET_INDENT = 16;
const HEADING = { 2: { size: 13, lead: 17, before: 12 }, 3: { size: 11, lead: 14, before: 8 } } as const;
const WIDTH = LETTER[0] - 2 * MARGIN;

/** A field still in the text is drawn as its marker, so a preview shows exactly what is missing. */
const segsOf = (inlines: Inline[], forceBold = false): Seg[] =>
  inlines.map((inline) => ({ text: inline.type === "text" ? inline.text : `{{${inline.key}}}`, bold: forceBold || inline.bold }));

function ensure(pen: PdfPen, height: number): void {
  if (pen.y - height < MARGIN) {
    pen.page = pen.doc.addPage(LETTER);
    pen.y = LETTER[1] - MARGIN;
  }
}

/** Every string drawn passes through winAnsiSafe: the standard fonts throw on anything they cannot encode. */
function drawLine(pen: PdfPen, segs: Seg[], x: number, size: number): void {
  let cursor = x;
  for (const seg of segs) {
    const font = seg.bold ? pen.bold : pen.regular;
    const text = winAnsiSafe(seg.text);
    pen.page.drawText(text, { x: cursor, y: pen.y, size, font, color: INK });
    cursor += font.widthOfTextAtSize(text, size);
  }
}

function drawLines(pen: PdfPen, lines: Seg[][], x: number, size: number, lead: number): void {
  for (const line of lines) {
    ensure(pen, lead);
    drawLine(pen, line, x, size);
    pen.y -= lead;
  }
}

/** Draws doc-text blocks from the pen's position, adding pages as needed. Used for documents and contract terms. */
export function renderBlocks(pen: PdfPen, blocks: Block[]): void {
  const fonts = { regular: pen.regular, bold: pen.bold };
  blocks.forEach((block, index) => {
    if (block.type === "heading") {
      const style = HEADING[block.level];
      const lines = wrapRuns(segsOf(block.inlines, true), fonts, style.size, WIDTH);
      // A heading never sits alone at the foot of a page: it moves with room for a line of text.
      ensure(pen, style.before + lines.length * style.lead + LEAD);
      if (index > 0) pen.y -= style.before;
      drawLines(pen, lines, MARGIN, style.size, style.lead);
    } else if (block.type === "paragraph") {
      drawLines(pen, wrapRuns(segsOf(block.inlines), fonts, BODY, WIDTH), MARGIN, BODY, LEAD);
      pen.y -= GAP;
    } else {
      for (const item of block.items) {
        wrapRuns(segsOf(item), fonts, BODY, WIDTH - BULLET_INDENT).forEach((line, i) => {
          ensure(pen, LEAD);
          if (i === 0) drawLine(pen, [{ text: "•", bold: false }], MARGIN + 4, BODY);
          drawLine(pen, line, MARGIN + BULLET_INDENT, BODY);
          pen.y -= LEAD;
        });
      }
      pen.y -= GAP;
    }
  });
}

export type DocumentPdfInput = {
  title: string;
  projectNo: string | null;
  date: Date;
  client: { name: string; address: string | null; city: string; email: string | null };
  blocks: Block[];
  response: DocResponse;
};

/** A job document as a PDF (spec §6): company header, title and date, client block, body, signing line. */
export async function buildDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pen: PdfPen = { doc, page: doc.addPage(LETTER), y: LETTER[1] - MARGIN, regular, bold };
  const fonts = { regular, bold };

  drawLines(pen, [[{ text: business.legalName, bold: true }]], MARGIN, 14, 16);
  drawLines(pen, [[{ text: `${business.phone.display} · ${business.email}`, bold: false }]], MARGIN, 9, 12);
  pen.y -= 14;

  const date = winAnsiSafe(formatShortDate(input.date));
  const dateWidth = regular.widthOfTextAtSize(date, 10);
  pen.page.drawText(date, { x: LETTER[0] - MARGIN - dateWidth, y: pen.y, size: 10, font: regular, color: INK });
  drawLines(pen, wrapRuns([{ text: input.title, bold: true }], fonts, 16, WIDTH - dateWidth - 16), MARGIN, 16, 19);
  pen.y -= 6;

  drawLines(pen, wrapRuns([{ text: input.client.name, bold: true }], fonts, 11, WIDTH), MARGIN, 11, 13);
  const details = [input.client.address, input.client.city, input.client.email, input.projectNo ? `Project ${input.projectNo}` : null];
  for (const line of details) {
    if (line) drawLines(pen, wrapRuns([{ text: line, bold: false }], fonts, 10, WIDTH), MARGIN, 10, 12);
  }
  pen.y -= 14;

  renderBlocks(pen, input.blocks);
  if (input.response === "sign") {
    pen.y -= GAP;
    drawLines(pen, [[{ text: SIGN_CLOSING, bold: true }]], MARGIN, BODY, LEAD);
  }
  return doc.save();
}
```

- [ ] **Step 9: Run the renderer tests**

Run: `npx vitest run --maxWorkers=2 tests/docs/pdf.test.ts tests/pdf/text.test.ts tests/dc/contract.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/pdf/text.ts lib/dc/contract-pdf.ts lib/docs/pdf.ts tests/pdf/text.test.ts tests/docs/pdf.test.ts
git commit -m "feat: render doc text to PDF with the contract's wrapping and WinAnsi handling

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 10: React renderer

**Files:**
- Create: `components/docs/DocText.tsx`
- Test: `tests/docs/doc-text.test.tsx`

**Interfaces:**
- Consumes: `Block`, `Inline` from `lib/docs/types.ts`.
- Produces: `DocText({ blocks, highlightFields }: { blocks: Block[]; highlightFields?: boolean }): JSX.Element`. `##` renders as `<h3>`, `###` as `<h4>` (the page's own `<h2>` sits above it), paragraphs `<p>`, bullets `<ul><li>`, bold `<strong>`, a field `{{key}}` as text (inside `<mark>` when `highlightFields`). No hooks, no server imports: usable in server and client components.

- [ ] **Step 1: Write the failing test**

`tests/docs/doc-text.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocText } from "@/components/docs/DocText";
import type { Block, Inline } from "@/lib/docs/types";

const t = (text: string, bold = false): Inline => ({ type: "text", text, bold });

describe("DocText", () => {
  it("renders headings, paragraphs, bullets and bold", () => {
    const blocks: Block[] = [
      { type: "heading", level: 2, inlines: [t("Before we arrive")] },
      { type: "heading", level: 3, inlines: [t("Pets")] },
      { type: "paragraph", inlines: [t("Please "), t("move", true), t(" furniture.")] },
      { type: "bullets", items: [[t("Clear the sills")], [t("Unlock the gate")]] },
    ];
    const { container } = render(<DocText blocks={blocks} />);
    expect(screen.getByRole("heading", { level: 3, name: "Before we arrive" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Pets" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("move");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Clear the sills", "Unlock the gate"]);
  });
  it("renders HTML in a template as text, never as markup", () => {
    const hostile = '<script>alert("x")</script><img src=x onerror="alert(1)"><b>b</b>';
    const { container } = render(<DocText blocks={[{ type: "paragraph", inlines: [t(hostile)] }]} />);
    expect(container.querySelector("script, img, b")).toBeNull();
    expect(container).toHaveTextContent(hostile);
  });
  it("shows a field as its marker, highlighted only when asked", () => {
    const blocks: Block[] = [{ type: "paragraph", inlines: [t("Deposit "), { type: "field", key: "deposit", bold: true }] }];
    const { container, rerender } = render(<DocText blocks={blocks} />);
    expect(container).toHaveTextContent("Deposit {{deposit}}");
    expect(container.querySelector("mark")).toBeNull();
    rerender(<DocText blocks={blocks} highlightFields />);
    expect(container.querySelector("strong mark")).toHaveTextContent("{{deposit}}");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/doc-text.test.tsx`
Expected: FAIL, cannot resolve `@/components/docs/DocText`.

- [ ] **Step 3: Write `components/docs/DocText.tsx`**

```tsx
import type { ReactNode } from "react";
import type { Block, Inline } from "@/lib/docs/types";

/**
 * The React renderer for doc text (spec §2). Template text is untrusted: every string becomes a
 * React text node inside a fixed element, so nothing a template contains can run in a browser.
 * Never use dangerouslySetInnerHTML here.
 */
function Inlines({ inlines, highlightFields }: { inlines: Inline[]; highlightFields: boolean }) {
  return (
    <>
      {inlines.map((inline, index) => {
        const content = inline.type === "text" ? inline.text : `{{${inline.key}}}`;
        const node: ReactNode = inline.type === "field" && highlightFields
          ? <mark className="bg-champagne/30 px-0.5 text-charcoal">{content}</mark>
          : content;
        return inline.bold ? <strong key={index}>{node}</strong> : <span key={index}>{node}</span>;
      })}
    </>
  );
}

export function DocText({ blocks, highlightFields = false }: { blocks: Block[]; highlightFields?: boolean }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const inner = <Inlines inlines={block.inlines} highlightFields={highlightFields} />;
          return block.level === 2
            ? <h3 key={index} className="pt-2 text-base font-semibold">{inner}</h3>
            : <h4 key={index} className="pt-1 font-semibold">{inner}</h4>;
        }
        if (block.type === "paragraph") {
          return <p key={index}><Inlines inlines={block.inlines} highlightFields={highlightFields} /></p>;
        }
        return (
          <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}><Inlines inlines={item} highlightFields={highlightFields} /></li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/docs/doc-text.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/docs/DocText.tsx tests/docs/doc-text.test.tsx
git commit -m "feat: render doc text as React text nodes, never as HTML

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 11: Starter terms

**Files:**
- Create: `lib/docs/starter-terms.ts`
- Test: `tests/docs/starter-terms.test.ts`

**Interfaces:**
- Consumes: `TERMS_FIELDS`, `markerPattern` from `lib/docs/fields.ts` (test only).
- Produces: `STARTER_TERMS_NAME = "Contract terms"`, `STARTER_TERMS: string` (doc text). Converted from `docs/superpowers/specs/assets/starter-terms-draft.md` (current working-tree version): the HTML comment becomes a visible bold banner line (spec §5), and the business's legal name, phone and email become `{{company_name}}`, `{{company_phone}}`, `{{company_email}}` (terms fields, filled at contract time; this also keeps the phone number out of `lib/`, which `tests/business.test.ts` requires).

- [ ] **Step 1: Write the failing test**

`tests/docs/starter-terms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TERMS_FIELDS, markerPattern } from "@/lib/docs/fields";
import { STARTER_TERMS, STARTER_TERMS_NAME } from "@/lib/docs/starter-terms";

describe("starter terms", () => {
  it("is named Contract terms", () => expect(STARTER_TERMS_NAME).toBe("Contract terms"));
  it("opens with the attorney-review banner the owner deletes when ready", () =>
    expect(STARTER_TERMS.split("\n")[0]).toBe("**DRAFT: have a Nevada attorney review these terms before use, then delete this line.**"));
  it("has the eighteen sections, in order", () => {
    const headings = STARTER_TERMS.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toHaveLength(18);
    expect(headings[0]).toBe("## 1. Our Agreement");
    expect(headings[3]).toBe("## 4. Your Right to Cancel");
    expect(headings[17]).toBe("## 18. Contact Us");
  });
  it("uses only contract-time fields, and names the business only through them", () => {
    const keys = [...STARTER_TERMS.matchAll(markerPattern())].map((m) => m[1].trim());
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(TERMS_FIELDS).toContain(key);
    expect(STARTER_TERMS).not.toContain("Premier Shade Solutions LLC");
    expect(STARTER_TERMS).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}/);
    expect(STARTER_TERMS).not.toContain("support@");
  });
  it("promises the 3-business-day window the Quote tab enforces", () =>
    expect(STARTER_TERMS).toContain("within **3 business days** of signing"));
  it("keeps the owner's filled prices", () => {
    expect(STARTER_TERMS).toContain("a return-trip charge of **$175** applies");
    expect(STARTER_TERMS).toContain("service visits are **$175 per visit**");
  });
  it("carries no HTML comment", () => expect(STARTER_TERMS).not.toContain("<!--"));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/starter-terms.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/starter-terms`.

- [ ] **Step 3: Write `lib/docs/starter-terms.ts`**

Before writing, re-read `docs/superpowers/specs/assets/starter-terms-draft.md`: if the owner has changed it since this plan was written, carry the changes over (keeping the banner and the three field substitutions).

````ts
/**
 * The Premier Shade starter terms (spec §5), offered on the Documents page when there is no terms
 * template. Doc text: the first line is a visible banner the owner deletes once an attorney has
 * reviewed the terms. The business's name, phone and email are fields, filled when each contract
 * is generated, so they always match content/business.ts.
 */
export const STARTER_TERMS_NAME = "Contract terms";

export const STARTER_TERMS = `**DRAFT: have a Nevada attorney review these terms before use, then delete this line.**

## 1. Our Agreement

These Terms & Conditions go with your priced contract from {{company_name}} ("we," "us"). The priced contract lists each window, the products chosen, installation, the Hunter Douglas handling fee and your total.

When you sign electronically on your project page, you agree to the priced contract and to these terms. The signed PDF of the contract and these terms is our complete agreement, and you can download or ask us for a copy at any time.

## 2. Deposit and Payment

- A **50% deposit** is due when you sign. We use it to place your order.
- The remaining **balance is due on installation day**, when installation is complete.
- If we can't install because your home isn't available or accessible, the balance becomes due **30 days after your product is ready**, even if installation happens later. We'll still install once your home is ready.

## 3. Payment Methods and Fees

We accept cash, check and credit card.

- Card payments include a **3% card processing fee**. We'll show you the fee before you pay, and you can avoid it by paying with cash or check.
- A returned or declined check has a **$35 fee**.
- A balance not paid within **30 days** of its due date accrues **1.5% per month** until paid. You also agree to pay the reasonable costs of collecting an overdue balance.

## 4. Your Right to Cancel

You may cancel for a **full refund of your deposit** by telling us in writing (email is fine) within **3 business days** of signing. We do not place your order with the manufacturer until that 3-business-day window has closed.

Once your order is placed, your products are custom made to your measurements and choices. After that point the order cannot be cancelled, returned or refunded, except for coverage under the warranties described below.

## 5. How Long Our Pricing Is Good

Pricing on your contract is valid for **30 days** from the contract date. After that, we may need to re-quote before you sign.

## 6. Measurements and Final Measure

Your pricing is based on the measurements taken at your consultation. Before we order, we may come back for a final, precise measure.

If sizes, mounting or product specifications need to change, we'll tell you the new price first. Nothing is ordered until you approve it.

## 7. Your Choices and Approvals

You choose your products, colors, fabrics and controls, and you've reviewed them as listed on your contract. Please check them carefully before signing, because custom products are made exactly as ordered.

If your home is in an HOA or you rent, you are responsible for getting any approval you need from your HOA or landlord before installation.

## 8. Lead Times

Lead times are estimates, not guarantees. Typical times from order placement are:

- Shades and blinds: about **3–5 weeks**
- Shutters: about **6–10 weeks**
- Motorized products: add about **1 week**

Manufacturing delays, backorders and shipping are outside our control. We'll keep you informed, but we can't offer refunds, discounts or penalties for these delays.

## 9. Installation Day

To help installation go smoothly, please:

- Give us clear access to every window, with furniture and fragile items moved away.
- Keep pets secured away from the work areas.
- Have an adult **18 or older** at home for the whole visit.

If we arrive as scheduled and can't install through no fault of ours, a return-trip charge of **$175** applies.

We are not responsible for conditions that existed before we arrived, such as damaged or uneven walls, out-of-square window frames, or drywall that can't hold anchors securely. We'll point out any concern we notice. Small touch-ups to paint or drywall around brackets are your responsibility.

## 10. Fit and Light Gaps

Inside-mounted products need small clearances on each side to open and close properly. Light gaps within the manufacturer's standard tolerances are normal and are not a defect. Outside mounts, motorized products and specialty products may need larger clearances.

## 11. Our Installation Warranty

We warrant our installation work for **1 year** from your installation date. If something goes wrong in that year because of how we installed it, we'll come back and fix it at no charge.

## 12. Manufacturer Warranty

Hunter Douglas products come with the manufacturer's own limited warranty. In general, it offers long-term coverage against defects for the original purchaser, with shorter coverage periods for items like operating cords and motorization. It generally does not cover normal wear, damage from sun or moisture exposure, misuse, or products that have been altered.

The official Hunter Douglas warranty for your product is what governs, and we're happy to give you a copy. If you ever need to make a warranty claim, contact us and we'll help you through it.

## 13. Service Calls

After your first year, or for products we did not install, service visits are **$175 per visit** plus any parts. We'll quote the cost before doing any work.

Parts covered by the manufacturer's warranty are free, but our labor to install them after the first year is billed as a service visit.

## 14. Hunter Douglas Handling Fee

The manufacturer's handling charge appears as its own line on your contract. We may waive it at our discretion, and if we do, the contract will show it.

## 15. Photos of Our Work

We may photograph your finished windows for our portfolio and marketing. We will never show your name or address. If you'd rather we not take photos, just let us know in writing.

## 16. Limits on Our Responsibility

We take care in your home and are responsible for damage we cause. We are not responsible for indirect losses, such as lost time or inconvenience, or for delays and conditions outside our control. Our responsibility for any claim is limited to the amount you paid under this contract, except where the law does not allow such a limit.

Nothing in these terms limits any right you have under Nevada or federal law.

## 17. General Terms

- This contract and these terms are our entire agreement and replace any earlier discussions or quotes.
- Any change must be in writing and agreed to by both of us. Email counts as writing.
- Nevada law governs this agreement.
- If any part of these terms can't be enforced, the rest still applies.

## 18. Contact Us

{{company_name}}

- Phone: {{company_phone}}
- Email: {{company_email}}
`;
````

(The file contains no backtick and no `${`, so the template literal is safe. `$175` and `$35` are not interpolations.)

- [ ] **Step 4: Run it, and the business guard**

Run: `npx vitest run --maxWorkers=2 tests/docs/starter-terms.test.ts tests/business.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/docs/starter-terms.ts tests/docs/starter-terms.test.ts
git commit -m "feat: the Premier Shade starter terms as doc text, with the attorney-review banner

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 12: Document emails

**Files:**
- Create: `lib/docs/emails.ts`
- Test: `tests/docs/emails.test.ts`

**Interfaces:**
- Consumes: `Resend` from `resend`; `business`; `Job` (type); `adminOrigin` from `lib/admin/origin.ts`; `formatShortDate`, `formatTime`; `ownerRecipients` from `lib/leads/email.ts`; `normalizeEmail` from `lib/portal/access.ts`; `issueCustomerLink`, `INVITE_MINUTES` from `lib/portal/login.ts`; `formatProjectNo`; `DocResponse`.
- Produces:
  - `sendDocumentEmail(job: Pick<Job, "name" | "email">, title: string, response: DocResponse): Promise<void>` — subject `Your ${title} is ready to sign` for sign, `... ready to review` otherwise; plain text with a sign-in link; throws on any failure (the caller reports `emailed: false`).
  - `notifyOwnersOfDocumentAcknowledgement(job: { id: string; name: string; projectNo?: number | null }, title: string, acknowledgedBy: string, acknowledgedAt: Date): Promise<void>` — throws on failure; never contains the typed name.

- [ ] **Step 1: Write the failing test**

`tests/docs/emails.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { business } from "@/content/business";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const login = { issueCustomerLink: vi.fn(), INVITE_MINUTES: 7 * 24 * 60 };
vi.mock("@/lib/portal/login", () => login);
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));
vi.mock("@/lib/admin/origin", () => ({ adminOrigin: () => "https://pss.test" }));
const { notifyOwnersOfDocumentAcknowledgement, sendDocumentEmail } = await import("@/lib/docs/emails");

const LINK = "https://pss.test/project/auth?token=abc";
const job = { id: "11111111-1111-4111-8111-111111111111", name: "  Maria Lopez", email: " Maria@Example.COM ", projectNo: 1048 };

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  login.issueCustomerLink.mockReset().mockResolvedValue(LINK);
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("sendDocumentEmail", () => {
  it("asks the client to sign a sign document, with a sign-in link", async () => {
    await sendDocumentEmail(job, "Change order — PSS-1048", "sign");
    expect(login.issueCustomerLink).toHaveBeenCalledWith("maria@example.com", login.INVITE_MINUTES);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("maria@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.subject).toBe("Your Change order — PSS-1048 is ready to sign");
    expect(message.text).toMatch(/^Hi Maria,/);
    expect(message.text).toContain("You can sign it on your project page:");
    expect(message.text).toContain(LINK);
  });
  it("asks the client to review an acknowledge or view document", async () => {
    await sendDocumentEmail(job, "Service agreement", "acknowledge");
    await sendDocumentEmail(job, "Care notes", "view");
    expect(send.mock.calls.map((c) => c[0].subject)).toEqual(["Your Service agreement is ready to review", "Your Care notes is ready to review"]);
  });
  it("throws without a key or an email, sending nothing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendDocumentEmail(job, "t", "view")).rejects.toThrow("RESEND_API_KEY is not set");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    await expect(sendDocumentEmail({ ...job, email: " " }, "t", "view")).rejects.toThrow("This job has no email address");
    expect(send).not.toHaveBeenCalled();
  });
  it("throws when Resend rejects it", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendDocumentEmail(job, "t", "view")).rejects.toThrow("Resend rejected the document email: domain not verified");
  });
});

describe("notifyOwnersOfDocumentAcknowledgement", () => {
  it("tells the owners who, what, when and where, replying to the client", async () => {
    await notifyOwnersOfDocumentAcknowledgement(job, "Service agreement — PSS-1048", "maria@example.com", new Date("2026-09-28T19:05:00Z"));
    const message = send.mock.calls[0][0];
    expect(message.to).toEqual(["owner@example.com"]);
    expect(message.replyTo).toBe("maria@example.com");
    expect(message.subject).toBe("Document acknowledged: Service agreement — PSS-1048 — PSS-1048");
    expect(message.text).toContain("Acknowledged by: maria@example.com");
    expect(message.text).toContain("When:            Sep 28, 2026 at 12:05");
    expect(message.text).toContain("Open in tracker: https://pss.test/admin/jobs/11111111-1111-4111-8111-111111111111");
  });
  it("throws when not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(notifyOwnersOfDocumentAcknowledgement(job, "t", "a@b.c", new Date())).rejects.toThrow("Acknowledgement notification email is not configured");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/emails.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/emails`.

- [ ] **Step 3: Write `lib/docs/emails.ts`**

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { adminOrigin } from "@/lib/admin/origin";
import { formatShortDate, formatTime } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import { normalizeEmail } from "@/lib/portal/access";
import { INVITE_MINUTES, issueCustomerLink } from "@/lib/portal/login";
import { formatProjectNo } from "@/lib/portal/project-no";
import type { DocResponse } from "./kinds";

const fromAddress = () => process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

/**
 * Tells the client a document is ready (spec §6 step 4), with a sign-in link. Plain text, like
 * sendContractEmail. Throws on any failure: the caller has already sent the document and reports
 * the failed email to the owner.
 */
export async function sendDocumentEmail(job: Pick<Job, "name" | "email">, title: string, response: DocResponse): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const email = normalizeEmail(job.email);
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!email) throw new Error("This job has no email address");
  const verb = response === "sign" ? "sign" : "review";
  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0] || "";
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${fromAddress()}>`, to: email, replyTo: business.email,
    subject: `Your ${title} is ready to ${verb}`,
    text: [
      firstName ? `Hi ${firstName},` : "Hi there,", "",
      `Your ${title} is ready. You can ${verb} it on your project page:`, "",
      link, "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n"),
  });
  if (error) throw new Error(`Resend rejected the document email: ${error.message}`);
}

/**
 * Tells the owners a client acknowledged a document: who, which, when, where to open the job.
 * The typed name never appears; replyTo is the address the client is signed in as.
 */
export async function notifyOwnersOfDocumentAcknowledgement(
  job: { id: string; name: string; projectNo?: number | null },
  title: string,
  acknowledgedBy: string,
  acknowledgedAt: Date,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  if (!apiKey || to.length === 0) throw new Error("Acknowledgement notification email is not configured");
  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    `${job.name.trim()} acknowledged a document from their project page.`,
    "",
    `Acknowledged by: ${acknowledgedBy}`,
    `Document:        ${title}`,
    `When:            ${formatShortDate(acknowledgedAt)} at ${formatTime(acknowledgedAt)}`,
    projectNo ? `Project:         ${projectNo}` : null,
    "",
    `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
  ].filter((line): line is string => line !== null).join("\n");
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${fromAddress()}>`, to, replyTo: acknowledgedBy,
    subject: `Document acknowledged: ${title}${projectNo ? ` — ${projectNo}` : ""}`,
    text,
  });
  if (error) throw new Error(`Resend rejected the acknowledgement notification: ${error.message}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/docs/emails.test.ts`
Expected: PASS. (`formatTime` may put U+202F before "PM"; the test matches only `at 12:05`, which is why it stops before the period.)

- [ ] **Step 5: Commit**

```bash
git add lib/docs/emails.ts tests/docs/emails.test.ts
git commit -m "feat: email the client when a document is ready, and the owners when one is acknowledged

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---
## Wave 2

### Task 13: Create and send workflow

**Files:**
- Create: `lib/docs/workflow.ts`
- Test: `tests/docs/workflow.test.ts`

**Interfaces:**
- Consumes (exact): `createFile(input: { leadId: string; kind: FileKind; name: string; contentType: string; body: Blob; actor: string; docType?: StoredDocType }): Promise<JobFile | null>` and `deleteFile(fileId: string, actor: string): Promise<boolean>` from `lib/admin/files.ts`; `getJob(id: string): Promise<Job | null>`; `formatProjectNo`; `fieldValues`, `fillFields` (Task 3); `parseDocText`, `remainingMarkers` (Task 2); `buildDocumentPdf` (Task 9); `getTemplate` (Task 6); `getJobDocument`, `insertDraft`, `markSent`, `JobDocument` (Task 6); `sendDocumentEmail` (Task 12); `isClientDocKind` (Task 1).
- Produces:
  - `SEND_RACE = "This document changed while you were sending. Reload and try again."`
  - `TITLE_MAX = 200`
  - `documentSendBlockers(doc: Pick<JobDocument, "status" | "title" | "body">, job: Pick<Job, "email" | "status">): string[]` — exact strings: `"This document has already been sent."`, `"Give the document a title."`, `"The document is empty."`, `` `Fill in ${markers.join(", ")} first.` `` (e.g. `"Fill in {{deposit}} first."`), `"Add the client's email to the job first."`, `"This job is marked Lost."`
  - `createDocumentFromTemplate(input: { jobId: string; templateId: string; actor: string; now?: Date }): Promise<{ id: string } | { error: string }>` — title `` `${template.name} — ${PSS-####}` ``.
  - `sendJobDocument(input: { jobId: string; documentId: string; actor: string; now?: Date }): Promise<{ ok: true; emailed: boolean } | { error: string }>`

- [ ] **Step 1: Write the failing test**

`tests/docs/workflow.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const store = { getJobDocument: vi.fn(), insertDraft: vi.fn(), markSent: vi.fn() };
vi.mock("@/lib/docs/job-documents", () => store);
const templates = { getTemplate: vi.fn() };
vi.mock("@/lib/docs/templates", () => templates);
const pdf = { buildDocumentPdf: vi.fn() };
vi.mock("@/lib/docs/pdf", () => pdf);
const emails = { sendDocumentEmail: vi.fn() };
vi.mock("@/lib/docs/emails", () => emails);

const { SEND_RACE, createDocumentFromTemplate, documentSendBlockers, sendJobDocument } = await import("@/lib/docs/workflow");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const TEMPLATE = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-09-28T19:00:00Z");
const job = { id: JOB, name: "Maria Lopez", email: "maria@example.com", phone: "7025550100", address: "12 Palm Way", city: "Henderson",
  status: "sold", projectNo: 1048, soldCents: 450000, quoteCents: null, depositCents: null, installOn: null };
const template = { id: TEMPLATE, name: "Service agreement", kind: "service_agreement", response: "acknowledge", archivedAt: null,
  body: "## Scope\n\nHi {{client_first_name}}. Deposit {{deposit}}." };
const draft = { id: DOC, leadId: JOB, title: "Service agreement — PSS-1048", status: "draft", response: "acknowledge", body: "## Scope\n\nHi Maria. Deposit $500." };

beforeEach(() => {
  for (const f of [...Object.values(files), ...Object.values(jobs), ...Object.values(store), ...Object.values(templates),
    ...Object.values(pdf), ...Object.values(emails)]) f.mockReset();
  jobs.getJob.mockResolvedValue(job);
  templates.getTemplate.mockResolvedValue(template);
  store.insertDraft.mockResolvedValue(DOC);
  store.getJobDocument.mockResolvedValue(draft);
  store.markSent.mockResolvedValue(true);
  pdf.buildDocumentPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  files.createFile.mockResolvedValue({ id: FILE });
  files.deleteFile.mockResolvedValue(true);
  emails.sendDocumentEmail.mockResolvedValue(undefined);
});

describe("documentSendBlockers", () => {
  const ok = { status: "draft" as const, title: "T", body: "Text" };
  const client = { email: "a@b.c", status: "sold" as const };
  it("has none for a finished draft on a live job with an email", () => expect(documentSendBlockers(ok, client)).toEqual([]));
  it("names every reason plainly", () => {
    expect(documentSendBlockers({ status: "sent", title: " ", body: "{{deposit}} and {{x}}" }, { email: "  ", status: "lost" })).toEqual([
      "This document has already been sent.", "Give the document a title.", "Fill in {{deposit}}, {{x}} first.",
      "Add the client's email to the job first.", "This job is marked Lost.",
    ]);
    expect(documentSendBlockers({ ...ok, body: " " }, { email: null, status: "sold" })).toEqual(["The document is empty.", "Add the client's email to the job first."]);
  });
});

describe("createDocumentFromTemplate", () => {
  it("fills the fields, leaves a missing one as a marker, and titles it with the PSS number", async () => {
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o@x.com", now: NOW })).toEqual({ id: DOC });
    expect(store.insertDraft).toHaveBeenCalledWith({ leadId: JOB, templateId: TEMPLATE, title: "Service agreement — PSS-1048",
      kind: "service_agreement", response: "acknowledge", body: "## Scope\n\nHi Maria. Deposit {{deposit}}.", actor: "o@x.com" });
  });
  it("refuses an archived template, a terms or guide template, and a missing job", async () => {
    templates.getTemplate.mockResolvedValueOnce({ ...template, archivedAt: new Date() });
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" })).toEqual({ error: "That template is no longer available. Reload the page." });
    templates.getTemplate.mockResolvedValueOnce({ ...template, kind: "terms" });
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" })).toEqual({ error: "That template is no longer available. Reload the page." });
    jobs.getJob.mockResolvedValueOnce(null);
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" })).toEqual({ error: "This job no longer exists." });
    expect(store.insertDraft).not.toHaveBeenCalled();
  });
  it("rejects a template with an unknown field", async () => {
    templates.getTemplate.mockResolvedValueOnce({ ...template, body: "Hi {{nope}}" });
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" }))
      .toEqual({ error: "The template uses fields that don't exist ({{nope}}). Fix it on the Documents page." });
    expect(store.insertDraft).not.toHaveBeenCalled();
  });
});

describe("sendJobDocument", () => {
  it("renders the stored text, stores the PDF, sends in one statement, then emails", async () => {
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o@x.com", now: NOW })).toEqual({ ok: true, emailed: true });
    const [input] = pdf.buildDocumentPdf.mock.calls[0];
    expect(input).toMatchObject({ title: draft.title, projectNo: "PSS-1048", date: NOW, response: "acknowledge",
      client: { name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "maria@example.com" } });
    expect(input.blocks[0]).toEqual({ type: "heading", level: 2, inlines: [{ type: "text", text: "Scope", bold: false }] });
    expect(files.createFile).toHaveBeenCalledWith(expect.objectContaining({ leadId: JOB, kind: "document", name: `${draft.title}.pdf`,
      contentType: "application/pdf", actor: "o@x.com", docType: "other" }));
    expect(store.markSent).toHaveBeenCalledWith({ leadId: JOB, documentId: DOC, fileId: FILE, title: draft.title, body: draft.body, actor: "o@x.com" });
    expect(emails.sendDocumentEmail).toHaveBeenCalledWith(job, draft.title, "acknowledge");
  });
  it("stores a sign document as a contract, so the signing path offers it", async () => {
    store.getJobDocument.mockResolvedValue({ ...draft, response: "sign" });
    await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" });
    expect(files.createFile.mock.calls[0][0].docType).toBe("contract");
  });
  it("refuses with the first blocker and stores nothing", async () => {
    store.getJobDocument.mockResolvedValue({ ...draft, body: "Deposit {{deposit}}" });
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: "Fill in {{deposit}} first." });
    expect(files.createFile).not.toHaveBeenCalled();
  });
  it("removes the PDF and answers the race when the statement matched nothing", async () => {
    store.markSent.mockResolvedValue(false);
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: SEND_RACE });
    expect(files.deleteFile).toHaveBeenCalledWith(FILE, "o");
    expect(emails.sendDocumentEmail).not.toHaveBeenCalled();
  });
  it("removes the PDF when the statement throws, and the error still propagates", async () => {
    store.markSent.mockRejectedValue(new Error("db down"));
    await expect(sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).rejects.toThrow("db down");
    expect(files.deleteFile).toHaveBeenCalledWith(FILE, "o");
  });
  it("a failed email leaves the document sent, and says so", async () => {
    emails.sendDocumentEmail.mockRejectedValue(new Error("resend"));
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ ok: true, emailed: false });
  });
  it("answers plainly for a missing job or document", async () => {
    store.getJobDocument.mockResolvedValueOnce(null);
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: "This document no longer exists." });
    jobs.getJob.mockResolvedValueOnce(null);
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: "This job no longer exists." });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/workflow.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/workflow`.

- [ ] **Step 3: Write `lib/docs/workflow.ts`**

```ts
import "server-only";
import { createFile, deleteFile } from "@/lib/admin/files";
import { getJob, type Job } from "@/lib/admin/jobs";
import { formatProjectNo } from "@/lib/portal/project-no";
import { sendDocumentEmail } from "./emails";
import { fieldValues, fillFields } from "./fill";
import { getJobDocument, insertDraft, markSent, type JobDocument } from "./job-documents";
import { isClientDocKind } from "./kinds";
import { parseDocText, remainingMarkers } from "./parse";
import { buildDocumentPdf } from "./pdf";
import { getTemplate } from "./templates";

export const SEND_RACE = "This document changed while you were sending. Reload and try again.";
export const TITLE_MAX = 200;

/** Spec §6: every reason Send is disabled, each said plainly. The page and sendJobDocument share it. */
export function documentSendBlockers(doc: Pick<JobDocument, "status" | "title" | "body">, job: Pick<Job, "email" | "status">): string[] {
  const blockers: string[] = [];
  if (doc.status !== "draft") blockers.push("This document has already been sent.");
  if (!doc.title.trim()) blockers.push("Give the document a title.");
  if (!doc.body.trim()) blockers.push("The document is empty.");
  const markers = remainingMarkers(doc.body);
  if (markers.length > 0) blockers.push(`Fill in ${markers.join(", ")} first.`);
  if (!job.email?.trim()) blockers.push("Add the client's email to the job first.");
  if (job.status === "lost") blockers.push("This job is marked Lost.");
  return blockers;
}

/** Spec §6: copies a live client-document template into a draft, fields filled from the job now. */
export async function createDocumentFromTemplate(input: {
  jobId: string; templateId: string; actor: string; now?: Date;
}): Promise<{ id: string } | { error: string }> {
  const [job, template] = await Promise.all([getJob(input.jobId), getTemplate(input.templateId)]);
  if (!job) return { error: "This job no longer exists." };
  if (!template || template.archivedAt || !isClientDocKind(template.kind)) {
    return { error: "That template is no longer available. Reload the page." };
  }
  const filled = fillFields(template.body, fieldValues(job, input.now ?? new Date()));
  if (filled.unknown.length > 0) {
    return { error: `The template uses fields that don't exist (${filled.unknown.map((key) => `{{${key}}}`).join(", ")}). Fix it on the Documents page.` };
  }
  const projectNo = formatProjectNo(job.projectNo);
  const title = (projectNo ? `${template.name} — ${projectNo}` : template.name).slice(0, TITLE_MAX);
  const id = await insertDraft({
    leadId: job.id, templateId: template.id, title, kind: template.kind, response: template.response, body: filled.text, actor: input.actor,
  });
  return id ? { id } : { error: "This job no longer exists." };
}

/**
 * Spec §6 Send: render the stored text, store the PDF, then one statement sends, links, shares and
 * logs. markSent re-checks every blocker and that the stored title and body are the ones rendered,
 * so a draft saved in another tab meanwhile refuses the send. Nothing links to the PDF until that
 * statement succeeds, so any refusal or error removes it. The email goes last: a failed email
 * leaves the document sent and answers emailed false.
 */
export async function sendJobDocument(input: {
  jobId: string; documentId: string; actor: string; now?: Date;
}): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const [job, doc] = await Promise.all([getJob(input.jobId), getJobDocument(input.jobId, input.documentId)]);
  if (!job) return { error: "This job no longer exists." };
  if (!doc) return { error: "This document no longer exists." };
  const blockers = documentSendBlockers(doc, job);
  if (blockers.length > 0) return { error: blockers[0] };

  const pdf = await buildDocumentPdf({
    title: doc.title, projectNo: formatProjectNo(job.projectNo), date: input.now ?? new Date(),
    client: { name: job.name, address: job.address, city: job.city, email: job.email },
    blocks: parseDocText(doc.body), response: doc.response,
  });
  const file = await createFile({
    leadId: job.id, kind: "document", name: `${doc.title}.pdf`, contentType: "application/pdf",
    body: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), actor: input.actor,
    docType: doc.response === "sign" ? "contract" : "other",
  });
  if (!file) return { error: "This job no longer exists." };

  let sent: boolean;
  try {
    sent = await markSent({ leadId: job.id, documentId: doc.id, fileId: file.id, title: doc.title, body: doc.body, actor: input.actor });
  } catch (error) {
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unsent document", cleanup));
    throw error;
  }
  if (!sent) {
    if (!(await deleteFile(file.id, input.actor))) console.error(`Could not remove the unsent document ${file.id}`);
    return { error: SEND_RACE };
  }
  try {
    await sendDocumentEmail(job, doc.title, doc.response);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Document "${doc.title}" sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/docs/workflow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/docs/workflow.ts tests/docs/workflow.test.ts
git commit -m "feat: create a filled document from a template, and send it as a frozen, shared PDF

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 14: Contracts print the terms template

**Files:**
- Modify: `lib/dc/contract-pdf.ts` (`buildContractPdf` takes `ContractTerms`)
- Modify: `lib/dc/send.ts` (`review()` loads the live terms template; `sendContract` chooses the terms source)
- Modify: `lib/dc/pricing.ts:75` (blocker wording)
- Test: `tests/dc/contract.test.ts`, `tests/dc/send.test.ts`, `tests/dc/pricing.test.ts`

**Interfaces:**
- Consumes: `parseDocText`, `remainingMarkers` (Task 2); `renderBlocks`, `PdfPen` (Task 9); `LETTER`, `MARGIN` (Task 9); `fieldValues`, `fillFields` (Task 3); `liveTemplateOfKind`, `DocumentTemplate` (Task 6).
- Produces:
  - `type ContractTerms = { text: string } | { pdf: Uint8Array }`; `buildContractPdf(input: ContractInput, terms: ContractTerms): Promise<Uint8Array>`. Text terms start on a new page headed "Terms and Conditions".
  - `sendContract` terms source: the live `terms` template (filled with `fieldValues(job, now)`), else the uploaded PDF, else the blocker. `loadReview` has no terms blocker when either exists.
  - Blocker text: `"Add your contract terms on the Documents page first."`; unreadable upload: `"Your contract terms file could not be read. Add your contract terms on the Documents page."`; a terms field with no value: `` `Your contract terms have ${markers.join(", ")} with no value for this job. Fix the terms on the Documents page.` ``

- [ ] **Step 1: Update and extend the contract PDF test**

In `tests/dc/contract.test.ts`, every second argument to `buildContractPdf` becomes `{ pdf: … }`:
- line 118: `, await terms.save());` → `, { pdf: await terms.save() });`
- lines 133, 142, 148, 163, 173: `await (await PDFDocument.create()).save()` → `{ pdf: await (await PDFDocument.create()).save() }`
- line 182: `buildContractPdf(many, terms)` → `buildContractPdf(many, { pdf: terms })`

Then add inside `describe("buildContractPdf", …)`:

```ts
  it("prints text terms on pages after the contract, headed, with bold runs", async () => {
    const drawn = spyOnDrawText();
    const bytes = await buildContractPdf(input, { text: "## 4. Your Right to Cancel\n\nCancel within **3 business days** of signing." });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    const texts = drawn.map(({ text }) => text);
    expect(texts).toContain("The terms and conditions on the following pages are part of this contract.");
    const heading = drawn.find(({ text }) => text === "Terms and Conditions")!;
    expect(heading.y).toBe(792 - 54);
    expect(texts).toContain("4. Your Right to Cancel");
    expect(texts).toContain("3 business days");
  });
  it("spills long text terms onto more pages inside the margins, drawing only encodable text", async () => {
    const drawn = spyOnDrawText();
    const long = Array.from({ length: 150 }, (_, i) => `## ${i}. Term\n\nText ½″ “quoted” 🙂 → ${"word ".repeat(30)}`).join("\n\n");
    const doc = await PDFDocument.load(await buildContractPdf(input, { text: long }));
    expect(doc.getPageCount()).toBeGreaterThan(3);
    const font = await helvetica();
    for (const { y, right, text } of drawn) {
      expect(y, text).toBeGreaterThanOrEqual(54);
      expect(right, text).toBeLessThanOrEqual(612 - 54 + 0.001);
      expect(encodes(font, text), text).toBe(true);
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/dc/contract.test.ts`
Expected: FAIL (`PDFDocument.load` of `{ pdf }` / missing "Terms and Conditions").

- [ ] **Step 3: Change `lib/dc/contract-pdf.ts`**

Add imports `import { parseDocText } from "@/lib/docs/parse";` and `import { renderBlocks, type PdfPen } from "@/lib/docs/pdf";`, and:

```ts
/** The terms a contract prints: the terms template's filled text, or (legacy) the uploaded PDF. */
export type ContractTerms = { text: string } | { pdf: Uint8Array };
```

Change the signature to `export async function buildContractPdf(input: ContractInput, terms: ContractTerms): Promise<Uint8Array>` and its doc comment to `/** Page 1+: the priced contract. Then the terms: drawn from the terms template, or the uploaded PDF page for page. Signing stamps it later. */`. Replace the last five lines (from `const terms = await PDFDocument.load(termsPdf);` to `return doc.save();`) with:

```ts
  if ("text" in terms) {
    // Same fonts and margins as the contract; the signed PDF then carries the exact terms signed.
    const pen: PdfPen = { doc, page: doc.addPage(LETTER), y: LETTER[1] - MARGIN, regular, bold };
    pen.page.drawText("Terms and Conditions", { x: MARGIN, y: pen.y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
    pen.y -= 26;
    renderBlocks(pen, parseDocText(terms.text));
  } else {
    const uploaded = await PDFDocument.load(terms.pdf);
    const copied = await doc.copyPages(uploaded, uploaded.getPageIndices());
    for (const p of copied) doc.addPage(p);
  }
  return doc.save();
```

- [ ] **Step 4: Run the contract test**

Run: `npx vitest run --maxWorkers=2 tests/dc/contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Update and extend the send and pricing tests**

In `tests/dc/pricing.test.ts:87` change the expected text to `"Add your contract terms on the Documents page first."`.

In `tests/dc/send.test.ts`:
- after the `email` mock add:

```ts
const templates = { liveTemplateOfKind: vi.fn() };
vi.mock("@/lib/docs/templates", () => templates);
```

- add `...Object.values(templates)` to the reset list in `beforeEach`, and `templates.liveTemplateOfKind.mockResolvedValue(null);` after it.
- line 170: expected error becomes `"Your contract terms file could not be read. Add your contract terms on the Documents page."`
- line 192: `expect(terms).toEqual(termsBytes);` becomes `expect(terms).toEqual({ pdf: termsBytes });`
- add:

```ts
describe("terms from the Documents page", () => {
  const TERMS = { id: "t", name: "Contract terms", kind: "terms", response: "view", archivedAt: null,
    body: "## Terms\n\n{{company_name}} and {{client_name}}, {{project_no}}." };

  it("prefers the live terms template over the uploaded PDF, filled for this job", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    const review = await loadReview(JOB);
    const result = await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    expect(result).toEqual({ ok: true, emailed: true });
    expect(templates.liveTemplateOfKind).toHaveBeenCalledWith("terms");
    expect(blob.get).not.toHaveBeenCalled();
    expect(pdf.buildContractPdf.mock.calls[0][1]).toEqual({ text: "## Terms\n\nPremier Shade Solutions LLC and Test Testt, PSS-1042." });
  });
  it("has no terms blocker with a template and no upload", async () => {
    store.getDcSettings.mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    expect((await loadReview(JOB))!.blockers).toEqual([]);
  });
  it("blocks with neither a template nor an upload", async () => {
    store.getDcSettings.mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
    expect((await loadReview(JOB))!.blockers).toContain("Add your contract terms on the Documents page first.");
  });
  it("refuses, storing nothing, when a terms field has no value for this job", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    jobs.getJob.mockResolvedValue({ ...job, name: "   " });
    const review = await loadReview(JOB);
    expect(await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER }))
      .toEqual({ error: "Your contract terms have {{client_name}} with no value for this job. Fix the terms on the Documents page." });
    expect(pdf.buildContractPdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
  });
});
```

(`business.legalName` is `"Premier Shade Solutions LLC"`; the expected string is test data, not an app literal.)

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/send.test.ts tests/dc/pricing.test.ts`
Expected: FAIL on the new and reworded cases.

- [ ] **Step 7: Change `lib/dc/pricing.ts` and `lib/dc/send.ts`**

`lib/dc/pricing.ts` line 75:

```ts
  if (!context.hasTerms) reasons.push("Add your contract terms on the Documents page first.");
```

`lib/dc/send.ts`:
- imports: add `import { fieldValues, fillFields } from "@/lib/docs/fill";`, `import { remainingMarkers } from "@/lib/docs/parse";`, `import { liveTemplateOfKind, type DocumentTemplate } from "@/lib/docs/templates";`, and change the contract-pdf import to `import { buildContractPdf, type ContractTerms } from "./contract-pdf";`.
- `review()`: its return type becomes `Promise<{ review: Review; job: Job; settings: DcSettings; termsTemplate: DocumentTemplate | null } | null>`; add `liveTemplateOfKind("terms")` as a sixth entry of its `Promise.all` destructured as `termsTemplate`; `hasTerms` becomes `termsTemplate !== null || settings.termsPathname !== null`; return `{ review: {...}, job, settings, termsTemplate }`.
- `sendContract`: destructure `termsTemplate` from `loaded`, then replace the four lines from `const terms = await get(...)` through `const termsBytes = ...` with:

```ts
  // Spec §8: the live terms template, filled for this job now; otherwise the uploaded PDF.
  const now = new Date();
  let terms: ContractTerms;
  if (termsTemplate) {
    const filled = fillFields(termsTemplate.body, fieldValues(job, now));
    const left = remainingMarkers(filled.text);
    if (left.length > 0) {
      return { error: `Your contract terms have ${left.join(", ")} with no value for this job. Fix the terms on the Documents page.` };
    }
    terms = { text: filled.text };
  } else {
    const stored = await get(settings.termsPathname!, { access: "private" });
    if (!stored || stored.statusCode !== 200) {
      return { error: "Your contract terms file could not be read. Add your contract terms on the Documents page." };
    }
    terms = { pdf: new Uint8Array(await new Response(stored.stream).arrayBuffer()) };
  }
```

and in the `buildContractPdf` call change `date: new Date()` to `date: now` and the final argument `termsBytes` to `terms`.

- [ ] **Step 8: Run all DC tests**

Run: `npx vitest run --maxWorkers=2 tests/dc`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/dc/contract-pdf.ts lib/dc/send.ts lib/dc/pricing.ts tests/dc/contract.test.ts tests/dc/send.test.ts tests/dc/pricing.test.ts
git commit -m "feat: generated contracts print the terms template, falling back to the uploaded PDF

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 15: The editor and the PDF preview route

**Files:**
- Create: `lib/docs/edit.ts`
- Create: `app/admin/documents/DocEditor.tsx`
- Create: `app/admin/documents/preview/route.ts`
- Test: `tests/docs/edit.test.ts`, `tests/docs/doc-editor.test.tsx`, `tests/docs/preview-route.test.ts`

**Interfaces:**
- Consumes: `FIELDS`, `FieldKey` (Task 1); `parseDocText`, `remainingMarkers`, `unknownFields` (Task 2); `DocText` (Task 10); `buildDocumentPdf` (Task 9); `BODY_MAX` (Task 2); `isDocResponse` (Task 1); `requireAdmin`; `getJob`, `isUuid` from `lib/admin/jobs.ts`; `formatProjectNo`.
- Produces:
  - `lib/docs/edit.ts`: `type EditState = { text: string; start: number; end: number }`, `prefixLines(state: EditState, prefix: "## " | "### " | "- "): EditState`, `wrapBold(state: EditState): EditState`, `insertText(state: EditState, insert: string): EditState`.
  - `DocEditor` (client component) props: `{ name: string; label: string; defaultValue: string; mode: "template" | "document"; allowedFields?: readonly FieldKey[]; titleField: string; previewExtras?: Record<string, string>; onChange?: (value: string) => void }`. It renders inside the caller's `<form>`: a `role="toolbar"` named "Formatting" with buttons **Heading**, **Subheading**, **Bold**, **Bullet**, a select labelled **Insert field** (template mode, when `allowedFields` is not empty), a **Preview PDF** button; a textarea named `name` labelled `label`; a region labelled **Preview**. Template mode lists `{{key}} can't be used here.` in a `role="alert"` list; document mode shows `Replace before sending: {{a}}, {{b}}`.
  - Preview PDF posts `title` (read from the enclosing form's `titleField` input), `body`, and every `previewExtras` entry to `POST /admin/documents/preview` in a new tab.
  - `POST /admin/documents/preview`: `requireAdmin()` first; form fields `title`, `body`, `response` (defaults to view), optional `jobId` (the job's client block and PSS number; otherwise a sample client); answers `application/pdf` inline, `413` when the body is over `BODY_MAX`.

- [ ] **Step 1: Write the failing edit test**

`tests/docs/edit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { insertText, prefixLines, wrapBold } from "@/lib/docs/edit";

describe("prefixLines", () => {
  it("turns the caret's line into a heading", () =>
    expect(prefixLines({ text: "Scope\nNext", start: 2, end: 2 }, "## ")).toEqual({ text: "## Scope\nNext", start: 0, end: 8 }));
  it("prefixes every selected line, replacing another prefix, skipping blank lines", () =>
    expect(prefixLines({ text: "## a\n\nb\nc", start: 0, end: 8 }, "- ").text).toBe("- a\n\n- b\nc"));
  it("toggles the prefix off when every selected line already has it", () =>
    expect(prefixLines({ text: "- a\n- b", start: 0, end: 7 }, "- ").text).toBe("a\nb"));
  it("tells ## from ###", () =>
    expect(prefixLines({ text: "### a", start: 0, end: 0 }, "## ").text).toBe("## a"));
  it("starts a heading on an empty line, caret after the prefix", () =>
    expect(prefixLines({ text: "", start: 0, end: 0 }, "### ")).toEqual({ text: "### ", start: 4, end: 4 }));
});

describe("wrapBold", () => {
  it("wraps the selection", () => expect(wrapBold({ text: "pay now", start: 4, end: 7 })).toEqual({ text: "pay **now**", start: 4, end: 11 }));
  it("unwraps a selection that is already bold", () =>
    expect(wrapBold({ text: "pay **now**", start: 4, end: 11 })).toEqual({ text: "pay now", start: 4, end: 7 }));
  it("inserts an empty pair with the caret inside", () => expect(wrapBold({ text: "ab", start: 1, end: 1 })).toEqual({ text: "a****b", start: 3, end: 3 }));
});

describe("insertText", () => {
  it("replaces the selection and puts the caret after", () =>
    expect(insertText({ text: "Hi X!", start: 3, end: 4 }, "{{client_name}}")).toEqual({ text: "Hi {{client_name}}!", start: 18, end: 18 }));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/edit.test.ts`
Expected: FAIL, cannot resolve `@/lib/docs/edit`.

- [ ] **Step 3: Write `lib/docs/edit.ts`**

```ts
/** The editor toolbar's text changes, as pure functions of the text and its selection. */
export type EditState = { text: string; start: number; end: number };

const LINE_PREFIX = /^(#{2,3} |- )/;

/** Heading, Subheading and Bullet: prefix each touched line (replacing another prefix), or toggle it off. */
export function prefixLines(state: EditState, prefix: "## " | "### " | "- "): EditState {
  const { text } = state;
  const from = state.start === 0 ? 0 : text.lastIndexOf("\n", state.start - 1) + 1;
  // A selection that ends just after a newline does not touch the next line.
  const endAt = state.end > state.start && text[state.end - 1] === "\n" ? state.end - 1 : state.end;
  const newline = text.indexOf("\n", endAt);
  const to = newline === -1 ? text.length : newline;
  const lines = text.slice(from, to).split("\n");
  const content = lines.filter((line) => line.trim() !== "");
  if (content.length === 0) {
    const caret = from + prefix.length;
    return { text: text.slice(0, from) + prefix + text.slice(to), start: caret, end: caret };
  }
  const allHave = content.every((line) => line.startsWith(prefix));
  const next = lines
    .map((line) => (line.trim() === "" ? line : (allHave ? "" : prefix) + line.replace(LINE_PREFIX, "")))
    .join("\n");
  return { text: text.slice(0, from) + next + text.slice(to), start: from, end: from + next.length };
}

/** Bold: wrap the selection in `**`, unwrap it if already wrapped, or insert an empty pair. */
export function wrapBold(state: EditState): EditState {
  const before = state.text.slice(0, state.start);
  const selected = state.text.slice(state.start, state.end);
  const after = state.text.slice(state.end);
  if (!selected) return { text: `${before}****${after}`, start: state.start + 2, end: state.start + 2 };
  if (selected.length >= 4 && selected.startsWith("**") && selected.endsWith("**")) {
    const inner = selected.slice(2, -2);
    return { text: before + inner + after, start: state.start, end: state.start + inner.length };
  }
  return { text: `${before}**${selected}**${after}`, start: state.start, end: state.end + 4 };
}

/** Insert field: replace the selection with the marker, caret after it. */
export function insertText(state: EditState, insert: string): EditState {
  const caret = state.start + insert.length;
  return { text: state.text.slice(0, state.start) + insert + state.text.slice(state.end), start: caret, end: caret };
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run --maxWorkers=2 tests/docs/edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing editor and route tests**

`tests/docs/doc-editor.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocEditor } from "@/app/admin/documents/DocEditor";
import { TERMS_FIELDS } from "@/lib/docs/fields";

afterEach(() => vi.restoreAllMocks());

const inForm = (ui: ReactNode) => render(<form><input name="name" defaultValue="Service agreement" />{ui}</form>);

describe("DocEditor", () => {
  it("formats the caret's line and shows the live preview", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="Scope" mode="template" titleField="name" />);
    const area = screen.getByLabelText("Text") as HTMLTextAreaElement;
    area.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole("button", { name: "Heading" }));
    expect(area.value).toBe("## Scope");
    expect(within(screen.getByRole("region", { name: "Preview" })).getByRole("heading", { name: "Scope" })).toBeInTheDocument();
  });
  it("bolds the selection and reports each change", () => {
    const onChange = vi.fn();
    inForm(<DocEditor name="body" label="Text" defaultValue="pay now" mode="document" titleField="title" onChange={onChange} />);
    const area = screen.getByLabelText("Text") as HTMLTextAreaElement;
    area.setSelectionRange(4, 7);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(area.value).toBe("pay **now**");
    expect(onChange).toHaveBeenLastCalledWith("pay **now**");
  });
  it("offers only the allowed fields and inserts the one chosen", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="" mode="template" allowedFields={TERMS_FIELDS} titleField="name" />);
    const select = screen.getByLabelText("Insert field") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value).filter(Boolean)).toEqual([...TERMS_FIELDS]);
    fireEvent.change(select, { target: { value: "client_name" } });
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("{{client_name}}");
  });
  it("flags a field the template cannot use", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="{{deposit}} {{nope}}" mode="template" allowedFields={TERMS_FIELDS} titleField="name" />);
    expect(screen.getByRole("alert")).toHaveTextContent("{{deposit}} can't be used here.");
    expect(screen.getByRole("alert")).toHaveTextContent("{{nope}} can't be used here.");
  });
  it("in a document: no field menu, and every remaining marker is named", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="Deposit {{deposit}}" mode="document" titleField="title" />);
    expect(screen.queryByLabelText("Insert field")).toBeNull();
    expect(screen.getByText("Replace before sending: {{deposit}}")).toBeInTheDocument();
  });
  it("Preview PDF posts the title, text and extras to the preview route in a new tab", () => {
    const posted: { action: string; target: string; fields: Record<string, string> }[] = [];
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
      posted.push({ action: this.getAttribute("action")!, target: this.target,
        fields: Object.fromEntries([...new FormData(this).entries()].map(([k, v]) => [k, String(v)])) });
    });
    inForm(<DocEditor name="body" label="Text" defaultValue="## Hi" mode="template" titleField="name" previewExtras={{ response: "sign" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
    expect(posted).toEqual([{ action: "/admin/documents/preview", target: "_blank", fields: { response: "sign", title: "Service agreement", body: "## Hi" } }]);
  });
});
```

`tests/docs/preview-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const getJob = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ getJob, isUuid: (id: string) => /^[0-9a-f-]{36}$/.test(id) }));
const buildDocumentPdf = vi.fn();
vi.mock("@/lib/docs/pdf", () => ({ buildDocumentPdf }));
const { POST } = await import("@/app/admin/documents/preview/route");

const JOB = "11111111-1111-4111-8111-111111111111";
const post = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return new Request("http://localhost/admin/documents/preview", { method: "POST", body });
};

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "o@x.com" });
  getJob.mockReset().mockResolvedValue({ id: JOB, name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "m@x.com", projectNo: 1048 });
  buildDocumentPdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("POST /admin/documents/preview", () => {
  it("checks the admin before reading the form", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const request = post({ body: "x" });
    const formData = vi.spyOn(request, "formData");
    await expect(POST(request)).rejects.toThrow("NEXT_REDIRECT");
    expect(formData).not.toHaveBeenCalled();
  });
  it("renders the posted text for a job as an inline PDF", async () => {
    const response = await POST(post({ title: "SA", body: "## Hi", response: "sign", jobId: JOB }));
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(buildDocumentPdf).toHaveBeenCalledWith(expect.objectContaining({ title: "SA", projectNo: "PSS-1048", response: "sign",
      client: { name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "m@x.com" },
      blocks: [{ type: "heading", level: 2, inlines: [{ type: "text", text: "Hi", bold: false }] }] }));
  });
  it("uses a sample client without a job, and view for an unknown response", async () => {
    await POST(post({ title: "", body: "x", response: "approve" }));
    expect(getJob).not.toHaveBeenCalled();
    expect(buildDocumentPdf).toHaveBeenCalledWith(expect.objectContaining({ title: "Untitled document", projectNo: null, response: "view",
      client: { name: "Client name", address: "Street address", city: "City", email: "client@example.com" } }));
  });
  it("refuses text over the template limit", async () => {
    expect((await POST(post({ body: "x".repeat(100_001) }))).status).toBe(413);
    expect(buildDocumentPdf).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/docs/doc-editor.test.tsx tests/docs/preview-route.test.ts`
Expected: FAIL, cannot resolve the two modules.

- [ ] **Step 7: Write `app/admin/documents/DocEditor.tsx`**

```tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { DocText } from "@/components/docs/DocText";
import { insertText, prefixLines, wrapBold, type EditState } from "@/lib/docs/edit";
import { FIELDS, type FieldKey } from "@/lib/docs/fields";
import { parseDocText, remainingMarkers, unknownFields } from "@/lib/docs/parse";

const TOOL = "inline-flex min-h-11 items-center border border-rule px-3 text-sm hover:border-charcoal";

/**
 * The simple formatted editor (spec §5): a text area with a toolbar that writes doc text, and a
 * live preview from the same parser as the PDF. It sits inside the caller's form: the text area
 * posts as `name`. Preview PDF posts the current text to /admin/documents/preview in a new tab.
 */
export function DocEditor({ name, label, defaultValue, mode, allowedFields = [], titleField, previewExtras = {}, onChange }: {
  name: string;
  label: string;
  defaultValue: string;
  mode: "template" | "document";
  allowedFields?: readonly FieldKey[];
  /** The enclosing form's input whose value titles the preview PDF. */
  titleField: string;
  previewExtras?: Record<string, string>;
  onChange?: (value: string) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number } | null>(null);
  const [value, setValue] = useState(defaultValue);

  useLayoutEffect(() => {
    const selection = pending.current;
    if (!selection || !area.current) return;
    pending.current = null;
    area.current.focus();
    area.current.setSelectionRange(selection.start, selection.end);
  }, [value]);

  const change = (next: string) => {
    setValue(next);
    onChange?.(next);
  };
  const current = (): EditState => ({
    text: value,
    start: area.current?.selectionStart ?? value.length,
    end: area.current?.selectionEnd ?? value.length,
  });
  const apply = (next: EditState) => {
    pending.current = { start: next.start, end: next.end };
    change(next.text);
  };

  const openPdf = (button: HTMLButtonElement) => {
    const titleInput = button.form?.elements.namedItem(titleField);
    const title = titleInput instanceof HTMLInputElement ? titleInput.value : "";
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/admin/documents/preview";
    form.target = "_blank";
    for (const [key, v] of Object.entries({ ...previewExtras, title, body: value })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = v;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
    form.remove();
  };

  const problems = mode === "template" ? unknownFields(value, allowedFields).map((key) => `{{${key}}} can't be used here.`) : [];
  const markers = mode === "document" ? remainingMarkers(value) : [];
  const offered = FIELDS.filter((field) => allowedFields.includes(field.key));

  return (
    <div className="flex flex-col gap-3">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-2">
        <button type="button" className={TOOL} onClick={() => apply(prefixLines(current(), "## "))}>Heading</button>
        <button type="button" className={TOOL} onClick={() => apply(prefixLines(current(), "### "))}>Subheading</button>
        <button type="button" className={`${TOOL} font-semibold`} onClick={() => apply(wrapBold(current()))}>Bold</button>
        <button type="button" className={TOOL} onClick={() => apply(prefixLines(current(), "- "))}>Bullet</button>
        {mode === "template" && offered.length > 0 ? (
          <select
            aria-label="Insert field"
            value=""
            className="min-h-11 border border-rule px-2 text-sm"
            onChange={(event) => {
              if (event.target.value) apply(insertText(current(), `{{${event.target.value}}}`));
            }}
          >
            <option value="">Insert field…</option>
            {offered.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
          </select>
        ) : null}
        <button type="button" className={TOOL} onClick={(event) => openPdf(event.currentTarget)}>Preview PDF</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          ref={area}
          name={name}
          aria-label={label}
          value={value}
          onChange={(event) => change(event.target.value)}
          rows={20}
          className="min-h-80 w-full border border-rule bg-ivory p-3 font-mono text-sm"
        />
        <section aria-label="Preview" className="min-h-40 overflow-x-auto border border-rule bg-ivory p-4">
          {value.trim() ? <DocText blocks={parseDocText(value)} highlightFields /> : <p className="text-sm text-ink-soft">The preview appears here.</p>}
        </section>
      </div>
      {problems.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-overdue">
          {problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      ) : null}
      {markers.length > 0 ? <p className="text-sm text-overdue">Replace before sending: {markers.join(", ")}</p> : null}
    </div>
  );
}
```

- [ ] **Step 8: Write `app/admin/documents/preview/route.ts`**

```ts
import { getJob, isUuid } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { isDocResponse } from "@/lib/docs/kinds";
import { parseDocText } from "@/lib/docs/parse";
import { buildDocumentPdf } from "@/lib/docs/pdf";
import { BODY_MAX } from "@/lib/docs/validate";
import { formatProjectNo } from "@/lib/portal/project-no";

const SAMPLE_CLIENT = { name: "Client name", address: "Street address", city: "City", email: "client@example.com" };

/**
 * The editor's Preview PDF: renders the posted, unsaved text with the real PDF renderer. A route
 * handler, not a Server Action, because the answer is a PDF opened in a new tab. Nothing is stored.
 */
export async function POST(request: Request) {
  await requireAdmin();
  const form = await request.formData();
  const field = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  const body = field("body");
  if (body.length > BODY_MAX) return new Response("The text is too long to preview.", { status: 413 });
  const jobId = field("jobId");
  const job = isUuid(jobId) ? await getJob(jobId) : null;
  const response = field("response");
  const pdf = await buildDocumentPdf({
    title: field("title").trim() || "Untitled document",
    projectNo: job ? formatProjectNo(job.projectNo) : null,
    date: new Date(),
    client: job ? { name: job.name, address: job.address, city: job.city, email: job.email } : SAMPLE_CLIENT,
    blocks: parseDocText(body),
    response: isDocResponse(response) ? response : "view",
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="preview.pdf"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 9: Run the three tests**

Run: `npx vitest run --maxWorkers=2 tests/docs/edit.test.ts tests/docs/doc-editor.test.tsx tests/docs/preview-route.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/docs/edit.ts app/admin/documents/DocEditor.tsx app/admin/documents/preview/route.ts tests/docs/edit.test.ts tests/docs/doc-editor.test.tsx tests/docs/preview-route.test.ts
git commit -m "feat: the document editor with a live preview, and a Preview PDF route

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---
### Task 16: Portal: Needs your attention, acknowledging, and the guides

**Files:**
- Create: `lib/portal/guides.ts`
- Create: `app/(site)/project/AcknowledgeDocument.tsx`
- Modify: `app/(site)/project/actions.ts` (two new exports)
- Modify: `app/(site)/project/ProjectView.tsx`
- Modify: `app/(site)/project/page.tsx`, `app/(site)/project/[jobId]/page.tsx` (pass `docAck`)
- Test: `tests/portal/guides.test.ts`, `tests/portal/acknowledge-document-action.test.ts`, `tests/portal/acknowledge-document-ui.test.tsx` (new); `tests/portal/project-view.test.tsx` (mocks and cases)

**Interfaces:**
- Consumes: `acknowledgeableDocuments`, `acknowledgementFor`, `recordAcknowledgement`, `AcknowledgeableDocument`, `Acknowledgement` (Task 7); `notifyOwnersOfDocumentAcknowledgement` (Task 12); `liveTemplateOfKind` (Task 6); `parseDocText` (Task 2); `DocText` (Task 10); `isInstalled` from `lib/admin/stages.ts`; `isUuid` from `lib/admin/jobs.ts`; existing `requireCustomer`, `headers`, `after`, `revalidatePath`, `redirect`.
- Produces:
  - `guidesToShow(job: { status: string; installOn?: string | null }, installAppointmentAt: Date | null): { install: boolean; care: boolean }`
  - `type DocAckResult = "acknowledged" | "not-found" | "invalid"`; `acknowledgeDocumentAction(jobId: string, fileId: string, name: string, read: boolean): Promise<DocAckResult>`; `acknowledgeDocumentFormAction(formData: FormData): Promise<void>` — form fields `jobId`, `fileId`, `acknowledgedName`, `read` (checkbox, `"on"`); redirects to `/project/{jobId}?docAck=1|missing|no&file={fileId}`.
  - `AcknowledgeDocument({ jobId, document }: { jobId: string; document: { id: string; title: string; file: { id: string; name: string } } })` and `DocumentAcknowledgedNotice({ flag, acknowledgement }: { flag?: string | null; acknowledgement: Pick<Acknowledgement, "acknowledgedAt"> | null })`.
  - `ProjectView` new prop `justDocAck?: string | null`. UI contract (Task 22 relies on it): region "Needs your attention" (h2) at the top, with h3 "Documents to sign" and/or h3 "Documents to acknowledge"; each acknowledge item shows the title, a closed `<details>` whose summary is "Read and acknowledge", a link "Open {file name}", an input labelled "Your full name", a checkbox labelled "I have read {title}", a button "Acknowledge". Notice texts: `` `Thank you — your acknowledgement was recorded on ${date}.` ``, `"We could not record that: please type your full name and tick the box, then try again."`, `` `We could not record that just now. Please call us on ${business.phone.display} and we will sort it out.` ``. Guide sections: h2 "Getting ready for your install", h2 "Caring for your shades". The old "Your contract" heading is gone.

- [ ] **Step 1: Write the failing guide-visibility test**

`tests/portal/guides.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { guidesToShow } from "@/lib/portal/guides";

const at = new Date("2026-10-13T17:00:00Z");

describe("guidesToShow", () => {
  it("shows neither before an install is booked or ordered", () => {
    expect(guidesToShow({ status: "sold", installOn: null }, null)).toEqual({ install: false, care: false });
  });
  it("shows the install guide once an install appointment or date is booked, or the job is Ordered", () => {
    expect(guidesToShow({ status: "sold", installOn: null }, at)).toEqual({ install: true, care: false });
    expect(guidesToShow({ status: "sold", installOn: "2026-10-13" }, null)).toEqual({ install: true, care: false });
    expect(guidesToShow({ status: "ordered", installOn: null }, null)).toEqual({ install: true, care: false });
  });
  it("adds the care guide once Installed or Completed", () => {
    expect(guidesToShow({ status: "installed" }, null)).toEqual({ install: true, care: true });
    expect(guidesToShow({ status: "completed" }, null)).toEqual({ install: true, care: true });
  });
  it("shows nothing on a Lost job", () => expect(guidesToShow({ status: "lost", installOn: "2026-10-13" }, at)).toEqual({ install: false, care: false }));
});
```

- [ ] **Step 2: Run it to verify it fails, then write `lib/portal/guides.ts`**

Run: `npx vitest run --maxWorkers=2 tests/portal/guides.test.ts` → FAIL (module missing). Then:

```ts
import { isInstalled } from "@/lib/admin/stages";

const ORDERED_OR_LATER: readonly string[] = ["ordered", "installed", "completed"];

/**
 * Spec §7: "Getting ready for your install" from the moment an install is booked (a confirmed
 * install appointment, or an install date) or the job is Ordered or later; "Caring for your
 * shades" once Installed or Completed. A Lost job shows neither.
 */
export function guidesToShow(job: { status: string; installOn?: string | null }, installAppointmentAt: Date | null): { install: boolean; care: boolean } {
  if (job.status === "lost") return { install: false, care: false };
  return {
    install: installAppointmentAt !== null || Boolean(job.installOn) || ORDERED_OR_LATER.includes(job.status),
    care: isInstalled(job.status),
  };
}
```

Run it again → PASS.

- [ ] **Step 3: Write the failing action test**

`tests/portal/acknowledge-document-action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer, destroyCustomerSession: vi.fn() }));
const acknowledgeableDocuments = vi.fn();
const acknowledgementFor = vi.fn();
const recordAcknowledgement = vi.fn();
vi.mock("@/lib/portal/acknowledge-document", () => ({ acknowledgeableDocuments, acknowledgementFor, recordAcknowledgement }));
const notifyOwnersOfDocumentAcknowledgement = vi.fn();
vi.mock("@/lib/docs/emails", () => ({ notifyOwnersOfDocumentAcknowledgement, sendDocumentEmail: vi.fn() }));
// Anything reaching the database from here is a bug the test should see.
const query = vi.fn(() => { throw new Error("database reached"); });
vi.mock("@/lib/db", () => ({ db: () => query }));
const headerValues: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(headerValues), cookies: async () => new Map() }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const pending: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void pending.push(fn) }));
const runAfter = async () => { for (const fn of pending.splice(0)) await fn(); };
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { acknowledgeDocumentAction, acknowledgeDocumentFormAction } = await import("@/app/(site)/project/actions");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const FILE = "22222222-2222-4222-8222-222222222222";
const EMAIL = "john@example.com";
const job = { id: MINE, name: "John Ramos", projectNo: 1048, status: "sold" };
const document = { id: "d1", title: "Service agreement — PSS-1048", file: { id: FILE, name: "Service agreement — PSS-1048.pdf", leadId: MINE } };
const AT = new Date("2026-09-28T19:00:00Z");

beforeEach(() => {
  pending.length = 0;
  for (const key of Object.keys(headerValues)) delete headerValues[key];
  for (const fn of [revalidatePath, redirect, query]) fn.mockClear();
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job] });
  acknowledgeableDocuments.mockReset().mockResolvedValue([document]);
  acknowledgementFor.mockReset().mockResolvedValue({ leadId: MINE, fileId: FILE, acknowledgedAt: AT });
  recordAcknowledgement.mockReset().mockResolvedValue("acknowledged");
  notifyOwnersOfDocumentAcknowledgement.mockReset().mockResolvedValue(undefined);
});

describe("acknowledgeDocumentAction", () => {
  it("refuses a job the customer does not own, reading nothing", async () => {
    expect(await acknowledgeDocumentAction(THEIRS, FILE, "John", true)).toBe("not-found");
    expect(acknowledgeableDocuments).not.toHaveBeenCalled();
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
  it("refuses when the box is not ticked", async () => {
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", false)).toBe("invalid");
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
  it("re-derives the file from this job's list, never trusting the post", async () => {
    acknowledgeableDocuments.mockResolvedValue([]);
    acknowledgementFor.mockResolvedValue(null);
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("not-found");
    expect(acknowledgeableDocuments).toHaveBeenCalledWith(MINE);
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
  it("answers a repeat of this job's own acknowledgement with success and does nothing", async () => {
    acknowledgeableDocuments.mockResolvedValue([]);
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("acknowledged");
    expect(recordAcknowledgement).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });
  it("refuses another job's acknowledged file, and a malformed id without a lookup", async () => {
    acknowledgeableDocuments.mockResolvedValue([]);
    acknowledgementFor.mockResolvedValue({ leadId: THEIRS, fileId: FILE, acknowledgedAt: AT });
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("not-found");
    acknowledgementFor.mockClear();
    expect(await acknowledgeDocumentAction(MINE, "not-a-uuid", "John", true)).toBe("not-found");
    expect(acknowledgementFor).not.toHaveBeenCalled();
  });
  it("records with the session's email and request facts, then emails the owners after the response", async () => {
    headerValues["x-forwarded-for"] = "1.2.3.4, 10.0.0.1";
    headerValues["user-agent"] = "UA";
    expect(await acknowledgeDocumentAction(MINE, FILE, "John Ramos", true)).toBe("acknowledged");
    expect(recordAcknowledgement).toHaveBeenCalledWith({ jobId: MINE, document, name: "John Ramos", email: EMAIL, ip: "1.2.3.4", userAgent: "UA" });
    expect(notifyOwnersOfDocumentAcknowledgement).not.toHaveBeenCalled();
    await runAfter();
    expect(notifyOwnersOfDocumentAcknowledgement).toHaveBeenCalledWith(job, document.title, EMAIL, AT);
    expect(revalidatePath).toHaveBeenCalledWith("/project");
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });
  it("a raced repeat answers success and emails nobody", async () => {
    recordAcknowledgement.mockResolvedValue("already-acknowledged");
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("acknowledged");
    expect(pending).toHaveLength(0);
  });
  it("passes a blank-name refusal through", async () => {
    recordAcknowledgement.mockResolvedValue("invalid");
    expect(await acknowledgeDocumentAction(MINE, FILE, " ", true)).toBe("invalid");
  });
  it("release gate: job A's form never reaches job B", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job, { ...job, id: THEIRS }] });
    acknowledgeableDocuments.mockImplementation(async (jobId: string) => (jobId === MINE ? [] : [document]));
    acknowledgementFor.mockResolvedValue(null);
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("not-found");
    expect(acknowledgeableDocuments).toHaveBeenCalledTimes(1);
    expect(acknowledgeableDocuments).toHaveBeenCalledWith(MINE);
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
});

describe("acknowledgeDocumentFormAction", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.append(k, v);
    return data;
  };
  it("redirects with the outcome and the file", async () => {
    await expect(acknowledgeDocumentFormAction(form({ jobId: MINE, fileId: FILE, acknowledgedName: "John", read: "on" })))
      .rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?docAck=1&file=${FILE}`);
    await expect(acknowledgeDocumentFormAction(form({ jobId: MINE, fileId: FILE, acknowledgedName: "John" })))
      .rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?docAck=missing&file=${FILE}`);
    await expect(acknowledgeDocumentFormAction(form({ jobId: THEIRS, fileId: FILE, acknowledgedName: "John", read: "on" })))
      .rejects.toThrow(`NEXT_REDIRECT /project/${THEIRS}?docAck=no&file=${FILE}`);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/portal/acknowledge-document-action.test.ts`
Expected: FAIL (`acknowledgeDocumentAction` is not exported).

- [ ] **Step 5: Add the actions to `app/(site)/project/actions.ts`**

Add imports:

```ts
import { notifyOwnersOfDocumentAcknowledgement } from "@/lib/docs/emails";
import { acknowledgeableDocuments, acknowledgementFor, recordAcknowledgement } from "@/lib/portal/acknowledge-document";
```

Append after `signContractFormAction`:

```ts
/** What acknowledging a document can answer. Every refusal is a plain outcome, never an exception. */
export type DocAckResult = "acknowledged" | "not-found" | "invalid";

/**
 * Records that a customer read one of their job's documents (spec §7). The signing action's
 * rules, in its order, none of it taken from the request:
 *
 * 1. Ownership: a jobId not among the session's own jobs is refused as a missing one is.
 * 2. The file: re-derived from acknowledgeableDocuments, the same list the page renders from.
 *    The posted id is only a key into that list.
 * 3. The identity: the session's email, never anything the form sent.
 *
 * recordAcknowledgement fingerprints the bytes served and writes the record, the completion and
 * the event in one statement; a repeat is a no-op. The owners' email runs inside after().
 */
export async function acknowledgeDocumentAction(jobId: string, fileId: string, name: string, read: boolean): Promise<DocAckResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  if (!read) return "invalid";

  const documents = await acknowledgeableDocuments(job.id);
  const doc = documents.find((candidate) => candidate.file.id === fileId);
  if (!doc) {
    // A repeat post: the document has left the list, but the honest answer is still yes. The
    // record's lead_id must be this job's. file_id is a uuid column: a forged id would throw.
    if (!isUuid(fileId)) return "not-found";
    const existing = await acknowledgementFor(fileId);
    return existing && existing.leadId === job.id ? "acknowledged" : "not-found";
  }

  const headerList = await headers();
  const result = await recordAcknowledgement({
    jobId: job.id,
    document: doc,
    name,
    email,
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: headerList.get("user-agent"),
  });
  if (result === "already-acknowledged") return "acknowledged";
  if (result !== "acknowledged") return result;

  after(async () => {
    const saved = await acknowledgementFor(doc.file.id).catch(() => null);
    await notifyOwnersOfDocumentAcknowledgement(job, doc.title, email, saved?.acknowledgedAt ?? new Date()).catch(console.error);
  });

  // Both paths render the same view, as for every other action here.
  revalidatePath("/project");
  revalidatePath(`/project/${job.id}`);
  return "acknowledged";
}

/** The form's wrapper. The outcome rides back on the URL as a hint; the notice re-derives what to say. */
export async function acknowledgeDocumentFormAction(formData: FormData): Promise<void> {
  const jobId = text(formData.get("jobId"));
  const fileId = text(formData.get("fileId"));
  const result = await acknowledgeDocumentAction(jobId, fileId, text(formData.get("acknowledgedName")), formData.get("read") === "on");
  // Outside any try/catch: redirect() works by throwing.
  redirect(
    `/project/${encodeURIComponent(jobId)}?docAck=${result === "acknowledged" ? "1" : result === "invalid" ? "missing" : "no"}&file=${encodeURIComponent(fileId)}`,
  );
}
```

(`isUuid` is already imported from `@/lib/admin/jobs` in this file.)

- [ ] **Step 6: Run the action test, then every portal test that imports `actions.ts`**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: the new file PASSES; `project-view.test.tsx` may fail until Step 10. Every other portal test must still pass (they mock `@/lib/admin/files` partially; the new module only reads `toFile` when called).

- [ ] **Step 7: Write the failing UI test**

`tests/portal/acknowledge-document-ui.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { business } from "@/content/business";

vi.mock("@/app/(site)/project/actions", () => ({ acknowledgeDocumentFormAction: vi.fn() }));
const { AcknowledgeDocument, DocumentAcknowledgedNotice } = await import("@/app/(site)/project/AcknowledgeDocument");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const doc = { id: "d1", title: "Service agreement — PSS-1048", file: { id: "f1", name: "Service agreement — PSS-1048.pdf" } };

describe("AcknowledgeDocument", () => {
  it("shows the title and a closed form that carries only the job and file", () => {
    const { container } = render(<AcknowledgeDocument jobId={JOB} document={doc} />);
    expect(screen.getByText(doc.title, { selector: "p" })).toBeInTheDocument();
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Read and acknowledge")).toBeInTheDocument();
    const form = details.querySelector("form")!;
    expect(form.querySelector('input[name="jobId"]')).toHaveValue(JOB);
    expect(form.querySelector('input[name="fileId"]')).toHaveValue("f1");
    expect(within(form).getByRole("link", { name: `Open ${doc.file.name}` })).toHaveAttribute("href", "/project/files/f1");
    expect(within(form).getByLabelText("Your full name")).toBeRequired();
    expect(within(form).getByLabelText(`I have read ${doc.title}`)).toBeRequired();
    expect(within(form).getByRole("button", { name: "Acknowledge" })).toHaveAttribute("type", "submit");
  });
});

describe("DocumentAcknowledgedNotice", () => {
  const at = { acknowledgedAt: new Date("2026-09-28T19:00:00Z") };
  it("confirms only a recorded acknowledgement", () => {
    const { rerender, container } = render(<DocumentAcknowledgedNotice flag="1" acknowledgement={at} />);
    expect(screen.getByRole("status")).toHaveTextContent("Thank you — your acknowledgement was recorded on Sep 28, 2026.");
    rerender(<DocumentAcknowledgedNotice flag="1" acknowledgement={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("explains a refusal, unless it is already recorded", () => {
    const { rerender, container } = render(<DocumentAcknowledgedNotice flag="missing" acknowledgement={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("We could not record that: please type your full name and tick the box, then try again.");
    rerender(<DocumentAcknowledgedNotice flag="no" acknowledgement={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(`Please call us on ${business.phone.display}`);
    rerender(<DocumentAcknowledgedNotice flag="no" acknowledgement={at} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DocumentAcknowledgedNotice flag={null} acknowledgement={at} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 8: Write `app/(site)/project/AcknowledgeDocument.tsx`**

```tsx
import { business } from "@/content/business";
import { formatShortDate } from "@/lib/admin/time";
import type { Acknowledgement } from "@/lib/portal/acknowledge-document";
import { acknowledgeDocumentFormAction } from "./actions";

/**
 * Acknowledging one shared document (spec §7). Closed until opened, like SignContract, so the
 * customer opens the PDF before the button is reachable. Plain HTML: works with JavaScript off.
 */
export function AcknowledgeDocument({ jobId, document }: {
  jobId: string;
  document: { id: string; title: string; file: { id: string; name: string } };
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <p className="font-semibold">{document.title}</p>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory">
          Read and acknowledge
        </summary>
        <form action={acknowledgeDocumentFormAction} className="mt-3 flex max-w-sm flex-col gap-3 border border-rule bg-sand/50 p-4">
          {/* Carry the job and file with JavaScript off; the action re-derives both itself. */}
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="fileId" value={document.file.id} />
          <p className="text-sm text-ink-soft">
            <a href={`/project/files/${document.file.id}`} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
              Open {document.file.name}
            </a>
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Your full name
            <input type="text" name="acknowledgedName" required pattern=".*\S.*" title="Type your full name" autoComplete="name"
              className="min-h-11 w-full border border-rule bg-ivory px-3" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="read" required className="mt-1 size-4" />
            I have read {document.title}
          </label>
          <button type="submit" className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory">
            Acknowledge
          </button>
        </form>
      </details>
    </div>
  );
}

/**
 * What the customer is told on landing back. `flag` is the `?docAck=` query string, unvalidated:
 * only a recorded acknowledgement confirms, and a refusal is suppressed once one exists.
 */
export function DocumentAcknowledgedNotice({ flag, acknowledgement }: {
  flag?: string | null;
  acknowledgement: Pick<Acknowledgement, "acknowledgedAt"> | null;
}) {
  if (!flag) return null;
  const confirmed = flag === "1" && acknowledgement !== null;
  if (flag === "1" && !confirmed) return null;
  if (!confirmed && acknowledgement !== null) return null;
  return (
    <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
      {confirmed && acknowledgement
        ? `Thank you — your acknowledgement was recorded on ${formatShortDate(acknowledgement.acknowledgedAt)}.`
        : flag === "missing"
          ? "We could not record that: please type your full name and tick the box, then try again."
          : `We could not record that just now. Please call us on ${business.phone.display} and we will sort it out.`}
    </p>
  );
}
```

Run: `npx vitest run --maxWorkers=2 tests/portal/acknowledge-document-ui.test.tsx` → PASS.

- [ ] **Step 9: Extend the ProjectView test (failing first)**

In `tests/portal/project-view.test.tsx`:
- add to the actions mock: `acknowledgeDocumentFormAction: vi.fn(),`
- add mocks after the `@/lib/portal/sign` mock:

```ts
// Nothing to acknowledge and no guides unless a test says otherwise.
const acknowledgeableDocuments = vi.fn(async () => [] as { id: string; title: string; file: { id: string; name: string } }[]);
const acknowledgementFor = vi.fn(async () => null as { leadId: string; acknowledgedAt: Date } | null);
vi.mock("@/lib/portal/acknowledge-document", () => ({ acknowledgeableDocuments, acknowledgementFor }));
const liveTemplateOfKind = vi.fn(async () => null as { body: string } | null);
vi.mock("@/lib/docs/templates", () => ({ liveTemplateOfKind }));
```

- in `beforeEach` add: `signableContracts.mockReset().mockResolvedValue([]); acknowledgeableDocuments.mockReset().mockResolvedValue([]); acknowledgementFor.mockReset().mockResolvedValue(null); liveTemplateOfKind.mockReset().mockResolvedValue(null);`
- append:

```tsx
describe("Needs your attention", () => {
  it("lists documents to sign and to acknowledge at the top", async () => {
    signableContracts.mockResolvedValue([{ id: "c1", name: "Change order — PSS-1048.pdf" }]);
    acknowledgeableDocuments.mockResolvedValue([{ id: "d1", title: "Service agreement — PSS-1048", file: { id: "f1", name: "SA.pdf" } }]);
    render(await ProjectView({ job }));
    const region = screen.getByRole("region", { name: "Needs your attention" });
    expect(within(region).getByRole("heading", { name: "Documents to sign" })).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "Documents to acknowledge" })).toBeInTheDocument();
    expect(within(region).getByText("I have read Service agreement — PSS-1048")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your contract" })).toBeNull();
    // At the top: before the tracker.
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-labelledby"));
    expect(regions.indexOf("attention-heading")).toBeLessThan(regions.indexOf("progress-heading"));
  });
  it("is absent when nothing waits", async () => {
    render(await ProjectView({ job }));
    expect(screen.queryByRole("region", { name: "Needs your attention" })).toBeNull();
  });
  it("confirms an acknowledgement only when it is this job's", async () => {
    acknowledgementFor.mockResolvedValue({ leadId: JOB, acknowledgedAt: new Date("2026-09-28T19:00:00Z") });
    const { unmount } = render(await ProjectView({ job, justDocAck: "1", justSignedFile: "22222222-2222-4222-8222-222222222222" }));
    expect(screen.getByRole("status")).toHaveTextContent("Thank you — your acknowledgement was recorded on Sep 28, 2026.");
    unmount();
    acknowledgementFor.mockResolvedValue({ leadId: "another-job", acknowledgedAt: new Date() });
    render(await ProjectView({ job, justDocAck: "1", justSignedFile: "22222222-2222-4222-8222-222222222222" }));
    expect(screen.queryByText(/your acknowledgement was recorded/)).toBeNull();
  });
});

describe("portal guides", () => {
  const guides = async (kind: string) =>
    kind === "guide_install" ? { body: "## Before we arrive\n\n- Clear the sills" } : { body: "Dust weekly with a **soft** cloth." };
  it("shows the install guide on an ordered job, rendered from the template", async () => {
    liveTemplateOfKind.mockImplementation(guides);
    render(await ProjectView({ job }));
    const region = screen.getByRole("region", { name: "Getting ready for your install" });
    expect(within(region).getByRole("heading", { name: "Before we arrive" })).toBeInTheDocument();
    expect(within(region).getByText("Clear the sills")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Caring for your shades" })).toBeNull();
    expect(liveTemplateOfKind).toHaveBeenCalledWith("guide_install");
    expect(liveTemplateOfKind).not.toHaveBeenCalledWith("guide_care");
  });
  it("adds the care guide once installed", async () => {
    liveTemplateOfKind.mockImplementation(guides);
    render(await ProjectView({ job: { ...job, status: "installed" as const } }));
    expect(within(screen.getByRole("region", { name: "Caring for your shades" })).getByText("soft")).toBeInTheDocument();
  });
  it("loads no guide a sold job with nothing booked cannot show", async () => {
    render(await ProjectView({ job: { ...job, status: "sold" as const } }));
    expect(liveTemplateOfKind).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run --maxWorkers=2 tests/portal/project-view.test.tsx` → the new cases FAIL.

- [ ] **Step 10: Change `ProjectView.tsx`**

Imports to add:

```ts
import { DocText } from "@/components/docs/DocText";
import { isUuid } from "@/lib/admin/ids";
import { parseDocText } from "@/lib/docs/parse";
import { liveTemplateOfKind } from "@/lib/docs/templates";
import { acknowledgeableDocuments, acknowledgementFor } from "@/lib/portal/acknowledge-document";
import { guidesToShow } from "@/lib/portal/guides";
import { AcknowledgeDocument, DocumentAcknowledgedNotice } from "./AcknowledgeDocument";
```

Props: add after `justSignedFile`:

```ts
  /** The `?docAck=` flag from the hop back after acknowledging. Unvalidated: DocumentAcknowledgedNotice checks it. */
  justDocAck?: string | null;
```

Loading: add `acknowledgeable` as a twelfth entry of the existing `Promise.all` (value `acknowledgeableDocuments(job.id)`, commented "The same helper the acknowledge action re-derives from"). After it:

```ts
  // Only the guides this stage shows are loaded; the acknowledgement is looked up only on the
  // hop back, and only believed when it is this job's.
  const guides = guidesToShow(job, installAt);
  const [installGuide, careGuide, justAcknowledgement] = await Promise.all([
    guides.install ? liveTemplateOfKind("guide_install") : Promise.resolve(null),
    guides.care ? liveTemplateOfKind("guide_care") : Promise.resolve(null),
    justDocAck && justSignedFile && isUuid(justSignedFile) ? acknowledgementFor(justSignedFile) : Promise.resolve(null),
  ]);
  const acknowledgement = justAcknowledgement?.leadId === job.id ? justAcknowledgement : null;
```

JSX:
1. Delete the `{contracts.length > 0 ? (<section … aria-labelledby="sign-heading"> … "Your contract" …) : null}` block.
2. Directly after `</header>`, insert:

```tsx
      {/* Spec §7: everything waiting on the customer, at the top. The two lists come from the same
          helpers the sign and acknowledge actions re-derive from, so the page and the guards agree. */}
      {contracts.length > 0 || acknowledgeable.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="attention-heading">
          <h2 id="attention-heading" className={heading}>Needs your attention</h2>
          {contracts.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">Documents to sign</h3>
              {contracts.map((file) => <SignContract key={file.id} jobId={job.id} file={file} />)}
            </div>
          ) : null}
          {acknowledgeable.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">Documents to acknowledge</h3>
              {acknowledgeable.map((doc) => <AcknowledgeDocument key={doc.id} jobId={job.id} document={doc} />)}
            </div>
          ) : null}
        </section>
      ) : null}
```

3. After the `<SignatureNotice … />` element, add `<DocumentAcknowledgedNotice flag={justDocAck ?? null} acknowledgement={acknowledgement} />`.
4. After the Installation `</section>`, add:

```tsx
      {installGuide ? (
        <section className="flex flex-col gap-3" aria-labelledby="guide-install-heading">
          <h2 id="guide-install-heading" className={heading}>Getting ready for your install</h2>
          <DocText blocks={parseDocText(installGuide.body)} />
        </section>
      ) : null}
      {careGuide ? (
        <section className="flex flex-col gap-3" aria-labelledby="guide-care-heading">
          <h2 id="guide-care-heading" className={heading}>Caring for your shades</h2>
          <DocText blocks={parseDocText(careGuide.body)} />
        </section>
      ) : null}
```

In both `app/(site)/project/page.tsx` and `app/(site)/project/[jobId]/page.tsx`: add `docAck?: string` to the `searchParams` type and pass `justDocAck={params.docAck ?? null}` (respectively `query.docAck`).

- [ ] **Step 11: Run all portal tests**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add lib/portal/guides.ts "app/(site)/project" tests/portal/guides.test.ts tests/portal/acknowledge-document-action.test.ts tests/portal/acknowledge-document-ui.test.tsx tests/portal/project-view.test.tsx
git commit -m "feat: the portal lists documents to sign or acknowledge first, and shows the guides by stage

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 17: Quote tab shows the cancellation window

**Files:**
- Modify: `app/admin/jobs/[id]/QuoteReview.tsx` (the signed banner, a `now` prop)
- Modify: `app/admin/jobs/[id]/QuoteTab.tsx` (pass `now`)
- Test: `tests/dc/quote-review.test.tsx`

**Interfaces:**
- Consumes: `cancellationWindowEnd` (Task 4); `formatShortDate`, `formatWhen` from `lib/admin/time.ts`.
- Produces: `QuoteReview({ jobId, review, now }: { jobId: string; review: Review; now?: Date })` (default `new Date()`). During the window a signed version shows `` `Signed ${formatShortDate(signedAt)}. Cancellation window ends ${formatWhen(end)} — place the Direct Connect order after that.` `` and no order link; after it, the existing "Signed {date}" line and "Signed — ready to order: Open quote … in Direct Connect" link.

- [ ] **Step 1: Write the failing test**

In `tests/dc/quote-review.test.tsx`, next to the existing signed-banner test (line ~271), add:

```tsx
  describe("the cancellation window", () => {
    const signedMonday = () => ({ ...sent, status: "signed" as const, signedAt: new Date("2026-09-28T17:00:00Z") });
    it("during the window, says when it ends and offers no order link", () => {
      render(<QuoteReview jobId={J} review={review({ version: signedMonday() })} now={new Date("2026-09-29T17:00:00Z")} />);
      expect(screen.getByText(/^Signed Sep 28, 2026\. Cancellation window ends Fri, Oct 2, 12:00\sAM — place the Direct Connect order after that\.$/)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /ready to order/ })).toBeNull();
    });
    it("from midnight after the third business day, is ready to order", () => {
      render(<QuoteReview jobId={J} review={review({ version: signedMonday() })} now={new Date("2026-10-02T07:00:00Z")} />);
      expect(screen.getByRole("link", { name: /^Signed — ready to order/ })).toBeInTheDocument();
      expect(screen.queryByText(/Cancellation window/)).toBeNull();
    });
  });
```

Before adding it, read lines 30-60 and 255-285 of the test file and adapt the two fixture calls to its real helpers: it builds a review with `review(...)` and a sent version named `sent` near line 262. If `review()` takes a different override shape, use the same shape the existing "Signed Sep 22, 2026" test (line ~271) uses. Also give that existing test `now={new Date("2026-10-01T12:00:00Z")}` so it stays true whatever day the suite runs.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/dc/quote-review.test.tsx`
Expected: FAIL (the link is shown during the window).

- [ ] **Step 3: Change `QuoteReview.tsx` and `QuoteTab.tsx`**

`QuoteReview.tsx`: import `cancellationWindowEnd` from `@/lib/docs/business-days` and `formatWhen` alongside `formatShortDate`. Change the signature to:

```tsx
export function QuoteReview({ jobId, review, now }: { jobId: string; review: Review; now?: Date }) {
```

After `const signedEarlier = …` add:

```tsx
  // Spec §9: the order is not placed until the 3-business-day cancellation window has passed.
  const windowEnd = version.status === "signed" && version.signedAt ? cancellationWindowEnd(version.signedAt) : null;
  const inWindow = windowEnd !== null && (now ?? new Date()).getTime() < windowEnd.getTime();
```

Replace the `{version.status === "signed" ? (…) : null}` block with:

```tsx
      {version.status === "signed" ? (
        <div className="flex flex-col gap-1">
          {inWindow && version.signedAt && windowEnd ? (
            <p className="text-sm font-semibold">
              Signed {formatShortDate(version.signedAt)}. Cancellation window ends {formatWhen(windowEnd)} — place the Direct Connect order after that.
            </p>
          ) : (
            <>
              {version.signedAt ? <p className="text-sm">Signed {formatShortDate(version.signedAt)}</p> : null}
              <a className={`${TEXT_LINK} font-semibold`} href={dcQuoteUrl(version.dcQuoteNo)} target="_blank" rel="noopener noreferrer">
                Signed — ready to order: Open quote {version.dcQuoteNo} in Direct Connect
              </a>
            </>
          )}
        </div>
      ) : null}
```

`QuoteTab.tsx`: `<QuoteReview jobId={job.id} review={review} now={new Date()} />`.

- [ ] **Step 4: Run the Quote tab tests**

Run: `npx vitest run --maxWorkers=2 tests/dc/quote-review.test.tsx tests/admin/job-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/QuoteReview.tsx" "app/admin/jobs/[id]/QuoteTab.tsx" tests/dc/quote-review.test.tsx
git commit -m "feat: the Quote tab holds the order until the cancellation window has passed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 18: Settings: terms become a line linking to Documents

**Files:**
- Modify: `app/admin/settings/TermsSection.tsx` (rewritten: a server component, no upload)
- Modify: `app/admin/settings/page.tsx`
- Delete: `app/admin/settings/terms/route.ts`, `lib/dc/terms.ts`, `tests/dc/terms-route.test.ts`
- Test: `tests/dc/terms-section.test.tsx` (rewritten), `tests/admin/settings-page.test.tsx`

**Interfaces:**
- Consumes: `liveTemplateOfKind` (Task 6); `getDcSettings` (existing, `termsPathname`).
- Produces: `TermsSection({ template, legacyUpload }: { template: { updatedAt: Date } | null; legacyUpload: boolean })`. Region "Contract terms" (h2 `terms-heading`) with one of: `` `Contracts print the terms from the Documents page, last updated ${formatWhen(updatedAt)}.` ``; `"Using the uploaded PDF until you create terms on the Documents page."`; `"No contract terms yet. Contracts can't be sent until you add them on the Documents page."`; and a link to `/admin/documents` ("Edit terms on the Documents page" when a template exists, else "Open the Documents page").

- [ ] **Step 1: Rewrite `tests/dc/terms-section.test.tsx` (failing)**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TermsSection } from "@/app/admin/settings/TermsSection";

describe("terms section", () => {
  it("links to the Documents page, where the terms template is edited", () => {
    render(<TermsSection template={{ updatedAt: new Date("2026-09-20T18:00:00Z") }} legacyUpload />);
    const region = screen.getByRole("region", { name: "Contract terms" });
    expect(region).toHaveTextContent(/^Contract termsContracts print the terms from the Documents page, last updated Sun, Sep 20/);
    expect(screen.getByRole("link", { name: "Edit terms on the Documents page" })).toHaveAttribute("href", "/admin/documents");
    expect(region).not.toHaveTextContent("uploaded PDF");
  });
  it("says the uploaded PDF is used until terms are created", () => {
    render(<TermsSection template={null} legacyUpload />);
    expect(screen.getByText("Using the uploaded PDF until you create terms on the Documents page.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the Documents page" })).toHaveAttribute("href", "/admin/documents");
  });
  it("says contracts can't be sent with neither", () => {
    render(<TermsSection template={null} legacyUpload={false} />);
    expect(screen.getByText("No contract terms yet. Contracts can't be sent until you add them on the Documents page.")).toBeInTheDocument();
  });
  it("offers no upload any more", () => {
    const { container } = render(<TermsSection template={null} legacyUpload={false} />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
```

In `tests/admin/settings-page.test.tsx`:
- add after the `dcStore` mock:

```ts
const liveTemplateOfKind = vi.fn(async () => null as { updatedAt: Date } | null);
vi.mock("@/lib/docs/templates", () => ({ liveTemplateOfKind }));
```

- in `beforeEach` add `liveTemplateOfKind.mockReset().mockResolvedValue(null);`
- in "shows markup per product line and the contract terms after installation rates", replace the region assertion with `expect(screen.getByRole("region", { name: "Contract terms" })).toHaveTextContent("Using the uploaded PDF until you create terms on the Documents page.");`
- rename "says contracts can't be sent until terms are uploaded" to "says contracts can't be sent until terms are added" and expect `"No contract terms yet. Contracts can't be sent until you add them on the Documents page."`
- add:

```tsx
  it("says contracts use the terms template once one exists", async () => {
    calendarEnabled.mockReturnValue(false);
    liveTemplateOfKind.mockResolvedValueOnce({ updatedAt: new Date("2026-09-28T18:00:00Z") });
    render(await SettingsPage());
    expect(liveTemplateOfKind).toHaveBeenCalledWith("terms");
    expect(screen.getByRole("region", { name: "Contract terms" })).toHaveTextContent("Contracts print the terms from the Documents page");
  });
```

Run: `npx vitest run --maxWorkers=2 tests/dc/terms-section.test.tsx tests/admin/settings-page.test.tsx` → FAIL.

- [ ] **Step 2: Rewrite `TermsSection.tsx`, wire the page, delete the upload**

`app/admin/settings/TermsSection.tsx`:

```tsx
import Link from "next/link";
import { formatWhen } from "@/lib/admin/time";

/**
 * Spec §8: contract terms are a template on the Documents page now. This line says which terms
 * contracts use: the template, else a PDF uploaded before templates existed, else none.
 */
export function TermsSection({ template, legacyUpload }: { template: { updatedAt: Date } | null; legacyUpload: boolean }) {
  return (
    <section aria-labelledby="terms-heading" className="flex flex-col gap-2">
      <h2 id="terms-heading" className="text-lg font-semibold">Contract terms</h2>
      {template ? (
        <p className="text-ink-soft">Contracts print the terms from the Documents page, last updated {formatWhen(template.updatedAt)}.</p>
      ) : legacyUpload ? (
        <p className="text-ink-soft">Using the uploaded PDF until you create terms on the Documents page.</p>
      ) : (
        <p className="text-overdue">No contract terms yet. Contracts can&apos;t be sent until you add them on the Documents page.</p>
      )}
      <Link href="/admin/documents" className="self-start underline underline-offset-4">
        {template ? "Edit terms on the Documents page" : "Open the Documents page"}
      </Link>
    </section>
  );
}
```

`app/admin/settings/page.tsx`: import `liveTemplateOfKind` from `@/lib/docs/templates`; add it as the eleventh entry of the `Promise.all` (`termsTemplate`, value `liveTemplateOfKind("terms")`); render

```tsx
      <TermsSection
        template={termsTemplate ? { updatedAt: termsTemplate.updatedAt } : null}
        legacyUpload={dcSettings.termsPathname !== null}
      />
```

Delete the upload: `git rm app/admin/settings/terms/route.ts lib/dc/terms.ts tests/dc/terms-route.test.ts`. Then `grep -rn "lib/dc/terms\"\|settings/terms" app lib tests` must print nothing. (`dc_settings.terms_file_pathname` stays: `sendContract` still reads an existing upload as the fallback.)

- [ ] **Step 3: Run the Settings tests**

Run: `npx vitest run --maxWorkers=2 tests/dc/terms-section.test.tsx tests/admin/settings-page.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/admin/settings/TermsSection.tsx app/admin/settings/page.tsx tests/dc/terms-section.test.tsx tests/admin/settings-page.test.tsx
git commit -m "feat: Settings points to the Documents page for contract terms, and the PDF upload is gone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

(The `git rm` in Step 2 already staged the three deletions.)

---
## Wave 3

### Task 19: The Documents page, template forms and the menu item

**Files:**
- Create: `app/admin/documents/actions.ts`, `app/admin/documents/TemplateForm.tsx`, `app/admin/documents/page.tsx`, `app/admin/documents/new/page.tsx`, `app/admin/documents/[id]/page.tsx`
- Modify: `app/admin/AdminNav.tsx` (`LINKS`, `isActive`)
- Test: `tests/docs/template-actions.test.ts`, `tests/docs/documents-page.test.tsx` (new), `tests/admin/admin-nav.test.tsx`

**Interfaces:**
- Consumes: `requireAdmin`; `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `archiveTemplate` (Task 6); `templateErrors` (Task 2); `STARTER_TERMS`, `STARTER_TERMS_NAME` (Task 11); kinds (Task 1); `DocEditor` (Task 15); `ACTION_LINK`, `TEXT_LINK` from `app/admin/jobs/[id]/ui.ts`; `formatWhen`.
- Produces:
  - `type TemplateFormState = { errors?: string[]; saved?: boolean }`; `createTemplateAction(prev, formData)`; `saveTemplateAction(prev, formData)`; `archiveTemplateAction(formData)`; `startStarterTermsAction()`. Form fields: `id` (edit only), `kind` (new only), `name`, `response`, `body`.
  - UI contract (Task 22 relies on it): `/admin/documents` has h1 "Documents", link "New template", regions "Contract terms", "Client documents", "Portal guides", button "Start from the Premier Shade starter terms" (only with no live terms); each template is a link named by its name. The form has a select "Kind" (new only), input "Name", select "Client response", the `DocEditor` (textarea "Text"), submit "Create template" or "Save template", `role="status"` "Saved.", errors in a list labelled "Template problems". The edit page has a button "Archive template".
  - Admin menu: Jobs, Schedule, Documents, Settings; Documents is active on `/admin/documents` and every page under it.

- [ ] **Step 1: Write the failing action test**

`tests/docs/template-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => { order.push("auth"); return { email: "owner@example.com" }; });
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { createTemplate: vi.fn(), updateTemplate: vi.fn(), getTemplate: vi.fn(), archiveTemplate: vi.fn() };
vi.mock("@/lib/docs/templates", () => store);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { archiveTemplateAction, createTemplateAction, saveTemplateAction, startStarterTermsAction } = await import("@/app/admin/documents/actions");
const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");

const ID = "11111111-1111-4111-8111-111111111111";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};
const good = { kind: "service_agreement", name: "Service agreement", response: "acknowledge", body: "## Scope\n\nHi {{client_name}}." };

beforeEach(() => {
  order.length = 0;
  for (const f of [...Object.values(store), revalidatePath, redirect]) f.mockClear();
  store.createTemplate.mockReset().mockImplementation(async () => { order.push("create"); return { id: ID }; });
  store.getTemplate.mockReset().mockResolvedValue({ id: ID, kind: "terms", archivedAt: null });
  store.updateTemplate.mockReset().mockResolvedValue(true);
  store.archiveTemplate.mockReset().mockResolvedValue(true);
});

describe("createTemplateAction", () => {
  it("checks the admin first, creates, then opens the template", async () => {
    await expect(createTemplateAction({}, form(good))).rejects.toThrow(`NEXT_REDIRECT /admin/documents/${ID}`);
    expect(order).toEqual(["auth", "create"]);
    expect(store.createTemplate).toHaveBeenCalledWith({ ...good, actor: "owner@example.com" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/documents");
  });
  it("answers every problem and saves nothing", async () => {
    expect(await createTemplateAction({}, form({ ...good, name: " ", body: "{{nope}}" })))
      .toEqual({ errors: ["Give the template a name.", "Unknown field {{nope}}."] });
    expect(store.createTemplate).not.toHaveBeenCalled();
  });
  it("makes terms and guides view-only whatever the form says", async () => {
    await expect(createTemplateAction({}, form({ ...good, kind: "terms", response: "sign", body: "For {{client_name}}" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.createTemplate.mock.calls[0][0].response).toBe("view");
  });
  it("shows the store's refusal of a second live singleton", async () => {
    store.createTemplate.mockResolvedValueOnce({ error: "There is already a live Contract terms template. Edit that one instead." });
    expect(await createTemplateAction({}, form({ ...good, kind: "terms", body: "x" })))
      .toEqual({ errors: ["There is already a live Contract terms template. Edit that one instead."] });
  });
});

describe("saveTemplateAction", () => {
  it("validates against the stored kind and saves", async () => {
    expect(await saveTemplateAction({}, form({ id: ID, name: "Terms", response: "sign", body: "Hi {{client_name}}" }))).toEqual({ saved: true });
    expect(store.updateTemplate).toHaveBeenCalledWith({ id: ID, name: "Terms", response: "view", body: "Hi {{client_name}}", actor: "owner@example.com" });
    expect(requireAdmin).toHaveBeenCalled();
  });
  it("refuses a field the stored kind cannot use", async () => {
    expect(await saveTemplateAction({}, form({ id: ID, name: "Terms", response: "view", body: "{{deposit}}" })))
      .toEqual({ errors: ["{{deposit}} can't be used in Contract terms."] });
    expect(store.updateTemplate).not.toHaveBeenCalled();
  });
  it("refuses an archived or missing template", async () => {
    store.getTemplate.mockResolvedValueOnce({ id: ID, kind: "other", archivedAt: new Date() });
    expect(await saveTemplateAction({}, form({ id: ID, name: "x", response: "view", body: "y" }))).toEqual({ errors: ["This template was archived. Reload the page."] });
    store.getTemplate.mockResolvedValueOnce(null);
    expect(await saveTemplateAction({}, form({ id: "nope", name: "x", response: "view", body: "y" }))).toEqual({ errors: ["This template was archived. Reload the page."] });
  });
});

describe("archive and starter", () => {
  it("archives, then returns to the list", async () => {
    await expect(archiveTemplateAction(form({ id: ID }))).rejects.toThrow("NEXT_REDIRECT /admin/documents");
    expect(store.archiveTemplate).toHaveBeenCalledWith(ID, "owner@example.com");
  });
  it("starts the terms from the starter text", async () => {
    await expect(startStarterTermsAction()).rejects.toThrow(`NEXT_REDIRECT /admin/documents/${ID}`);
    expect(order).toEqual(["auth", "create"]);
    expect(store.createTemplate).toHaveBeenCalledWith({ name: "Contract terms", kind: "terms", response: "view", body: STARTER_TERMS, actor: "owner@example.com" });
  });
  it("says so when live terms already exist", async () => {
    store.createTemplate.mockResolvedValueOnce({ error: "exists" });
    await expect(startStarterTermsAction()).rejects.toThrow("NEXT_REDIRECT /admin/documents?starter=exists");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/template-actions.test.ts`
Expected: FAIL, cannot resolve `@/app/admin/documents/actions`.

- [ ] **Step 3: Write `app/admin/documents/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { isDocResponse, isSingletonKind, isTemplateKind } from "@/lib/docs/kinds";
import { STARTER_TERMS, STARTER_TERMS_NAME } from "@/lib/docs/starter-terms";
import { archiveTemplate, createTemplate, getTemplate, updateTemplate } from "@/lib/docs/templates";
import { templateErrors } from "@/lib/docs/validate";

export type TemplateFormState = { errors?: string[]; saved?: boolean };

const str = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");
const ARCHIVED = "This template was archived. Reload the page.";
// Settings shows whether contracts use the terms template, so it goes stale too.
const refresh = () => {
  revalidatePath("/admin/documents");
  revalidatePath("/admin/settings");
};

// Each action calls requireAdmin() before reading its input.
export async function createTemplateAction(_previous: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const admin = await requireAdmin();
  const kind = str(formData.get("kind"));
  const input = {
    name: str(formData.get("name")),
    kind,
    // Terms and guides are view only; the form disables the choice, and this is the guard.
    response: isSingletonKind(kind) ? "view" : str(formData.get("response")),
    body: str(formData.get("body")),
  };
  const errors = templateErrors(input);
  if (errors.length > 0 || !isTemplateKind(input.kind) || !isDocResponse(input.response)) return { errors };
  const created = await createTemplate({ name: input.name, kind: input.kind, response: input.response, body: input.body, actor: admin.email });
  if ("error" in created) return { errors: [created.error] };
  refresh();
  redirect(`/admin/documents/${created.id}`);
}

/** The kind comes from the stored template, never the form: a template's kind never changes. */
export async function saveTemplateAction(_previous: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const admin = await requireAdmin();
  const id = str(formData.get("id"));
  const template = await getTemplate(id);
  if (!template || template.archivedAt) return { errors: [ARCHIVED] };
  const input = {
    name: str(formData.get("name")),
    kind: template.kind,
    response: isSingletonKind(template.kind) ? "view" : str(formData.get("response")),
    body: str(formData.get("body")),
  };
  const errors = templateErrors(input);
  if (errors.length > 0 || !isDocResponse(input.response)) return { errors };
  if (!(await updateTemplate({ id, name: input.name, response: input.response, body: input.body, actor: admin.email }))) {
    return { errors: [ARCHIVED] };
  }
  refresh();
  return { saved: true };
}

export async function archiveTemplateAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await archiveTemplate(str(formData.get("id")), admin.email);
  refresh();
  redirect("/admin/documents");
}

/** Spec §5: offered only while there is no terms template. The unique index refuses a second one. */
export async function startStarterTermsAction(): Promise<void> {
  const admin = await requireAdmin();
  const created = await createTemplate({ name: STARTER_TERMS_NAME, kind: "terms", response: "view", body: STARTER_TERMS, actor: admin.email });
  refresh();
  redirect("id" in created ? `/admin/documents/${created.id}` : "/admin/documents?starter=exists");
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run --maxWorkers=2 tests/docs/template-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page and form test**

`tests/docs/documents-page.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "o@x.com" })) }));
const listTemplates = vi.fn();
vi.mock("@/lib/docs/templates", () => ({ listTemplates }));
vi.mock("@/app/admin/documents/actions", () => ({
  createTemplateAction: vi.fn(async () => ({})), saveTemplateAction: vi.fn(async () => ({})),
  archiveTemplateAction: vi.fn(), startStarterTermsAction: vi.fn(),
}));

const { default: DocumentsPage } = await import("@/app/admin/documents/page");
const { TemplateForm } = await import("@/app/admin/documents/TemplateForm");

const template = (over: Record<string, unknown>) => ({ id: "t1", name: "Service agreement", kind: "service_agreement", response: "acknowledge",
  body: "x", archivedAt: null, createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date("2026-09-28T18:00:00Z"), ...over });

beforeEach(() => listTemplates.mockReset().mockResolvedValue([]));

describe("Documents page", () => {
  it("groups live templates as Contract terms, Client documents and Portal guides", async () => {
    listTemplates.mockResolvedValue([template({}), template({ id: "t2", name: "Install prep", kind: "guide_install", response: "view" })]);
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { level: 1, name: "Documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New template" })).toHaveAttribute("href", "/admin/documents/new");
    expect(within(screen.getByRole("region", { name: "Client documents" })).getByRole("link", { name: "Service agreement" }))
      .toHaveAttribute("href", "/admin/documents/t1");
    expect(within(screen.getByRole("region", { name: "Portal guides" })).getByRole("link", { name: "Install prep" })).toBeInTheDocument();
  });
  it("offers the starter terms only while there are no terms", async () => {
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    expect(within(screen.getByRole("region", { name: "Contract terms" }))
      .getByRole("button", { name: "Start from the Premier Shade starter terms" })).toBeInTheDocument();
  });
  it("hides the starter once terms exist", async () => {
    listTemplates.mockResolvedValue([template({ kind: "terms", name: "Contract terms", response: "view" })]);
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("button", { name: /starter terms/ })).toBeNull();
  });
});

describe("TemplateForm", () => {
  it("fixes the response to View for terms and offers only the terms fields", () => {
    render(<TemplateForm template={null} />);
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "terms" } });
    expect(screen.getByLabelText("Client response")).toBeDisabled();
    expect(screen.getByLabelText("Client response")).toHaveValue("view");
    const fields = [...(screen.getByLabelText("Insert field") as HTMLSelectElement).options].map((o) => o.value).filter(Boolean);
    expect(fields).toEqual(["client_name", "project_no", "today", "company_name", "company_phone", "company_email"]);
    expect(screen.getByRole("button", { name: "Create template" })).toBeInTheDocument();
  });
  it("offers no field at all for a guide", () => {
    render(<TemplateForm template={null} />);
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "guide_care" } });
    expect(screen.queryByLabelText("Insert field")).toBeNull();
  });
  it("edits an existing template without changing its kind", () => {
    render(<TemplateForm template={{ id: "t1", name: "SA", kind: "service_agreement", response: "sign", body: "## A" }} />);
    expect(screen.queryByLabelText("Kind")).toBeNull();
    expect(screen.getByText("Service agreement")).toBeInTheDocument();
    expect(screen.getByLabelText("Client response")).toHaveValue("sign");
    expect(screen.getByLabelText("Text")).toHaveValue("## A");
    expect(screen.getByRole("button", { name: "Save template" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/docs/documents-page.test.tsx`
Expected: FAIL, cannot resolve the page.

- [ ] **Step 7: Write the form and the three pages**

`app/admin/documents/TemplateForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  DOC_RESPONSES, allowedFields, isSingletonKind, templateKindLabel, TEMPLATE_KINDS, type DocResponse, type TemplateKind,
} from "@/lib/docs/kinds";
import { createTemplateAction, saveTemplateAction, type TemplateFormState } from "./actions";
import { DocEditor } from "./DocEditor";

const CONTROL = "min-h-11 border border-rule bg-ivory px-3 text-sm";

/**
 * New and edit share one form. The kind is chosen once, at creation; the server re-derives it on
 * save. Every field is controlled: React resets uncontrolled fields when a form action finishes,
 * which would wipe what the owner typed whenever the server refuses the template.
 */
export function TemplateForm({ template }: {
  template: { id: string; name: string; kind: TemplateKind; response: DocResponse; body: string } | null;
}) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(template ? saveTemplateAction : createTemplateAction, {});
  const [name, setName] = useState(template?.name ?? "");
  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? "service_agreement");
  const [response, setResponse] = useState<DocResponse>(template?.response ?? "sign");
  const singleton = isSingletonKind(kind);

  return (
    <form action={action} className="flex flex-col gap-4">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div className="flex flex-wrap items-end gap-4">
        {template ? (
          <p className="text-sm">Kind: <span className="font-semibold">{templateKindLabel(template.kind)}</span></p>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Kind
            <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as TemplateKind)} className={CONTROL}>
              {TEMPLATE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
          Name
          <input name="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Client response
          <select name="response" value={singleton ? "view" : response} disabled={singleton}
            onChange={(event) => setResponse(event.target.value as DocResponse)} className={CONTROL}>
            {DOC_RESPONSES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </div>
      {singleton ? (
        <p className="text-sm text-ink-soft">
          {kind === "terms"
            ? "Contract terms print inside every contract. They can use the client's name, the project number, today's date and the company details."
            : "Guides appear on every client's project page at the right stage, so they can't use fields."}
        </p>
      ) : null}
      <DocEditor name="body" label="Text" defaultValue={template?.body ?? ""} mode="template" allowedFields={allowedFields(kind)}
        titleField="name" previewExtras={{ response: singleton ? "view" : response }} />
      {state.errors && state.errors.length > 0 ? (
        <ul aria-label="Template problems" className="flex flex-col gap-1 text-sm text-overdue">
          {state.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 bg-charcoal px-5 text-sm text-ivory">
          {template ? "Save template" : "Create template"}
        </button>
        {state.saved ? <p role="status" className="text-sm">Saved.</p> : null}
      </div>
    </form>
  );
}
```

`app/admin/documents/page.tsx`:

```tsx
import Link from "next/link";
import { ACTION_LINK } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { formatWhen } from "@/lib/admin/time";
import { TEMPLATE_GROUPS, docResponseLabel, templateGroup, templateKindLabel, type TemplateGroup } from "@/lib/docs/kinds";
import { listTemplates } from "@/lib/docs/templates";
import { startStarterTermsAction } from "./actions";

const EMPTY: Record<TemplateGroup, string> = {
  terms: "No contract terms yet. Contracts can't be sent until you add them.",
  client: "No client document templates yet.",
  guide: "No portal guides yet. A guide appears on the client's page only once you write it.",
};

/** Spec §5: live templates, grouped. Archived templates are not listed. */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ starter?: string | string[] }> }) {
  await requireAdmin();
  const [templates, query] = await Promise.all([listTemplates(), searchParams]);
  const hasTerms = templates.some((template) => template.kind === "terms");
  const starter = Array.isArray(query.starter) ? query.starter[0] : query.starter;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Link href="/admin/documents/new" className={ACTION_LINK}>New template</Link>
      </div>
      {starter === "exists" ? <p role="status" className="text-sm">There is already a live Contract terms template.</p> : null}
      {TEMPLATE_GROUPS.map((group) => {
        const inGroup = templates.filter((template) => templateGroup(template.kind) === group.value);
        return (
          <section key={group.value} aria-labelledby={`group-${group.value}`} className="flex flex-col gap-3">
            <h2 id={`group-${group.value}`} className="text-lg font-semibold">{group.label}</h2>
            {inGroup.length === 0 ? <p className="text-sm text-ink-soft">{EMPTY[group.value]}</p> : (
              <ul className="flex flex-col divide-y divide-rule border border-rule">
                {inGroup.map((template) => (
                  <li key={template.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                    <Link href={`/admin/documents/${template.id}`} className="font-semibold underline underline-offset-4">{template.name}</Link>
                    <span className="text-ink-soft">
                      {templateKindLabel(template.kind)} · {docResponseLabel(template.response)} · Updated {formatWhen(template.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {group.value === "terms" && !hasTerms ? (
              <form action={startStarterTermsAction}>
                <button type="submit" className={ACTION_LINK}>Start from the Premier Shade starter terms</button>
              </form>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
```

`app/admin/documents/new/page.tsx`:

```tsx
import Link from "next/link";
import { TEXT_LINK } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { TemplateForm } from "../TemplateForm";

export default async function NewTemplatePage() {
  await requireAdmin();
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Link href="/admin/documents" className={TEXT_LINK}>All documents</Link>
      <h1 className="text-2xl font-semibold">New template</h1>
      <TemplateForm template={null} />
    </div>
  );
}
```

`app/admin/documents/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { TEXT_LINK } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { getTemplate } from "@/lib/docs/templates";
import { archiveTemplateAction } from "../actions";
import { TemplateForm } from "../TemplateForm";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template || template.archivedAt) notFound();
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Link href="/admin/documents" className={TEXT_LINK}>All documents</Link>
      <h1 className="text-2xl font-semibold">{template.name}</h1>
      <TemplateForm template={{ id: template.id, name: template.name, kind: template.kind, response: template.response, body: template.body }} />
      <form action={archiveTemplateAction} className="flex flex-col gap-2 border-t border-rule pt-4">
        <input type="hidden" name="id" value={template.id} />
        <p className="text-sm text-ink-soft">Archiving hides this template. Documents already made from it keep their text.</p>
        <button type="submit" className="min-h-11 self-start border border-charcoal px-4 text-sm">Archive template</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Add Documents to the menu**

In `tests/admin/admin-nav.test.tsx`, rename the first test to `"links to Jobs, Schedule, Documents and Settings, with no New job link"` and add `expect(nav.getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/admin/documents");`. Append to `describe("AdminNav")`:

```tsx
  it("marks the Documents page and every template page as Documents", () => {
    for (const path of ["/admin/documents", "/admin/documents/new", "/admin/documents/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c"]) {
      pathname.mockReturnValue(path);
      const { unmount } = render(<AdminNav email="owner@example.com" />);
      expect(within(column()).getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");
      expect(within(column()).getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
      unmount();
    }
  });
  it("lists the four sections in order", () => {
    pathname.mockReturnValue("/admin");
    render(<AdminNav email="owner@example.com" />);
    expect(within(column()).getAllByRole("link").map((l) => l.textContent)).toEqual(["Jobs", "Schedule", "Documents", "Settings"]);
  });
```

In `app/admin/AdminNav.tsx`:

```tsx
const LINKS: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Jobs", icon: "jobs" },
  { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
  { href: "/admin/documents", label: "Documents", icon: "document" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

/** A job page, including the new-job form, belongs under Jobs; a template page under Documents. */
function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/jobs/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 9: Run the Documents and admin tests**

Run: `npx vitest run --maxWorkers=2 tests/docs tests/admin/admin-nav.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/admin/documents app/admin/AdminNav.tsx tests/docs/template-actions.test.ts tests/docs/documents-page.test.tsx tests/admin/admin-nav.test.tsx
git commit -m "feat: the Documents page, template editor and the Documents menu item

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

### Task 20: A job's Documents tab

**Files:**
- Modify: `app/admin/jobs/[id]/tabs.ts` (a `documents` tab after Files)
- Modify: `app/admin/jobs/[id]/page.tsx` (render the tab; `doc` and `sent` params)
- Create: `app/admin/jobs/[id]/document-actions.ts`, `DocumentsTab.tsx`, `CreateDocumentForm.tsx`, `DocumentPanel.tsx`, `VoidDocumentButton.tsx`
- Test: `tests/admin/job-tabs.test.tsx`, `tests/docs/document-actions.test.ts`, `tests/docs/documents-tab.test.tsx`

**Interfaces:**
- Consumes: `createDocumentFromTemplate`, `sendJobDocument`, `documentSendBlockers`, `TITLE_MAX` (Task 13); `listJobDocuments`, `updateDraft`, `discardDraft`, `voidDocument`, `JobDocument` (Task 6); `listTemplates` (Task 6); `BODY_MAX` (Task 2); kinds (Task 1); `DocEditor` (Task 15); `requireAdmin`; `isUuid`; `HEADING`, `TEXT_LINK`, `ACTION_LINK`, `CARD` from `./ui`; `firstParam` from `./tabs`.
- Produces:
  - Actions: `createDocumentAction(prev: { error?: string }, formData)` (fields `jobId`, `templateId`; redirects to `/admin/jobs/{jobId}?tab=documents&doc={id}`), `type DocumentFormState = { error?: string; saved?: boolean }`, `saveDocumentAction(prev, formData)` (fields `jobId`, `documentId`, `title`, `body`), `sendDocumentAction(jobId, documentId): Promise<{ error?: string; ok?: boolean; emailed?: boolean }>`, `voidDocumentAction(jobId, documentId): Promise<{ error?: string }>`, `discardDocumentAction(jobId, documentId): Promise<{ error?: string }>`.
  - `documentStatusLabel(doc)`: `Draft` · `Sent {date}` · `Signed {date}` · `Acknowledged {date}` · `Void` (a completed view document reads `Sent {date}`); `parseSentNotice(value): "1" | "email-failed" | null`; `SENT_NOTICES`.
  - UI contract (Task 22 relies on it): tab link "Documents"; h2 "Documents"; select "Template" with options `{name} ({kind label})`, button "Create document"; list labelled "Documents on this job", each row: title, response label, status, link "PDF", link "Edit" (drafts), button "Void" with accessible name `Void {title}` (sent only); draft panel region "Draft: {title}" with input "Title", `DocEditor` (textarea "Text"), button "Save draft", status "Saved.", list "Before you can send", note "Save your changes before sending.", button "Send to client", button "Discard draft"; after a send, status "Sent." or "Sent, but the email to the client failed — send them their project page link yourself."

- [ ] **Step 1: Write the failing tests**

In `tests/admin/job-tabs.test.tsx`, the "accepts each tab" list becomes `["overview", "measurements", "files", "documents", "quote", "install", "activity"]`.

`tests/docs/document-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => { order.push("auth"); return { email: "owner@example.com" }; });
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("@/lib/admin/jobs", () => ({ isUuid: (id: string) => /^[0-9a-f-]{36}$/.test(id) }));
const workflow = { createDocumentFromTemplate: vi.fn(), sendJobDocument: vi.fn(), TITLE_MAX: 200 };
vi.mock("@/lib/docs/workflow", () => workflow);
const store = { updateDraft: vi.fn(), discardDraft: vi.fn(), voidDocument: vi.fn() };
vi.mock("@/lib/docs/job-documents", () => store);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const actions = await import("@/app/admin/jobs/[id]/document-actions");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "33333333-3333-4333-8333-333333333333";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};

beforeEach(() => {
  order.length = 0;
  for (const f of [...Object.values(store), workflow.createDocumentFromTemplate, workflow.sendJobDocument, revalidatePath, redirect]) f.mockReset();
  redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
  workflow.createDocumentFromTemplate.mockImplementation(async () => { order.push("create"); return { id: DOC }; });
  workflow.sendJobDocument.mockImplementation(async () => { order.push("send"); return { ok: true, emailed: true }; });
  store.updateDraft.mockImplementation(async () => { order.push("save"); return true; });
  store.voidDocument.mockResolvedValue(true);
  store.discardDraft.mockResolvedValue(true);
});

describe("document actions", () => {
  it("createDocumentAction checks the admin, creates, then opens the draft", async () => {
    await expect(actions.createDocumentAction({}, form({ jobId: JOB, templateId: TEMPLATE })))
      .rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}?tab=documents&doc=${DOC}`);
    expect(order).toEqual(["auth", "create"]);
    expect(workflow.createDocumentFromTemplate).toHaveBeenCalledWith({ jobId: JOB, templateId: TEMPLATE, actor: "owner@example.com" });
  });
  it("createDocumentAction refuses malformed ids and passes a refusal through", async () => {
    expect(await actions.createDocumentAction({}, form({ jobId: JOB, templateId: "x" }))).toEqual({ error: "Choose a template." });
    workflow.createDocumentFromTemplate.mockResolvedValueOnce({ error: "That template is no longer available. Reload the page." });
    expect(await actions.createDocumentAction({}, form({ jobId: JOB, templateId: TEMPLATE })))
      .toEqual({ error: "That template is no longer available. Reload the page." });
  });
  it("saveDocumentAction validates, saves a draft only, and says when it is no longer one", async () => {
    expect(await actions.saveDocumentAction({}, form({ jobId: JOB, documentId: DOC, title: " ", body: "b" }))).toEqual({ error: "Give the document a title." });
    expect(await actions.saveDocumentAction({}, form({ jobId: JOB, documentId: DOC, title: "T", body: "b" }))).toEqual({ saved: true });
    expect(order).toEqual(["auth", "auth", "save"]);
    expect(store.updateDraft).toHaveBeenCalledWith({ leadId: JOB, documentId: DOC, title: "T", body: "b" });
    store.updateDraft.mockResolvedValueOnce(false);
    expect(await actions.saveDocumentAction({}, form({ jobId: JOB, documentId: DOC, title: "T", body: "b" })))
      .toEqual({ error: "This document has been sent and can no longer be changed." });
  });
  it("sendDocumentAction checks the admin first and turns a throw into a plain answer", async () => {
    expect(await actions.sendDocumentAction(JOB, DOC)).toEqual({ ok: true, emailed: true });
    expect(order).toEqual(["auth", "send"]);
    workflow.sendJobDocument.mockRejectedValueOnce(new Error("blob down"));
    expect(await actions.sendDocumentAction(JOB, DOC)).toEqual({ error: "The document could not be sent. Try again, and if it keeps failing, contact support." });
    workflow.sendJobDocument.mockResolvedValueOnce({ error: "Fill in {{deposit}} first." });
    expect(await actions.sendDocumentAction(JOB, DOC)).toEqual({ error: "Fill in {{deposit}} first." });
  });
  it("void and discard answer plainly when refused", async () => {
    store.voidDocument.mockResolvedValueOnce(false);
    expect(await actions.voidDocumentAction(JOB, DOC)).toEqual({ error: "Only a sent document that hasn't been signed or acknowledged can be voided." });
    store.discardDraft.mockResolvedValueOnce(false);
    expect(await actions.discardDocumentAction(JOB, DOC)).toEqual({ error: "Only a draft can be discarded." });
    expect(await actions.voidDocumentAction(JOB, DOC)).toEqual({});
    expect(store.voidDocument).toHaveBeenLastCalledWith(JOB, DOC, "owner@example.com");
  });
});
```

`tests/docs/documents-tab.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listJobDocuments = vi.fn();
vi.mock("@/lib/docs/job-documents", () => ({ listJobDocuments }));
const listTemplates = vi.fn();
vi.mock("@/lib/docs/templates", () => ({ listTemplates }));
vi.mock("@/app/admin/jobs/[id]/document-actions", () => ({
  createDocumentAction: vi.fn(async () => ({})), saveDocumentAction: vi.fn(async () => ({})),
  sendDocumentAction: vi.fn(async () => ({})), voidDocumentAction: vi.fn(async () => ({})), discardDocumentAction: vi.fn(async () => ({})),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const { DocumentsTab, documentStatusLabel, parseSentNotice } = await import("@/app/admin/jobs/[id]/DocumentsTab");

const JOB = "11111111-1111-4111-8111-111111111111";
const job = { id: JOB, email: "maria@example.com", status: "sold" } as never;
const doc = (over: Record<string, unknown>) => ({ id: "d1", leadId: JOB, templateId: null, title: "Service agreement — PSS-1048", kind: "service_agreement",
  response: "acknowledge", body: "Deposit {{deposit}}", status: "draft", fileId: null, sentAt: null, sentBy: null, completedAt: null, voidedAt: null,
  createdBy: "o", createdAt: new Date(), updatedAt: new Date(), ...over });

beforeEach(() => {
  listJobDocuments.mockReset().mockResolvedValue([]);
  listTemplates.mockReset().mockResolvedValue([{ id: "t1", name: "Service agreement", kind: "service_agreement" }, { id: "t2", name: "Terms", kind: "terms" }]);
});

describe("documentStatusLabel", () => {
  const sentAt = new Date("2026-09-28T18:00:00Z");
  const completedAt = new Date("2026-09-29T18:00:00Z");
  it("names every status, with its date", () => {
    expect(documentStatusLabel({ status: "draft", response: "sign", sentAt: null, completedAt: null })).toBe("Draft");
    expect(documentStatusLabel({ status: "sent", response: "sign", sentAt, completedAt: null })).toBe("Sent Sep 28, 2026");
    expect(documentStatusLabel({ status: "completed", response: "sign", sentAt, completedAt })).toBe("Signed Sep 29, 2026");
    expect(documentStatusLabel({ status: "completed", response: "acknowledge", sentAt, completedAt })).toBe("Acknowledged Sep 29, 2026");
    expect(documentStatusLabel({ status: "completed", response: "view", sentAt, completedAt: sentAt })).toBe("Sent Sep 28, 2026");
    expect(documentStatusLabel({ status: "void", response: "sign", sentAt, completedAt: null })).toBe("Void");
  });
  it("reads only the two known send notices", () => {
    expect(parseSentNotice("1")).toBe("1");
    expect(parseSentNotice(["email-failed"])).toBe("email-failed");
    expect(parseSentNotice("<b>hi</b>")).toBeNull();
  });
});

describe("DocumentsTab", () => {
  it("offers only client-document templates", async () => {
    render(await DocumentsTab({ job, selectedId: null, sentNotice: null }));
    const options = [...(screen.getByLabelText("Template") as HTMLSelectElement).options].map((o) => o.textContent);
    expect(options).toEqual(["Service agreement (Service agreement)"]);
    expect(screen.getByRole("button", { name: "Create document" })).toBeInTheDocument();
  });
  it("lists documents with status, PDF and Void only while sent", async () => {
    listJobDocuments.mockResolvedValue([
      doc({ id: "d1", status: "sent", fileId: "f1", sentAt: new Date("2026-09-28T18:00:00Z"), title: "A" }),
      doc({ id: "d2", status: "completed", fileId: "f2", sentAt: new Date(), completedAt: new Date("2026-09-29T18:00:00Z"), title: "B" }),
    ]);
    render(await DocumentsTab({ job, selectedId: null, sentNotice: null }));
    const rows = within(screen.getByRole("list", { name: "Documents on this job" })).getAllByRole("listitem");
    expect(within(rows[0]).getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/admin/files/f1");
    expect(within(rows[0]).getByRole("button", { name: "Void A" })).toBeInTheDocument();
    expect(within(rows[1]).getByText("Acknowledged Sep 29, 2026")).toBeInTheDocument();
    expect(within(rows[1]).queryByRole("button")).toBeNull();
  });
  it("opens a selected draft with its blockers, Send disabled", async () => {
    listJobDocuments.mockResolvedValue([doc({})]);
    render(await DocumentsTab({ job, selectedId: "d1", sentNotice: null }));
    const panel = screen.getByRole("region", { name: "Draft: Service agreement — PSS-1048" });
    expect(within(panel).getByRole("list", { name: "Before you can send" })).toHaveTextContent("Fill in {{deposit}} first.");
    expect(within(panel).getByRole("button", { name: "Send to client" })).toBeDisabled();
  });
  it("disables Send while there are unsaved changes", async () => {
    listJobDocuments.mockResolvedValue([doc({ body: "Deposit $500" })]);
    render(await DocumentsTab({ job, selectedId: "d1", sentNotice: null }));
    const panel = screen.getByRole("region", { name: "Draft: Service agreement — PSS-1048" });
    expect(within(panel).getByRole("button", { name: "Send to client" })).toBeEnabled();
    fireEvent.change(within(panel).getByLabelText("Text"), { target: { value: "Deposit $600" } });
    expect(within(panel).getByRole("button", { name: "Send to client" })).toBeDisabled();
    expect(within(panel).getByText("Save your changes before sending.")).toBeInTheDocument();
  });
  it("shows the fixed copy for a send notice", async () => {
    render(await DocumentsTab({ job, selectedId: null, sentNotice: "email-failed" }));
    expect(screen.getByRole("status")).toHaveTextContent("Sent, but the email to the client failed — send them their project page link yourself.");
  });
  it("points to the Documents page when there is no client template", async () => {
    listTemplates.mockResolvedValue([]);
    render(await DocumentsTab({ job, selectedId: null, sentNotice: null }));
    expect(screen.getByRole("link", { name: "Write one on the Documents page" })).toHaveAttribute("href", "/admin/documents/new");
  });
});
```

Run: `npx vitest run --maxWorkers=2 tests/admin/job-tabs.test.tsx tests/docs/document-actions.test.ts tests/docs/documents-tab.test.tsx` → FAIL.

- [ ] **Step 2: Add the tab**

`app/admin/jobs/[id]/tabs.ts`: insert `{ value: "documents", label: "Documents" },` after the `files` entry.

- [ ] **Step 3: Write `document-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { discardDraft, updateDraft, voidDocument } from "@/lib/docs/job-documents";
import { BODY_MAX } from "@/lib/docs/validate";
import { TITLE_MAX, createDocumentFromTemplate, sendJobDocument } from "@/lib/docs/workflow";

const str = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");
const refresh = (jobId: string) => revalidatePath(`/admin/jobs/${jobId}`);

// Each action calls requireAdmin() before reading its input.
export async function createDocumentAction(_previous: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const jobId = str(formData.get("jobId"));
  const templateId = str(formData.get("templateId"));
  if (!isUuid(jobId) || !isUuid(templateId)) return { error: "Choose a template." };
  const result = await createDocumentFromTemplate({ jobId, templateId, actor: admin.email });
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  redirect(`/admin/jobs/${jobId}?tab=documents&doc=${result.id}`);
}

export type DocumentFormState = { error?: string; saved?: boolean };

/** Drafts only (updateDraft's WHERE). The title is stored as typed, so the screen and the record match. */
export async function saveDocumentAction(_previous: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  await requireAdmin();
  const jobId = str(formData.get("jobId"));
  const documentId = str(formData.get("documentId"));
  const title = str(formData.get("title"));
  const body = str(formData.get("body"));
  if (!title.trim()) return { error: "Give the document a title." };
  if (title.length > TITLE_MAX) return { error: `The title must be ${TITLE_MAX} characters or fewer.` };
  if (body.length > BODY_MAX) return { error: "The document is too long." };
  if (!(await updateDraft({ leadId: jobId, documentId, title, body }))) {
    return { error: "This document has been sent and can no longer be changed." };
  }
  refresh(jobId);
  return { saved: true };
}

export async function sendDocumentAction(jobId: string, documentId: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }> {
  const admin = await requireAdmin();
  let result: Awaited<ReturnType<typeof sendJobDocument>>;
  try {
    result = await sendJobDocument({ jobId, documentId, actor: admin.email });
  } catch (error) {
    // Blob or pdf-lib can throw. The owner gets a plain answer, not the error page.
    console.error("Sending the document failed", error);
    return { error: "The document could not be sent. Try again, and if it keeps failing, contact support." };
  }
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { ok: true, emailed: result.emailed };
}

export async function voidDocumentAction(jobId: string, documentId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!(await voidDocument(jobId, documentId, admin.email))) {
    return { error: "Only a sent document that hasn't been signed or acknowledged can be voided." };
  }
  refresh(jobId);
  return {};
}

export async function discardDocumentAction(jobId: string, documentId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!(await discardDraft(jobId, documentId, admin.email))) return { error: "Only a draft can be discarded." };
  refresh(jobId);
  return {};
}
```

- [ ] **Step 4: Write the three client components**

`CreateDocumentForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createDocumentAction } from "./document-actions";
import { ACTION_LINK } from "./ui";

export function CreateDocumentForm({ jobId, templates }: { jobId: string; templates: { id: string; name: string; kindLabel: string }[] }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(createDocumentAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="flex flex-col gap-1 text-sm">
        Template
        <select name="templateId" required className="min-h-11 border border-rule bg-ivory px-2">
          {templates.map((t) => <option key={t.id} value={t.id}>{`${t.name} (${t.kindLabel})`}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending} className={ACTION_LINK}>Create document</button>
      {state.error ? <p role="alert" className="basis-full text-sm text-overdue">{state.error}</p> : null}
    </form>
  );
}
```

`DocumentPanel.tsx`:

```tsx
"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DocEditor } from "@/app/admin/documents/DocEditor";
import type { DocResponse } from "@/lib/docs/kinds";
import { discardDocumentAction, saveDocumentAction, sendDocumentAction, type DocumentFormState } from "./document-actions";
import { CARD } from "./ui";

/**
 * One draft. Send works from the SAVED text only: blockers are computed on the server from what is
 * stored, and Send is disabled while the screen differs from it, so what is sent is what is shown.
 */
export function DocumentPanel({ jobId, doc, blockers }: {
  jobId: string;
  doc: { id: string; title: string; body: string; response: DocResponse };
  blockers: string[];
}) {
  const router = useRouter();
  const [state, save, saving] = useActionState<DocumentFormState, FormData>(saveDocumentAction, {});
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const dirty = title !== doc.title || body !== doc.body;

  const send = () => startBusy(async () => {
    const result = await sendDocumentAction(jobId, doc.id);
    if (result.error) return setError(result.error);
    router.replace(`/admin/jobs/${jobId}?tab=documents&sent=${result.emailed === false ? "email-failed" : "1"}`);
  });
  const discard = () => startBusy(async () => {
    const result = await discardDocumentAction(jobId, doc.id);
    if (result.error) return setError(result.error);
    router.replace(`/admin/jobs/${jobId}?tab=documents`);
  });

  return (
    <section aria-labelledby="draft-heading" className={CARD}>
      <h3 id="draft-heading" className="text-base font-semibold">Draft: {doc.title}</h3>
      <form action={save} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="documentId" value={doc.id} />
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200}
            className="min-h-11 border border-rule bg-ivory px-3" />
        </label>
        <DocEditor name="body" label="Text" defaultValue={doc.body} mode="document" titleField="title"
          previewExtras={{ jobId, response: doc.response }} onChange={setBody} />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="min-h-11 border border-charcoal px-4 text-sm">Save draft</button>
          {state.saved && !dirty ? <p role="status" className="text-sm">Saved.</p> : null}
          {state.error ? <p role="alert" className="text-sm text-overdue">{state.error}</p> : null}
        </div>
      </form>
      {blockers.length > 0 ? (
        <ul aria-label="Before you can send" className="flex list-disc flex-col gap-1 pl-5 text-sm text-overdue">
          {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      ) : null}
      {dirty ? <p className="text-sm text-ink-soft">Save your changes before sending.</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={send} disabled={busy || dirty || blockers.length > 0} className="min-h-11 bg-charcoal px-5 text-sm text-ivory disabled:opacity-50">
          Send to client
        </button>
        <button type="button" onClick={discard} disabled={busy} className="min-h-11 border border-rule px-4 text-sm">Discard draft</button>
      </div>
      {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}
    </section>
  );
}
```

`VoidDocumentButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { voidDocumentAction } from "./document-actions";

/** Withdraws a sent, unanswered document: its file is un-shared and it reads Void (spec §6). */
export function VoidDocumentButton({ jobId, documentId, title }: { jobId: string; documentId: string; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      <button type="button" aria-label={`Void ${title}`} disabled={pending} className="min-h-11 border border-charcoal px-3 text-sm"
        onClick={() => start(async () => setError((await voidDocumentAction(jobId, documentId)).error ?? null))}>
        Void
      </button>
      {error ? <span role="alert" className="text-xs text-overdue">{error}</span> : null}
    </span>
  );
}
```

- [ ] **Step 5: Write `DocumentsTab.tsx` and wire the page**

```tsx
import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { formatShortDate } from "@/lib/admin/time";
import { docResponseLabel, isClientDocKind, templateKindLabel } from "@/lib/docs/kinds";
import { listJobDocuments, type JobDocument } from "@/lib/docs/job-documents";
import { listTemplates } from "@/lib/docs/templates";
import { documentSendBlockers } from "@/lib/docs/workflow";
import { CreateDocumentForm } from "./CreateDocumentForm";
import { DocumentPanel } from "./DocumentPanel";
import { firstParam } from "./tabs";
import { HEADING, TEXT_LINK } from "./ui";
import { VoidDocumentButton } from "./VoidDocumentButton";

/** Matched, never rendered: a crafted `?sent=` can never put words of its own on the page. */
export const SENT_NOTICES = {
  "1": "Sent.",
  "email-failed": "Sent, but the email to the client failed — send them their project page link yourself.",
} as const;
export type SentNotice = keyof typeof SENT_NOTICES;

export function parseSentNotice(value: string | string[] | undefined): SentNotice | null {
  const v = firstParam(value);
  return v === "1" || v === "email-failed" ? v : null;
}

export function documentStatusLabel(doc: Pick<JobDocument, "status" | "response" | "sentAt" | "completedAt">): string {
  if (doc.status === "draft") return "Draft";
  if (doc.status === "void") return "Void";
  if (doc.status === "completed" && doc.response === "sign" && doc.completedAt) return `Signed ${formatShortDate(doc.completedAt)}`;
  if (doc.status === "completed" && doc.response === "acknowledge" && doc.completedAt) return `Acknowledged ${formatShortDate(doc.completedAt)}`;
  const at = doc.sentAt ?? doc.completedAt;
  return at ? `Sent ${formatShortDate(at)}` : "Sent";
}

/** Spec §6: create from a template, edit the draft, send; the list shows each document's state. */
export async function DocumentsTab({ job, selectedId, sentNotice }: {
  job: Pick<Job, "id" | "email" | "status">;
  selectedId: string | null;
  sentNotice: SentNotice | null;
}) {
  const [documents, templates] = await Promise.all([listJobDocuments(job.id), listTemplates()]);
  const usable = templates.filter((template) => isClientDocKind(template.kind));
  const selected = documents.find((doc) => doc.id === selectedId && doc.status === "draft") ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h2 className={HEADING}>Documents</h2>
      {sentNotice ? <p role="status" className="text-sm">{SENT_NOTICES[sentNotice]}</p> : null}
      {usable.length > 0 ? (
        <CreateDocumentForm jobId={job.id} templates={usable.map((t) => ({ id: t.id, name: t.name, kindLabel: templateKindLabel(t.kind) }))} />
      ) : (
        <p className="text-sm">
          No client document templates yet. <Link href="/admin/documents/new" className={TEXT_LINK}>Write one on the Documents page</Link>.
        </p>
      )}
      {documents.length === 0 ? <p className="text-sm text-ink-soft">No documents on this job yet.</p> : (
        <ul aria-label="Documents on this job" className="flex flex-col divide-y divide-rule border border-rule">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1 basis-full font-semibold sm:basis-auto">{doc.title}</span>
              <span className="text-ink-soft">{docResponseLabel(doc.response)}</span>
              <span>{documentStatusLabel(doc)}</span>
              {doc.fileId ? <a href={`/admin/files/${doc.fileId}`} target="_blank" rel="noreferrer" className={TEXT_LINK}>PDF</a> : null}
              {doc.status === "draft" ? <Link href={`/admin/jobs/${job.id}?tab=documents&doc=${doc.id}`} className={TEXT_LINK}>Edit</Link> : null}
              {doc.status === "sent" ? <VoidDocumentButton jobId={job.id} documentId={doc.id} title={doc.title} /> : null}
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <DocumentPanel key={selected.id} jobId={job.id}
          doc={{ id: selected.id, title: selected.title, body: selected.body, response: selected.response }}
          blockers={documentSendBlockers(selected, job)} />
      ) : null}
    </div>
  );
}
```

`app/admin/jobs/[id]/page.tsx`: add `doc?: string | string[]; sent?: string | string[]` to the `searchParams` type; import `DocumentsTab`, `parseSentNotice` from `./DocumentsTab`; after the Files tab block render:

```tsx
      {tab === "documents" ? (
        <DocumentsTab job={job} selectedId={firstParam(query.doc) ?? null} sentNotice={parseSentNotice(query.sent)} />
      ) : null}
```

- [ ] **Step 6: Run the job-page and Documents tests**

Run: `npx vitest run --maxWorkers=2 tests/admin tests/docs`
Expected: PASS (including `job-page-layout.test.tsx`, which imports the page: the new imports are only called on the Documents tab).

- [ ] **Step 7: Commit**

```bash
git add "app/admin/jobs/[id]" tests/admin/job-tabs.test.tsx tests/docs/document-actions.test.ts tests/docs/documents-tab.test.tsx
git commit -m "feat: a job's Documents tab: create from a template, edit the draft, send, void

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---
### Task 21: Prove the SQL against the Neon test branch (hand-run script)

The unit tests mock `db()`, so they prove SQL text only. This script calls the real functions against the real test branch. It is modelled on `scripts/verify-dc-quote-import.ts` and its config, and like it is run by hand, never by `npm test`.

**Files:**
- Create: `scripts/verify-documents.config.mts`
- Create: `scripts/verify-documents.ts`

**Interfaces:**
- Consumes (real, unmocked): `createFile`, `deleteFile`, `getFile`, `setDocType`, `setShared` (Task 8); `createTemplate`, `archiveTemplate`, `updateTemplate` (Task 6); `insertDraft`, `updateDraft`, `discardDraft`, `markSent`, `voidDocument` (Task 6); `createDocumentFromTemplate`, `sendJobDocument` (Task 13); `acknowledgeableDocuments`, `recordAcknowledgement` (Task 7); `recordSignature` (Task 7); `buildDocumentPdf` runs for real. Mocked: `@vercel/blob` (in memory) and `lib/docs/emails` (no network).
- Produces: a PASSED line, or the first failed check. Nothing else depends on it.

- [ ] **Step 1: Write the config**

`scripts/verify-documents.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-documents.ts and nothing else. Deliberately NOT reachable from
 * vitest.config.mts (whose include is tests/**): this script must never be swept into npm test
 * and counted as coverage. It is run by hand against a Neon test branch.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-documents.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/server-only-stub.ts"),
    },
  },
});
```

- [ ] **Step 2: Write the script**

`scripts/verify-documents.ts`:

```ts
/**
 * Behavioural proof of the Documents SQL: migration 026, lib/docs/templates.ts,
 * lib/docs/job-documents.ts, lib/docs/workflow.ts, lib/portal/acknowledge-document.ts, the
 * `document` CTE in lib/portal/sign.ts, and the job-document clauses in lib/admin/files.ts.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, is in no suite, and CI does not run it. If
 * you change any statement above, run it, and if you cannot, call that SQL unverified.
 *
 * Mocks: @vercel/blob (in memory, there is no blob token here) and lib/docs/emails (no network).
 * Every statement reaches the database for real, and the PDF is really built.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and
 * refuses a URL that looks like production. It archives any live terms or guide template for the
 * run (the singleton checks need a clean slate) and puts them back in `finally`.
 *
 * Usage (PowerShell, from the worktree root; loads the URL without printing it):
 *   Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*E2E_POSTGRES_URL\s*=\s*(.*)$') { $env:E2E_POSTGRES_URL = $matches[1].Trim().Trim('"').Trim("'") } }
 *   npx vitest run --config scripts/verify-documents.config.mts
 *
 * To watch it fail (the only way to know it works): delete `and title = ${input.title} and body =
 * ${input.body}` from markSent (lib/docs/job-documents.ts): step 5's stale-body check must fail.
 * Put it back. Delete `and status = 'sent'` from voidDocument: step 9 must fail. Delete the
 * `where exists (...)` guard from recordAcknowledgement: step 10's voided check must fail.
 */
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

const blobs = vi.hoisted(() => new Map<string, Buffer>());
const emails = vi.hoisted(() => [] as string[]);
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, body: Blob | Buffer) => {
    blobs.set(pathname, body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body));
    return { pathname };
  },
  del: async (pathname: string) => {
    blobs.delete(pathname);
  },
  get: async (pathname: string) => {
    const bytes = blobs.get(pathname);
    if (!bytes) return null;
    return { statusCode: 200, stream: new Blob([new Uint8Array(bytes)]).stream(), blob: { contentType: "application/pdf" } };
  },
}));
vi.mock("../lib/docs/emails", () => ({
  sendDocumentEmail: async (_job: unknown, title: string) => {
    emails.push(title);
  },
  notifyOwnersOfDocumentAcknowledgement: async () => {},
}));

import { createFile, deleteFile, getFile, setDocType, setShared } from "../lib/admin/files";
import { discardDraft, insertDraft, markSent, updateDraft, voidDocument } from "../lib/docs/job-documents";
import { archiveTemplate, createTemplate, updateTemplate } from "../lib/docs/templates";
import { createDocumentFromTemplate, sendJobDocument } from "../lib/docs/workflow";
import { acknowledgeableDocuments, recordAcknowledgement } from "../lib/portal/acknowledge-document";
import { formatProjectNo } from "../lib/portal/project-no";
import { recordSignature } from "../lib/portal/sign";

const FORBIDDEN_HOSTS = ["cold-term"];
const BANNER = "\n================ verify-documents REFUSED TO RUN ================\n";
function refuse(reason: string): never {
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-documents refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse("E2E_POSTGRES_URL is not set. This script WRITES rows, so it never falls back to POSTGRES_URL, DATABASE_URL or .env.local. It does not skip: no result means it did not run.");
}
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse("E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.");
  }
})();
for (const forbidden of FORBIDDEN_HOSTS) {
  if (url.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at ${host}, which matches the production endpoint "${forbidden}". Use a Neon test branch.`);
}

// The modules under test read the connection through lib/db at call time: only the vetted URL.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;

const sql = neon(url);
const ACTOR = "verify-documents@example.com";
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Documents";
const SINGLETONS = ["terms", "guide_install", "guide_care"];
const NO_JOB = "00000000-0000-4000-8000-000000000000";

function check(condition: unknown, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const idOf = (result: { id: string } | { error: string }, what: string): string => {
  if (!("id" in result)) throw new Error(`setup: ${what}: ${result.error}`);
  return result.id;
};

const newLead = async (suffix: string): Promise<{ id: string; projectNo: number }> => {
  const [row] = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550199', ${`verify-docs-${STAMP}-${suffix}@example.com`}, 'Henderson', 'phone', 'sold')
    returning id, project_no`;
  return { id: row.id as string, projectNo: Number(row.project_no) };
};
const footprint = async (leadId: string) => (await sql`
  select (select count(*)::int from job_documents where lead_id = ${leadId}) as documents,
         (select count(*)::int from job_files where lead_id = ${leadId}) as files,
         (select count(*)::int from job_events where lead_id = ${leadId}) as events,
         (select count(*)::int from document_acknowledgements where lead_id = ${leadId}) as acknowledgements`)[0];
const docRow = async (id: string) =>
  (await sql`select status, file_id, title, body, sent_at, completed_at, voided_at from job_documents where id = ${id}`)[0];
const fileRow = async (id: string) =>
  (await sql`select shared_at, doc_type, name, blob_pathname from job_files where id = ${id}`)[0];
const documentEvents = async (leadId: string) =>
  (await sql`select body from job_events where lead_id = ${leadId} and kind = 'document' order by created_at`).map((r) => r.body as string);
const scriptLeads = async () => (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

/** Creates a document from `templateId` on job A, replaces its text with `body`, sends it, answers its id and file. */
async function sendNew(jobId: string, templateId: string, body: string): Promise<{ id: string; fileId: string }> {
  const id = idOf(await createDocumentFromTemplate({ jobId, templateId, actor: ACTOR }), "create a document");
  const row = await docRow(id);
  if (!(await updateDraft({ leadId: jobId, documentId: id, title: row.title as string, body }))) throw new Error("setup: updateDraft");
  const sent = await sendJobDocument({ jobId, documentId: id, actor: ACTOR });
  if (!("ok" in sent)) throw new Error(`setup: send: ${sent.error}`);
  return { id, fileId: (await docRow(id)).file_id as string };
}

test("Documents: templates, drafts, send, acknowledge, void and sign against a real database", async () => {
  console.log("\nverify-documents: writing to a test branch\n");
  const prior = (await sql`select id from document_templates where archived_at is null and kind = any(${SINGLETONS})`).map((r) => r.id as string);
  if (prior.length > 0) await sql`update document_templates set archived_at = now() where id = any(${prior})`;
  const A = await newLead("A");
  const B = await newLead("B");

  try {
    console.log("step 1: templates and the singleton index");
    const terms = await createTemplate({ name: "VERIFY terms", kind: "terms", response: "sign", body: "For {{client_name}}", actor: ACTOR });
    const termsId = idOf(terms, "create terms");
    check((await sql`select response from document_templates where id = ${termsId}`)[0].response === "view",
      "terms are stored view-only whatever was asked", "not view");
    const second = await createTemplate({ name: "VERIFY terms 2", kind: "terms", response: "view", body: "x", actor: ACTOR });
    check("error" in second, "a second live terms template is refused by the unique index", JSON.stringify(second));
    check((await archiveTemplate(termsId, ACTOR)) === true, "archiving the live terms answers true", "false");
    check((await archiveTemplate(termsId, ACTOR)) === false, "archiving it again answers false", "true");
    check((await updateTemplate({ id: termsId, name: "x", response: "view", body: "x", actor: ACTOR })) === false,
      "an archived template cannot be edited", "true");
    idOf(await createTemplate({ name: "VERIFY terms 3", kind: "terms", response: "view", body: "x", actor: ACTOR }), "terms 3");
    console.log("  ok  with the old terms archived, a new live one is allowed");
    const saId = idOf(await createTemplate({ name: "VERIFY Service agreement", kind: "service_agreement", response: "acknowledge",
      body: "## Scope\n\nHi {{client_first_name}}. Deposit {{deposit}}.", actor: ACTOR }), "service agreement");
    idOf(await createTemplate({ name: "VERIFY Service agreement 2", kind: "service_agreement", response: "acknowledge", body: "x", actor: ACTOR }), "sa 2");
    console.log("  ok  a client-document kind may have many live templates");

    console.log("step 2: a draft, filled from the job");
    const bBefore = await footprint(B.id);
    const d1 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: saId, actor: ACTOR }), "create d1");
    const row1 = await docRow(d1);
    const title = `VERIFY Service agreement — ${formatProjectNo(A.projectNo)}`;
    check(row1.status === "draft" && row1.title === title && row1.body === "## Scope\n\nHi VERIFY. Deposit {{deposit}}.",
      "the draft is filled, the missing deposit left as a marker, titled with the PSS number", JSON.stringify(row1));
    check(same(await documentEvents(A.id), [`Drafted "${title}"`]), "one document event, Drafted", JSON.stringify(await documentEvents(A.id)));
    check((await insertDraft({ leadId: NO_JOB, templateId: null, title: "t", kind: "other", response: "view", body: "b", actor: ACTOR })) === null,
      "no draft is written for a job that does not exist", "an id");

    console.log("step 3: send is blocked while a marker remains");
    const blocked = await sendJobDocument({ jobId: A.id, documentId: d1, actor: ACTOR });
    check("error" in blocked && blocked.error === "Fill in {{deposit}} first.", "Send names the marker", JSON.stringify(blocked));
    check((await footprint(A.id)).files === 0, "and nothing was stored", "a file");

    console.log("step 4: draft edits");
    const finalBody = "## Scope\n\nHi VERIFY. Deposit $500.";
    check((await updateDraft({ leadId: B.id, documentId: d1, title, body: finalBody })) === false, "another job cannot edit the draft", "true");
    check((await updateDraft({ leadId: A.id, documentId: d1, title, body: finalBody })) === true, "the draft is edited", "false");

    console.log("step 5: markSent re-checks everything where it is stored");
    const scratch = await createFile({ leadId: A.id, kind: "document", name: "scratch.pdf", contentType: "application/pdf",
      body: new Blob(["%PDF-1.4 scratch"]), actor: ACTOR });
    if (!scratch) throw new Error("setup: scratch file");
    check((await markSent({ leadId: A.id, documentId: d1, fileId: scratch.id, title, body: "stale text", actor: ACTOR })) === false,
      "a body other than the stored one is refused", "true");
    await sql`update job_documents set body = 'Deposit {{deposit}}' where id = ${d1}`;
    check((await markSent({ leadId: A.id, documentId: d1, fileId: scratch.id, title, body: "Deposit {{deposit}}", actor: ACTOR })) === false,
      "a stored marker is refused by the database's own pattern", "true");
    await sql`update job_documents set body = ${finalBody} where id = ${d1}`;
    await sql`update leads set status = 'lost' where id = ${A.id}`;
    check((await markSent({ leadId: A.id, documentId: d1, fileId: scratch.id, title, body: finalBody, actor: ACTOR })) === false,
      "a Lost job is refused", "true");
    await sql`update leads set status = 'sold' where id = ${A.id}`;
    check((await docRow(d1)).status === "draft" && (await fileRow(scratch.id)).shared_at === null,
      "the draft is still a draft and the file still private", "changed");
    check((await deleteFile(scratch.id, ACTOR)) === true, "positive control: a file no document names deletes", "false");

    console.log("step 6: send");
    const sent = await sendJobDocument({ jobId: A.id, documentId: d1, actor: ACTOR });
    check("ok" in sent && sent.emailed === true, "sendJobDocument answers ok, emailed", JSON.stringify(sent));
    const row2 = await docRow(d1);
    check(row2.status === "sent" && row2.file_id && row2.sent_at && !row2.completed_at, "the document is sent and names its PDF", JSON.stringify(row2));
    const file1Id = row2.file_id as string;
    const file1 = await fileRow(file1Id);
    check(file1.shared_at !== null && file1.doc_type === "other" && file1.name === `${title}.pdf`,
      "its PDF is shared, typed other, named after the title", JSON.stringify(file1));
    check(blobs.get(file1.blob_pathname as string)?.subarray(0, 5).toString() === "%PDF-", "the stored bytes are a PDF", "not a PDF");
    check((await documentEvents(A.id)).includes(`Sent "${title}"`), "a Sent event is logged", JSON.stringify(await documentEvents(A.id)));
    check(same(emails, [title]), "the client email was sent once", JSON.stringify(emails));

    console.log("step 7: frozen once sent");
    check((await updateDraft({ leadId: A.id, documentId: d1, title, body: "changed" })) === false, "a sent document cannot be edited", "true");
    check((await discardDraft(A.id, d1, ACTOR)) === false, "nor discarded", "true");
    check((await setShared(A.id, file1Id, false, ACTOR)) === false, "the Files tab cannot unshare its PDF", "true");
    check((await setShared(A.id, file1Id, true, ACTOR)) === false, "nor share it", "true");
    check((await setDocType(A.id, file1Id, "quote", ACTOR)) === false, "nor relabel it", "true");
    check((await deleteFile(file1Id, ACTOR)) === false, "nor delete it (answered false, not a foreign-key error)", "true");
    check((await fileRow(file1Id)).shared_at !== null, "it is still shared", "unshared");

    console.log("step 8: acknowledge, and the release gate");
    const listA = await acknowledgeableDocuments(A.id);
    check(listA.length === 1 && listA[0].id === d1 && listA[0].file.id === file1Id, "A has the document to acknowledge", JSON.stringify(listA));
    check((await acknowledgeableDocuments(B.id)).length === 0, "B has nothing to acknowledge", "something");
    const gate = await recordAcknowledgement({ jobId: B.id, document: listA[0], name: "Mallory", email: "b@example.com", ip: null, userAgent: null });
    check(gate === "not-found", "acknowledging A's document as job B writes nothing", gate);
    check(same(await footprint(B.id), bBefore), "B has no new rows", JSON.stringify(await footprint(B.id)));
    const ack = await recordAcknowledgement({ jobId: A.id, document: listA[0], name: "  Pat Client ", email: "pat@example.com", ip: "1.2.3.4", userAgent: "UA" });
    check(ack === "acknowledged", "the client acknowledges it", ack);
    const acks = await sql`select * from document_acknowledgements where file_id = ${file1Id}`;
    const expectedSha = createHash("sha256").update(blobs.get(file1.blob_pathname as string)!).digest("hex");
    check(acks.length === 1 && acks[0].doc_sha256 === expectedSha && acks[0].acknowledged_name === "Pat Client"
      && acks[0].acknowledged_email === "pat@example.com" && acks[0].lead_id === A.id,
      "one record, fingerprinting the stored bytes, trimmed name, session email", JSON.stringify(acks));
    check((await docRow(d1)).status === "completed", "the document is completed in the same statement", "not completed");
    const again = await recordAcknowledgement({ jobId: A.id, document: listA[0], name: "Pat", email: "pat@example.com", ip: null, userAgent: null });
    check(again === "already-acknowledged", "a repeat is a no-op", again);
    const ackEvents = (await documentEvents(A.id)).filter((body) => body.startsWith("Acknowledged"));
    check(same(ackEvents, [`Acknowledged "${title}" from their project page`]), "one Acknowledged event, naming the document not the typed name", JSON.stringify(ackEvents));
    check((await acknowledgeableDocuments(A.id)).length === 0, "nothing left to acknowledge", "something");
    check((await setShared(A.id, file1Id, false, ACTOR)) === false, "an acknowledged file cannot be unshared", "true");

    console.log("step 9: a completed document cannot be voided");
    check((await voidDocument(A.id, d1, ACTOR)) === false, "void refuses a completed document", "true");
    check((await fileRow(file1Id)).shared_at !== null, "and its file stays shared", "unshared");

    console.log("step 10: void");
    const d2 = await sendNew(A.id, saId, finalBody);
    check((await voidDocument(B.id, d2.id, ACTOR)) === false, "another job cannot void it", "true");
    check((await voidDocument(A.id, d2.id, ACTOR)) === true, "void answers true for a sent document", "false");
    const row3 = await docRow(d2.id);
    check(row3.status === "void" && row3.voided_at !== null && (await fileRow(d2.fileId)).shared_at === null,
      "it is void and its file unshared", JSON.stringify(row3));
    check((await setShared(A.id, d2.fileId, true, ACTOR)) === false, "the Files tab cannot share a voided document again", "true");
    const voidedFile = await getFile(d2.fileId);
    const late = await recordAcknowledgement({ jobId: A.id, document: { id: d2.id, title, file: voidedFile! }, name: "Pat", email: "pat@example.com", ip: null, userAgent: null });
    check(late === "not-found", "a voided document cannot be acknowledged", late);

    console.log("step 11: a view document completes when sent");
    const viewId = idOf(await createTemplate({ name: "VERIFY Care notes", kind: "other", response: "view", body: "Dust weekly.", actor: ACTOR }), "view");
    const d3 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: viewId, actor: ACTOR }), "create d3");
    const viewSent = await sendJobDocument({ jobId: A.id, documentId: d3, actor: ACTOR });
    const row4 = await docRow(d3);
    check("ok" in viewSent && row4.status === "completed" && row4.completed_at !== null, "a view document is completed on send", JSON.stringify(row4));

    console.log("step 12: a sign document is signed through the contract path");
    const signTemplate = idOf(await createTemplate({ name: "VERIFY Change order", kind: "change_order", response: "sign",
      body: "## Change\n\nOne more shade for {{client_name}}.", actor: ACTOR }), "sign");
    const d4 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: signTemplate, actor: ACTOR }), "create d4");
    const signSent = await sendJobDocument({ jobId: A.id, documentId: d4, actor: ACTOR });
    const signFileId = (await docRow(d4)).file_id as string;
    check("ok" in signSent && (await fileRow(signFileId)).doc_type === "contract", "a sign document's PDF is a contract", JSON.stringify(signSent));
    const signed = await recordSignature({ jobId: A.id, file: (await getFile(signFileId))!, name: "Pat Client", email: "pat@example.com", ip: null, userAgent: null });
    check(signed === "signed" && (await docRow(d4)).status === "completed", "signing completes the document in the same statement", signed);
    const [lead] = await sql`select status, sold_cents from leads where id = ${A.id}`;
    check(lead.status === "sold" && lead.sold_cents === null, "no Direct Connect version: the sale is untouched", JSON.stringify(lead));
    check((await voidDocument(A.id, d4, ACTOR)) === false, "a signed document cannot be voided", "true");

    console.log("step 13: discard a draft");
    const d5 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: saId, actor: ACTOR }), "create d5");
    check((await discardDraft(A.id, d5, ACTOR)) === true, "a draft is discarded", "false");
    check((await sql`select id from job_documents where id = ${d5}`).length === 0, "its row is gone", "still there");
    check((await documentEvents(A.id)).includes(`Discarded draft "${title}"`), "and the discard is logged", "no event");
    check(same(await footprint(B.id), bBefore), "B still has no new rows at the end", JSON.stringify(await footprint(B.id)));

    console.log("\nPASSED: the Documents SQL holds against a real database. Manual run, not coverage.\n");
  } finally {
    // Never throws: a throw here would replace the failure being reported.
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`cleanup could not ${label}:`, (error as Error).message);
      }
    };
    let leads = [A.id, B.id];
    await attempt("find leftover leads", async () => { leads = [...new Set([...leads, ...(await scriptLeads())])]; });
    await attempt("delete acknowledgements", () => sql`delete from document_acknowledgements where lead_id = any(${leads})`);
    await attempt("delete signatures", () => sql`delete from contract_signatures where lead_id = any(${leads})`);
    await attempt("delete documents", () => sql`delete from job_documents where lead_id = any(${leads})`);
    await attempt("delete events", () => sql`delete from job_events where lead_id = any(${leads})`);
    await attempt("delete files", () => sql`delete from job_files where lead_id = any(${leads})`);
    await attempt("delete leads", () => sql`delete from leads where id = any(${leads})`);
    await attempt("delete templates", () => sql`delete from document_templates where created_by = ${ACTOR}`);
    await attempt("restore the owners' live terms and guides",
      () => sql`update document_templates set archived_at = null where id = any(${prior})`);
    await attempt("report", async () => {
      const [left] = await sql`select (select count(*)::int from leads where name like ${`${NAME_PREFIX} %`}) as leads,
        (select count(*)::int from document_templates where created_by = ${ACTOR}) as templates,
        (select count(*)::int from document_templates where id = any(${prior}) and archived_at is null) as restored`;
      console.log(`cleanup: ${left.leads} leads and ${left.templates} templates left, ${left.restored} of ${prior.length} owner templates restored`);
    });
  }
});
```

- [ ] **Step 3: Run it against the Neon test branch**

Migration 026 must already be on the branch (Task 5 Step 6). PowerShell, from the worktree root, never printing the URL:

```powershell
Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*E2E_POSTGRES_URL\s*=\s*(.*)$') { $env:E2E_POSTGRES_URL = $matches[1].Trim().Trim('"').Trim("'") } }
npx vitest run --config scripts/verify-documents.config.mts
```

Expected: every `ok` line, then `PASSED: the Documents SQL holds against a real database.` and `cleanup: 0 leads and 0 templates left`.

- [ ] **Step 4: Watch it fail (test power)**

Delete `and title = ${input.title} and body = ${input.body}` from `markSent` in `lib/docs/job-documents.ts` and re-run: step 5 must print `FAILED: a body other than the stored one is refused`. Restore it (`git diff lib/docs/job-documents.ts` must be empty afterwards). Do the same with `and status = 'sent'` in `voidDocument` (step 9 must fail) and restore.

- [ ] **Step 5: Re-run the two older hand-run scripts this feature touches**

`lib/portal/sign.ts` (Task 7) and `lib/dc/send.ts` (Task 14) changed, so their real-DB proofs must still pass, with `E2E_POSTGRES_URL` still set from Step 3:

```powershell
npx vitest run --config scripts/verify-contract-signing.config.mts
npx vitest run --config scripts/verify-dc-quote-import.config.mts
Remove-Item Env:E2E_POSTGRES_URL
```

Expected: both end in their PASSED line. If `verify-dc-quote-import` fails only because a live terms template exists on the branch, archive it for the run (it expects the legacy upload path) and say so in the report.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-documents.ts scripts/verify-documents.config.mts
git commit -m "test: hand-run proof of the Documents SQL against a Neon test branch

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---
## Wave 4

### Task 22: End-to-end tests and the release gate

**Files:**
- Create: `e2e/fixtures/pdf-text.ts`, `e2e/documents.spec.ts`
- Modify: `e2e/dc-quote.spec.ts` (terms come from the Documents page; "Documents to sign"; the contract prints the terms text)
- Modify: `e2e/portal.spec.ts:965,973` ("Your contract" → "Documents to sign")
- Modify: `playwright.config.ts` (owner email; mobile ignore)

**Interfaces:**
- Consumes: the UI contracts written in Tasks 16, 19 and 20 (exact labels and texts), the schema from Task 5.
- Produces: `pdfText(bytes: Buffer): string[]` — every string pdf-lib drew (content streams inflated, `<hex> Tj` decoded). Verified while planning against pdf-lib 1.17 output.

- [ ] **Step 1: The PDF text helper**

`e2e/fixtures/pdf-text.ts`:

```ts
import { inflateSync } from "node:zlib";

/**
 * The strings pdf-lib drew into a PDF: each content stream inflated, each `<hex> Tj` decoded. Enough
 * to prove which words a generated PDF carries (pdf-lib writes one Tj per drawText); it is not a
 * general PDF parser and is not meant for PDFs made by anything else.
 */
export function pdfText(bytes: Buffer): string[] {
  const source = bytes.toString("latin1");
  const out: string[] = [];
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = Buffer.from(match[1], "latin1");
    try {
      body = inflateSync(body);
    } catch {
      // Not compressed: read as is.
    }
    for (const text of body.toString("latin1").matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      out.push(Buffer.from(text[1], "hex").toString("latin1"));
    }
  }
  return out;
}
```

- [ ] **Step 2: Register the spec's owner and keep it off the phone project**

In `playwright.config.ts`: append `,e2e-docs-owner@example.com` inside the `ADMIN_EMAILS` string, and add `|documents` to the mobile project's `testIgnore` alternation (after `dc-quote`).

- [ ] **Step 3: Write `e2e/documents.spec.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";
import { formatProjectNo } from "../lib/portal/project-no";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run the Documents tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const STAMP = Date.now();
const NAME = `E2E Docs ${STAMP}`;
const OWNER = "e2e-docs-owner@example.com";
const CUSTOMER = `e2e-docs-${STAMP}@example.com`;
const BYSTANDER = `e2e-docs-bystander-${STAMP}@example.com`;
const ACK_TEMPLATE = `E2E Agreement ${STAMP}`;
const SIGN_TEMPLATE = `E2E Change Order ${STAMP}`;
const EMAIL_FAILED = "Sent, but the email to the client failed — send them their project page link yourself.";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function signInOwner(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

async function customerPage(browser: Browser, email: string): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/project/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/project$/);
  return page;
}

/** Fetches a file with the page's own session (the cookie is Secure: page.request would arrive signed out). */
async function fetchFile(page: Page, href: string): Promise<{ status: number; bytes: Buffer }> {
  const { status, base64 } = await page.evaluate(async (target) => {
    const response = await fetch(target, { redirect: "manual" });
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return { status: response.status, base64: btoa(binary) };
  }, href);
  return { status, bytes: Buffer.from(base64, "base64") };
}

async function lead(name: string, email: string, status: string): Promise<{ id: string; projectNo: number }> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550161', ${email}, 'Henderson', 'phone', ${status}) returning id, project_no`;
  return { id: row.id as string, projectNo: Number(row.project_no) };
}

const documentsTab = async (page: Page, jobId: string) => {
  await page.goto(`/admin/jobs/${jobId}?tab=documents`);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
};

/** Creates a document from a template on the job's Documents tab; answers its draft panel. */
async function createDocument(page: Page, jobId: string, option: string, title: string) {
  await documentsTab(page, jobId);
  await page.getByLabel("Template").selectOption({ label: option });
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/tab=documents&doc=[0-9a-f-]{36}/);
  return page.getByRole("region", { name: `Draft: ${title}` });
}

let job: { id: string; projectNo: number };
let bystander: { id: string; projectNo: number };
let priorGuides: string[] = [];
const ackTitle = () => `${ACK_TEMPLATE} — ${formatProjectNo(job.projectNo)}`;
const signTitle = () => `${SIGN_TEMPLATE} — ${formatProjectNo(job.projectNo)}`;

test.beforeAll(async () => {
  if (!url) return;
  // Sending stores the PDF in Blob and acknowledging fingerprints the stored bytes, so this is a
  // release gate: a missing token fails loudly rather than skipping and reading green.
  if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
    throw new Error("E2E_BLOB_READ_WRITE_TOKEN is not set. The Documents tests must run against the test blob store, not skip.");
  }
  job = await lead(`${NAME} A`, CUSTOMER, "sold");
  bystander = await lead(`${NAME} B`, BYSTANDER, "sold");
  // One live install guide exists across the whole database: set any aside for the run.
  priorGuides = (await sql()`select id from document_templates where archived_at is null and kind = 'guide_install'`).map((r) => r.id as string);
  if (priorGuides.length > 0) await sql()`update document_templates set archived_at = now() where id = any(${priorGuides})`;
  await sql()`insert into document_templates (id, name, kind, response, body, created_by, updated_by)
    values (gen_random_uuid(), ${`E2E Install guide ${STAMP}`}, 'guide_install', 'view', ${"## Before we arrive\n\n- Clear the windowsills."}, ${OWNER}, ${OWNER})`;
  await sql()`insert into document_templates (id, name, kind, response, body, created_by, updated_by)
    values (gen_random_uuid(), ${SIGN_TEMPLATE}, 'change_order', 'sign', ${"## Change\n\nOne more shade for {{client_name}}."}, ${OWNER}, ${OWNER})`;
});

test.afterAll(async () => {
  if (!url) return;
  const token = process.env.E2E_BLOB_READ_WRITE_TOKEN;
  if (token) {
    const files = await sql()`select blob_pathname from job_files where lead_id in (select id from leads where name like 'E2E Docs %')`;
    const paths = files.map((f) => f.blob_pathname as string);
    if (paths.length > 0) await del(paths, { token }).catch((error) => console.error("Could not remove e2e blobs", error));
  }
  await sql()`delete from document_acknowledgements where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from contract_signatures where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from job_documents where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from job_events where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from leads where name like 'E2E Docs %'`;
  await sql()`delete from document_templates where created_by = ${OWNER}`;
  if (priorGuides.length > 0) await sql()`update document_templates set archived_at = null where id = any(${priorGuides})`;
  await sql()`delete from customer_login_tokens where email like 'e2e-docs-%'`;
  await sql()`delete from customer_sessions where email like 'e2e-docs-%'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("the owner writes an acknowledge template, and an unknown field is refused", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/admin/documents");
  await expect(page.getByRole("link", { name: "Documents" }).first()).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Kind").selectOption("service_agreement");
  await page.getByLabel("Name").fill(ACK_TEMPLATE);
  await page.getByLabel("Client response").selectOption("acknowledge");
  const text = page.getByLabel("Text");
  await text.fill("## Scope of work\n\nHello {{client_first_name}}. Your deposit is {{deposit}}.\n\n{{nope}}");
  await expect(page.getByText("{{nope}} can't be used here.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Preview" }).getByRole("heading", { name: "Scope of work" })).toBeVisible();
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByRole("list", { name: "Template problems" })).toHaveText("Unknown field {{nope}}.");
  // Controlled fields: the refusal keeps everything the owner typed.
  await expect(page.getByLabel("Name")).toHaveValue(ACK_TEMPLATE);

  await text.fill("## Scope of work\n\nHello {{client_first_name}}. Your deposit is {{deposit}}.");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/);
  const [row] = await sql()`select kind, response, body from document_templates where name = ${ACK_TEMPLATE} and archived_at is null`;
  expect(row).toEqual({ kind: "service_agreement", response: "acknowledge", body: "## Scope of work\n\nHello {{client_first_name}}. Your deposit is {{deposit}}." });
});

test("a document from it carries the client's details, and can't go out with a field left", async ({ page }) => {
  await signInOwner(page);
  const panel = await createDocument(page, job.id, `${ACK_TEMPLATE} (Service agreement)`, ackTitle());
  await expect(panel.getByLabel("Title")).toHaveValue(ackTitle());
  await expect(panel.getByLabel("Text")).toHaveValue("## Scope of work\n\nHello E2E. Your deposit is {{deposit}}.");
  await expect(panel.getByRole("list", { name: "Before you can send" })).toContainText("Fill in {{deposit}} first.");
  await expect(panel.getByRole("button", { name: "Send to client" })).toBeDisabled();

  await panel.getByLabel("Text").fill("## Scope of work\n\nHello E2E. Your deposit is $500.");
  await expect(panel.getByText("Save your changes before sending.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Send to client" })).toBeDisabled();
  await panel.getByRole("button", { name: "Save draft" }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved.");
  await expect(panel.getByRole("list", { name: "Before you can send" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Send to client" }).click();
  // Resend is not configured in e2e: the document is sent and the email reported failed.
  await expect(page.getByRole("status")).toHaveText(EMAIL_FAILED);

  const [doc] = await sql()`select d.status, f.shared_at, f.doc_type, f.name from job_documents d join job_files f on f.id = d.file_id
    where d.lead_id = ${job.id} and d.title = ${ackTitle()}`;
  expect(doc).toMatchObject({ status: "sent", doc_type: "other", name: `${ackTitle()}.pdf` });
  expect(doc.shared_at).not.toBeNull();
  const row = page.getByRole("list", { name: "Documents on this job" }).getByRole("listitem").filter({ hasText: ackTitle() });
  await expect(row).toContainText("Acknowledge");
  await expect(row).toContainText(/Sent [A-Z][a-z]{2} \d{1,2}, \d{4}/);
});

test("the client acknowledges it, fingerprinting the bytes served, and the owner sees Acknowledged", async ({ page, browser }) => {
  const customer = await customerPage(browser, CUSTOMER);
  const attention = customer.getByRole("region", { name: "Needs your attention" });
  await expect(attention.getByRole("heading", { name: "Documents to acknowledge" })).toBeVisible();
  // By text, not role: the form sits inside a CLOSED <details>, hidden from the accessibility tree.
  const item = attention.locator("details", { hasText: `Open ${ackTitle()}.pdf` });
  await expect(item).toHaveCount(1);
  const [file] = await sql()`select f.id from job_documents d join job_files f on f.id = d.file_id where d.lead_id = ${job.id} and d.title = ${ackTitle()}`;
  const served = await fetchFile(customer, `/project/files/${file.id}`);
  expect(served.status).toBe(200);
  await item.locator("summary").click();
  await item.getByLabel("Your full name").fill("Pat Client");
  await item.getByLabel(`I have read ${ackTitle()}`).check();
  await item.getByRole("button", { name: "Acknowledge" }).click();
  await expect(customer.getByRole("status")).toContainText("Thank you — your acknowledgement was recorded on");
  await expect(customer.getByRole("region", { name: "Needs your attention" })).toHaveCount(0);

  const rows = await sql()`select acknowledged_name, acknowledged_email, doc_sha256 from document_acknowledgements where file_id = ${file.id}`;
  expect(rows).toEqual([{ acknowledged_name: "Pat Client", acknowledged_email: CUSTOMER,
    doc_sha256: createHash("sha256").update(served.bytes).digest("hex") }]);
  const [doc] = await sql()`select status from job_documents where file_id = ${file.id}`;
  expect(doc.status).toBe("completed");

  await signInOwner(page);
  await documentsTab(page, job.id);
  await expect(page.getByRole("list", { name: "Documents on this job" }).getByRole("listitem").filter({ hasText: ackTitle() }))
    .toContainText(/Acknowledged [A-Z][a-z]{2} \d{1,2}, \d{4}/);
});

test("gate: the other client sees none of it, and their job is untouched", async ({ browser }) => {
  const other = await customerPage(browser, BYSTANDER);
  await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(other.getByRole("region", { name: "Needs your attention" })).toHaveCount(0);
  await expect(other.locator("main")).not.toContainText(ackTitle());
  const [file] = await sql()`select file_id from job_documents where lead_id = ${job.id} and title = ${ackTitle()}`;
  expect(await fetchFile(other, `/project/files/${file.file_id}`)).toMatchObject({ status: 404 });
  expect(await sql()`select id from job_documents where lead_id = ${bystander.id}`).toHaveLength(0);
  expect(await sql()`select id from document_acknowledgements where lead_id = ${bystander.id}`).toHaveLength(0);
  expect(await sql()`select id from job_events where lead_id = ${bystander.id} and kind = 'document'`).toHaveLength(0);
});

test("a sign document is signed through the contract path, and the owner sees Signed", async ({ page, browser }) => {
  await signInOwner(page);
  const panel = await createDocument(page, job.id, `${SIGN_TEMPLATE} (Change order)`, signTitle());
  await expect(panel.getByLabel("Text")).toHaveValue(`## Change\n\nOne more shade for ${NAME} A.`);
  await panel.getByRole("button", { name: "Send to client" }).click();
  await expect(page.getByRole("status")).toHaveText(EMAIL_FAILED);

  const customer = await customerPage(browser, CUSTOMER);
  const attention = customer.getByRole("region", { name: "Needs your attention" });
  await expect(attention.getByRole("heading", { name: "Documents to sign" })).toBeVisible();
  const details = attention.locator("details", { hasText: `${signTitle()}.pdf` });
  await expect(details).toHaveCount(1);
  await details.locator("summary").click();
  await details.getByLabel("Your full name").fill("Pat Client");
  await details.getByLabel("I agree to sign this contract electronically").check();
  await details.getByRole("button", { name: "Sign this contract" }).click();
  await expect(customer.getByRole("status")).toContainText("Thank you — your contract was signed on");

  const [doc] = await sql()`select status, file_id from job_documents where lead_id = ${job.id} and title = ${signTitle()}`;
  expect(doc.status).toBe("completed");
  // The stamped copy is written in after(): wait for it so it is proven and afterAll removes its blob.
  await expect.poll(async () => {
    const [signature] = await sql()`select signed_file_id from contract_signatures where file_id = ${doc.file_id}`;
    return signature?.signed_file_id ?? null;
  }, { timeout: 20_000 }).not.toBeNull();

  await documentsTab(page, job.id);
  await expect(page.getByRole("list", { name: "Documents on this job" }).getByRole("listitem").filter({ hasText: signTitle() }))
    .toContainText(/Signed [A-Z][a-z]{2} \d{1,2}, \d{4}/);
});

test("Void withdraws a sent document from the client", async ({ page, browser }) => {
  await signInOwner(page);
  const panel = await createDocument(page, job.id, `${ACK_TEMPLATE} (Service agreement)`, ackTitle());
  await panel.getByLabel("Text").fill("## Scope of work\n\nSecond copy, deposit $500.");
  await panel.getByRole("button", { name: "Save draft" }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved.");
  await panel.getByRole("button", { name: "Send to client" }).click();
  await expect(page.getByRole("status")).toHaveText(EMAIL_FAILED);

  await page.getByRole("button", { name: `Void ${ackTitle()}` }).click();
  await expect(page.getByRole("button", { name: `Void ${ackTitle()}` })).toHaveCount(0);
  const [doc] = await sql()`select d.status, f.shared_at from job_documents d join job_files f on f.id = d.file_id
    where d.lead_id = ${job.id} and d.body = ${"## Scope of work\n\nSecond copy, deposit $500."}`;
  expect(doc).toEqual({ status: "void", shared_at: null });

  const customer = await customerPage(browser, CUSTOMER);
  await expect(customer.getByRole("region", { name: "Needs your attention" })).toHaveCount(0);
});

test("the install guide shows once the job is ordered, and the care guide does not yet", async ({ browser }) => {
  await sql()`update leads set status = 'ordered' where id = ${job.id}`;
  const customer = await customerPage(browser, CUSTOMER);
  const guide = customer.getByRole("region", { name: "Getting ready for your install" });
  await expect(guide.getByRole("heading", { name: "Before we arrive" })).toBeVisible();
  await expect(guide.getByText("Clear the windowsills.")).toBeVisible();
  await expect(customer.getByRole("region", { name: "Caring for your shades" })).toHaveCount(0);
});
```

- [ ] **Step 4: Update `e2e/dc-quote.spec.ts`**

1. Imports: delete `import { PDFDocument, StandardFonts } from "pdf-lib";` and add `import { pdfText } from "./fixtures/pdf-text";`. Delete the `termsPdf()` helper.
2. Add below `let savedTerms …`:

```ts
let savedTermsTemplates: string[] = [];
```

and at the end of `beforeAll` (after the `dc_settings` update):

```ts
  // The terms template is one live row across the whole database: set any aside for the run.
  savedTermsTemplates = (await sql()`select id from document_templates where archived_at is null and kind = 'terms'`).map((r) => r.id as string);
  if (savedTermsTemplates.length > 0) await sql()`update document_templates set archived_at = now() where id = any(${savedTermsTemplates})`;
```

and at the end of `afterAll`:

```ts
  await sql()`delete from document_templates where created_by = ${OWNER} and kind = 'terms'`;
  if (savedTermsTemplates.length > 0) await sql()`update document_templates set archived_at = null where id = any(${savedTermsTemplates})`;
```

3. Replace both occurrences of `"Upload your contract terms in Settings first."` with `"Add your contract terms on the Documents page first."`.
4. In "with terms uploaded, Send contract sends the reviewed total and the job moves to Quoted": rename it to "with the starter terms, Send contract sends the reviewed total, prints the terms, and the job moves to Quoted"; replace its first three lines after `signInOwner(page)` (the Settings upload) with:

```ts
    await page.goto("/admin/documents");
    await page.getByRole("button", { name: "Start from the Premier Shade starter terms" }).click();
    await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/);
```

and append at the end of that test:

```ts
    // The contract prints the terms template's text, fields filled: spec §8.
    const contract = await page.evaluate(async (href) => {
      const buffer = new Uint8Array(await (await fetch(href)).arrayBuffer());
      let binary = "";
      for (const byte of buffer) binary += String.fromCharCode(byte);
      return btoa(binary);
    }, `/admin/files/${version.contract_file_id}`);
    const drawn = pdfText(Buffer.from(contract, "base64"));
    expect(drawn).toContain("Terms and Conditions");
    expect(drawn).toContain("4. Your Right to Cancel");
    expect(drawn).toContain("18. Contact Us");
    expect(drawn).toContain("Premier Shade Solutions LLC");
    expect(drawn.join(" ")).not.toContain("{{");
```

5. Replace every `getByRole("heading", { name: "Your contract" })` with `getByRole("heading", { name: "Documents to sign" })` (three places).

- [ ] **Step 5: Update `e2e/portal.spec.ts`**

Lines 965 and 973: `{ name: "Your contract" }` → `{ name: "Documents to sign" }`.

- [ ] **Step 6: The whole unit suite, types and lint**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS, with no test file skipped that was passing on `main`.

Run: `npm run typecheck` then `npm run lint`
Expected: both clean.

- [ ] **Step 7: Build and run the e2e specs against the Neon test branch**

Migration 026 must be on the branch (Task 5). PowerShell, from the worktree root, loading both values without printing them:

```powershell
Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*(E2E_POSTGRES_URL|E2E_BLOB_READ_WRITE_TOKEN)\s*=\s*(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2].Trim().Trim('"').Trim("'") } }
if ($env:E2E_POSTGRES_URL -match 'cold-term') { throw "That is production. Stop." }
npx playwright test e2e/documents.spec.ts e2e/dc-quote.spec.ts e2e/portal.spec.ts --project=desktop
Remove-Item Env:E2E_POSTGRES_URL, Env:E2E_BLOB_READ_WRITE_TOKEN
```

Expected: all pass. The web server is `next build` then `next start` on 127.0.0.1:3100 (about 34s to build in a fresh worktree; if a stale `.next` exists from another run, delete `.next` first).

- [ ] **Step 8: Watch the e2e fail once (test power)**

Temporarily change `markSent`'s `status = case when response = 'view' then 'completed' else 'sent' end` to always `'completed'`, rebuild, and run only `e2e/documents.spec.ts`: the acknowledge test must fail (nothing left to acknowledge). Revert, and confirm `git diff lib/docs/job-documents.ts` is empty.

- [ ] **Step 9: Commit**

```bash
git add e2e/fixtures/pdf-text.ts e2e/documents.spec.ts e2e/dc-quote.spec.ts e2e/portal.spec.ts playwright.config.ts
git commit -m "test: e2e for templates, sending, acknowledging, signing, voiding, guides and printed terms

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

## Spec coverage

| Spec | Task |
|---|---|
| §2 doc text, one parser, two renderers, no HTML | 1, 2, 9, 10 |
| §3 fields, missing → marker, unknown rejected, terms subset, Send blocked | 1, 2, 3, 13 |
| §4 tables, singleton index, view-only singletons, `document` kind, freezing | 5, 6, 7, 8 |
| §5 Documents page, editor, live preview, Preview PDF, validation, starter terms, archive | 11, 15, 19 |
| §6 job Documents tab, create, draft, blockers, one-statement send, email, list, void | 6, 12, 13, 20 |
| §7 Needs your attention, acknowledge rules, owners' email, guides by stage | 7, 12, 16 |
| §8 contracts print the terms template, fallback, reworded blocker, Settings line | 14, 18 |
| §9 business-day window on the Quote tab | 4, 17 |
| §10 requireAdmin first, re-derivation, winAnsiSafe, text-node rendering, frozen | 6, 7, 8, 9, 10, 15, 16, 19, 20 |
| §11 tests, including the real-DB script and e2e | every task, 21, 22 |

## Resolved ambiguities (decisions this plan made)

1. **Observed holidays.** Spec §9 lists the holidays but not weekend observance. Both the date and its observed weekday (Saturday → Friday before, Sunday → Monday after) are non-business days. This can only lengthen the window, so the order is never placed early.
2. **Files a job document names.** Spec §4 freezes only acknowledged files. The plan also makes every job-document PDF unmanageable from the Files tab (share, unshare, relabel, delete all refused), because Send shares, Void unshares, and a Files-tab re-share would put a voided document back in front of the client; a delete would also hit the foreign key.
3. **Race guard on send.** `markSent` compares the stored title and body with the ones rendered, so a save in another tab after rendering refuses the send ("saved figure equals screen").
4. **Document editor has no Insert field menu.** Fields are filled when a document is created; a field inserted afterwards could never be filled and would only block Send. Templates keep the full toolbar.
5. **Discard draft.** Not in the spec; added so a document created by mistake does not sit on the job forever. Drafts only, logged.
6. **View documents** are emailed as "ready to review" and completed at send.
7. **Terms upload removed.** The Settings upload UI, its route and `lib/dc/terms.ts` are deleted; an already-uploaded PDF keeps working as the fallback until a terms template exists.
8. **The window's end** is shown with `formatWhen` (for example "Fri, Oct 2, 12:00 AM"), which is exactly midnight after the third business day.
9. **Starter terms** name the business only through `{{company_name}}`, `{{company_phone}}`, `{{company_email}}` (terms fields), which keeps the phone number out of `lib/` as `tests/business.test.ts` requires, and the draft's HTML comment becomes the visible bold banner line.
10. **Sign documents keep the contract wording** on the portal ("Sign this contract", "your contract was signed"), because they flow through the unchanged signing path; only the section heading changes to "Documents to sign".
11. **Signing a voided document in a race** (void commits between the page load and the signature) is not blocked in `recordSignature`: its statement is shared with generated contracts and its "already-signed" answer cannot tell a race from a repeat. `voidDocument` refuses once a signature exists, so the only window is a void that lands first; the signature is then recorded on a void document. Acknowledgements have no such window (their insert requires a sent, shared document).
