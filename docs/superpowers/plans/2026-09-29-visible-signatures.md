# Visible Signatures and Initials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every signed document looks signed: the client's initials beside every numbered section and a filled signature block (signature, printed name, date), adopted once by typing or drawing.

**Architecture:** The PDF renderer records where initials and the signature block belong ("sign marks") while it draws the unsigned PDF. `createFile` stores them in the new `job_files.sign_marks` column in the same statement that creates the file. At signing, the portal form collects an adoption (typed text, or two PNGs from canvas pads). The server action validates it. `recordSignature` stores it in its existing single statement, with drawn PNGs put in private Blob first. `stampSignature` then writes the adoption onto a copy of the original at every mark, and onto the ELECTRONIC SIGNATURE page.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, `after()`), React 19, Neon Postgres through `@neondatabase/serverless` tagged templates, private Vercel Blob, pdf-lib 1.17 plus the new `@pdf-lib/fontkit`, vitest 4 (jsdom by default), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-visible-signatures-design.md`. It is the authority. Read it before your task. Where this plan decides something the spec leaves open, the decision is stated in "Decisions" below.

**Base:** branch `feat/signatures` at `cf115cb` (origin/main merged, includes `027_install_extras.sql` and the `E2E_TEST_ENDPOINT` guard in `playwright.config.ts`).

---

## Global Constraints

Every task's requirements include these.

- **Migration number is 029** (`db/migrations/029_visible_signatures.sql`). 027 is on main. Another session has claimed 028. The controller re-confirms 029 with the owner's other session before Wave 1 runs.
- **Migration rules:** `scripts/migrate.mjs` re-applies every file on every run and splits on `;` after stripping whole-line `--` comments. So:
  - no `;` inside any comment or string literal;
  - whole-line comments only;
  - every statement is idempotent (`add column if not exists`, or `drop constraint if exists` right before `add constraint`).
- **Do not redefine `job_events_kind_check` or `job_files_doc_type_check`.** `tests/db/migration-checks-consistent.test.ts` requires every definition of those checks to be identical, and this feature needs neither.
- **Line endings.** Every existing file is LF in the index and CRLF in the working tree (`core.autocrlf=true`). Edit with the Edit tool, which keeps the working-tree endings. After editing, `git diff --stat` must show only the lines you meant to change, never a whole-file rewrite. This matters especially for `lib/dc/contract-pdf.ts`.
- **Atomic writes are one statement.** Use one data-modifying CTE, never separate `db()` calls and never `sql.transaction()` (precedents: `createFile`, `recordSignature`).
- **Refusals are plain outcomes, never exceptions.** `SignResult` stays `"signed" | "not-found" | "invalid"`.
- **Nothing trusted from the form except the adoption itself.** The job, the file, the email and the file's sign marks are re-derived server-side (spec §9).
- **Validation values (spec §6), verbatim:**
  - method is `typed` or `drawn`;
  - typed initials match `^[A-Za-z][A-Za-z.\- ]{0,5}$` after trim;
  - a drawn image is a data URL of a real PNG (magic bytes), ≤ 150 KB decoded, width ≤ 1200 and height ≤ 400 px;
  - initials are present exactly when the file has initial marks.
- **Pad sizes (spec §4):** signature pad max 600×200 CSS px, initials pad max 200×100 CSS px, device pixel ratio capped at 2.
- **Numbered section (spec §2):** a `##` or `###` heading whose text matches `^\d+\.\s`.
- **Blob paths:** drawn PNGs go to `jobs/<jobId>/signatures/<uuid>-signature.png` and `jobs/<jobId>/signatures/<uuid>-initials.png`, with `access: "private"`, `contentType: "image/png"` and `addRandomSuffix: false`.
- **Every string drawn in a standard font passes through `winAnsiSafe`**, except where an existing test pins a throw. `stampSignature` still returns null for a signed name Helvetica cannot draw (`tests/portal/stamp.test.ts` "returns null for a name the standard font cannot draw").
- **Tests:**
  - run `npx vitest run --maxWorkers=2 <paths>`;
  - `npm run typecheck` covers `tests/`, `scripts/` and `e2e/`, so every caller of a changed signature must compile;
  - `npm run lint` must be clean for touched files.
