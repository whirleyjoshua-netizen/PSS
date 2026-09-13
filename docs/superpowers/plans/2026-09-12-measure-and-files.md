# Measure and Job Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An iPhone-first measuring screen per job and a Files section on the job page, with window photos and uploaded documents in a private Vercel Blob store.

**Architecture:** Lives in the existing owner-only `/admin` area. Measurements and file metadata are new Postgres tables; file bytes live in private Vercel Blob storage. Uploads and file viewing go through Route Handlers that call `requireAdmin()`; measurement saves and deletes are Server Actions. Photos are resized in the browser before upload.

**Tech Stack:** Next.js 16.3 (App Router, Route Handlers, Server Actions), React 19, `@neondatabase/serverless`, `@vercel/blob@2.8.0`, zod 4, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-measure-and-files-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before using a Next API. `params`, `searchParams`, `cookies()` are async.
- Every page, Server Action, and Route Handler here calls `requireAdmin()` (from `@/lib/admin/session`) before reading input or data.
- Dimensions are integer eighths of an inch. Width and height required and > 0; depth optional and > 0 when set. Max 600 inches (4800 eighths).
- Mount is `inside` or `outside`.
- Special requirements: `hard_surface` (Hard surface), `high_ladder` (High ladder).
- Rooms (quick picks): Living room, Family room, Kitchen, Dining room, Primary bedroom, Bedroom, Bathroom, Office, Patio.
- Blob: `access: 'private'` always. Pathname `jobs/<leadId>/<fileId>-<safe-name>`.
- Upload types: photo = `image/jpeg` up to 10 MB; document = `application/pdf`, `image/jpeg`, `image/png` up to 20 MB.
- Photos resized in the browser to longest side 2000 px, JPEG quality 0.8.
- File view responses: `Cache-Control: private, no-store`, `Content-Disposition: inline`.
- Events: `measure` for window add/edit/delete, `file` for upload/delete; actor is the owner's email.
- A job, window, or file id that is not a uuid or does not exist yields not found, never an error.
- Admin UI uses the admin theme already in place (white, black, grey; `admin-theme` tokens). Primary buttons use `variant="solid"`.
- Verification on this machine (see memory): `npx vitest run --maxWorkers=2`; `npx tsc --noEmit 2>&1 | grep -v "^\.next/"`; `npx eslint` on changed files. Skip the local production build; the Vercel deploy is the build check.
- Another session may commit to `main`. Work in a worktree; stage only your own files.
- End commit messages with the session's two attribution lines.

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/003_measure_and_files.sql` | `job_files`, `window_measurements`, widened `job_events.kind` |
| `lib/admin/measure-units.ts` | Eighths math and formatting, rooms, requirements |
| `lib/admin/uploads.ts` | Pure upload rules: type/size check, safe file name, resize dimensions |
| `lib/admin/files.ts` | Server-only: file rows + Blob put/get/del, each writing its event |
| `lib/admin/measurements.ts` | Server-only: window rows, each writing its event |
| `lib/admin/schema.ts` | Adds `measurementSchema` |
| `lib/admin/jobs.ts` | `JobEvent.kind` widened |
| `app/admin/jobs/[id]/files/route.ts` | POST upload |
| `app/admin/files/[fileId]/route.ts` | GET view |
| `app/admin/jobs/measure-actions.ts` | Server Actions: save/delete window, delete file |
| `app/admin/jobs/[id]/measure/page.tsx`, `[windowId]/page.tsx` | Measure screen (new, edit) |
| `app/admin/jobs/[id]/measure/MeasureForm.tsx` | Client form, photo resize + upload |
| `app/admin/jobs/[id]/JobFiles.tsx`, `UploadButton.tsx` | Files section on the job page |
| `lib/admin/client-upload.ts` | Browser helpers: resize a photo, post a file |

---

### Task 1: Migration and measurement units

**Files:**
- Create: `db/migrations/003_measure_and_files.sql`, `lib/admin/measure-units.ts`
- Test: `tests/admin/measure-units.test.ts`

**Interfaces:**
- Produces from `@/lib/admin/measure-units`: `MAX_EIGHTHS = 4800`; `toEighths(inches: number, eighth: number): number`; `splitEighths(total: number): { inches: number; eighth: number }`; `formatEighths(total: number | null): string` (`285` → `"35 ⅝″"`, `288` → `"36″"`, `null` → `"—"`); `EIGHTH_OPTIONS: readonly { value: number; label: string }[]` (0–7 with labels `"0"`, `"⅛"`, `"¼"`, `"⅜"`, `"½"`, `"⅝"`, `"¾"`, `"⅞"`); `ROOMS: readonly string[]`; `REQUIREMENTS: readonly { value: "hard_surface" | "high_ladder"; label: string }[]`; `type Requirement`; `requirementLabel(value: string): string`.

- [ ] **Step 1: Write the failing test** — `tests/admin/measure-units.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  MAX_EIGHTHS, toEighths, splitEighths, formatEighths, EIGHTH_OPTIONS, ROOMS, REQUIREMENTS, requirementLabel,
} from "@/lib/admin/measure-units";

