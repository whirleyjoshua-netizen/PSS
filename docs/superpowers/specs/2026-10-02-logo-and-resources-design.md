# Logo on paperwork, and a Resources library

Owner request (2026-10-02): "upload docs from my computer for company resources", and "our logo needs to be on paperwork like quotes and contracts and terms … so it stays consistent and the logo doesn't alter".

Owner decisions: the library is **owner-only**; it takes **any file type**; it is organised by **category**; the logo master is the **website version** (vector mark + Jost wordmark); placement is a **letterhead on page 1 and a small mark on later pages**.

Two independent parts, shipped separately: Part A (logo) first, no migration; Part B (Resources) with migration 036.

## Part A — Logo on paperwork

### A1. One geometry, one master

- `lib/brand/logo-geometry.ts`: the mark's panels (x, top, bottom, tones), `PANEL_WIDTH`, `SHEAR`, `RIM`, the rim colours, and the wordmark's letter-spacing ratios — moved verbatim out of `components/brand/Logo.tsx`, which imports them. The website renders exactly as before.
- `lib/pdf/fonts/Jost.ttf` (the variable font) and its OFL licence, `Jost-OFL.txt`: the website's display face, committed so the master never depends on Google. The builder takes its 300 and 400 instances and draws every letter as an outline, so no font travels in any PDF.
- `scripts/build-logo-master.ts` draws, with pdf-lib + fontkit, from the geometry:
  - `public/brand/logo-master.pdf`: page 1 the light-tone **lockup**, page 2 the **mark** alone (76 × 106). Each page's width/height *is* the logo's aspect ratio.
  - Page 1 is the website's lockup box. The wordmark column is as wide as its widest row, SHADE SOLUTIONS, so its trailing rule has no width, as on the live site.
  - The same bytes go to `lib/brand/logo-master.ts` as base64, which is what the PDFs embed: functions don't read loose files at runtime (precedent `lib/pdf/fonts/great-vibes.ts`).
  - Text is drawn letter by letter (pdf-lib has no letter-spacing) with the website's spacing ratios.
  - It is run once by hand and its output committed. It is not part of the build.

### A2. Drawing it

`lib/pdf/logo.ts`:

- `embedLogo(doc)` embeds both master pages once per document (`doc.embedPdf`; vector, not rasterised).
- `drawLogo(page, logo, { x, top, width })` draws at `width`, with height = `width × master height / master width`. It takes **no height**, so nothing can stretch it.
- `drawLetterhead(page, logo, fonts)`: page 1's top-left is the lockup at 170 pt wide; under it, in 8.5 pt, `business.legalName` and then `phone · email`. It returns the y where the content starts. The date stays on the title line, where it was.
- `markPages(doc, logo, { fromPage, skip })` puts the mark, 22 pt tall, at the top-right of every page from `fromPage` on, inside the top margin. Its bottom is at y = 756, clear of a first line's capitals (about 748) and of an initials box at the top of a page (752). Pages in `skip` are left untouched.

### A3. Where

| PDF | Page 1 | Pages 2+ |
|---|---|---|
| Quote (`buildQuotePdf`, preview included) | letterhead | mark |
| Contract (`renderContractPdf`) | letterhead | mark on the priced pages, typed terms, signature page; **uploaded terms pages are skipped**, as uploaded |
| Terms preview (`buildTermsPdf`) | mark (it has no letterhead today; it is the terms pages alone) | mark |
| Job documents (`renderDocumentPdf`, and its preview) | letterhead | mark |

- The quote and the contract keep drawing page 1 through the one `drawPricedPages`, so they still match line for line. The existing test that compares their positions keeps proving it.
- Sign marks (initials, signature) are computed as pages are drawn, so they follow the moved content. Stored, signed PDFs are files and do not change.
- `portal/stamp.ts` stamps at stored marks and is untouched. The signing-certificate page it appends carries no mark: it is the signing record, not our paperwork.

### A4. Guards (tests)

- The master file's SHA-256 is pinned. Any change fails until the test is updated on purpose.
- `drawLogo`: for several widths, the drawn height ÷ width equals the master page's ratio exactly.
- Each of the four PDFs: page 1 draws the lockup once; every later page draws the mark once, and an uploaded terms page draws none. This is checked by spying on `drawPage`.
- Nothing drawn by the content goes above the top margin, so the mark covers nothing.
- The website `Logo` still renders the same paths, with a snapshot of its SVG path data taken before the move.

## Part B — Resources library (owner-only)

### B1. Data: migration 036 `company_files`

```
id uuid pk default gen_random_uuid(), name text not null (1–200 chars, trimmed),
category text not null (1–60 chars, trimmed), content_type text not null,
size_bytes bigint not null check > 0, blob_pathname text not null unique
  check (blob_pathname like 'resources/%'),
uploaded_by text not null, created_at timestamptz default now(), updated_at timestamptz default now()
index on (category, name)
```

It follows the house style: re-runnable, with named checks dropped and re-added.

### B2. Upload

- The browser sends each file straight to private Blob storage with `upload()` from `@vercel/blob/client`, using `multipart: true` and `handleUploadUrl: /admin/resources/upload`. Files never pass through a function, so there is no 4.5 MB limit.
- `app/admin/resources/upload/route.ts` uses `handleUpload`. `onBeforeGenerateToken` calls `requireAdmin()`, requires the pathname to be `resources/<uuid>/<safeName>`, and sets `maximumSizeInBytes` to 200 MB, `addRandomSuffix: false` and `allowOverwrite: false`. There is no `onUploadCompleted`, because the record is written next.
- Then the server action `saveResource({ pathname, name, category })`:
  - `requireAdmin`;
  - pathname shape;
  - `head(pathname)` to confirm the blob exists and to take its real size and content type;
  - insert.
  - If the insert fails, the blob is deleted.
- Upload form: a multi-file picker, then a category input (a datalist of the categories in use, or type a new one). Each file shows a progress bar and its own result. Over 200 MB is refused in the browser before uploading.

### B3. Page `/admin/resources` ("Resources" in the admin nav, after Documents)

- Files grouped by category (A–Z), each sorted by name. Each row shows the name (a link), size, who uploaded it and when.
- A search box filters by name or category on the page.
- Each row has rename, change category and delete (with a confirmation).
- Empty state: "No files yet. Upload price sheets, spec books, certificates — anything you want on hand."

### B4. Opening a file — `app/admin/resources/[id]/route.ts`

- `requireAdmin`, then the file is streamed from private Blob with `Cache-Control: private, no-store` and `nosniff`.
- `inline` only for PDF, JPEG, PNG, WebP and GIF. Everything else is `attachment` (HTML and SVG included, so nothing uploaded runs on our origin).

### B5. Edit and delete

- Rename and change category are server actions (`requireAdmin`, the same length rules as the table).
- Delete removes the row (`returning blob_pathname`), then the blob. If the blob delete fails it is logged, and the row is already gone.

### B6. Tests

- Unit tests:
  - the upload route's token rules (signed-in, path shape, limits);
  - `saveResource` (head-verified size and type, bad path refused, blob removed when the insert fails);
  - the download route's inline/attachment rules;
  - the page's grouping and search;
  - rename, category and delete.
- The new SQL is run against a real Neon branch (migration plus the insert, list, rename and delete statements) before shipping.

## Out of scope

- Sharing resources with clients or attaching them to jobs (the owner chose internal-only).
- Folders.
- Logos on uploaded terms PDFs and on emails.

**Noted, not changed:** job-file uploads go through a function with a 20 MB limit, while Vercel caps request bodies at about 4.5 MB. Check this separately.