- **Power checks:** for every guard a task adds, break the guard, watch its test go red, then revert. Record the red test's name in the commit body.
- **No database, no deploy and no download in any implementer task.** The real-DB runs, the e2e runs and the font download are controller steps, named as such.
- **Secrets:** never print a connection string. Refer to the test branch as "the test branch named by `E2E_TEST_ENDPOINT`, or `ep-lingering-fog` by default". Never hard-code only `ep-lingering-fog` in a new guard.
- **Commits:** every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj
  ```
- **Worktrees:** each task runs in its own worktree cut from `feat/signatures` after the previous wave merged. Before editing, run `git rev-parse --show-toplevel` and `git log --oneline -1`. Stop if the worktree is not the one you were given.

## Decisions (where the spec leaves a choice)

1. **Handwriting font: Great Vibes (`GreatVibes-Regular.ttf`), SIL OFL 1.1.** The google/fonts repository ships it as one static TTF at `ofl/greatvibes/`. The alternatives were rejected:
   - Dancing Script and Caveat ship only as variable fonts there (`[wght]`).
   - Homemade Apple is Apache-2.0, not OFL.

   Great Vibes also reads as a signature and covers Latin Extended, so fewer characters fall back to Helvetica Oblique.

   **Fallback if the download 404s:** Allura (`ofl/allura/Allura-Regular.ttf`, also OFL and static). If you use it, replace `GreatVibes-Regular`/`GREAT_VIBES` with `Allura-Regular`/`ALLURA` throughout Task 1.
2. **How the server gets the font:** the TTF is committed under `lib/pdf/fonts/`, and a generated module `lib/pdf/fonts/great-vibes.ts` carries it as base64. The server bundle then contains the font, and nothing reads a file at runtime. That removes any doubt about Vercel output-file tracing, since `next start` in e2e would not reveal a tracing miss. A unit test proves the module matches the TTF byte for byte. The portal preview loads the same TTF through `next/font/local`.
3. **Builders keep their signatures and gain siblings.**
   - `renderDocumentPdf(input): Promise<RenderedPdf>` and `renderContractPdf(input, terms): Promise<RenderedPdf>` are new, with `RenderedPdf = { bytes: Uint8Array; marks: SignMarks }`.
   - `buildDocumentPdf`, `buildContractPdf` and `buildTermsPdf` keep their exact signatures and return `(await render…()).bytes`.
   - Callers that stay on the old names (compile unchanged): `app/admin/documents/preview/route.ts` (both builders), `tests/dc/contract.test.ts`, `tests/docs/pdf.test.ts` and `tests/docs/preview-route.test.ts`.
   - Callers that move to `render…`: `lib/dc/send.ts`, `lib/docs/workflow.ts`, and their mocks in `tests/dc/send.test.ts`, `tests/docs/workflow.test.ts` and `scripts/verify-dc-quote-import.ts`.
4. **Marks accumulate through the pen.**
   - `PdfPen` gains an optional `initials?: InitialsMark[]`. When it is set, `renderBlocks` draws an initials box on each numbered heading and pushes the mark. When it is unset, `renderBlocks` behaves exactly as today.
   - `renderBlocks(pen, blocks): void` keeps its signature.
   - The signature block is drawn by the new exported `drawSignatureBlock(pen): MarkPoint`.
5. **Each initials mark carries its section number** (`{ page, x, y, section }`). The spec's mark is `{ page, x, y }`, but the signature page must print "Initialed sections: 4, 5, …", and coordinates cannot say which section a mark belongs to.
6. **`buildTermsPdf` draws exactly what the contract prints after its terms**, initials boxes and signature block included. The existing test "previews terms alone exactly as the contract prints them" pins this.
7. **Legacy uploaded terms get a final page** headed "Signature" (bold 14pt, like "Terms and Conditions"), holding the signature block. Its marks are `{ initials: [], signature }`.
8. **Where the file's marks come from at signing:** `signableContracts` reads `sign_marks` in a fourth parallel query and returns `SignableFile.signMarks`. `listSharedDocuments` stays a named-column, customer-facing list and does not gain the column.
9. **Where the stamp gets the drawn PNGs:** the action passes the validated in-memory buffers (the same bytes `recordSignature` stored) into `after()`. The method and typed initials are re-read from the recorded row through `signatureFor`, as the name already is.
10. **Other-mode fields are ignored, not refused.**
    - In typed mode, image fields are ignored.
    - In drawn mode, `signedInitials` is ignored.
    - "Initials present exactly when the file has marks" is judged on the chosen method's initials.
11. **Drawn mode needs JavaScript.** Its pads render only after hydration (the `useSyncExternalStore` pattern in `app/(site)/project/FilesTabs.tsx`). The server-rendered form (JS off) is typed mode with a hidden `signatureMethod=typed`.
12. **Job deletion removes the PNGs too.** `listBlobPathnames` also returns the job's signature image pathnames, so deleting a job removes them. The spec is silent here, but without it they would be orphaned in Blob.
13. **A header-valid but corrupt PNG** passes server validation (the spec forbids decoding) and makes `embedPng` throw inside `stampSignature`. That returns null, as any unopenable PDF does today: the signature stands, and the owners' email says the copy is missing.

## File map

| File | Status | Responsibility | Task |
|---|---|---|---|
| `lib/pdf/fonts/GreatVibes-Regular.ttf`, `lib/pdf/fonts/OFL.txt` | new (controller download) | The handwriting font and its licence | 0 |
| `package.json`, `package-lock.json` | modify | Add `@pdf-lib/fontkit` | 1 |
| `.gitattributes` | new (controller) | `*.ttf binary` | 0 |
| `scripts/embed-handwriting-font.mjs` | new | Generates the base64 module from the TTF | 1 |
| `lib/pdf/fonts/great-vibes.ts` | new (generated) | The TTF as base64 | 1 |
| `lib/pdf/handwriting.ts` | new | Embed the hand font, split runs, draw fitted handwriting with Helvetica Oblique fallback | 1 |
| `tests/pdf/handwriting.test.ts` | new | | 1 |
| `db/migrations/029_visible_signatures.sql` | new | `sign_marks` and the adoption columns, with checks | 2 |
| `tests/db/migration-029.test.ts` | new | | 2 |
| `lib/pdf/sign-marks.ts` | new | Mark types, geometry constants, numbered-section detection, `parseSignMarks` | 3 |
| `tests/pdf/sign-marks.test.ts` | new | | 3 |
| `lib/portal/adoption-limits.ts` | new | Client-safe constants (patterns, caps, pad sizes) | 4 |
| `lib/portal/adoption.ts` | new | `Adoption` type, `parsePngDataUrl`, `pngSize`, `parseAdoption`, `requireInitials` | 4 |
| `tests/fixtures/png.ts` | new | Test helper: a real PNG of any size (no dependency) | 4 |
| `tests/portal/adoption.test.ts` | new | | 4 |
| `e2e/fixtures/pdf-pages.ts` | new | Per-page drawn text runs (font-aware, ToUnicode-decoded) and image draws | 5 |
| `tests/e2e-fixtures/pdf-pages.test.ts` | new | | 5 |
| `lib/docs/pdf.ts` | modify | Initials boxes and marks in `renderBlocks`, `drawSignatureBlock`, `renderDocumentPdf`; `SIGN_CLOSING` removed | 6 |
| `lib/dc/contract-pdf.ts` | modify | `renderContractPdf`, signature block after terms or on a final page | 6 |
| `tests/docs/pdf.test.ts`, `tests/dc/contract.test.ts` | modify | | 6 |
| `lib/admin/files.ts` | modify | `createFile({ signMarks })`, `listBlobPathnames` includes signature PNGs | 7 |
| `tests/admin/files.test.ts`, `tests/admin/delete-job.test.ts` | modify | | 7 |
| `lib/portal/sign.ts` | modify | `Signature` adoption fields, `SignableFile.signMarks`, `recordSignature({ adoption })` storing PNGs | 8 |
| `tests/portal/sign.test.ts` | modify | | 8 |
| `scripts/verify-contract-signing.ts`, `scripts/verify-documents.ts` | modify | `recordSignature` calls gain `adoption` | 8 |
| `scripts/verify-dc-quote-import.ts` | modify | `recordSignature` call (Task 8); `renderContractPdf` mock (Task 10) | 8, 10 |
| `lib/portal/stamp.ts` | modify | Draws the adoption at every mark and on the signature page | 9 |
| `tests/portal/stamp.test.ts` | modify | | 9 |
| `lib/dc/send.ts`, `lib/docs/workflow.ts` | modify | Render with marks, pass `signMarks` to `createFile` | 10 |
| `tests/dc/send.test.ts`, `tests/docs/workflow.test.ts` | modify | | 10 |
| `app/(site)/project/actions.ts` | modify | Parse and validate the adoption, pass it on, stamp with marks | 11 |
| `tests/portal/sign-action.test.ts` | modify | | 11 |
| `app/(site)/project/SignContract.tsx` | modify | Hosts the adoption, checkbox wording, "missing" notice wording | 12 |
| `app/(site)/project/AdoptSignature.tsx` | new | Client: Type/Draw switch, name, initials, live preview, pads | 12 |
| `app/(site)/project/SignaturePad.tsx` | new | Client: pointer-event canvas pad with Clear and a required carrier input | 12 |
| `app/(site)/project/hand-font.ts` | new | `next/font/local` for the same TTF | 12 |
| `tests/setup.ts` | modify | Global mock of `next/font/local` | 12 |
| `tests/portal/sign-ui.test.tsx`, `tests/portal/adopt-signature.test.tsx` | modify / new | | 12 |
| `scripts/verify-signatures.ts`, `scripts/verify-signatures.config.mts` | new | Real-DB proof (run by the controller) | 13 |
| `e2e/dc-quote.spec.ts`, `e2e/documents.spec.ts` | modify | Typed DC contract, drawn service agreement | 14 |

## Waves

Each wave's tasks run in parallel, each in its own worktree cut from `feat/signatures` after the previous wave is merged. The controller merges a wave's branches in task order, runs `npm run typecheck && npx vitest run --maxWorkers=2 && npm run lint` on the merge, and only then starts the next wave.

| Wave | Tasks (parallel) | Needs | Controller steps around it |
|---|---|---|---|
| 0 | Task 0: font download (controller only) | — | Ask the owner for permission to download, then download, verify and commit to `feat/signatures`. Re-confirm migration 029 with the other session. |
| 1 | 1 font module + fontkit · 2 migration 029 · 3 sign-marks · 4 adoption validation | Wave 0 | After merge: run migration 029 on the test branch twice (Task 2, Step 6). |
| 2 | 5 pdf-pages helper · 6 renderer + builders · 7 files.ts · 8 sign.ts · 9 stamp | Wave 1 | — |
| 3 | 10 senders · 11 sign action · 12 portal form | Wave 2 | — |
| 4 | 13 verify-signatures script · 14 e2e | Wave 3 | Run Task 13's script and Task 14's e2e against the test branch. Manual mobile and JS-off checks (Review Focus). |

### Ownership within each wave (disjoint by construction)

| Wave | Task | Owns (creates or modifies) — nothing else |
|---|---|---|
| 1 | 1 | `package.json`, `package-lock.json`, `scripts/embed-handwriting-font.mjs`, `lib/pdf/fonts/great-vibes.ts`, `lib/pdf/handwriting.ts`, `tests/pdf/handwriting.test.ts` |
| 1 | 2 | `db/migrations/029_visible_signatures.sql`, `tests/db/migration-029.test.ts` |
| 1 | 3 | `lib/pdf/sign-marks.ts`, `tests/pdf/sign-marks.test.ts` |
| 1 | 4 | `lib/portal/adoption-limits.ts`, `lib/portal/adoption.ts`, `tests/fixtures/png.ts`, `tests/portal/adoption.test.ts` |
| 2 | 5 | `e2e/fixtures/pdf-pages.ts`, `tests/e2e-fixtures/pdf-pages.test.ts` |
| 2 | 6 | `lib/docs/pdf.ts`, `lib/dc/contract-pdf.ts`, `tests/docs/pdf.test.ts`, `tests/dc/contract.test.ts` |
| 2 | 7 | `lib/admin/files.ts`, `tests/admin/files.test.ts`, `tests/admin/delete-job.test.ts` |
| 2 | 8 | `lib/portal/sign.ts`, `tests/portal/sign.test.ts`, `scripts/verify-contract-signing.ts`, `scripts/verify-documents.ts`, `scripts/verify-dc-quote-import.ts` |
| 2 | 9 | `lib/portal/stamp.ts`, `tests/portal/stamp.test.ts` |
| 3 | 10 | `lib/dc/send.ts`, `lib/docs/workflow.ts`, `tests/dc/send.test.ts`, `tests/docs/workflow.test.ts`, `scripts/verify-dc-quote-import.ts` |
| 3 | 11 | `app/(site)/project/actions.ts`, `tests/portal/sign-action.test.ts` |
| 3 | 12 | `app/(site)/project/SignContract.tsx`, `app/(site)/project/AdoptSignature.tsx`, `app/(site)/project/SignaturePad.tsx`, `app/(site)/project/hand-font.ts`, `tests/setup.ts`, `tests/portal/sign-ui.test.tsx`, `tests/portal/adopt-signature.test.tsx` |
| 4 | 13 | `scripts/verify-signatures.ts`, `scripts/verify-signatures.config.mts` |
| 4 | 14 | `e2e/dc-quote.spec.ts`, `e2e/documents.spec.ts` |

`scripts/verify-dc-quote-import.ts` is touched in Wave 2 (Task 8: the `recordSignature` call) and in Wave 3 (Task 10: the `renderContractPdf` mock). Those are different waves, so the edits are sequential.

**Compile-order note (controller).** Wave 2 tasks import only Wave 1 modules and their own files. Task 9 imports the type `Adoption` from Task 4, not from Task 8.

After Wave 2 merges, one file no longer compiles: `app/(site)/project/actions.ts`. Two things break it:
- Task 8 makes `recordSignature`'s `adoption` required.
- Task 9 adds `stampSignature`'s two new parameters.

Everything else still compiles, because the old builder names are kept (Decision 3) and `createFile`'s `signMarks` is optional. To keep the merge gate green, the controller adds two interim edits to `actions.ts` in the Wave 2 merge commit, and nothing else:
1. Add `adoption: { method: "typed", initials: null },` to the `recordSignature({...})` call.
2. Change the stamp call to `stampSignature(original, {...facts unchanged...}, { method: "typed", initials: null }, null)`.

Also update the one `stampSignature` expectation in `tests/portal/sign-action.test.ts` ("stamps, stores and emails the copy after answering") to expect those two extra arguments. Task 11 replaces all of this.

## Review Focus

These are the input classes most likely to bite a real client, each pinned by a test in the owning task:

1. **Mobile canvas.**
   - Expected: drawing with a finger on a phone draws and does not scroll the page, and the pad fits a 360px-wide screen without overflow.
   - Pinned by Task 12: `touch-none` on the canvas, width `100%` capped at the max, pointer coordinates scaled by the element's rect, DPR capped at 2.
   - Controller: a manual check at 390×844 with touch emulation.
2. **JS off, typed path.**
   - Expected: with JavaScript off, a client can still sign a document with numbered sections: typed name, typed initials, box, submit. The Draw option is absent.
   - Pinned by Task 12 (static markup has `signatureMethod=typed`, the initials input, and no canvas or Draw button) and Task 11 (a FormData with no image fields and `signatureMethod=typed` signs).
3. **A document with zero numbered sections.**
   - Expected: no initials boxes, no initials field, the checkbox without "and to initial…", the signature block filled, and "No numbered sections" on the signature page.
   - Pinned by Task 6 (empty `initials`, signature set), Task 11 (initials posted for a no-marks file are refused, none posted signs), Task 12 (wording), Task 9 (the line), Task 14 (the existing `## Change` document still signs).
