# Deleting a Job — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner can permanently delete a job from the job page's "More actions" menu — the row, everything that cascades from it, and its files in Blob storage.

**Architecture:** One function in `lib/admin/jobs.ts` that refuses a job with a service child, reads its blob pathnames before the row goes, deletes in a single statement letting the foreign keys cascade, then removes the blobs independently. One server action, and a confirmation in the existing `•••` panel that names the customer before the last tap.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before any Next API), React 19 server components and server actions, Neon Postgres via `db()`, `@vercel/blob`, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-delete-a-job-design.md`

## Global Constraints

- **This is the only destructive operation in the app that cannot be undone.** No archive, no trash, no restore. Every safeguard in the spec is there because of that.
- **A job with a service request against it is REFUSED, never cascaded.** That visit may already be scheduled.
- **Order is load-bearing**: check for children → read blob pathnames → delete the row → remove blobs. A blob removed before a failed delete leaves a live job whose files are gone.
- **A failed blob removal must not fail the deletion.** The row is already gone; log and carry on.
- Tailwind class names are complete literals, never built by concatenation. Existing tokens only. Works at ~400px, and the menu works with JavaScript off.
- No migration. Every foreign key into `leads` already cascades or nulls; `parent_job_id` alone declares no rule, which is what produces the refusal.
- Unit tests: `npx vitest run --maxWorkers=2 <paths>`. Never run vitest alongside typecheck or build — this machine's memory watchdog kills large concurrent runs.
- `npm run typecheck`; `npx eslint <changed paths>` — **never a bare `npm run lint`** (it walks sibling worktrees' generated types).
- Do NOT run `scripts/migrate.mjs`, Playwright, or anything touching a database — `.env.local` holds PRODUCTION credentials. Mock the db in tests.
- **Before trusting any test that guards something, delete or loosen the thing it guards and watch it go red.** Prove the mutation applied before believing the result.

---

### Task 1: The deletion itself

**Files:**
- Modify: `lib/admin/jobs.ts`, `lib/admin/files.ts`
- Test: `tests/admin/delete-job.test.ts` (new), `tests/admin/files.test.ts`

**Interfaces (Produces):**
- `listBlobPathnames(jobId): Promise<string[]>` in `lib/admin/files.ts` — the `blob_pathname` of every file on a job. Read BEFORE the row is deleted, because `job_files` cascades away with it.
- `deleteJob(id, actor): Promise<"deleted" | "has-children" | "missing">` in `lib/admin/jobs.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/delete-job.test.ts`, mocking `@/lib/db` and `@vercel/blob`:

```ts
it("refuses a job that has a service request, and deletes nothing", async () => {
  query.mockResolvedValueOnce([{ id: CHILD }]);            // the child lookup finds one
  await expect(deleteJob(PARENT, ACTOR)).resolves.toBe("has-children");
  const statements = query.mock.calls.map(([strings]) => strings.join(" "));
  expect(statements.some((s) => /delete\s+from\s+leads/i.test(s))).toBe(false);
});

it("reads the blob pathnames before the row is deleted", async () => {
  // order is the assertion: pathnames, then delete
  expect(order).toEqual(["children", "pathnames", "delete", "blob", "blob"]);
});

it("deletes the row in one statement, bound to the id", async () => { /* … */ });

it("still reports deleted when a blob removal throws", async () => {
  del.mockRejectedValueOnce(new Error("blob down"));
  await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");
});