describe("eighths", () => {
  it("stores inches and eighths as one integer", () => {
    expect(toEighths(35, 5)).toBe(285);
    expect(toEighths(36, 0)).toBe(288);
  });

  it("splits back into inches and eighths", () => {
    expect(splitEighths(285)).toEqual({ inches: 35, eighth: 5 });
  });

  it("formats with reduced fraction glyphs", () => {
    expect(formatEighths(285)).toBe("35 ⅝″");
    expect(formatEighths(290)).toBe("36 ¼″");
    expect(formatEighths(288)).toBe("36″");
    expect(formatEighths(4)).toBe("½″");
    expect(formatEighths(null)).toBe("—");
  });

  it("caps at 600 inches", () => {
    expect(MAX_EIGHTHS).toBe(600 * 8);
  });

  it("offers every eighth from 0 to 7", () => {
    expect(EIGHTH_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("rooms and requirements", () => {
  it("lists the quick-pick rooms in order", () => {
    expect(ROOMS).toEqual([
      "Living room", "Family room", "Kitchen", "Dining room", "Primary bedroom",
      "Bedroom", "Bathroom", "Office", "Patio",
    ]);
  });

  it("labels the special requirements", () => {
    expect(REQUIREMENTS.map((r) => r.value)).toEqual(["hard_surface", "high_ladder"]);
    expect(requirementLabel("high_ladder")).toBe("High ladder");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/measure-units.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin/measure-units`.

- [ ] **Step 3: Implement `lib/admin/measure-units.ts`**

```ts
/**
 * Window dimensions are whole eighths of an inch, stored as one integer so
 * 35 5/8" is exactly 285 — no floating-point rounding anywhere.
 */
export const MAX_EIGHTHS = 600 * 8;

const GLYPHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"] as const;

export const EIGHTH_OPTIONS = GLYPHS.map((glyph, value) => ({ value, label: glyph || "0" }));

export const toEighths = (inches: number, eighth: number): number => inches * 8 + eighth;

export const splitEighths = (total: number) => ({ inches: Math.floor(total / 8), eighth: total % 8 });

export function formatEighths(total: number | null): string {
  if (total === null) return "—";
  const { inches, eighth } = splitEighths(total);
  if (!eighth) return `${inches}″`;
  return inches ? `${inches} ${GLYPHS[eighth]}″` : `${GLYPHS[eighth]}″`;
}

export const ROOMS = [
  "Living room", "Family room", "Kitchen", "Dining room", "Primary bedroom",
  "Bedroom", "Bathroom", "Office", "Patio",
] as const;

export const REQUIREMENTS = [
  { value: "hard_surface", label: "Hard surface" },
  { value: "high_ladder", label: "High ladder" },
] as const;

export type Requirement = (typeof REQUIREMENTS)[number]["value"];

export const requirementLabel = (value: string): string =>
  REQUIREMENTS.find((r) => r.value === value)?.label ?? value;
```

- [ ] **Step 4: Write `db/migrations/003_measure_and_files.sql`**

```sql
-- Window measurements and job files. File bytes live in a private Vercel Blob
-- store; these tables hold what the job page lists.
--
-- Every statement is safe to re-run: the migrate script applies all files.

create table if not exists job_files (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads (id) on delete cascade,
  created_at    timestamptz not null default now(),
  uploaded_by   text not null,
  kind          text not null check (kind in ('photo','document')),
  name          text not null,
  content_type  text not null,
  size_bytes    integer not null,
  blob_pathname text not null
);

create index if not exists job_files_lead_idx on job_files (lead_id, created_at desc);

create table if not exists window_measurements (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  measured_by    text not null,
  position       integer not null,
  room           text not null,
  label          text,
  width_eighths  integer not null check (width_eighths > 0),
  height_eighths integer not null check (height_eighths > 0),
  depth_eighths  integer check (depth_eighths > 0),
  mount          text not null check (mount in ('inside','outside')),
  requirements   text[] not null default '{}',
  notes          text,
  photo_file_id  uuid references job_files (id) on delete set null
);

create index if not exists window_measurements_lead_idx on window_measurements (lead_id, position);

alter table job_events drop constraint if exists job_events_kind_check;
alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','measure','file')
);
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run --maxWorkers=2 tests/admin/measure-units.test.ts` → PASS (7 tests). Do not run the migration against any database.

```bash
git add db/migrations/003_measure_and_files.sql lib/admin/measure-units.ts tests/admin/measure-units.test.ts
git commit -m "feat: measurement units and schema for windows and job files"
```

---

### Task 2: Upload rules

**Files:**
- Create: `lib/admin/uploads.ts`
- Test: `tests/admin/uploads.test.ts`

**Interfaces:**
- Produces from `@/lib/admin/uploads`: `type FileKind = "photo" | "document"`; `LIMITS: Record<FileKind, { types: readonly string[]; maxBytes: number }>`; `checkUpload(kind: FileKind, type: string, size: number): string | null` (an error message, or null when allowed); `safeName(name: string): string`; `fitWithin(width: number, height: number, max: number): { width: number; height: number }`.

- [ ] **Step 1: Write the failing test** — `tests/admin/uploads.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { checkUpload, safeName, fitWithin, LIMITS } from "@/lib/admin/uploads";

const MB = 1024 * 1024;

describe("checkUpload", () => {
  it("accepts a JPEG photo up to 10 MB", () => {
    expect(checkUpload("photo", "image/jpeg", 10 * MB)).toBeNull();
    expect(checkUpload("photo", "image/jpeg", 10 * MB + 1)).toMatch(/10 MB/);
  });

  it("accepts PDF, JPG, and PNG documents up to 20 MB", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png"]) {
      expect(checkUpload("document", type, 20 * MB)).toBeNull();
    }
    expect(checkUpload("document", "application/pdf", 20 * MB + 1)).toMatch(/20 MB/);
  });

  it("names the allowed types when refusing one", () => {
    expect(checkUpload("document", "application/zip", 1000)).toMatch(/PDF, JPG, or PNG/);
    expect(checkUpload("photo", "image/png", 1000)).toMatch(/JPG/);
  });

  it("refuses an empty file", () => {
    expect(checkUpload("document", "application/pdf", 0)).toMatch(/empty/i);
  });

  it("exposes the limits", () => {
    expect(LIMITS.document.maxBytes).toBe(20 * MB);
  });
});

describe("safeName", () => {
  it("keeps letters, digits, dots, dashes, and underscores", () => {
    expect(safeName("Quote #3 (final).pdf")).toBe("Quote-3-final-.pdf");
  });

  it("never returns an empty name and caps the length", () => {
    expect(safeName("")).toBe("file");
    expect(safeName("a".repeat(200)).length).toBe(80);
  });
});

describe("fitWithin", () => {
  it("scales the longest side down to the limit", () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("leaves small images alone", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/uploads.test.ts` → FAIL, cannot resolve the module.

- [ ] **Step 3: Implement `lib/admin/uploads.ts`**

```ts
export type FileKind = "photo" | "document";

const MB = 1024 * 1024;

export const LIMITS = {
  photo: { types: ["image/jpeg"], maxBytes: 10 * MB, allowed: "JPG" },
  document: { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 20 * MB, allowed: "PDF, JPG, or PNG" },
} as const satisfies Record<FileKind, { types: readonly string[]; maxBytes: number; allowed: string }>;

/** An error message for a file that may not be uploaded, or null when it may. */
export function checkUpload(kind: FileKind, type: string, size: number): string | null {
  const limit = LIMITS[kind];
  if (size <= 0) return "That file is empty.";
  if (!(limit.types as readonly string[]).includes(type)) return `Upload a ${limit.allowed} file.`;
  if (size > limit.maxBytes) return `Files must be ${limit.maxBytes / MB} MB or smaller.`;
  return null;
}

/** A storage-safe file name: no spaces or symbols, never empty, at most 80 characters. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  return cleaned || "file";
}

/** Scales width and height so the longer side is at most `max`, keeping the ratio. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run --maxWorkers=2 tests/admin/uploads.test.ts` → PASS (9 tests).

```bash
git add lib/admin/uploads.ts tests/admin/uploads.test.ts
git commit -m "feat: upload type and size rules, safe names, and resize math"
```

---

### Task 3: File storage layer

**Files:**
- Modify: `package.json` (add `@vercel/blob@2.8.0`), `lib/admin/jobs.ts` (widen `JobEvent["kind"]`)
- Create: `lib/admin/files.ts`
- Test: `tests/admin/files.test.ts`

**Interfaces:**
- Consumes: `db()`; `safeName`, `type FileKind` (Task 2).
- Produces from `@/lib/admin/files`: `type JobFile = { id: string; leadId: string; createdAt: Date; uploadedBy: string; kind: FileKind; name: string; contentType: string; sizeBytes: number; blobPathname: string }`; `listFiles(leadId: string): Promise<JobFile[]>`; `getFile(fileId: string): Promise<JobFile | null>`; `createFile(input: { leadId: string; kind: FileKind; name: string; contentType: string; body: Blob; actor: string }): Promise<JobFile | null>` (null when the job does not exist or the id is not a uuid); `deleteFile(fileId: string, actor: string): Promise<boolean>`; `readFile(file: JobFile): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null>`.
- Produces: `JobEvent["kind"]` is `"stage" | "note" | "edit" | "measure" | "file"`.

- [ ] **Step 1: Install**

```bash
npm install @vercel/blob@2.8.0
```

- [ ] **Step 2: Write the failing test** — `tests/admin/files.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const put = vi.fn();
const get = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ put, get, del }));

const files = await import("@/lib/admin/files");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const row = {
  id: FILE, lead_id: LEAD, created_at: "2026-09-12T18:00:00Z", uploaded_by: "owner@example.com",
  kind: "document", name: "Quote.pdf", content_type: "application/pdf", size_bytes: 1200,
  blob_pathname: `jobs/${LEAD}/${FILE}-Quote.pdf`,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  put.mockReset().mockResolvedValue({ pathname: "p" });
  get.mockReset();
  del.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createFile", () => {
  it("stores the blob privately under the job, then records the row and its event", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("select id from leads") ? [{ id: LEAD }] : [row],
    );

    const file = await files.createFile({
      leadId: LEAD, kind: "document", name: "Quote #3.pdf", contentType: "application/pdf",
      body: new Blob(["x"]), actor: "owner@example.com",
    });

    const [pathname, , options] = put.mock.calls[0];
    expect(pathname).toMatch(new RegExp(`^jobs/${LEAD}/[0-9a-f-]{36}-Quote-3.pdf$`));
    expect(options).toMatchObject({ access: "private", contentType: "application/pdf" });
    const insert = sql.mock.calls.find((c) => text(c).includes("insert into job_files"))!;
    expect(text(insert)).toContain("insert into job_events");
    expect(file?.name).toBe("Quote.pdf");
  });

  it("returns null for a missing job without storing anything", async () => {
    sql.mockResolvedValue([]);
    const file = await files.createFile({
      leadId: LEAD, kind: "photo", name: "a.jpg", contentType: "image/jpeg", body: new Blob(["x"]), actor: "o",
    });
    expect(file).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it("returns null for a non-uuid job id without querying", async () => {
    const file = await files.createFile({
      leadId: "nope", kind: "photo", name: "a.jpg", contentType: "image/jpeg", body: new Blob(["x"]), actor: "o",
    });
    expect(file).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("removes the stored blob if the row cannot be saved", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      if (strings.join("?").includes("select id from leads")) return [{ id: LEAD }];
      throw new Error("db down");
    });
    await expect(files.createFile({
      leadId: LEAD, kind: "photo", name: "a.jpg", contentType: "image/jpeg", body: new Blob(["x"]), actor: "o",
    })).rejects.toThrow("db down");
    expect(del).toHaveBeenCalledOnce();
  });
});

describe("reading and deleting", () => {
  it("maps rows to files", async () => {
    sql.mockResolvedValue([row]);
    const [file] = await files.listFiles(LEAD);
    expect(file).toMatchObject({ id: FILE, kind: "document", sizeBytes: 1200 });
  });

  it("returns null for a non-uuid file id without querying", async () => {
    expect(await files.getFile("../x")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("reads a blob privately and returns null when it is gone", async () => {
    get.mockResolvedValue({ statusCode: 200, stream: "S", blob: { contentType: "application/pdf" } });
    const file = { ...row, id: FILE, leadId: LEAD, createdAt: new Date(), uploadedBy: "o", kind: "document" as const,
      contentType: "application/pdf", sizeBytes: 1, blobPathname: row.blob_pathname };
    expect(await files.readFile(file)).toEqual({ stream: "S", contentType: "application/pdf" });
    expect(get).toHaveBeenCalledWith(row.blob_pathname, { access: "private" });

    get.mockResolvedValue(null);
    expect(await files.readFile(file)).toBeNull();
  });

  it("deletes the row with its event, then the blob", async () => {
    sql.mockResolvedValue([{ blob_pathname: row.blob_pathname }]);
    expect(await files.deleteFile(FILE, "owner@example.com")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("delete from job_files");
    expect(text(sql.mock.calls[0])).toContain("insert into job_events");
    expect(del).toHaveBeenCalledWith(row.blob_pathname);
  });

  it("reports false when the file does not exist", async () => {
    sql.mockResolvedValue([]);
    expect(await files.deleteFile(FILE, "o")).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to see it fail** — `npx vitest run --maxWorkers=2 tests/admin/files.test.ts` → FAIL.

- [ ] **Step 4: Implement `lib/admin/files.ts`**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { db } from "@/lib/db";
import { safeName, type FileKind } from "./uploads";

export type JobFile = {
  id: string;
  leadId: string;
  createdAt: Date;
  uploadedBy: string;
  kind: FileKind;
  name: string;
  contentType: string;
  sizeBytes: number;
  blobPathname: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toFile(row: Record<string, unknown>): JobFile {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    createdAt: new Date(row.created_at as string),
    uploadedBy: row.uploaded_by as string,
    kind: row.kind as FileKind,
    name: row.name as string,
    contentType: row.content_type as string,
    sizeBytes: Number(row.size_bytes),
    blobPathname: row.blob_pathname as string,
  };
}

export async function listFiles(leadId: string): Promise<JobFile[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`select * from job_files where lead_id = ${leadId} order by created_at desc`;
  return rows.map(toFile);
}

export async function getFile(fileId: string): Promise<JobFile | null> {
  if (!UUID.test(fileId)) return null;
  const rows = await db()`select * from job_files where id = ${fileId}`;
  return rows[0] ? toFile(rows[0]) : null;
}

/**
 * Stores the bytes privately, then records the file and its event in one
 * statement. If the row cannot be saved, the blob is removed so nothing is
 * left unreachable.
 */
export async function createFile(input: {
  leadId: string;
  kind: FileKind;
  name: string;
  contentType: string;
  body: Blob;
  actor: string;
}): Promise<JobFile | null> {
  if (!UUID.test(input.leadId)) return null;
  const sql = db();
  const [lead] = await sql`select id from leads where id = ${input.leadId}`;
  if (!lead) return null;

  const id = randomUUID();
  const pathname = `jobs/${input.leadId}/${id}-${safeName(input.name)}`;
  await put(pathname, input.body, { access: "private", contentType: input.contentType, addRandomSuffix: false });

  try {
    const rows = await sql`
      with created as (
        insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname)
        values (${id}, ${input.leadId}, ${input.actor}, ${input.kind}, ${input.name},
                ${input.contentType}, ${input.body.size}, ${pathname})
        returning *
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select lead_id, ${input.actor}, 'file', ${`Uploaded ${input.name}`} from created
      )
      select * from created`;
    return toFile(rows[0]);
  } catch (error) {
    await del(pathname).catch((cleanup) => console.error("Could not remove orphaned blob", cleanup));
    throw error;
  }
}

/** Removes the row and its event together, then the stored bytes. */
export async function deleteFile(fileId: string, actor: string): Promise<boolean> {
  if (!UUID.test(fileId)) return false;
  const rows = await db()`
    with removed as (
      delete from job_files where id = ${fileId} returning lead_id, name, blob_pathname
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'file', 'Deleted ' || name from removed
    )
    select blob_pathname from removed`;
  if (!rows[0]) return false;
  await del(rows[0].blob_pathname as string).catch((error) => console.error("Blob delete failed", error));
  return true;
}

export async function readFile(file: JobFile) {
  const result = await get(file.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType };
}
```

In `lib/admin/jobs.ts`, change `kind: "stage" | "note" | "edit";` in `JobEvent` to `kind: "stage" | "note" | "edit" | "measure" | "file";`.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS. Run the filtered typecheck → no errors outside `.next/`.

```bash
git add package.json package-lock.json lib/admin/files.ts lib/admin/jobs.ts tests/admin/files.test.ts
git commit -m "feat: private job file storage with activity log entries"
```

---

### Task 4: Measurement data layer and schema

**Files:**
- Modify: `lib/admin/schema.ts` (add `measurementSchema`, `type MeasurementInput`)
- Create: `lib/admin/measurements.ts`
- Test: `tests/admin/measurements.test.ts`

**Interfaces:**
- Consumes: `db()`; `MAX_EIGHTHS`, `toEighths`, `REQUIREMENTS` (Task 1); `deleteFile` (Task 3).
- Produces from `@/lib/admin/schema`: `measurementSchema` parsing form fields `room`, `label`, `widthIn`, `widthEighth`, `heightIn`, `heightEighth`, `depthIn`, `depthEighth`, `mount`, `requirements` (array), `notes`, `photoFileId` into `MeasurementInput = { room: string; label: string | null; widthEighths: number; heightEighths: number; depthEighths: number | null; mount: "inside" | "outside"; requirements: Requirement[]; notes: string | null; photoFileId: string | null }`.
- Produces from `@/lib/admin/measurements`: `type WindowMeasurement = { id; leadId; position; room; label; widthEighths; heightEighths; depthEighths; mount; requirements; notes; photoFileId; measuredBy; createdAt; updatedAt }` (types as in `MeasurementInput`, plus `id`, `leadId` strings, `position` number, `measuredBy` string, dates); `listMeasurements(leadId): Promise<WindowMeasurement[]>` (by position); `getMeasurement(leadId, windowId): Promise<WindowMeasurement | null>`; `addMeasurement(leadId, input, actor): Promise<string | null>` (new id, or null for a missing job); `updateMeasurement(leadId, windowId, input, actor): Promise<boolean>`; `deleteMeasurement(leadId, windowId, actor): Promise<boolean>` (also deletes its photo).

- [ ] **Step 1: Write the failing test** — `tests/admin/measurements.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const deleteFile = vi.fn();
vi.mock("@/lib/admin/files", () => ({ deleteFile }));

const { measurementSchema } = await import("@/lib/admin/schema");
const m = await import("@/lib/admin/measurements");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const PHOTO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const form = {
  room: " Kitchen ", label: "Left of sink", widthIn: "35", widthEighth: "5", heightIn: "48", heightEighth: "0",
  depthIn: "", depthEighth: "0", mount: "inside", requirements: ["high_ladder"], notes: "", photoFileId: "",
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  deleteFile.mockReset().mockResolvedValue(true);
});

describe("measurementSchema", () => {
  it("turns the form into eighths and typed fields", () => {
    expect(measurementSchema.parse(form)).toEqual({
      room: "Kitchen", label: "Left of sink", widthEighths: 285, heightEighths: 384, depthEighths: null,
      mount: "inside", requirements: ["high_ladder"], notes: null, photoFileId: null,
    });
  });

  it("keeps an optional depth", () => {
    expect(measurementSchema.parse({ ...form, depthIn: "3", depthEighth: "4" }).depthEighths).toBe(28);
  });

  it("requires room, width, height, and mount", () => {
    expect(measurementSchema.safeParse({ ...form, room: " " }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, widthIn: "", widthEighth: "0" }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, heightIn: "0", heightEighth: "0" }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, mount: "" }).success).toBe(false);
  });

  it("refuses sizes over 600 inches and unknown requirements", () => {
    expect(measurementSchema.safeParse({ ...form, widthIn: "601" }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, requirements: ["crane"] }).success).toBe(false);
  });

  it("accepts a photo id only when it is a uuid", () => {
    expect(measurementSchema.parse({ ...form, photoFileId: PHOTO }).photoFileId).toBe(PHOTO);
    expect(measurementSchema.safeParse({ ...form, photoFileId: "x" }).success).toBe(false);
  });
});

describe("measurements", () => {
  const input = measurementSchema.parse({ ...form, photoFileId: PHOTO });

  it("adds a window at the next position with its event, only using a photo from the same job", async () => {
    sql.mockResolvedValue([{ id: WIN }]);
    expect(await m.addMeasurement(LEAD, input, "owner@example.com")).toBe(WIN);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("coalesce(max(position)");
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("from job_files");
  });

  it("returns null for a missing or non-uuid job", async () => {
    sql.mockResolvedValue([]);
    expect(await m.addMeasurement(LEAD, input, "o")).toBeNull();
    expect(await m.addMeasurement("nope", input, "o")).toBeNull();
  });

  it("updates a window of this job with its event", async () => {
    sql.mockResolvedValue([{ id: WIN }]);
    expect(await m.updateMeasurement(LEAD, WIN, input, "o")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("update window_measurements");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([LEAD, WIN]));
  });

  it("deletes a window and then its photo", async () => {
    sql.mockResolvedValue([{ photo_file_id: PHOTO }]);
    expect(await m.deleteMeasurement(LEAD, WIN, "o")).toBe(true);
    expect(deleteFile).toHaveBeenCalledWith(PHOTO, "o");
  });

  it("reports false for a window that is not on this job", async () => {
    sql.mockResolvedValue([]);
    expect(await m.deleteMeasurement(LEAD, WIN, "o")).toBe(false);
    expect(await m.getMeasurement(LEAD, "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run --maxWorkers=2 tests/admin/measurements.test.ts` → FAIL.

- [ ] **Step 3: Add `measurementSchema` to `lib/admin/schema.ts`**

Add these imports at the top: `import { MAX_EIGHTHS, REQUIREMENTS, toEighths, type Requirement } from "./measure-units";`. Then append:

```ts
const inches = z.preprocess(blank, z.coerce.number().int("Whole inches only").min(0).max(600).optional());
const eighth = z.coerce.number().int().min(0).max(7).default(0);
const requirementValues = REQUIREMENTS.map((r) => r.value) as [Requirement, ...Requirement[]];
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Unknown photo");

const dimension = (label: string, required: boolean) =>
  z.object({ in: inches, eighth }).transform((value, ctx) => {
    if (value.in === undefined && value.eighth === 0) {
      if (required) ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
      return null;
    }
    const total = toEighths(value.in ?? 0, value.eighth);
    if (total <= 0) {
      ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
      return z.NEVER;
    }
    if (total > MAX_EIGHTHS) {
      ctx.addIssue({ code: "custom", message: `The ${label} must be 600 inches or less` });
      return z.NEVER;
    }
    return total;
  });

export const measurementSchema = z
  .object({
    room: z.string().trim().min(1, "Pick or type a room").max(60),
    label: z.preprocess(blank, z.string().trim().max(80).optional()),
    widthIn: z.unknown(), widthEighth: z.unknown(),
    heightIn: z.unknown(), heightEighth: z.unknown(),
    depthIn: z.unknown(), depthEighth: z.unknown(),
    mount: z.enum(["inside", "outside"], { message: "Choose inside or outside mount" }),
    requirements: z.array(z.enum(requirementValues)).default([]),
    notes: z.preprocess(blank, z.string().trim().max(1000).optional()),
    photoFileId: z.preprocess(blank, uuid.optional()),
  })
  .transform((value, ctx) => {
    const width = dimension("width", true).safeParse({ in: value.widthIn, eighth: value.widthEighth });
    const height = dimension("height", true).safeParse({ in: value.heightIn, eighth: value.heightEighth });
    const depth = dimension("depth", false).safeParse({ in: value.depthIn, eighth: value.depthEighth });
    for (const part of [width, height, depth]) {
      if (!part.success) {
        ctx.addIssue({ code: "custom", message: part.error.issues[0].message });
        return z.NEVER;
      }
    }
    return {
      room: value.room,
      label: value.label ?? null,
      widthEighths: width.data as number,
      heightEighths: height.data as number,
      depthEighths: depth.data ?? null,
      mount: value.mount,
      requirements: value.requirements,
      notes: value.notes ?? null,
      photoFileId: value.photoFileId ?? null,
    };
  });

export type MeasurementInput = z.output<typeof measurementSchema>;
```

- [ ] **Step 4: Implement `lib/admin/measurements.ts`**

```ts
import "server-only";
import { db } from "@/lib/db";
import { deleteFile } from "./files";
import type { Requirement } from "./measure-units";
import type { MeasurementInput } from "./schema";

export type WindowMeasurement = MeasurementInput & {
  id: string;
  leadId: string;
  position: number;
  measuredBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const describe = (input: { room: string; label: string | null }) =>
  input.label ? `${input.room}, ${input.label}` : input.room;

function toMeasurement(row: Record<string, unknown>): WindowMeasurement {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    position: Number(row.position),
    room: row.room as string,
    label: (row.label as string | null) ?? null,
    widthEighths: Number(row.width_eighths),
    heightEighths: Number(row.height_eighths),
    depthEighths: row.depth_eighths === null ? null : Number(row.depth_eighths),
    mount: row.mount as "inside" | "outside",
    requirements: (row.requirements as Requirement[]) ?? [],
    notes: (row.notes as string | null) ?? null,
    photoFileId: (row.photo_file_id as string | null) ?? null,
    measuredBy: row.measured_by as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listMeasurements(leadId: string): Promise<WindowMeasurement[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`select * from window_measurements where lead_id = ${leadId} order by position`;
  return rows.map(toMeasurement);
}

export async function getMeasurement(leadId: string, windowId: string): Promise<WindowMeasurement | null> {
  if (!UUID.test(leadId) || !UUID.test(windowId)) return null;
  const rows = await db()`select * from window_measurements where id = ${windowId} and lead_id = ${leadId}`;
  return rows[0] ? toMeasurement(rows[0]) : null;
}

/**
 * Adds a window at the end of the job's list, with its event, in one statement.
 * A photo id is kept only if that file belongs to the same job.
 */
export async function addMeasurement(leadId: string, input: MeasurementInput, actor: string): Promise<string | null> {
  if (!UUID.test(leadId)) return null;
  const rows = await db()`
    with job as (select id from leads where id = ${leadId}),
    photo as (select id from job_files where id = ${input.photoFileId} and lead_id = ${leadId}),
    created as (
      insert into window_measurements (lead_id, measured_by, position, room, label, width_eighths,
        height_eighths, depth_eighths, mount, requirements, notes, photo_file_id)
      select job.id, ${actor},
        (select coalesce(max(position), 0) + 1 from window_measurements where lead_id = ${leadId}),
        ${input.room}, ${input.label}, ${input.widthEighths}, ${input.heightEighths}, ${input.depthEighths},
        ${input.mount}, ${input.requirements}, ${input.notes}, (select id from photo)
      from job
      returning id, lead_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure', ${`Added window: ${describe(input)}`} from created
    )
    select id from created`;
  return (rows[0]?.id as string | undefined) ?? null;
}

export async function updateMeasurement(
  leadId: string, windowId: string, input: MeasurementInput, actor: string,
): Promise<boolean> {
  if (!UUID.test(leadId) || !UUID.test(windowId)) return false;
  const rows = await db()`
    with photo as (select id from job_files where id = ${input.photoFileId} and lead_id = ${leadId}),
    changed as (
      update window_measurements set
        room = ${input.room}, label = ${input.label}, width_eighths = ${input.widthEighths},
        height_eighths = ${input.heightEighths}, depth_eighths = ${input.depthEighths}, mount = ${input.mount},
        requirements = ${input.requirements}, notes = ${input.notes},
        photo_file_id = coalesce((select id from photo), photo_file_id), updated_at = now()
      where id = ${windowId} and lead_id = ${leadId}
      returning id, lead_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure', ${`Edited window: ${describe(input)}`} from changed
    )
    select id from changed`;
  return rows.length > 0;
}

/** Deletes the window with its event, then its photo (if it had one). */
export async function deleteMeasurement(leadId: string, windowId: string, actor: string): Promise<boolean> {
  if (!UUID.test(leadId) || !UUID.test(windowId)) return false;
  const rows = await db()`
    with removed as (
      delete from window_measurements where id = ${windowId} and lead_id = ${leadId}
      returning lead_id, room, label, photo_file_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure',
        'Deleted window: ' || room || coalesce(', ' || label, '') from removed
    )
    select photo_file_id from removed`;
  if (!rows[0]) return false;
  const photo = rows[0].photo_file_id as string | null;
  if (photo) await deleteFile(photo, actor);
  return true;
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS; filtered typecheck clean.

```bash
git add lib/admin/schema.ts lib/admin/measurements.ts tests/admin/measurements.test.ts
git commit -m "feat: window measurement records and form schema"
```

---

### Task 5: Upload and view routes

**Files:**
- Create: `app/admin/jobs/[id]/files/route.ts`, `app/admin/files/[fileId]/route.ts`
- Test: `tests/admin/file-routes.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`; `createFile`, `getFile`, `readFile` (Task 3); `checkUpload`, `type FileKind` (Task 2).
- Produces: `POST /admin/jobs/[id]/files` with multipart fields `file` (a File) and `kind` (`photo` | `document`); responds `201 { id }`, `400 { error }`, or `404 { error }`. `GET /admin/files/[fileId]` streams the file or returns 404.

- [ ] **Step 1: Write the failing test** — `tests/admin/file-routes.test.ts`

The first line pins this file to Vitest's Node environment. Under the default jsdom environment, `request.formData()` returns Node's own `File`, which fails `instanceof File` against jsdom's global and would make every upload look empty. Route Handlers run on Node in production, so Node is also the faithful environment.

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const files = { createFile: vi.fn(), getFile: vi.fn(), readFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);

const upload = await import("@/app/admin/jobs/[id]/files/route");
const view = await import("@/app/admin/files/[fileId]/route");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const post = (file: File | null, kind = "document") => {
  const data = new FormData();
  if (file) data.append("file", file);
  data.append("kind", kind);
  return new Request(`http://localhost/admin/jobs/${LEAD}/files`, { method: "POST", body: data });
};
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => {
  Object.values(files).forEach((fn) => fn.mockReset());
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("POST upload", () => {
  it("stores an allowed file and returns its id", async () => {
    files.createFile.mockResolvedValue({ id: FILE });
    const response = await upload.POST(post(new File(["%PDF"], "Quote.pdf", { type: "application/pdf" })), params({ id: LEAD }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: FILE });
    expect(files.createFile).toHaveBeenCalledWith(expect.objectContaining({
      leadId: LEAD, kind: "document", name: "Quote.pdf", contentType: "application/pdf", actor: "owner@example.com",
    }));
  });

  it("refuses a disallowed type before storing anything", async () => {
    const response = await upload.POST(post(new File(["x"], "a.zip", { type: "application/zip" })), params({ id: LEAD }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/PDF, JPG, or PNG/);
    expect(files.createFile).not.toHaveBeenCalled();
  });

  it("refuses a request with no file", async () => {
    const response = await upload.POST(post(null), params({ id: LEAD }));
    expect(response.status).toBe(400);
  });

  it("returns 404 for a missing job", async () => {
    files.createFile.mockResolvedValue(null);
    const response = await upload.POST(post(new File(["x"], "a.jpg", { type: "image/jpeg" }), "photo"), params({ id: LEAD }));
    expect(response.status).toBe(404);
  });

  it("does nothing without a session", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(upload.POST(post(new File(["x"], "a.pdf", { type: "application/pdf" })), params({ id: LEAD }))).rejects.toThrow("NEXT_REDIRECT");
    expect(files.createFile).not.toHaveBeenCalled();
  });
});

describe("GET view", () => {
  it("streams the file privately", async () => {
    files.getFile.mockResolvedValue({ id: FILE, name: "Quote.pdf" });
    files.readFile.mockResolvedValue({ stream: new Blob(["%PDF"]).stream(), contentType: "application/pdf" });
    const response = await view.GET(new Request("http://localhost"), params({ fileId: FILE }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("returns 404 for an unknown file or a missing blob", async () => {
    files.getFile.mockResolvedValue(null);
    expect((await view.GET(new Request("http://localhost"), params({ fileId: FILE }))).status).toBe(404);
    files.getFile.mockResolvedValue({ id: FILE, name: "x" });
    files.readFile.mockResolvedValue(null);
    expect((await view.GET(new Request("http://localhost"), params({ fileId: FILE }))).status).toBe(404);
  });

  it("does nothing without a session", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(view.GET(new Request("http://localhost"), params({ fileId: FILE }))).rejects.toThrow("NEXT_REDIRECT");
    expect(files.getFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail** — FAIL, routes not found.

- [ ] **Step 3: Implement the routes**

`app/admin/jobs/[id]/files/route.ts`:

```ts
import { createFile } from "@/lib/admin/files";
import { requireAdmin } from "@/lib/admin/session";
import { checkUpload, type FileKind } from "@/lib/admin/uploads";

/**
 * Upload endpoint. A Route Handler rather than a Server Action, because Server
 * Actions cap request bodies at 1 MB by default and photos and PDFs exceed it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { email } = await requireAdmin();
  const { id } = await params;

  const data = await request.formData();
  const file = data.get("file");
  const kind: FileKind = data.get("kind") === "photo" ? "photo" : "document";
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });

  const problem = checkUpload(kind, file.type, file.size);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const saved = await createFile({ leadId: id, kind, name: file.name, contentType: file.type, body: file, actor: email });
  if (!saved) return Response.json({ error: "That job no longer exists." }, { status: 404 });
  return Response.json({ id: saved.id }, { status: 201 });
}
```

`app/admin/files/[fileId]/route.ts`:

```ts
import { getFile, readFile } from "@/lib/admin/files";
import { requireAdmin } from "@/lib/admin/session";

/** Streams a private file to a signed-in owner. Never cached publicly. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  await requireAdmin();
  const { fileId } = await params;

  const file = await getFile(fileId);
  const content = file ? await readFile(file) : null;
  if (!file || !content) return new Response("Not found", { status: 404 });

  return new Response(content.stream, {
    headers: {
      "Content-Type": content.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${file.name.replace(/"/g, "")}"`,
    },
  });
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS; filtered typecheck clean.

```bash
git add "app/admin/jobs/[id]/files/route.ts" "app/admin/files/[fileId]/route.ts" tests/admin/file-routes.test.ts
git commit -m "feat: owner-only upload and file view routes"
```

---

### Task 6: Measurement and file Server Actions

**Files:**
- Create: `app/admin/jobs/measure-actions.ts`
- Test: `tests/admin/measure-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`; `measurementSchema`; `addMeasurement`, `updateMeasurement`, `deleteMeasurement` (Task 4); `deleteFile` (Task 3); `type FormState` from `app/admin/jobs/actions.ts`.
- Produces: `saveMeasurement(jobId: string, windowId: string | null, formData: FormData): Promise<FormState>` (`{ ok: true }`, or `{ error, values }`); `removeMeasurement(jobId: string, windowId: string): Promise<void>`; `removeFile(jobId: string, fileId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `tests/admin/measure-actions.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const measurements = { addMeasurement: vi.fn(), updateMeasurement: vi.fn(), deleteMeasurement: vi.fn() };
vi.mock("@/lib/admin/measurements", () => measurements);
const deleteFile = vi.fn();
vi.mock("@/lib/admin/files", () => ({ deleteFile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/app/admin/jobs/measure-actions");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

const window = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  const fields = { room: "Kitchen", widthIn: "35", widthEighth: "5", heightIn: "48", heightEighth: "0", mount: "inside", ...overrides };
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

beforeEach(() => {
  Object.values(measurements).forEach((fn) => fn.mockReset());
  deleteFile.mockReset();
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("saveMeasurement", () => {
  it("adds a new window as the signed-in owner", async () => {
    measurements.addMeasurement.mockResolvedValue(WIN);
    expect(await actions.saveMeasurement(LEAD, null, window())).toEqual({ ok: true });
    expect(measurements.addMeasurement).toHaveBeenCalledWith(
      LEAD, expect.objectContaining({ widthEighths: 285, mount: "inside" }), "owner@example.com",
    );
  });

  it("updates an existing window", async () => {
    measurements.updateMeasurement.mockResolvedValue(true);
    expect(await actions.saveMeasurement(LEAD, WIN, window())).toEqual({ ok: true });
    expect(measurements.updateMeasurement).toHaveBeenCalledWith(LEAD, WIN, expect.any(Object), "owner@example.com");
  });

  it("returns the error and the typed values when invalid", async () => {
    const state = await actions.saveMeasurement(LEAD, null, window({ mount: "" }));
    expect(state.error).toMatch(/mount/i);
    expect(state.values).toMatchObject({ room: "Kitchen", widthIn: "35" });
    expect(measurements.addMeasurement).not.toHaveBeenCalled();
  });

  it("reports a job or window that no longer exists", async () => {
    measurements.addMeasurement.mockResolvedValue(null);
    expect((await actions.saveMeasurement(LEAD, null, window())).error).toMatch(/no longer exists/);
  });
});

describe("without a session", () => {
  beforeEach(() => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it.each([
    ["saveMeasurement", () => actions.saveMeasurement(LEAD, null, window())],
    ["removeMeasurement", () => actions.removeMeasurement(LEAD, WIN)],
    ["removeFile", () => actions.removeFile(LEAD, WIN)],
  ])("%s touches nothing", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    Object.values(measurements).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe("deletes", () => {
  it("removes a window and a file as the signed-in owner", async () => {
    await actions.removeMeasurement(LEAD, WIN);
    expect(measurements.deleteMeasurement).toHaveBeenCalledWith(LEAD, WIN, "owner@example.com");
    await actions.removeFile(LEAD, WIN);
    expect(deleteFile).toHaveBeenCalledWith(WIN, "owner@example.com");
  });
});
```

- [ ] **Step 2: Run it to see it fail** — FAIL.

- [ ] **Step 3: Implement `app/admin/jobs/measure-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { deleteFile } from "@/lib/admin/files";
import { addMeasurement, deleteMeasurement, updateMeasurement } from "@/lib/admin/measurements";
import { measurementSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

const FIELDS = [
  "room", "label", "widthIn", "widthEighth", "heightIn", "heightEighth",
  "depthIn", "depthEighth", "mount", "requirements", "notes", "photoFileId",
];

function captureValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of FIELDS) {
    const all = formData.getAll(key).map(String);
    if (all.length) values[key] = key === "requirements" ? all : all[0];
  }
  return values;
}

// Every action calls requireAdmin() before reading its input.

export async function saveMeasurement(jobId: string, windowId: string | null, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData);
  const parsed = measurementSchema.safeParse({ ...values, requirements: formData.getAll("requirements").map(String) });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const saved = windowId
    ? await updateMeasurement(jobId, windowId, parsed.data, email)
    : Boolean(await addMeasurement(jobId, parsed.data, email));
  if (!saved) return { error: "That job or window no longer exists." };

  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: true };
}

export async function removeMeasurement(jobId: string, windowId: string): Promise<void> {
  const { email } = await requireAdmin();
  await deleteMeasurement(jobId, windowId, email);
  revalidatePath(`/admin/jobs/${jobId}`);
}

export async function removeFile(jobId: string, fileId: string): Promise<void> {
  const { email } = await requireAdmin();
  await deleteFile(fileId, email);
  revalidatePath(`/admin/jobs/${jobId}`);
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS; filtered typecheck clean.

```bash
git add app/admin/jobs/measure-actions.ts tests/admin/measure-actions.test.ts
git commit -m "feat: Server Actions to save and delete windows and files"
```

---

### Task 7: Measure screen and Files section

**Files:**
- Create: `lib/admin/client-upload.ts`, `app/admin/jobs/[id]/measure/MeasureForm.tsx`, `app/admin/jobs/[id]/measure/page.tsx`, `app/admin/jobs/[id]/measure/[windowId]/page.tsx`, `app/admin/jobs/[id]/JobFiles.tsx`, `app/admin/jobs/[id]/UploadButton.tsx`
- Modify: `app/admin/jobs/[id]/page.tsx` (add the Files section and a Measure link)
- Test: `tests/admin/measure-form.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: `resizePhoto(file: File): Promise<Blob>`, `postFile(jobId: string, file: Blob, name: string, kind: FileKind): Promise<{ id: string } | { error: string }>` from `@/lib/admin/client-upload`; `MeasureForm({ jobId, window, defaultRoom }: { jobId: string; window: WindowMeasurement | null; defaultRoom: string })`; `JobFiles({ jobId, measurements, files })`; `UploadButton({ jobId })`.

- [ ] **Step 1: Write the failing test** — `tests/admin/measure-form.test.tsx`

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveMeasurement = vi.fn();
vi.mock("@/app/admin/jobs/measure-actions", () => ({ saveMeasurement }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/admin/client-upload", () => ({ resizePhoto: vi.fn(), postFile: vi.fn() }));

const { MeasureForm } = await import("@/app/admin/jobs/[id]/measure/MeasureForm");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  saveMeasurement.mockReset();
  push.mockReset();
});

async function fillWindow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Kitchen" }));
  await user.type(screen.getByLabelText(/^width inches/i), "35");
  await user.selectOptions(screen.getByLabelText(/^width eighths/i), "5");
  await user.type(screen.getByLabelText(/^height inches/i), "48");
  await user.click(screen.getByRole("radio", { name: "Inside" }));
}

describe("MeasureForm", () => {
  it("saves a window and clears the form except the room", async () => {
    saveMeasurement.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);

    await fillWindow(user);
    await user.click(screen.getByRole("button", { name: /save and next window/i }));

    await waitFor(() => expect(saveMeasurement).toHaveBeenCalledOnce());
    const [jobId, windowId, data] = saveMeasurement.mock.calls[0];
    expect([jobId, windowId]).toEqual([LEAD, null]);
    expect(data.get("room")).toBe("Kitchen");
    expect(data.get("widthEighth")).toBe("5");
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(screen.getByLabelText(/^room/i)).toHaveValue("Kitchen");
    expect(screen.getByLabelText(/^width inches/i)).toHaveValue(null);
  });

  it("keeps what was typed when the save fails", async () => {
    saveMeasurement.mockResolvedValue({ error: "Choose inside or outside mount" });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);

    await user.click(screen.getByRole("button", { name: "Kitchen" }));
    await user.type(screen.getByLabelText(/^width inches/i), "35");
    await user.click(screen.getByRole("button", { name: /save and next window/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/mount/i);
    expect(screen.getByLabelText(/^width inches/i)).toHaveValue(35);
  });

  it("labels every requirement toggle and offers the camera", () => {
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="Office" />);
    expect(screen.getByRole("checkbox", { name: "Hard surface" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "High ladder" })).toBeInTheDocument();
    expect(screen.getByLabelText(/photo/i)).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText(/^room/i)).toHaveValue("Office");
  });
});
```

- [ ] **Step 2: Run it to see it fail** — FAIL.

- [ ] **Step 3: Implement `lib/admin/client-upload.ts`**

```ts
import { fitWithin, type FileKind } from "./uploads";

/** Shrinks a camera photo to 2000 px on the longest side as a JPEG (also converts HEIC). */
export async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, 2000);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not read that photo."))), "image/jpeg", 0.8),
  );
}

export async function postFile(
  jobId: string, file: Blob, name: string, kind: FileKind,
): Promise<{ id: string } | { error: string }> {
  const data = new FormData();
  data.append("file", file, name);
  data.append("kind", kind);
  try {
    const response = await fetch(`/admin/jobs/${jobId}/files`, { method: "POST", body: data });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.id) return { id: body.id as string };
    return { error: body?.error ?? "Upload failed. Check your signal and try again." };
  } catch {
    return { error: "Upload failed. Check your signal and try again." };
  }
}
```

- [ ] **Step 4: Implement `MeasureForm.tsx`**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { FormState } from "@/app/admin/jobs/actions";
import { saveMeasurement } from "@/app/admin/jobs/measure-actions";
import { postFile, resizePhoto } from "@/lib/admin/client-upload";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { EIGHTH_OPTIONS, REQUIREMENTS, ROOMS, splitEighths } from "@/lib/admin/measure-units";

const CONTROL = "min-h-12 w-full border border-rule bg-ivory px-3 text-base";

function Dimension({ name, label, value }: { name: "width" | "height" | "depth"; label: string; value: number | null }) {
  const parts = value === null ? null : splitEighths(value);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <label className="sr-only" htmlFor={`${name}In`}>{label} inches</label>
        <input id={`${name}In`} name={`${name}In`} type="number" inputMode="numeric" min={0} max={600}
          placeholder="inches" defaultValue={parts?.inches ?? ""} className={CONTROL} />
        <label className="sr-only" htmlFor={`${name}Eighth`}>{label} eighths</label>
        <select id={`${name}Eighth`} name={`${name}Eighth`} defaultValue={parts?.eighth ?? 0} className={CONTROL}>
          {EIGHTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

/**
 * One window at a time. Submits through a transition rather than a form
 * action, so a failed save never resets what was typed on the phone.
 */
export function MeasureForm({ jobId, window, defaultRoom }: {
  jobId: string;
  window: WindowMeasurement | null;
  defaultRoom: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [room, setRoom] = useState(window?.room ?? defaultRoom);
  const [state, setState] = useState<FormState & { saved?: number }>({});
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("room", room);
    const photo = data.get("photo");
    data.delete("photo");

    startTransition(async () => {
      if (photo instanceof File && photo.size > 0) {
        const uploaded = await resizePhoto(photo)
          .then((blob) => postFile(jobId, blob, photo.name.replace(/\.\w+$/, "") + ".jpg", "photo"))
          .catch((error: Error) => ({ error: error.message }));
        if ("error" in uploaded) {
          setState({ error: uploaded.error });
          return;
        }
        data.set("photoFileId", uploaded.id);
      }

      const result = await saveMeasurement(jobId, window?.id ?? null, data);
      if (result.error) {
        setState(result);
        return;
      }
      if (window) {
        router.push(`/admin/jobs/${jobId}`);
        return;
      }
      setState({ saved: Date.now() });
      setFormKey((key) => key + 1); // a fresh form, keeping the room
    });
  }

  return (
    <form key={formKey} ref={formRef} onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="room" className="text-sm font-semibold">Room</label>
        <div className="flex flex-wrap gap-2">
          {ROOMS.map((option) => (
            <button key={option} type="button" onClick={() => setRoom(option)} aria-pressed={room === option}
              className={`min-h-11 border px-3 text-sm ${room === option ? "border-charcoal bg-charcoal text-ivory" : "border-rule"}`}>
              {option}
            </button>
          ))}
        </div>
        <input id="room" name="room" value={room} onChange={(e) => setRoom(e.target.value)}
          placeholder="Or type a room" className={CONTROL} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="label" className="text-sm font-semibold">Window label (optional)</label>
        <input id="label" name="label" defaultValue={window?.label ?? ""} placeholder="e.g. Left of fireplace" className={CONTROL} />
      </div>

      <Dimension name="width" label="Width" value={window?.widthEighths ?? null} />
      <Dimension name="height" label="Height" value={window?.heightEighths ?? null} />
      <Dimension name="depth" label="Depth (optional)" value={window?.depthEighths ?? null} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Mount</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["inside", "outside"] as const).map((mount) => (
            <label key={mount} className="flex min-h-12 items-center gap-2 border border-rule px-3">
              <input type="radio" name="mount" value={mount} defaultChecked={window?.mount === mount} />
              {mount === "inside" ? "Inside" : "Outside"}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Special requirements</legend>
        <div className="flex flex-wrap gap-2">
          {REQUIREMENTS.map((req) => (
            <label key={req.value} className="flex min-h-12 items-center gap-2 border border-rule px-3">
              <input type="checkbox" name="requirements" value={req.value}
                defaultChecked={window?.requirements.includes(req.value)} />
              {req.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-sm font-semibold">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={window?.notes ?? ""} className="w-full border border-rule bg-ivory p-3 text-base" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="photo" className="text-sm font-semibold">
          Photo {window?.photoFileId ? "(replaces the current one)" : "(optional)"}
        </label>
        <input id="photo" name="photo" type="file" accept="image/*" capture="environment" className="text-base" />
      </div>

      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-ink-soft">Saved. Next window.</p> : null}

      <Button type="submit" variant="solid" disabled={pending} className="w-full">
        {pending ? "Saving…" : window ? "Save window" : "Save and next window"}
      </Button>
    </form>
  );
}
```

Note: the form's `key` changes only after a successful new-window save, so a failed save keeps every typed field; `room` lives in state and survives the reset.

- [ ] **Step 5: Implement the measure pages**

`app/admin/jobs/[id]/measure/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/admin/jobs";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { MeasureForm } from "./MeasureForm";

export default async function MeasurePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const windows = await listMeasurements(id);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/admin/jobs/${id}`} className="text-sm underline underline-offset-4">← {job.name}</Link>
        <Link href={`/admin/jobs/${id}`} className="text-sm font-semibold underline underline-offset-4">Finish</Link>
      </div>
      <h1 className="text-2xl font-semibold">Measure</h1>
      <p className="text-sm text-ink-soft">{windows.length} {windows.length === 1 ? "window" : "windows"} so far</p>
      <MeasureForm jobId={id} window={null} defaultRoom={windows.at(-1)?.room ?? ""} />
    </div>
  );
}
```

`app/admin/jobs/[id]/measure/[windowId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeasurement } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { MeasureForm } from "../MeasureForm";

export default async function EditWindowPage({ params }: { params: Promise<{ id: string; windowId: string }> }) {
  await requireAdmin();
  const { id, windowId } = await params;
  const window = await getMeasurement(id, windowId);
  if (!window) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href={`/admin/jobs/${id}`} className="text-sm underline underline-offset-4">← Back to job</Link>
      <h1 className="text-2xl font-semibold">Edit window</h1>
      <MeasureForm jobId={id} window={window} defaultRoom={window.room} />
    </div>
  );
}
```

- [ ] **Step 6: Implement the Files section**

`app/admin/jobs/[id]/UploadButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postFile } from "@/lib/admin/client-upload";
import { checkUpload } from "@/lib/admin/uploads";

export function UploadButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center self-start border border-charcoal px-4 text-sm">
        {pending ? "Uploading…" : "Upload file"}
        <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const problem = checkUpload("document", file.type, file.size);
            if (problem) return setError(problem);
            setError(null);
            startTransition(async () => {
              const result = await postFile(jobId, file, file.name, "document");
              if ("error" in result) setError(result.error);
              else router.refresh();
            });
          }} />
      </label>
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
    </div>
  );
}
```

`app/admin/jobs/[id]/JobFiles.tsx`:

```tsx
import Link from "next/link";
import { removeFile, removeMeasurement } from "@/app/admin/jobs/measure-actions";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatEighths, requirementLabel } from "@/lib/admin/measure-units";
import { formatWhen } from "@/lib/admin/time";
import { UploadButton } from "./UploadButton";

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function JobFiles({ jobId, measurements, files }: {
  jobId: string;
  measurements: WindowMeasurement[];
  files: JobFile[];
}) {
  const rooms = [...new Set(measurements.map((m) => m.room))];
  const uploads = files.filter((file) => file.kind === "document");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/admin/jobs/${jobId}/measure`}
          className="inline-flex min-h-11 items-center bg-charcoal px-4 text-sm text-ivory">Measure</Link>
        <UploadButton jobId={jobId} />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Measurements · {measurements.length}</h3>
        {measurements.length === 0 ? <p className="text-sm text-ink-soft">No windows measured yet.</p> : null}
        {rooms.map((room) => (
          <div key={room} className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{room}</h4>
            <ul className="flex flex-col divide-y divide-rule border border-rule">
              {measurements.filter((m) => m.room === room).map((m) => (
                <li key={m.id} className="flex gap-3 p-3 text-sm">
                  {m.photoFileId ? (
                    <a href={`/admin/files/${m.photoFileId}`} target="_blank" rel="noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                      <img src={`/admin/files/${m.photoFileId}`} alt={`Photo of ${m.label ?? room}`} className="size-16 object-cover" />
                    </a>
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-semibold">{m.label ?? "Window"} — {formatEighths(m.widthEighths)} × {formatEighths(m.heightEighths)}</p>
                    <p className="text-ink-soft">
                      {m.mount === "inside" ? "Inside" : "Outside"} mount
                      {m.depthEighths ? ` · depth ${formatEighths(m.depthEighths)}` : ""}
                      {m.requirements.length ? ` · ${m.requirements.map(requirementLabel).join(", ")}` : ""}
                    </p>
                    {m.notes ? <p className="whitespace-pre-line">{m.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Link href={`/admin/jobs/${jobId}/measure/${m.id}`} className="underline underline-offset-4">Edit</Link>
                    <form action={removeMeasurement.bind(null, jobId, m.id)}>
                      <button type="submit" className="text-ink-soft underline underline-offset-4">Delete</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Uploads · {uploads.length}</h3>
        {uploads.length === 0 ? <p className="text-sm text-ink-soft">No files uploaded yet.</p> : (
          <ul className="flex flex-col divide-y divide-rule border border-rule">
            {uploads.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <a href={`/admin/files/${file.id}`} target="_blank" rel="noreferrer" className="block truncate font-semibold underline underline-offset-4">{file.name}</a>
                  <p className="text-ink-soft">{size(file.sizeBytes)} · {file.uploadedBy} · {formatWhen(file.createdAt)}</p>
                </div>
                <form action={removeFile.bind(null, jobId, file.id)}>
                  <button type="submit" className="text-ink-soft underline underline-offset-4">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

In `app/admin/jobs/[id]/page.tsx`: import `listFiles` from `@/lib/admin/files`, `listMeasurements` from `@/lib/admin/measurements`, and `JobFiles` from `./JobFiles`. After `const events = await getEvents(id);` add `const [measurements, files] = await Promise.all([listMeasurements(id), listFiles(id)]);`. Insert a new section before the Activity section:

```tsx
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Files</h2>
        <JobFiles jobId={job.id} measurements={measurements} files={files} />
      </section>
```

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run --maxWorkers=2` (full suite) → PASS; filtered typecheck clean; `npx eslint app/admin lib/admin tests/admin` → no new issues.

```bash
git add lib/admin/client-upload.ts "app/admin/jobs/[id]/measure" "app/admin/jobs/[id]/JobFiles.tsx" "app/admin/jobs/[id]/UploadButton.tsx" "app/admin/jobs/[id]/page.tsx" tests/admin/measure-form.test.tsx
git commit -m "feat: iPhone measuring screen and the job Files section"
```

---

### Task 8: End-to-end test and launch

**Files:**
- Modify: `e2e/admin.spec.ts`, `playwright.config.ts`

- [ ] **Step 1:** In `playwright.config.ts`, add `BLOB_READ_WRITE_TOKEN: process.env.E2E_BLOB_READ_WRITE_TOKEN ?? ""` to the `webServer.env` block used when `E2E_POSTGRES_URL` is set.

- [ ] **Step 2:** In `e2e/admin.spec.ts`, add a serial test "an owner measures a window with a photo", skipped unless both `E2E_POSTGRES_URL` and `E2E_BLOB_READ_WRITE_TOKEN` are set. It signs in, creates a job, opens Measure, taps Kitchen, enters 35 and ⅝ by 48, chooses Inside, attaches a small JPEG fixture (`e2e/fixtures/window.jpg`, a 20×20 image committed with the test), saves, finishes, and asserts the job page shows "Kitchen", "35 ⅝″ × 48″", and a photo whose `/admin/files/...` URL returns 200 with `image/jpeg`. It then deletes the window and asserts the photo URL returns 404. `afterAll` also runs `delete from job_files where lead_id in (select id from leads where name like 'E2E Tracker %')` before the existing lead cleanup.

- [ ] **Step 3:** Run `npx playwright test` with the variables unset → existing tests pass, the new test is skipped.

- [ ] **Step 4:** Commit: `git commit -m "test: end-to-end coverage for measuring and files"`.

- [ ] **Step 5 (confirm each with the user before running):**
  1. Apply `003_measure_and_files.sql` to production with `node scripts/migrate.mjs` (additive; the `job_events.kind` constraint is only widened).
  2. Deploy with `npx vercel --prod`.
  3. On the live site, as the owner: open a job, measure one window with a photo from an iPhone, confirm it shows in Files and the photo opens; upload a PDF larger than 10 MB and confirm it opens; delete both. If uploads fail with an authentication error from Blob, add `BLOB_READ_WRITE_TOKEN` to the project's Production environment in the Vercel dashboard and redeploy.
