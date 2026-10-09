# Files on Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach files to tasks — uploaded to the task or linked from Resources — per `docs/superpowers/specs/2026-10-09-task-files-design.md`.

**Architecture:** A `task_files` table (migration 043) holds both kinds, guarded by a CHECK. Uploads go browser → private Blob through an admin-only token route (the Resources pattern), then a server action verifies with `head()` and records. The new-task form makes the task id in the browser so the task and its files are written in one statement before the assignment email.

**Tech Stack:** Next.js server actions + route handlers, Neon tagged-template `db()`, `@vercel/blob` (`head`, `del`, `get`, `list`) and `@vercel/blob/client` (`upload`, `handleUpload`), vitest + Testing Library.

## Global Constraints

- Every migration statement re-runnable; whole-line comments only; no semicolons in comments.
- Multi-row writes are one data-modifying CTE, never separate `db()` calls.
- Every action and route calls `requireAdmin()` before reading input.
- 200 MB per file (`RESOURCE_MAX_BYTES`); names stored trimmed, 1–200 characters (`uploadName`).
- Inline only for PDFs and photos (`opensInline`), `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.
- Commits authored `whirleyjoshua@gmail.com` / Joshua, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --maxWorkers=2 <paths>`. Commit before any mutation check.

---

### Task 1: Migration 043 and the pure rules

**Files:**
- Create: `db/migrations/043_task_files.sql`, `lib/admin/task-file-rules.ts`, `tests/admin/task-file-rules.test.ts`

**Produces:**
- `TASK_FILE_PREFIX = "task-files/"`
- `taskFilePathname(taskId: string, fileId: string, fileName: string): string` → `task-files/<taskId>/<fileId>/<safeName>` (`.`/`..` → `file`)
- `parseTaskFilePathname(p: string): { taskId: string; fileId: string } | null` (v4 uuids, name `[A-Za-z0-9._-]{1,80}`, not `.`/`..`)
- `type TaskFile = { id; taskId; resourceId: string | null; name; contentType; sizeBytes: number; addedBy; createdAt: Date }`
- `type PendingUpload = { pathname: string; name: string }`
- `type ResourceOption = { id: string; name: string; category: string }`

SQL (043): table per spec; `task_files_kind_check`:
`(resource_id is not null and name is null and content_type is null and size_bytes is null and blob_pathname is null) or (resource_id is null and name is not null and content_type is not null and size_bytes is not null and blob_pathname is not null)`;
`task_files_name_check` `name is null or (name = btrim(name) and char_length(name) between 1 and 200)`;
`task_files_size_check` `size_bytes is null or size_bytes between 1 and 209715200`;
unique indexes `task_files_task_resource_idx (task_id, resource_id) where resource_id is not null`, `task_files_blob_idx (blob_pathname) where blob_pathname is not null`; index `task_files_task_idx (task_id)`, `task_files_resource_idx (resource_id)`.

- [ ] Tests: pathname round-trip; refuses other prefixes, `..`, non-uuid, resources paths.
- [ ] Implement; run; commit.

### Task 2: Store — task_files SQL, tasks.ts changes

**Files:**
- Create: `lib/admin/task-files.ts`, `tests/admin/task-files-store.test.ts`
- Modify: `lib/admin/tasks.ts`, `lib/admin/task-rules.ts` (`Task.fileCount: number`), `tests/admin/tasks-store.test.ts`, fixtures that build `Task`

**Produces (task-files.ts):**
- `listTaskFiles(taskId): Promise<TaskFile[]>` — uploads and links (link name/type/size from `company_files` via left join), oldest first.
- `getTaskFile(id): Promise<{ id; taskId; resourceId: string | null; name; contentType; sizeBytes; pathname: string | null } | null>`
- `addTaskUpload(u: { id; taskId; name; contentType; sizeBytes; pathname; addedBy }): Promise<"added" | "exists">` — `on conflict do nothing`; throws 23503 when the task is gone.
- `linkResource(taskId, resourceId, addedBy): Promise<"added" | "exists">` — throws 23503 when either is gone.
- `removeTaskFile(taskId, fileId): Promise<{ pathname: string | null } | null>` — null when already gone.
- `recordedPathnames(paths: string[]): Promise<Set<string>>`

**Changes (tasks.ts):**
- `listTasks`/`getTask` select `(select count(*) from task_files f where f.task_id = tasks.id)::int as file_count`.
- `createTask(input, actor, files: { id: string; uploads: StoredUpload[]; resourceIds: string[] })` → `{ id; created: boolean; fileNames: string[] } | "not-assignable"`. One CTE: `ins` inserts the task with the given id (`on conflict (id) do nothing`), `ups` inserts uploads `select … from ins` (only when the task was inserted), `links` inserts resource links from `ins`; returns whether inserted. `StoredUpload = { id; name; contentType; sizeBytes; pathname }`. A deleted picked resource throws 23503.
- `deleteTask(id): Promise<string[] | null>` — CTE: `paths as (select blob_pathname from task_files where task_id = id and blob_pathname is not null)`, `gone as (delete from tasks where id = id returning id)`; null when nothing deleted, else the paths (sibling CTE sees the pre-cascade snapshot — proven in Task 8).