4. **A numbered heading at the foot of a page.**
   - Expected: the heading moves to the next page with its initials box, and the mark names the new page and the top position.
   - Pinned by Task 6 (loop over filler lengths, as the existing "never leaves a heading last on a page" test does).
5. **An oversized or forged PNG.**
   - Expected: anything that is not a small real PNG is refused as "invalid" and nothing is stored. A PNG whose header is valid but whose data is corrupt still signs, and the stamped copy is simply missing.
   - Pinned by Task 4 (each rule, with power checks), Task 11 (nothing reaches `recordSignature`), Task 9 (corrupt data returns null, no throw).

---

## Task 0 (controller only): obtain the handwriting font

**Files:**
- Create: `lib/pdf/fonts/GreatVibes-Regular.ttf`, `lib/pdf/fonts/OFL.txt`, `.gitattributes`

This is not an implementer task: it downloads files from the internet.

- [ ] **Step 1: Ask the owner for permission to download**, naming both URLs:
  - `https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf`
  - `https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/OFL.txt`

  Do nothing until the owner says yes.

- [ ] **Step 2: Download both files into `feat/signatures`** (the base worktree, not a task worktree):

```bash
cd C:/Users/whirl/pss/.claude/worktrees/signatures
mkdir -p lib/pdf/fonts
curl -fsSL -o lib/pdf/fonts/GreatVibes-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf
curl -fsSL -o lib/pdf/fonts/OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/OFL.txt
```

If either command 404s, use the Allura fallback (Decisions 1): `ofl/allura/Allura-Regular.ttf` and `ofl/allura/OFL.txt`. Then tell the Task 1 and Task 12 implementers the new file name.

- [ ] **Step 3: Verify it is a static TrueType font with an OFL licence**

```bash
node -e "const b=require('fs').readFileSync('lib/pdf/fonts/GreatVibes-Regular.ttf');console.log(b.length, b.subarray(0,4).toString('hex'), require('crypto').createHash('sha256').update(b).digest('hex'))"
grep -ci "SIL OPEN FONT LICENSE" lib/pdf/fonts/OFL.txt
```

Expected:
- a size over 20000;
- magic `00010000` (TrueType outlines);
- a count of at least 1.

Task 1's test also proves the font has no variation axes.

- [ ] **Step 4: Mark fonts as binary** so `core.autocrlf` never touches them:

```bash
printf '*.ttf binary\n' > .gitattributes
```

- [ ] **Step 5: Commit**

```bash
git add .gitattributes lib/pdf/fonts/GreatVibes-Regular.ttf lib/pdf/fonts/OFL.txt
git commit -m "chore: Great Vibes handwriting font (SIL OFL 1.1) for visible signatures

Downloaded with the owner's permission from github.com/google/fonts ofl/greatvibes.
sha256 <paste from Step 3>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

- [ ] **Step 6: Re-confirm migration 029** with the owner's other session (028 is theirs), then start Wave 1.

---

## Task 1: Handwriting font module and `@pdf-lib/fontkit`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `scripts/embed-handwriting-font.mjs`, `lib/pdf/fonts/great-vibes.ts` (generated), `lib/pdf/handwriting.ts`
- Test: `tests/pdf/handwriting.test.ts`

**Interfaces:**
- Consumes: `lib/pdf/fonts/GreatVibes-Regular.ttf` and `OFL.txt` (Task 0); `winAnsiSafe(text: string): string` from `@/lib/dc/contract-layout`.
- Produces (used by Tasks 5 and 9):
  - `handwritingTtf(): Uint8Array`
  - `type Handwriting = { hand: PDFFont; fallback: PDFFont; supported: Set<number> }`
  - `embedHandwriting(pdf: PDFDocument): Promise<Handwriting>`
  - `type HandRun = { text: string; hand: boolean }`
  - `handRuns(text: string, supported: Set<number>): HandRun[]`
  - `drawHandwriting(page: PDFPage, fonts: Handwriting, text: string, box: { x: number; y: number; maxWidth: number; maxSize: number }): number` (returns the size used)
  - `GREAT_VIBES_TTF_BASE64: string`

- [ ] **Step 1: Install the dependency**

```bash
npm ci
npm install @pdf-lib/fontkit@^1.1.1
```

Expected: `package.json` `dependencies` gains `"@pdf-lib/fontkit": "^1.1.1"`, and `package-lock.json` changes. No other dependency changes. Check with `git diff --stat package.json package-lock.json`.

- [ ] **Step 2: Write the generator** `scripts/embed-handwriting-font.mjs`

```js
/**
 * Writes lib/pdf/fonts/great-vibes.ts: the handwriting TTF as base64, so the server bundle carries
 * the font and nothing reads a file at runtime (no output-file-tracing doubt on Vercel).
 * Re-run after replacing the TTF. tests/pdf/handwriting.test.ts fails if the two ever differ.
 *
 * Usage: node scripts/embed-handwriting-font.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const source = "lib/pdf/fonts/GreatVibes-Regular.ttf";
const base64 = readFileSync(source).toString("base64");
const lines = base64.match(/.{1,100}/g) ?? [];
const out = [
  `// Generated by scripts/embed-handwriting-font.mjs from ${source}. Do not edit by hand.`,
  "// Great Vibes, SIL Open Font License 1.1: see lib/pdf/fonts/OFL.txt.",
  "export const GREAT_VIBES_TTF_BASE64 = [",
  ...lines.map((line) => `  "${line}",`),
  '].join("");',
  "",
].join("\n");
writeFileSync("lib/pdf/fonts/great-vibes.ts", out);
console.log(`wrote lib/pdf/fonts/great-vibes.ts (${lines.length} lines)`);
```

Run: `node scripts/embed-handwriting-font.mjs`. Expected: `wrote lib/pdf/fonts/great-vibes.ts (N lines)`.

The module is an array joined at load, not a `+` chain: a chain of thousands of `+` operands can overflow the TypeScript checker's stack.

- [ ] **Step 3: Write the failing test** `tests/pdf/handwriting.test.ts`

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GREAT_VIBES_TTF_BASE64 } from "@/lib/pdf/fonts/great-vibes";
import { drawHandwriting, embedHandwriting, handRuns, handwritingTtf } from "@/lib/pdf/handwriting";

const TTF = "lib/pdf/fonts/GreatVibes-Regular.ttf";

function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number; size: number; font: string }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, size: options?.size ?? 0, font: options?.font?.name ?? "" });
    return original.call(this, text, options);
  });
  return drawn;
}
afterEach(() => vi.restoreAllMocks());

describe("the handwriting font", () => {
  it("is embedded byte for byte from the committed TTF", () => {
    expect(Buffer.from(GREAT_VIBES_TTF_BASE64, "base64").equals(readFileSync(TTF))).toBe(true);
    expect(Buffer.from(handwritingTtf()).equals(readFileSync(TTF))).toBe(true);
  });
  it("is a static font (no variation axes) with its OFL licence committed beside it", () => {
    const font = fontkit.create(readFileSync(TTF)) as unknown as { variationAxes: Record<string, unknown> };
    expect(Object.keys(font.variationAxes ?? {})).toEqual([]);
    expect(readFileSync("lib/pdf/fonts/OFL.txt", "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});

describe("handRuns", () => {
  const supported = new Set([..."Zoë Jan"].map((ch) => ch.codePointAt(0)!));
  it("keeps characters the font draws in one hand run", () => {
    expect(handRuns("Jan Zoë", supported)).toEqual([{ text: "Jan Zoë", hand: true }]);
  });
  it("puts characters the font cannot draw in fallback runs, WinAnsi-safe", () => {
    expect(handRuns("Zoë 日本 Jan", supported)).toEqual([
      { text: "Zoë ", hand: true }, { text: "??", hand: false }, { text: " Jan", hand: true },
    ]);
  });
  it("collapses whitespace and trims", () => {
    expect(handRuns("  Jan\n\tZoë ", supported)).toEqual([{ text: "Jan Zoë", hand: true }]);
  });
});

describe("drawHandwriting", () => {
  it("draws in the hand font, at most maxSize", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const fonts = await embedHandwriting(pdf);
    const drawn = spyOnDrawText();
    const size = drawHandwriting(page, fonts, "Jo", { x: 10, y: 20, maxWidth: 500, maxSize: 24 });
    expect(size).toBe(24);
    expect(drawn).toEqual([{ text: "Jo", x: 10, y: 20, size: 24, font: fonts.hand.name }]);
    await expect(pdf.save()).resolves.toBeInstanceOf(Uint8Array);
  });
  it("shrinks a long name to fit maxWidth", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const fonts = await embedHandwriting(pdf);
    const name = "Maximiliana Alexandrina Montgomery-Worthington";
    const size = drawHandwriting(page, fonts, name, { x: 0, y: 0, maxWidth: 120, maxSize: 24 });
    expect(size).toBeLessThan(24);
    expect(fonts.hand.widthOfTextAtSize(name, size)).toBeLessThanOrEqual(120 + 0.01);
  });
  it("draws what the font lacks in Helvetica Oblique, encodably, and never throws", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const fonts = await embedHandwriting(pdf);
    const drawn = spyOnDrawText();
    expect(() => drawHandwriting(page, fonts, "Jan 日本", { x: 0, y: 0, maxWidth: 300, maxSize: 20 })).not.toThrow();
    const fallback = drawn.filter((d) => d.font === "Helvetica-Oblique");
    expect(fallback.map((d) => d.text)).toEqual(["??"]);
    const oblique = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaOblique);
    for (const { text } of fallback) expect(() => oblique.encodeText(text)).not.toThrow();
    // Consecutive runs sit side by side, never on top of one another.
    expect(drawn[1].x).toBeGreaterThan(drawn[0].x);
    await expect(pdf.save()).resolves.toBeInstanceOf(Uint8Array);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/pdf/handwriting.test.ts`
Expected: FAIL, the module `@/lib/pdf/handwriting` cannot be resolved.

- [ ] **Step 5: Implement** `lib/pdf/handwriting.ts`

```ts
import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { GREAT_VIBES_TTF_BASE64 } from "./fonts/great-vibes";

let ttf: Uint8Array | null = null;

/** The handwriting font's bytes (spec §7), decoded once per process. */
export function handwritingTtf(): Uint8Array {
  ttf ??= new Uint8Array(Buffer.from(GREAT_VIBES_TTF_BASE64, "base64"));
  return ttf;
}

