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
| `.gitattributes` | new | `*.ttf binary` | 1 |
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
| 1 | 1 | `package.json`, `package-lock.json`, `.gitattributes`, `scripts/embed-handwriting-font.mjs`, `lib/pdf/fonts/great-vibes.ts`, `lib/pdf/handwriting.ts`, `tests/pdf/handwriting.test.ts` |
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