- [ ] Tests pin SQL text and mapping; run; commit.

### Task 3: Upload verification + token route + open route

**Files:**
- Create: `lib/admin/task-file-uploads.ts` (server-only), `app/admin/tasks/upload/route.ts`, `app/admin/tasks/files/[fileId]/route.ts`, tests for each.

**Produces:**
- `verifyTaskUpload(taskId: string, upload: PendingUpload): Promise<{ upload: StoredUpload } | { error: string }>` — path must parse and belong to `taskId`; `head()` size/type; empty/oversize/missing → error and `del`. Name via `uploadName`.
- `discard(pathname)` — `del`, logged on failure.
- Token route: like Resources, path must `parseTaskFilePathname`.
- Open route: upload → stream like Resources route; link → `303` to `/admin/resources/<resourceId>`; missing → 404.

- [ ] Tests; implement; run; commit.

### Task 4: Actions — files on an existing task, create/delete with files, emails

**Files:**
- Create: `app/admin/tasks/file-actions.ts`, `tests/admin/task-file-actions.test.ts`
- Modify: `app/admin/tasks/actions.ts`, `lib/admin/task-emails.ts`, `tests/admin/task-actions.test.ts`, `tests/admin/task-emails.test.ts`

**Produces (file-actions.ts):** all return `{ ok: true } | { error: string }`:
- `saveTaskFileAction(taskId, upload: PendingUpload)` — verify; `addTaskUpload`; 23503 → discard, "That task was deleted."; lost reply → re-check `getTaskFile`.
- `linkResourceAction(taskId, resourceId)` — 23503 → "That task or file was deleted."; exists → ok.
- `removeTaskFileAction(taskId, fileId)` — row first, then `del` the upload.
- `discardPendingUploadAction(pathname)` — only a parseable task-files path not in `recordedPathnames`.

**Changes:**
- `TaskSummary` gains `fileNames: string[]`; email body adds `Files:` + `- name` lines after notes when any.
- `createTaskAction`: reads `taskId` (uuid, else error "Reload the page and try again."), `upload` (JSON `PendingUpload`, repeated), `resourceId` (repeated); verifies each upload (first error returned, the others kept); `createTask`; `created: false` → `{ ok: "Task added." }` with no email; 23503 → "A file you picked from Resources was deleted. Pick again."
- `updateTaskAction` and `remindTaskAction` pass `fileNames` from `listTaskFiles`.
- `deleteTaskAction` deletes returned paths (logged on failure).

- [ ] Tests; implement; run; commit.

### Task 5: UI — files on the task page and the new-task form, card count

**Files:**
- Create: `app/admin/tasks/FilePicker.tsx` (upload button + Resources picker; emits `onUploaded(PendingUpload)`, `onPickResource(ResourceOption)`, `onBusy(boolean)`), `app/admin/tasks/TaskFiles.tsx` (task page: list + remove + picker calling file actions, then `router.refresh()`), `app/admin/tasks/NewTaskFiles.tsx` (pending list; hidden inputs via `form={formId}` so the form's error remount never drops them; Remove calls `discardPendingUploadAction` for uploads)
- Modify: `TaskForm.tsx` (optional `newFiles: { resources }`; form `id`; submit disabled while busy; on success the files block remounts with a fresh task id), `page.tsx` + `[id]/page.tsx` (load `listResources`, `listTaskFiles`), `TaskCard.tsx` (📎 count)
- Tests: `tests/admin/task-files-ui.test.tsx`, update `task-form.test.tsx`, `tasks-page.test.tsx`

- [ ] Tests; implement; run; commit.

### Task 6: Resources delete warning

**Files:** `lib/admin/resources.ts` (`task_count`), `lib/admin/resource-rules.ts` (`Resource.taskCount`), `app/admin/resources/ResourceList.tsx`, tests/fixtures.
Confirm text: `Delete {name}? It's attached to {n} task(s) and will be removed from them. This can't be undone.`

- [ ] Tests; implement; run; commit.

### Task 7: Sweep left-behind uploads in the daily cron

**Files:** `lib/admin/task-file-sweep.ts`, `app/api/cron/tasks/route.ts`, tests.
`sweepTaskUploads(now)`: page through `list({ prefix: TASK_FILE_PREFIX, cursor })`, keep blobs with `uploadedAt` older than 24 h, drop `recordedPathnames`, `del` the rest; never throws, returns `{ removed, error? }`. Cron returns `{ ...digest, swept }`, 500 when either errored.

- [ ] Tests; implement; run; commit.

### Task 8: Real-database proof, full suite, build

**Files:** `scripts/verify-task-files.ts`, `scripts/verify-task-files.config.mts`
Steps: constraint refusals (23514, 23505); createTask with uploads + link in one statement; repeat id → created false, nothing doubled; addTaskUpload/linkResource exists; listTaskFiles merges; file_count; removeTaskFile; deleteTask returns paths and cascades; company_files delete cascades links; recordedPathnames; cleanup.
- [ ] Full suite, `tsc`, `next build`; owner runs the Neon-branch command; production 043 + push; live upload check.