/** The hand font, its fallback (spec §7: Helvetica Oblique) and the code points the hand font can draw. */
export type Handwriting = { hand: PDFFont; fallback: PDFFont; supported: Set<number> };

export async function embedHandwriting(pdf: PDFDocument): Promise<Handwriting> {
  pdf.registerFontkit(fontkit);
  const hand = await pdf.embedFont(handwritingTtf(), { subset: true });
  const fallback = await pdf.embedFont(StandardFonts.HelveticaOblique);
  return { hand, fallback, supported: new Set(hand.getCharacterSet()) };
}

export type HandRun = { text: string; hand: boolean };

/**
 * Splits text into runs the hand font draws and runs it cannot. A custom font never throws on a
 * missing glyph (it draws an empty box), so the check is by code point. The fallback text goes
 * through winAnsiSafe, because the standard font WOULD throw.
 */
export function handRuns(text: string, supported: Set<number>): HandRun[] {
  const runs: HandRun[] = [];
  for (const ch of text.replace(/\s+/g, " ").trim()) {
    const hand = supported.has(ch.codePointAt(0)!);
    const piece = hand ? ch : winAnsiSafe(ch);
    const last = runs[runs.length - 1];
    if (last && last.hand === hand) last.text += piece;
    else runs.push({ text: piece, hand });
  }
  return runs;
}

/** Draws `text` in handwriting on the baseline at (x, y), sized to fit maxWidth and never above maxSize. Answers the size. */
export function drawHandwriting(
  page: PDFPage, fonts: Handwriting, text: string, box: { x: number; y: number; maxWidth: number; maxSize: number },
): number {
  const runs = handRuns(text, fonts.supported);
  const fontOf = (run: HandRun) => (run.hand ? fonts.hand : fonts.fallback);
  const widthAtOne = runs.reduce((sum, run) => sum + fontOf(run).widthOfTextAtSize(run.text, 1), 0);
  const size = widthAtOne > 0 ? Math.min(box.maxSize, box.maxWidth / widthAtOne) : box.maxSize;
  let x = box.x;
  for (const run of runs) {
    page.drawText(run.text, { x, y: box.y, size, font: fontOf(run) });
    x += fontOf(run).widthOfTextAtSize(run.text, size);
  }
  return size;
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/pdf/handwriting.test.ts && npm run typecheck`
Expected: PASS, with no type errors.

If `"Jan 日本"` produces no `Helvetica-Oblique` run, Great Vibes covers those glyphs (it should not). Then change the test string to another script it does not cover (for example `"Jan ᚠᚢ"`, runic), and say so in the commit.

- [ ] **Step 7: Power checks** (one at a time, revert after each)
  1. In `handRuns`, change `supported.has(...)` to `true`. The "fallback runs" and "Helvetica Oblique" tests should go red.
  2. In `drawHandwriting`, replace the `Math.min(...)` expression with `box.maxSize`. "shrinks a long name to fit maxWidth" should go red.
  3. Change one character inside one string of `great-vibes.ts`. "is embedded byte for byte" should go red.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json scripts/embed-handwriting-font.mjs lib/pdf/fonts/great-vibes.ts lib/pdf/handwriting.ts tests/pdf/handwriting.test.ts
git commit -m "feat: handwriting font embedded for signatures, with Helvetica Oblique fallback

Power checks: <names of the red tests>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

## Task 2: Migration 029

**Files:**
- Create: `db/migrations/029_visible_signatures.sql`
- Test: `tests/db/migration-029.test.ts`

**Interfaces:**
- Produces columns:
  - `job_files.sign_marks jsonb` (nullable, an object when set);
  - `contract_signatures.signature_method text` (null, `typed` or `drawn`);
  - `contract_signatures.signed_initials text`;
  - `contract_signatures.signature_image_pathname text`;
  - `contract_signatures.initials_image_pathname text`.
- Produces constraints:
  - `job_files_sign_marks_check`;
  - `contract_signatures_signature_method_check`;
  - `contract_signatures_adoption_check`.

- [ ] **Step 1: Write the failing test** `tests/db/migration-029.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/029_visible_signatures.sql", "utf8");
const statements = source.split(/\r?\n/).filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));