it("reports missing when the row was already gone", async () => { /* 0 rows deleted */ });
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run --maxWorkers=2 tests/admin/delete-job.test.ts`

- [ ] **Step 3: Implement.** In `lib/admin/files.ts`, `listBlobPathnames` selects `blob_pathname` for a job — name the column, do not `select *`. In `lib/admin/jobs.ts`:

```ts
export async function deleteJob(id: string, actor: string): Promise<"deleted" | "has-children" | "missing"> {
  // NOTE: `UUID` lives in lib/admin/files.ts, NOT in this file. Either export it from there
  // and import it, or guard the id the way this file already guards ids — check first, do not
  // assume a regex is in scope. A non-uuid must return "missing" without touching the db.
  const sql = db();
  const children = await sql`select id from leads where parent_job_id = ${id} limit 1`;
  if (children.length > 0) return "has-children";

  // Read these BEFORE the delete: job_files cascades away with the row.
  const pathnames = await listBlobPathnames(id);
  const rows = await sql`delete from leads where id = ${id} returning id`;
  if (rows.length === 0) return "missing";

  // The row is gone. A blob that will not delete is an orphan in storage — worth a log,
  // not worth telling the owner their deletion failed when it did not.
  for (const pathname of pathnames) {
    await del(pathname).catch((error) => console.error("Could not remove orphaned blob", error));
  }
  return "deleted";
}
```

That `.catch()` shape is the repo's own: `lib/admin/files.ts:91` and `:109` both do `await del(...).catch((error) => console.error(...))`. Follow it rather than a `try/catch` — and `del` is imported there as `import { del, get, put } from "@vercel/blob"`.

- [ ] **Step 4: Run tests, typecheck, eslint the changed paths.**
- [ ] **Step 5: Commit** — `feat: deleting a job takes its files with it`

---

### Task 2: The menu item and its confirmation

**Files:**
- Modify: `app/admin/jobs/actions.ts`, `app/admin/jobs/[id]/JobHeader.tsx`
- Create: `app/admin/jobs/[id]/DeleteJob.tsx`
- Test: `tests/admin/delete-job-ui.test.tsx` (new), `tests/admin/actions.test.ts`

**Interfaces (Consumes):** `deleteJob` from Task 1.

- [ ] **Step 1: Write the failing tests**

- The action requires an admin (`requireAdmin()` first) and refuses without one.
- `has-children` renders the explanation naming what to do, and the job is still there.
- `deleted` redirects to the board.
- The panel shows the customer's name and project number in the warning before the button.
- With JavaScript off the reveal is a `<details>` and the action a plain `<form>` post.

```tsx
it("names the customer before it will delete anything", () => {
  render(<DeleteJob job={{ id: ID, name: "Maria Alvarez", projectNo: "PSS-1002" }} />);
  expect(screen.getByText(/Maria Alvarez/)).toBeInTheDocument();
  expect(screen.getByText(/PSS-1002/)).toBeInTheDocument();
  expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement the action** in `app/admin/jobs/actions.ts`, shaped like `markLost` (read it first): `requireAdmin()`, call `deleteJob`, then on `"deleted"` `revalidatePath("/admin")` and `redirect("/admin")`; on `"has-children"` return a form state carrying the explanation; on `"missing"` redirect to the board too — the owner wanted it gone and it is gone.

- [ ] **Step 4: Implement `DeleteJob.tsx`** — a `<details>` whose summary reads "Delete this job…", revealing the named warning and a `DeleteButton` (the repo's existing two-tap component). Place it in `JobHeader.tsx`'s `•••` panel **below a rule, after everything else**.

Copy, exactly:

> Deleting removes **{name}**, {projectNo}, and everything on it: the quote, measurements, photos, documents and history. This cannot be undone.

- [ ] **Step 5: Focused tests, typecheck, eslint changed paths, `npm run build` alone and last.**
- [ ] **Step 6: Commit** — `feat: an owner can delete a job from the More actions menu`

---

### Task 3: End-to-end, and the release gate

**Files:** `e2e/admin.spec.ts`

SCOPE: write the specs and run the LOCAL checks. Do **NOT** run Playwright against a server, migrations, or a deploy — the controller does that. `npx playwright test --list` in the FOREGROUND is the only Playwright command you may run (a detached shell exits 0 with "not recognized" — a false pass).

- [ ] **Step 1: The journeys** — an owner deletes a job from the menu and it leaves the board, its events and measurements are gone, and the job page 404s; a job with a service request cannot be deleted and the explanation says why.

- [ ] **Step 2: The release gate.** Deleting one job must not touch another. Create two jobs, each with a file and events, delete one, and assert the other's rows and file survive. Assert on the effect in the database, not on what the page says.

**Then prove the gate can fail**: this is the controller's job on the Neon branch, but write it so the mutation is obvious — loosening `where id = ${id}` is what it must catch.

- [ ] **Step 3: Local checks** — typecheck, eslint changed paths, `npm run build`, `npx playwright test --list` in the foreground.
- [ ] **Step 4: Commit** — `test: e2e for deleting a job`

- [ ] **Step 5: Controller only** — Neon branch, run the suite, **watch the gate fail with `where id` loosened**, restore, delete the branch.

- [ ] **Step 6: Release (owner approval required)** — no migration, so: merge to main and **push, which deploys production by itself** (the owner's decision of 2026-09-17). Do NOT run `vercel --prod` afterwards. Verify with `vercel ls --prod` and `vercel inspect`, then delete a junk job on the live site to confirm.
