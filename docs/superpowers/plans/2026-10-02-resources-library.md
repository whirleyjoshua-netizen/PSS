# Resources Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner-only Resources page where any file, up to 200 MB, can be uploaded from a computer, filed under a category, searched, opened, renamed, re-categorised and deleted.

**Architecture:**
- Files go from the browser straight to private Vercel Blob storage (`@vercel/blob/client` `upload`, multipart). A route issues the upload token only to a signed-in admin, and only for a `resources/<uuid>/<safe-name>` path.
- A server action then checks the blob really exists (`head`) and records it in `company_files` (migration 036).
- A route streams a file back to signed-in admins.

**Tech Stack:** Next.js App Router (route handlers, server actions), @vercel/blob 2.x (`handleUpload`, `upload`, `head`, `get`, `del`), Neon via `db()`, vitest + testing-library, a hand-run verify script against a Neon branch.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-02-logo-and-resources-design.md`, Part B.
- Every page, action and route calls `requireAdmin()` before reading its input.
- Limits:
  - names are 1–200 characters after trimming;
  - categories are 1–60 characters after trimming;
  - files are 1 byte to 200 MB;
  - paths match `^resources/<uuid v4>/<safeName>$`.
- Opens `inline` only for application/pdf, image/jpeg, image/png, image/webp and image/gif. Everything else is `attachment`. Always send `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- Migration 036 is re-runnable, uses only whole-line comments, and has no semicolons inside comments (house rule).
- Verification:
  - `npx vitest run --maxWorkers=2`;
  - `npx next typegen` before `npx tsc --noEmit`;
  - eslint on changed files by path;
  - new SQL is proven on a Neon branch with `scripts/verify-resources.ts`.

---

### Task 1: Rules and migration

**Files:**
- Create `lib/admin/resource-rules.ts`, which has no server imports and is used by both client and server.
- Create `db/migrations/036_company_files.sql`.
- Test `tests/admin/resource-rules.test.ts`.

**Produces:**
```ts
export const RESOURCE_MAX_BYTES = 200 * 1024 * 1024;
export const NAME_MAX = 200; export const CATEGORY_MAX = 60;
export type Resource = { id: string; name: string; category: string; contentType: string; sizeBytes: number; uploadedBy: string; createdAt: Date };
export function resourcePathname(id: string, fileName: string): string;      // `resources/${id}/${safeName(fileName)}`
export function resourceIdFromPathname(pathname: string): string | null;     // the uuid when the path is well-formed, else null
export function cleanName(raw: string): string | null;                         // trimmed, ≤ NAME_MAX, else null
export function cleanCategory(raw: string): string | null;                     // trimmed, internal whitespace collapsed, ≤ CATEGORY_MAX, else null
export function opensInline(contentType: string): boolean;
export function formatBytes(bytes: number): string;                            // "512 B", "1.4 MB", "250 KB"
export function groupResources(list: Resource[], query: string): { category: string; files: Resource[] }[];
// filtered by name/category contains (case-insensitive), categories A–Z, files by name A–Z
```

### Task 2: Store

**Files:** Create `lib/admin/resources.ts` (server-only). Test `tests/admin/resources-store.test.ts`.

**Produces:**
- `listResources(): Promise<Resource[]>`
- `listCategories(): Promise<string[]>`
- `createResource(row: { id; name; category; contentType; sizeBytes; pathname; uploadedBy }): Promise<Resource>`
- `getResource(id): Promise<(Resource & { pathname: string }) | null>`
- `renameResource(id, name): Promise<boolean>`
- `recategorizeResource(id, category): Promise<boolean>`
- `deleteResource(id): Promise<string | null>`, which answers the deleted blob pathname.

### Task 3: Upload token route and save action

**Files:**
- Create `app/admin/resources/upload/route.ts`.
- Create `app/admin/resources/actions.ts` (`saveResourceAction`, `renameResourceAction`, `recategorizeResourceAction`, `deleteResourceAction`).
- Tests `tests/admin/resource-upload-route.test.ts` and `tests/admin/resource-actions.test.ts`.

What the code must do:
- **Token route:** `requireAdmin` runs inside `onBeforeGenerateToken`. Any pathname that `resourceIdFromPathname` rejects throws. Tokens are issued with `maximumSizeInBytes: RESOURCE_MAX_BYTES`, `addRandomSuffix: false` and `allowOverwrite: false`, and with no `onUploadCompleted`.
- **`saveResourceAction({ pathname, name, category })`:**
  - `requireAdmin`;
  - the id comes from the path;
  - `cleanName` and `cleanCategory`;
  - `head(pathname)` gives the size and content type, and an error on a missing blob;
  - a blob over the limit is deleted and refused;
  - if the insert throws, the blob is deleted and the error re-thrown;
  - `revalidatePath("/admin/resources")`.

### Task 4: Download route

**Files:** Create `app/admin/resources/[id]/route.ts`. Test `tests/admin/resource-download-route.test.ts`.

### Task 5: Page, uploader and list

**Files:**
- Create `app/admin/resources/page.tsx`, `ResourceUploader.tsx` (client) and `ResourceList.tsx` (client).
- Modify `app/admin/AdminNav.tsx` (a Resources link after Documents) and `components/admin/icons.tsx` (a `folder` icon).
- Test `tests/admin/resources-page.test.tsx`.

Behaviour:
- **Uploader:**
  - a multi-file input, then a category text input with a datalist of existing categories, defaulting to "General";
  - files over the limit are refused in the browser;
  - each file is sent with `upload(pathname, file, { access: "private", handleUploadUrl: "/admin/resources/upload", multipart: true, onUploadProgress })`, then `saveResourceAction`;
  - each file shows its progress and its result;
  - `router.refresh()` runs at the end.
- **List:**
  - a search box;
  - groups by category;
  - rows show a link to `/admin/resources/<id>`, the size, who uploaded it and when;
  - Rename, Move (category) and Delete, where Delete asks for confirmation with an inline "Delete <name>? Yes / No" rather than `window.confirm`.

### Task 6: Prove the SQL on a Neon branch

**Files:** Create `scripts/verify-resources.ts` and `scripts/verify-resources.config.mts` (the same pattern as verify-tasks).

The script runs:
- migration 036 twice;
- create, list, list categories, rename, recategorize and delete;
- raw writes that must THROW `company_files_name_check`, `company_files_category_check`, `company_files_size_check` and `company_files_pathname_check`, plus the unique pathname check;
- cleanup at the end.