describe("migration 029", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split(/\r?\n/)) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
  it("never puts a semicolon inside a string literal (every statement has balanced quotes)", () => {
    for (const s of statements) expect(s.split("'").length % 2, s).toBe(1);
  });
  it("is re-runnable: every column is added if missing, every check is dropped right before it is added", () => {
    for (const s of statements) {
      expect(s).toMatch(/^alter table (job_files|contract_signatures) (add column if not exists|drop constraint if exists|add constraint) /);
    }
    for (const name of ["job_files_sign_marks_check", "contract_signatures_signature_method_check", "contract_signatures_adoption_check"]) {
      const drop = statements.findIndex((s) => s.endsWith(`drop constraint if exists ${name}`));
      const add = statements.findIndex((s) => s.includes(`add constraint ${name} check`));
      expect(drop, name).toBeGreaterThanOrEqual(0);
      expect(add, name).toBe(drop + 1);
    }
  });
  it("adds the nullable columns, none with a default", () => {
    expect(find("sign_marks jsonb")).toBe("alter table job_files add column if not exists sign_marks jsonb");
    for (const column of ["signature_method", "signed_initials", "signature_image_pathname", "initials_image_pathname"]) {
      expect(find(`if not exists ${column} `)).toBe(`alter table contract_signatures add column if not exists ${column} text`);
    }
  });
  it("keeps sign marks an object when present", () => {
    expect(find("add constraint job_files_sign_marks_check")).toBe(
      "alter table job_files add constraint job_files_sign_marks_check check ( sign_marks is null or jsonb_typeof(sign_marks) = 'object' )");
  });
  it("allows only typed or drawn, and null for signatures made before adoption existed", () => {
    expect(find("add constraint contract_signatures_signature_method_check")).toBe(
      "alter table contract_signatures add constraint contract_signatures_signature_method_check check ( signature_method is null or signature_method in ('typed','drawn') )");
  });
  it("ties the stored adoption to its method", () => {
    expect(find("add constraint contract_signatures_adoption_check")).toBe(
      "alter table contract_signatures add constraint contract_signatures_adoption_check check ( " +
      "(signature_method is null and signed_initials is null and signature_image_pathname is null and initials_image_pathname is null) " +
      "or (signature_method = 'typed' and signature_image_pathname is null and initials_image_pathname is null) " +
      "or (signature_method = 'drawn' and signature_image_pathname is not null and signed_initials is null) )");
  });
  it("redefines neither shared kind check", () => {
    expect(source).not.toMatch(/job_events_kind_check|job_files_doc_type_check/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-029.test.ts`
Expected: FAIL, ENOENT for `029_visible_signatures.sql`.

- [ ] **Step 3: Write** `db/migrations/029_visible_signatures.sql`

```sql
-- Visible signatures and initials. Spec docs/superpowers/specs/2026-09-29-visible-signatures-design.md section 6.
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments or string literals.

-- Where the initials and the signature block sit on a generated PDF, written with the file.
-- Null for hand-uploaded files and anything generated before this shipped.
alter table job_files add column if not exists sign_marks jsonb;

alter table job_files drop constraint if exists job_files_sign_marks_check;
alter table job_files add constraint job_files_sign_marks_check check (
  sign_marks is null or jsonb_typeof(sign_marks) = 'object'
);

-- What the client adopted. A null method means the signature was made before adoption existed.
-- Typed initials are text. Drawn signatures and initials are private Blob pathnames.
alter table contract_signatures add column if not exists signature_method text;
alter table contract_signatures add column if not exists signed_initials text;
alter table contract_signatures add column if not exists signature_image_pathname text;
alter table contract_signatures add column if not exists initials_image_pathname text;

alter table contract_signatures drop constraint if exists contract_signatures_signature_method_check;
alter table contract_signatures add constraint contract_signatures_signature_method_check check (
  signature_method is null or signature_method in ('typed','drawn')
);

-- Each method stores only its own kind of adoption. A drawn signature always has its image.
alter table contract_signatures drop constraint if exists contract_signatures_adoption_check;
alter table contract_signatures add constraint contract_signatures_adoption_check check (
  (signature_method is null and signed_initials is null and signature_image_pathname is null and initials_image_pathname is null)
  or (signature_method = 'typed' and signature_image_pathname is null and initials_image_pathname is null)
  or (signature_method = 'drawn' and signature_image_pathname is not null and signed_initials is null)
);
```

- [ ] **Step 4: Run the tests, including the cross-file check guard**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-029.test.ts tests/db/migration-checks-consistent.test.ts`
Expected: PASS.

- [ ] **Step 5: Power checks, then commit** (revert after each check)
  1. Remove the `drop constraint if exists contract_signatures_adoption_check` statement. "is re-runnable" should go red.
  2. Add `;` to a comment line. "never puts a semicolon inside a comment" should go red.
  3. Change `'drawn'` to `'drew'` in the method check. Its test should go red.

```bash
git add db/migrations/029_visible_signatures.sql tests/db/migration-029.test.ts
git commit -m "feat: migration 029 — sign marks on files, adoption on signatures

Power checks: <names>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

- [ ] **Step 6 (controller, after the Wave 1 merge): prove the migration on the test branch twice.**

The branch is the one named by `E2E_TEST_ENDPOINT`, or `ep-lingering-fog` by default. Load its URL without printing it. Before running, check that the host contains that endpoint id and not `cold-term`:

```powershell
Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*E2E_POSTGRES_URL\s*=\s*(.*)$') { $env:MIGRATE_DATABASE_URL = $matches[1].Trim().Trim('"').Trim("'") } }
$endpoint = if ($env:E2E_TEST_ENDPOINT) { $env:E2E_TEST_ENDPOINT } else { "ep-lingering-fog" }
$h = ([Uri]$env:MIGRATE_DATABASE_URL).Host; if ($h -like "*cold-term*" -or $h -notlike "*$endpoint*") { throw "wrong branch" }
node scripts/migrate.mjs; node scripts/migrate.mjs
```

Expected: both runs finish with no error, and both list the `029_visible_signatures.sql` statements. The second run proves the file is idempotent.

Production is migrated only at deploy time, following memory "pss production migrations". That step is not part of this plan's waves.

---

## Task 3: Sign marks — types, geometry, numbered sections

**Files:**
- Create: `lib/pdf/sign-marks.ts`
- Test: `tests/pdf/sign-marks.test.ts`

**Interfaces:**
- Produces (used by Tasks 6, 7, 8, 9, 11 and 12). This module holds types and constants only, so it is safe in client components.
  - `type MarkPoint = { page: number; x: number; y: number }`
  - `type InitialsMark = MarkPoint & { section: string }`
  - `type SignMarks = { initials: InitialsMark[]; signature: MarkPoint | null }`
  - `sectionNumber(headingText: string): string | null`
  - `INITIALS_GUTTER = 64`
  - `INITIALS_BOX = { width: 56, height: 16, lineDrop: 3 }`
  - `SIGNATURE_BLOCK = { before: 30, row: 30, labelWidth: 100, lineWidth: 240, dateWidth: 120, signatureHeight: 26, lineDrop: 2, height: 110 }`
  - `parseSignMarks(value: unknown): SignMarks | null`
  - `initialedSections(marks: SignMarks | null): string[]`
  - `hasInitialMarks(marks: SignMarks | null | undefined): boolean`

The geometry contract (the renderer draws it, and the stamp writes into it):
- **Initials mark:** the left end of the initials line, in PDF points from the bottom-left of the page.
  - The line runs `INITIALS_BOX.width` to the right, at the heading's first baseline minus `lineDrop`.
  - The initials are written inside `[x, y + 1, width, height]`.
- **Signature mark:** the left end of the "Client signature" line.
  - The "Printed name" line is at `y - row`, and the "Date" line at `y - 2 * row`, at the same x.
  - The signature is written above its line, inside `[x, y + 1, lineWidth, signatureHeight]`.
  - The printed name and date are drawn on the baseline `lineY + 4`.

- [ ] **Step 1: Write the failing test** `tests/pdf/sign-marks.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  INITIALS_BOX, INITIALS_GUTTER, hasInitialMarks, initialedSections, parseSignMarks, sectionNumber, type SignMarks,
} from "@/lib/pdf/sign-marks";

const marks: SignMarks = {
  initials: [{ page: 1, x: 502, y: 700, section: "4" }, { page: 2, x: 502, y: 735, section: "5" }],
  signature: { page: 3, x: 154, y: 400 },
};

describe("sectionNumber (spec §2)", () => {
  it.each([["4. Your Right to Cancel", "4"], ["18. Contact Us", "18"], ["  2. Leading spaces", "2"]])("numbers %s", (text, n) => {
    expect(sectionNumber(text)).toBe(n);
  });
  it.each([["Scope"], ["4.Your"], ["4 Your"], ["A. Lettered"], ["Section 4. Late"], ["4."]])("does not number %s", (text) => {
    expect(sectionNumber(text)).toBeNull();
  });
});

describe("geometry", () => {
  it("leaves room in the gutter for the box and a gap", () => {
    expect(INITIALS_GUTTER).toBeGreaterThanOrEqual(INITIALS_BOX.width + 8);
  });
});

describe("parseSignMarks", () => {
  it("accepts what the renderer stores, as an object or as JSON text", () => {
    expect(parseSignMarks(marks)).toEqual(marks);
    expect(parseSignMarks(JSON.stringify(marks))).toEqual(marks);
    expect(parseSignMarks({ initials: [], signature: null })).toEqual({ initials: [], signature: null });
  });
  it("drops unknown keys", () => {
    expect(parseSignMarks({ ...marks, extra: 1, initials: [{ ...marks.initials[0], note: "x" }] }))
      .toEqual({ initials: [marks.initials[0]], signature: marks.signature });
  });
  it.each([
    ["null", null],
    ["a number", 3],
    ["no initials", { signature: null }],
    ["missing signature key", { initials: [] }],
    ["a negative page", { initials: [{ page: -1, x: 1, y: 1, section: "1" }], signature: null }],
    ["a fractional page", { initials: [], signature: { page: 0.5, x: 1, y: 1 } }],
    ["a non-numeric section", { initials: [{ page: 0, x: 1, y: 1, section: "four" }], signature: null }],
    ["an infinite x", { initials: [], signature: { page: 0, x: Infinity, y: 1 } }],
    ["bad JSON", "{"],
  ])("refuses %s", (_label, value) => expect(parseSignMarks(value)).toBeNull());
});

describe("helpers", () => {
  it("lists initialed sections in order, and none for a legacy file", () => {
    expect(initialedSections(marks)).toEqual(["4", "5"]);
    expect(initialedSections(null)).toEqual([]);
  });
  it("says whether initials are needed", () => {
    expect(hasInitialMarks(marks)).toBe(true);
    expect(hasInitialMarks({ initials: [], signature: marks.signature })).toBe(false);
    expect(hasInitialMarks(null)).toBe(false);
    expect(hasInitialMarks(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/pdf/sign-marks.test.ts`
Expected: FAIL, the module cannot be resolved.

- [ ] **Step 3: Implement** `lib/pdf/sign-marks.ts`

```ts
/**
 * Sign marks (spec §2): where, on a generated PDF, the initials and the signature block belong.
 * Types and constants only, safe to import anywhere. The renderer (lib/docs/pdf.ts) draws the empty
 * boxes and records the marks, and the stamp (lib/portal/stamp.ts) writes into them. Both read the
 * geometry below, so the two can never disagree about where a box is.
 */
export type MarkPoint = { page: number; x: number; y: number };
/** `section` is the heading's number ("4" for "4. Your Right to Cancel"), for "Initialed sections: 4, 5". */
export type InitialsMark = MarkPoint & { section: string };
export type SignMarks = { initials: InitialsMark[]; signature: MarkPoint | null };

const NUMBERED = /^(\d+)\.\s/;

/** The section number of a numbered heading's text (spec §2: `^\d+\.\s`), or null. */
export const sectionNumber = (headingText: string): string | null => NUMBERED.exec(headingText.trimStart())?.[1] ?? null;

/** How much narrower a numbered heading wraps, leaving room for its initials box at the right margin. */
export const INITIALS_GUTTER = 64;
/** The initials line. The mark is its left end, lineDrop below the heading's first baseline. */
export const INITIALS_BOX = { width: 56, height: 16, lineDrop: 3 } as const;
/**
 * The signature block. The mark is the left end of the "Client signature" line. "Printed name" and
 * "Date" follow `row` points below each other. `height` is what the renderer keeps free before drawing it.
 */
export const SIGNATURE_BLOCK = {
  before: 30, row: 30, labelWidth: 100, lineWidth: 240, dateWidth: 120, signatureHeight: 26, lineDrop: 2, height: 110,
} as const;

const isPoint = (value: unknown): value is MarkPoint => {
  if (typeof value !== "object" || value === null) return false;
  const { page, x, y } = value as Record<string, unknown>;
  return Number.isInteger(page) && (page as number) >= 0 && Number.isFinite(x) && Number.isFinite(y);
};
const isInitials = (value: unknown): value is InitialsMark =>
  isPoint(value) && typeof (value as InitialsMark).section === "string" && /^\d+$/.test((value as InitialsMark).section);

/** Reads a stored `sign_marks` value. Anything malformed is null, and is then signed as a file with no marks. */
export function parseSignMarks(value: unknown): SignMarks | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.initials) || !record.initials.every(isInitials)) return null;
  if (!("signature" in record) || (record.signature !== null && !isPoint(record.signature))) return null;
  const signature = record.signature as MarkPoint | null;
  return {
    initials: (record.initials as InitialsMark[]).map(({ page, x, y, section }) => ({ page, x, y, section })),
    signature: signature === null ? null : { page: signature.page, x: signature.x, y: signature.y },
  };
}

export const initialedSections = (marks: SignMarks | null): string[] => marks?.initials.map((mark) => mark.section) ?? [];

/** True when the file has numbered sections to initial, in which case initials are required (spec §4). */
export const hasInitialMarks = (marks: SignMarks | null | undefined): boolean => (marks?.initials.length ?? 0) > 0;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/pdf/sign-marks.test.ts`
Expected: PASS.

- [ ] **Step 5: Power checks** (revert after each)
  1. Change `NUMBERED` to `/^(\d+)\.?\s/`. "does not number 4 Your" should go red.
  2. Delete `!("signature" in record) ||`. "refuses missing signature key" should go red.
  3. Delete `&& (page as number) >= 0`. "refuses a negative page" should go red.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/sign-marks.ts tests/pdf/sign-marks.test.ts
git commit -m "feat: sign marks — numbered sections, box geometry and a strict reader

Power checks: <names>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

## Task 4: Adoption validation

**Files:**
- Create: `lib/portal/adoption-limits.ts`, `lib/portal/adoption.ts`, `tests/fixtures/png.ts`
- Test: `tests/portal/adoption.test.ts`

**Interfaces:**
- Produces, in `adoption-limits.ts` (client-safe, used by Task 12):
  - `INITIALS_MAX = 6`, `INITIALS_PATTERN: RegExp`, `INITIALS_INPUT_PATTERN: string`;
  - `PNG_MAX_BYTES = 153600`, `PNG_MAX_WIDTH = 1200`, `PNG_MAX_HEIGHT = 400`;
  - `PNG_DATA_URL_PREFIX = "data:image/png;base64,"`, `PNG_DATA_URL_MAX`;
  - `SIGNATURE_PAD = { maxWidth: 600, maxHeight: 200 }`, `INITIALS_PAD = { maxWidth: 200, maxHeight: 100 }`, `MAX_PIXEL_RATIO = 2`.
- Produces, in `adoption.ts` (server, used by Tasks 8, 9 and 11):
  - `type Adoption = { method: "typed"; initials: string | null } | { method: "drawn"; signaturePng: Buffer; initialsPng: Buffer | null }`
  - `type AdoptionForm = { method: string; initials: string; signatureImage: string; initialsImage: string }`
  - `pngSize(bytes: Buffer): { width: number; height: number } | null`
  - `parsePngDataUrl(value: string): Buffer | null`
  - `parseAdoption(form: AdoptionForm): Adoption | null`
  - `requireInitials(adoption: Adoption, needed: boolean): Adoption | null`
- Produces, in `tests/fixtures/png.ts` (used by Tasks 5, 8, 9, 11 and 13):
  - `PNG_SIGNATURE: Buffer`
  - `pngBytes(width: number, height: number): Buffer`
  - `pngDataUrl(bytes: Buffer): string`
  - `corruptPng(width: number, height: number): Buffer`

- [ ] **Step 1: Write the PNG helper** `tests/fixtures/png.ts`. It is a real encoder and needs no dependency: `pngjs` is in devDependencies but untyped and unused.

```ts
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A real 8-bit RGBA PNG, transparent except for one opaque pixel: what a canvas pad produces, and what any decoder opens. */
export function pngBytes(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height); // each row: filter byte 0, then pixels
  if (rows.length > 4) rows[4] = 255; // row 0, pixel 0, alpha
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

export const pngDataUrl = (bytes: Buffer): string => `data:image/png;base64,${bytes.toString("base64")}`;

/** A valid header (so it passes validation, which never decodes) over image data no decoder can inflate. */
export function corruptPng(width: number, height: number): Buffer {
  const png = pngBytes(width, height);
  const idat = png.indexOf("IDAT", 0, "latin1");
  png.fill(0x41, idat + 4, idat + 12); // the zlib header and the first deflate bytes
  return png;
}
```

- [ ] **Step 2: Write the failing test** `tests/portal/adoption.test.ts`

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseAdoption, parsePngDataUrl, pngSize, requireInitials, type AdoptionForm } from "@/lib/portal/adoption";
import {
  INITIALS_INPUT_PATTERN, INITIALS_MAX, INITIALS_PATTERN, PNG_DATA_URL_MAX, PNG_DATA_URL_PREFIX, PNG_MAX_BYTES,
} from "@/lib/portal/adoption-limits";
import { PNG_SIGNATURE, corruptPng, pngBytes, pngDataUrl } from "../fixtures/png";

const typed = (initials: string): AdoptionForm => ({ method: "typed", initials, signatureImage: "", initialsImage: "" });
const drawn = (signatureImage: string, initialsImage = ""): AdoptionForm => ({ method: "drawn", initials: "", signatureImage, initialsImage });
const SIG = pngBytes(600, 200);
const INI = pngBytes(200, 100);

describe("pngSize reads IHDR without decoding", () => {
  it("reads width and height", () => expect(pngSize(pngBytes(123, 45))).toEqual({ width: 123, height: 45 }));
  it("refuses bytes that are not a PNG", () => {
    expect(pngSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(40)]))).toBeNull(); // a JPEG header
    expect(pngSize(PNG_SIGNATURE)).toBeNull(); // too short for IHDR
  });
  it("refuses a PNG whose first chunk is not a 13-byte IHDR", () => {
    const wrongType = pngBytes(10, 10);
    wrongType.write("IHDX", 12, "latin1");
    expect(pngSize(wrongType)).toBeNull();
    const wrongLength = pngBytes(10, 10);
    wrongLength.writeUInt32BE(12, 8);
    expect(pngSize(wrongLength)).toBeNull();
  });
});

describe("parsePngDataUrl (spec §6)", () => {
  it("accepts a real PNG at the size limits", () => {
    const edge = pngBytes(1200, 400);
    expect(parsePngDataUrl(pngDataUrl(edge))?.equals(edge)).toBe(true);
  });
  it.each([[1201, 10], [10, 401], [0, 10], [10, 0]])("refuses %i x %i", (w, h) => {
    expect(parsePngDataUrl(pngDataUrl(pngBytes(w, h)))).toBeNull();
  });
  it("refuses another image type, a missing prefix and malformed base64", () => {
    expect(parsePngDataUrl(`data:image/jpeg;base64,${SIG.toString("base64")}`)).toBeNull();
    expect(parsePngDataUrl(SIG.toString("base64"))).toBeNull();
    expect(parsePngDataUrl(`${PNG_DATA_URL_PREFIX}${SIG.toString("base64")}!`)).toBeNull();
    expect(parsePngDataUrl(`${PNG_DATA_URL_PREFIX}${SIG.toString("base64").slice(0, -1)}`)).toBeNull();
    expect(parsePngDataUrl(PNG_DATA_URL_PREFIX)).toBeNull();
  });
  it("refuses data that is not a PNG whatever the prefix says", () => {
    expect(parsePngDataUrl(`${PNG_DATA_URL_PREFIX}${Buffer.from("GIF89a is not a png at all.....").toString("base64")}`)).toBeNull();
  });
  it("accepts exactly 150 KB decoded and refuses one byte more", () => {
    const base = pngBytes(10, 10);
    const atLimit = Buffer.concat([base, Buffer.alloc(PNG_MAX_BYTES - base.length)]);
    expect(atLimit.length).toBe(150 * 1024);
    expect(parsePngDataUrl(pngDataUrl(atLimit))).not.toBeNull();
    expect(parsePngDataUrl(pngDataUrl(Buffer.concat([atLimit, Buffer.alloc(1)])))).toBeNull();
  });
  it("refuses an overlong data URL before decoding anything", () => {
    const from = vi.spyOn(Buffer, "from");
    expect(parsePngDataUrl(PNG_DATA_URL_PREFIX + "A".repeat(PNG_DATA_URL_MAX))).toBeNull();
    expect(from).not.toHaveBeenCalled();
    from.mockRestore();
  });
  it("lets a header-valid PNG with corrupt data through: it is never decoded here (spec §9)", () => {
    expect(parsePngDataUrl(pngDataUrl(corruptPng(20, 10)))).not.toBeNull();
  });
});

describe("parseAdoption", () => {
  it("takes typed initials trimmed, and none when left empty", () => {
    expect(parseAdoption(typed(" J.D "))).toEqual({ method: "typed", initials: "J.D" });
    expect(parseAdoption(typed("Jo-Ann"))).toEqual({ method: "typed", initials: "Jo-Ann" });
    expect(parseAdoption(typed("   "))).toEqual({ method: "typed", initials: null });
  });
  it.each([["1D"], ["ABCDEFG"], ["J@"], [".J"], ["J_D"]])("refuses typed initials %s", (value) => {
    expect(parseAdoption(typed(value))).toBeNull();
  });
  it("ignores image fields in typed mode", () => {
    expect(parseAdoption({ ...typed("JD"), signatureImage: "junk", initialsImage: "junk" })).toEqual({ method: "typed", initials: "JD" });
  });
  it("takes drawn images as bytes, with or without initials", () => {
    const both = parseAdoption(drawn(pngDataUrl(SIG), pngDataUrl(INI)));
    if (both?.method !== "drawn") throw new Error("expected a drawn adoption");
    expect(both.signaturePng.equals(SIG)).toBe(true);
    expect(both.initialsPng?.equals(INI)).toBe(true);
    expect(parseAdoption(drawn(pngDataUrl(SIG)))).toMatchObject({ method: "drawn", initialsPng: null });
  });
  it("ignores typed initials in drawn mode", () => {
    expect(parseAdoption({ ...drawn(pngDataUrl(SIG)), initials: "JD" })).toMatchObject({ method: "drawn", initialsPng: null });
  });
  it("refuses a drawn adoption without a valid signature, or with invalid initials", () => {
    expect(parseAdoption(drawn(""))).toBeNull();
    expect(parseAdoption(drawn(pngDataUrl(pngBytes(1201, 10))))).toBeNull();
    expect(parseAdoption(drawn(pngDataUrl(SIG), "data:image/png;base64,AAAA"))).toBeNull();
  });
  it.each([[""], ["Typed"], ["both"]])("refuses method %j", (method) => {
    expect(parseAdoption({ ...typed("JD"), method })).toBeNull();
  });
});

describe("requireInitials (initials present exactly when the file has initial marks)", () => {
  it.each([
    [{ method: "typed", initials: "JD" } as const, true, true],
    [{ method: "typed", initials: null } as const, true, false],
    [{ method: "typed", initials: "JD" } as const, false, false],
    [{ method: "typed", initials: null } as const, false, true],
  ])("typed %j, needed %s -> accepted %s", (adoption, needed, accepted) => {
    expect(requireInitials(adoption, needed) !== null).toBe(accepted);
  });
  it("applies the same rule to drawn initials", () => {
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: INI }, true)).not.toBeNull();
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: null }, true)).toBeNull();
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: INI }, false)).toBeNull();
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: null }, false)).not.toBeNull();
  });
});

describe("the limits the form shares", () => {
  it("the HTML pattern, compiled as browsers do (v flag), agrees with the server's rule", () => {
    const html = new RegExp(`^(?:${INITIALS_INPUT_PATTERN})$`, "v");
    for (const sample of ["J", "JD", "J.D.", "Jo-Ann", "A B", "ABCDEF", "ABCDEFG", "1D", "J@", "", ".J", "J_D"]) {
      expect(html.test(sample), sample).toBe(INITIALS_PATTERN.test(sample));
    }
    expect(INITIALS_MAX).toBe(6);
  });
  it("the data URL cap is exactly the base64 length of 150 KB", () => {
    expect(PNG_DATA_URL_MAX).toBe(PNG_DATA_URL_PREFIX.length + 204800);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/adoption.test.ts`
Expected: FAIL, the modules cannot be resolved.

- [ ] **Step 4: Implement** `lib/portal/adoption-limits.ts`

```ts
/**
 * The adoption's limits (spec §4, §6), shared by the form and the server, so an input's own limits
 * and the server's checks cannot drift apart. Constants only, so this is safe in a client
 * component. That is why they are not in adoption.ts, which uses Buffer and is server-only.
 */
export const INITIALS_MAX = 6;
/** Spec §6, verbatim. Applied to the trimmed value. */
export const INITIALS_PATTERN = /^[A-Za-z][A-Za-z.\- ]{0,5}$/;
/** The same rule as an HTML pattern attribute. Browsers compile it with the v flag, where "-" in a class must be escaped. */
export const INITIALS_INPUT_PATTERN = "[A-Za-z][A-Za-z.\\- ]{0,5}";

export const PNG_MAX_BYTES = 150 * 1024;
export const PNG_MAX_WIDTH = 1200;
export const PNG_MAX_HEIGHT = 400;
export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
/** The longest data URL that can decode to PNG_MAX_BYTES. Checked before anything is decoded. */
export const PNG_DATA_URL_MAX = PNG_DATA_URL_PREFIX.length + Math.ceil(PNG_MAX_BYTES / 3) * 4;

/** CSS pixel caps for the two pads (spec §4). At a pixel ratio of at most 2, the PNGs stay within 1200 x 400. */
export const SIGNATURE_PAD = { maxWidth: 600, maxHeight: 200 } as const;
export const INITIALS_PAD = { maxWidth: 200, maxHeight: 100 } as const;
export const MAX_PIXEL_RATIO = 2;
```

- [ ] **Step 5: Implement** `lib/portal/adoption.ts`

```ts
import "server-only";
import {
  INITIALS_PATTERN, PNG_DATA_URL_MAX, PNG_DATA_URL_PREFIX, PNG_MAX_BYTES, PNG_MAX_HEIGHT, PNG_MAX_WIDTH,
} from "./adoption-limits";

/** What the client adopted (spec §2). Typed: the signature is the typed full name, drawn in the handwriting font. */
export type Adoption =
  | { method: "typed"; initials: string | null }
  | { method: "drawn"; signaturePng: Buffer; initialsPng: Buffer | null };

/** The adoption's form fields, as posted. Nothing here is trusted until parseAdoption accepts it. */
export type AdoptionForm = { method: string; initials: string; signatureImage: string; initialsImage: string };

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Width and height from the IHDR chunk, which the PNG format requires first: bytes 8-11 are its
 * length (13), 12-15 its type ("IHDR"), 16-19 the width and 20-23 the height, all big-endian.
 * Nothing is decoded (spec §9). Null when the header is not a PNG's.
 */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 33) return null; // signature 8 + length 4 + type 4 + data 13 + CRC 4
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) return null;
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A drawn image (spec §6): a PNG data URL, at most 150 KB decoded, 1 to 1200 wide and 1 to 400 high. Otherwise null. */
export function parsePngDataUrl(value: string): Buffer | null {
  // Length first, so a forged multi-megabyte post is refused without being decoded.
  if (value.length > PNG_DATA_URL_MAX || !value.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const body = value.slice(PNG_DATA_URL_PREFIX.length);
  // Buffer.from silently skips characters that are not base64, so the text is checked before decoding.
  if (body.length % 4 !== 0 || !BASE64.test(body)) return null;
  const bytes = Buffer.from(body, "base64");
  if (bytes.length > PNG_MAX_BYTES) return null;
  const size = pngSize(bytes);
  if (!size || size.width < 1 || size.height < 1 || size.width > PNG_MAX_WIDTH || size.height > PNG_MAX_HEIGHT) return null;
  return bytes;
}

/**
 * The posted adoption, validated (spec §6), or null for "invalid". The other method's fields are
 * ignored, not refused: a client who switched from Draw back to Type may still post a stale image.
 * Whether initials are required depends on the file, so requireInitials settles that afterwards.
 */
export function parseAdoption(form: AdoptionForm): Adoption | null {
  if (form.method === "typed") {
    const initials = form.initials.trim();
    if (!initials) return { method: "typed", initials: null };
    return INITIALS_PATTERN.test(initials) ? { method: "typed", initials } : null;
  }
  if (form.method === "drawn") {
    const signaturePng = parsePngDataUrl(form.signatureImage);
    if (!signaturePng) return null;
    if (!form.initialsImage) return { method: "drawn", signaturePng, initialsPng: null };
    const initialsPng = parsePngDataUrl(form.initialsImage);
    return initialsPng ? { method: "drawn", signaturePng, initialsPng } : null;
  }
  return null;
}

/** Spec §6: initials are present exactly when the file has initial marks. Otherwise null ("invalid"). */
export function requireInitials(adoption: Adoption, needed: boolean): Adoption | null {
  const present = adoption.method === "typed" ? adoption.initials !== null : adoption.initialsPng !== null;
  return present === needed ? adoption : null;
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/portal/adoption.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Power checks** (revert after each)
  1. Delete `value.length > PNG_DATA_URL_MAX ||`. "refuses an overlong data URL before decoding anything" should go red.
  2. Delete `|| !BASE64.test(body)`. "refuses … malformed base64" should go red.
  3. Change `> PNG_MAX_WIDTH` to `> PNG_MAX_WIDTH + 1`. "refuses 1201 x 10" should go red.
  4. Delete the IHDR length and type check. "refuses a PNG whose first chunk is not a 13-byte IHDR" should go red.
  5. Make `requireInitials` return `adoption` unconditionally. The requireInitials cases should go red.
  6. Change `INITIALS_INPUT_PATTERN`'s `\\-` to `-`. "the HTML pattern … agrees" should go red (a v-flag SyntaxError).

- [ ] **Step 8: Commit**

```bash
git add lib/portal/adoption-limits.ts lib/portal/adoption.ts tests/fixtures/png.ts tests/portal/adoption.test.ts
git commit -m "feat: adoption validation — typed initials and drawn PNGs checked by header only

Power checks: <names>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---

## Task 5: `pdfPages`, a font-aware PDF reader for tests

`e2e/fixtures/pdf-text.ts`'s `pdfText` decodes every `<hex> Tj` as Latin-1. That is right for the standard fonts, but gives glyph ids for text in an embedded font. Handwritten initials and signatures (spec §10: "initials appear once per numbered section") need a reader that knows which font drew each run, decodes embedded fonts through their ToUnicode CMap, and counts image draws. `pdfText` stays as it is: its callers are unchanged.

**Files:**
- Create: `e2e/fixtures/pdf-pages.ts`
- Test: `tests/e2e-fixtures/pdf-pages.test.ts`

**Interfaces:**
- Consumes: `embedHandwriting` (Task 1) and `pngBytes` (Task 4), in the test only.
- Produces (used by Task 14):
  - `type DrawnRun = { font: string; text: string }`
  - `type DrawnPage = { runs: DrawnRun[]; images: number }`
  - `pdfPages(bytes: Uint8Array): Promise<DrawnPage[]>`

  `font` is the font's base name: `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique` or the hand font's PostScript name (`GreatVibes-Regular`). pdf-lib names a page's font resource `<font.name>-<random digits>`, and `pdfPages` strips that suffix.

- [ ] **Step 1: Write the failing test** `tests/e2e-fixtures/pdf-pages.test.ts`

```ts
// @vitest-environment node
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfPages } from "@/e2e/fixtures/pdf-pages";
import { embedHandwriting } from "@/lib/pdf/handwriting";
import { pngBytes } from "../fixtures/png";

async function sample() {
  const pdf = await PDFDocument.create();
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const hand = await embedHandwriting(pdf);
  const image = await pdf.embedPng(pngBytes(40, 20));
  const first = pdf.addPage();
  first.drawText("4. Your Right to Cancel", { x: 50, y: 700, size: 11, font: helvetica });
  first.drawText("JD", { x: 500, y: 700, size: 14, font: hand.hand });
  first.drawImage(image, { x: 500, y: 650, width: 40, height: 20 });
  const second = pdf.addPage();
  second.drawText("Jane Doe", { x: 150, y: 400, size: 20, font: hand.hand });
  second.drawImage(image, { x: 1, y: 1, width: 4, height: 2 });
  second.drawImage(image, { x: 9, y: 9, width: 4, height: 2 });
  return { bytes: await pdf.save(), handName: hand.hand.name };
}

describe("pdfPages", () => {
  it("reads each page's runs with their font, decoding the embedded font through ToUnicode", async () => {
    const { bytes, handName } = await sample();
    const pages = await pdfPages(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0].runs).toEqual([
      { font: "Helvetica", text: "4. Your Right to Cancel" },
      { font: handName, text: "JD" },
    ]);
    expect(pages[1].runs).toEqual([{ font: handName, text: "Jane Doe" }]);
  });
  it("counts image draws per page", async () => {
    const pages = await pdfPages((await sample()).bytes);
    expect(pages.map((page) => page.images)).toEqual([1, 2]);
  });
  it("reads a page that was drawn on again after loading (several content streams)", async () => {
    const loaded = await PDFDocument.load((await sample()).bytes);
    loaded.getPage(0).drawText("Printed", { x: 10, y: 10, size: 9, font: await loaded.embedFont(StandardFonts.Helvetica) });
    const pages = await pdfPages(await loaded.save());
    expect(pages[0].runs.map((run) => run.text)).toEqual(["4. Your Right to Cancel", "JD", "Printed"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/e2e-fixtures/pdf-pages.test.ts`
Expected: FAIL, `@/e2e/fixtures/pdf-pages` cannot be resolved.

- [ ] **Step 3: Implement** `e2e/fixtures/pdf-pages.ts`

```ts
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream, type PDFObject } from "pdf-lib";

export type DrawnRun = { font: string; text: string };
export type DrawnPage = { runs: DrawnRun[]; images: number };

/**
 * What pdf-lib drew on each page: every `Tj` run with the base name of the font that drew it, and
 * the number of image draws (`Do`). A run in an embedded font is decoded through that font's
 * ToUnicode CMap (pdf-lib writes `<glyph> <unicode>` pairs in one beginbfchar block), so
 * handwritten text reads back as text. A run in a standard font is decoded as Latin-1, as pdfText does.
 * Only for PDFs pdf-lib wrote: this is not a general PDF parser.
 */
export async function pdfPages(bytes: Uint8Array): Promise<DrawnPage[]> {
  const pdf = await PDFDocument.load(bytes);
  const decode = (object: PDFObject | undefined): string => {
    const stream = object instanceof PDFRef ? pdf.context.lookup(object) : object;
    return Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1");
  };

  return pdf.getPages().map((page) => {
    // Resource key ("/GreatVibes-Regular-4812930311") -> base name and, for an embedded font, its glyph map.
    const fonts = new Map<string, { name: string; glyphs: Map<string, string> | null }>();
    const fontDict = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    for (const [key, ref] of fontDict?.entries() ?? []) {
      const dict = pdf.context.lookup(ref, PDFDict);
      const toUnicode = dict.get(PDFName.of("ToUnicode"));
      let glyphs: Map<string, string> | null = null;
      if (toUnicode) {
        glyphs = new Map();
        const block = /beginbfchar([\s\S]*?)endbfchar/.exec(decode(toUnicode))?.[1] ?? "";
        for (const [, glyph, unicode] of block.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g)) {
          const units = (unicode.match(/.{4}/g) ?? []).map((hex) => parseInt(hex, 16));
          glyphs.set(glyph.toLowerCase(), String.fromCharCode(...units));
        }
      }
      fonts.set(key.asString(), { name: key.asString().replace(/^\//, "").replace(/-\d+$/, ""), glyphs });
    }

    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const runs: DrawnRun[] = [];
    let images = 0;
    let current: { name: string; glyphs: Map<string, string> | null } = { name: "", glyphs: null };
    for (const source of streams.map(decode)) {
      for (const [, fontKey, hex, xobject] of source.matchAll(/(\/[^\s/<>[\]()]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\/[^\s/<>[\]()]+\s+(Do)\b/g)) {
        if (fontKey) current = fonts.get(fontKey) ?? { name: fontKey.slice(1), glyphs: null };
        else if (xobject) images++;
        else if (hex !== undefined) {
          const glyphs = current.glyphs;
          const text = glyphs
            ? (hex.match(/.{4}/g) ?? []).map((glyph) => glyphs.get(glyph.toLowerCase()) ?? "�").join("")
            : Buffer.from(hex, "hex").toString("latin1");
          runs.push({ font: current.name, text });
        }
      }
    }
    return { runs, images };
  });
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/e2e-fixtures/pdf-pages.test.ts && npm run typecheck`
Expected: PASS.

If the `Do` regex also counts the Tf alternation's font key, fix the regex, not the test.

- [ ] **Step 5: Power checks** (revert after each)
  1. Force `glyphs` to `null` everywhere, so everything is decoded as Latin-1. The first test should go red on the hand runs.
  2. Change `.replace(/-\d+$/, "")` to nothing. The font names should no longer match and the first test go red.
  3. Remove the `(Do)` alternative. "counts image draws per page" should go red.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures/pdf-pages.ts tests/e2e-fixtures/pdf-pages.test.ts
git commit -m "test: pdfPages reads drawn runs by font, decoding embedded fonts, and counts images

Power checks: <names>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj"
```

---
