# Quote Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One job can carry several Direct Connect quotes ("options") numbered `PSS-1042`, `PSS-1042-B` … `PSS-1042-Z`. Each one imports, prices, previews and sends on its own. The client sees every sent option together and approves one. Approving one closes the others, and the contract for the approved option follows.

**Architecture:** Migration 040 adds `quote_options` (letters B–Z per job) and `dc_quote_versions.option` (default `'A'`). Version numbering, the unique key and the one-offered exclusion all become per `(lead_id, option)`. Everything that today reads "the job's quote" reads "this option's quote" instead. The store, import gate, `review()`/`sendQuote`/`sendContract` and `approveDcQuote` take the option from the version or from a letter. The admin Quote tab shows one card per option. The portal shows a "Your quote options" list once two or more options are offered. Every multi-row write stays one SQL statement (the `pss-atomic-writes-single-cte` precedent).

**Tech Stack:** Next.js 16.3 App Router (server components, server actions, route handlers), React 19, `@neondatabase/serverless` tagged templates through `db()` from `lib/db`, vitest + Testing Library, Playwright, hand-run `scripts/verify-*.ts` against a Neon test branch.

**Spec:** `docs/superpowers/specs/2026-10-02-quote-options-design.md`

## Global Constraints

- Work only in the worktree `/Users/jenniferjordan/pss/.claude/worktrees/quote-options` (branch `feat/quote-options`). Before editing, run `git rev-parse --show-toplevel` and confirm it prints that path. Never touch the main checkout at `/Users/jenniferjordan/pss`. Never push, deploy, or migrate production. The controller handles shipping.
- The migration number is **040** (`db/migrations/040_quote_options.sql`). 039 belongs to `feat/google-lead-webhook`. `scripts/migrate.mjs` re-applies **every** file on **every** run, so every statement must be safe to re-run. Comments must be whole lines starting with `--`, and a comment must never contain a semicolon (migrate.mjs splits on `;` after stripping comment lines).
- An option is one capital letter. Option `A` is the job's own number (`PSS-1042`) and is never stored in `quote_options`. Options `B`–`Z` read `PSS-1042-B` … `PSS-1042-Z`. Format with `formatOptionNo(projectNo, option)` from `lib/portal/project-no.ts`, and nowhere else.
- Exact copy (use it verbatim):
  - Card heading: `Option A · PSS-1042`. It shows only when the job has two or more options.
  - Button: `Add another quote`. Event: `Added quote option PSS-1042-B`.
  - Empty card: `No Direct Connect quote yet. Put PSS-1042-B in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.`
  - Import event: `Direct Connect quote 22250749 arrived as PSS-1042-B version 1`. Option A keeps `Direct Connect quote 22250749 arrived as version 1`.
  - Signed-elsewhere refusal: `Option A is signed. Make changes as a new version of Option A.`
  - Approval events: `Approved PSS-1042-B version 1` (option A keeps `Approved quote version 1`). The quote-kind event appends ` from their project page`.
  - Files: `Quote PSS-1042-B v1.pdf`, `Contract PSS-1042-B v1.pdf`, `Quote PSS-1042-B v1 PREVIEW.pdf`. PDF headers: `Quote PSS-1042-B · Version 1`, `Contract PSS-1042-B · Version 1`.
  - Portal: section `Your quote options`, items `Option A`, controls `Approve Option B` / `Yes, approve Option B`, banner link `Review your options`.
- No new `job_events` kind. Everything here logs `'quote'` or `'stage'`. Migration 040 does not touch `job_events_kind_check`.
- `quoteSha256` (`lib/dc/import.ts`) must NOT change. `poReference` is already in its canonical object, so two options never collide. Adding a field would change every stored hash and re-import every unchanged Dealer Copy as a new version.
- Unit tests: `npx vitest run --maxWorkers=2 <paths>`. They mock `db()`, so they prove SQL **text** only. `npm run typecheck` (`tsc --noEmit`) includes `tests/**`, so a type change must update the test fixtures in the same task.
- Real SQL is proven only by the hand-run verify scripts, with `E2E_POSTGRES_URL` pointing at a **Neon test branch** (the e2e branch, `ep-lingering-fog`, or a branch the controller names). **Never production (`ep-cold-term`).** Never print a connection string. Keep the branch URL in a file (`$SCRATCH/e2e-db-url.txt`, where `$SCRATCH` is your session scratchpad directory) and pass it as `E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")"`. Name an endpoint by its `ep-…` id only.
- Mutation checks: **commit before mutating** (`git checkout -- <file>` wipes uncommitted edits). Make the one-line mutation, run the named test, see it FAIL, then restore with `git checkout -- <file>` and see it PASS.
- Commits: `git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. The second `-m` makes the blank line before the trailer.
- AGENTS.md: this Next.js differs from training data. Before changing the route handler (Task 7), read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`. This plan reads query params with the standard `new URL(request.url).searchParams`, which works for both `Request` and `NextRequest`.

## Judgment calls this plan makes (read before Task 1)

1. **030 must stop defining `dc_quote_versions_one_offered`.** The spec says 030 re-adds the per-job rule on every run and 040 replaces it. That fails in practice. `alter table … add constraint … exclude` validates existing rows even when the constraint is deferrable. So once any job has A and B offered at once, the next `migrate.mjs` run dies at 030 with `could not create exclusion constraint`, and every later migration stops with it. Task 1 removes the two statements from 030 (precedent: bfc17d9 edited 011 so a re-run no longer resets Contacted), and 040 owns the rule. Task 9 proves this. It re-applies every migration file with two options offered, and in its mutation step puts 030's old statements back to watch the re-run fail.
2. **`loadReview(jobId, option = "A")`, not `loadReviews`.** The Quote tab needs a card for an option with no versions yet, so it needs `listQuoteOptions(jobId)` anyway. It then calls `loadReview(job.id, letter)` per letter. `sendQuote`/`sendContract` find the option from the posted version id (`review(jobId, { versionId })`). An id the job never had falls back to option A, whose newest version is not that id, so the caller answers today's "A newer version…" refusal. That keeps the existing tests' meaning.
3. **`offeredVersions` returns approved offered versions too.** The page shows only `approvedAt === null` ones, and the action uses the approved ones to answer a double tap with "approved", as `offeredVersion` did. `offeredVersion` is deleted in Task 8, once no caller needs it.
4. **A posted `versionId` that matches none of the job's offered versions is `wrong-status`.** It is never read as approval of an uploaded quote.
5. **`approveDcQuote` updates `leads` in ONE CTE** (`updated`). Two CTEs updating the same `leads` row in one statement would apply only one of them. So `quote_cents`, the Quoted→Approved move and `updated_at` share one `update`, and `moved` is derived from `prev`.
6. **The import gate also checks the 20-character PO limit.** A PO Reference longer than 20 characters is `no-po`, as the spec's test list asks.
7. **`notifyOwnersOfApproval` gains an optional 5th parameter `optionNo`.** It replaces the project number in the subject and the `Project:` line. The import email needs no change to `notify.ts`'s `imported` case, because `import.ts` passes the option number as `projectNo`. The `no-match` wording gains a sentence for a `-B` PO whose option was never added.
8. **The contract terms' `{{project_no}}` stays the job number** (`termsFieldValues(job, now)` is unchanged). Only file names and PDF headers carry the option number.
9. **The portal now shows money** (each option's client total, as the spec asks). The `ProjectView` docblock is amended to say so.
10. **The "Add another quote" button always shows.** The server refuses with a message (Lost, signed, past Z). `QuoteTab` still reads no job status (ruling P9).

## File map

| File | Change |
|---|---|
| `db/migrations/040_quote_options.sql` | new: `quote_options`, `option` column, per-option unique key and one-offered rule |
| `db/migrations/030_deposit_flow.sql` | remove the per-job one-offered statements (Judgment 1) |
| `lib/portal/project-no.ts` | `formatOptionNo` |
| `lib/dc/types.ts`, `lib/dc/parse.ts` | `DcQuote.option`, PO regex with an option, 20-character limit |
| `lib/dc/store.ts` | `StoredVersion.option`, `importVersion`/`latestSha` per option, `quoteOptionExists`, `listQuoteOptions`, `addQuoteOption`, `OPTION_SIGNED` |
| `lib/dc/import.ts`, `lib/dc/notify.ts` | gate on option, email names the option number |
| `lib/dc/send.ts` | `review(jobId, which)`, `loadReview(jobId, option)`, `previewQuote(jobId, option)`, per-option `sendQuote`/`sendContract`, `signedElsewhere` |
| `lib/dc/approve.ts` | `offeredVersions`, `approveDcQuote` closes other options (and later loses `offeredVersion`) |
| `app/admin/jobs/[id]/QuoteTab.tsx`, `QuoteReview.tsx`, `DcButtons.tsx`, `quote-actions.ts`, `quote-preview/route.ts` | option cards, unique ids, Add another quote, `?option=` |
| `app/(site)/project/ApproveQuote.tsx`, `QuoteOptions.tsx` (new), `StatusBanner.tsx`, `ProjectView.tsx`, `actions.ts` | the options list, approval by version id |
| `lib/portal/send-approval-email.ts` | `optionNo` parameter |
| `scripts/verify-quote-options.ts` (new) + `.config.mts` (new), `scripts/verify-dc-quote-import.ts` | real-SQL proof |
| `e2e/dc-quote.spec.ts` | two-option journey |

---

### Task 1: Migration 040, and 030 stops defining the one-offered rule

**Files:**
- Create: `db/migrations/040_quote_options.sql`
- Modify: `db/migrations/030_deposit_flow.sql` (the block from `-- At most one offered version per job.` through `… deferrable initially deferred;`)
- Create: `tests/db/migration-040.test.ts`
- Modify: `tests/db/migration-030.test.ts` (the test `allows one offered version per job, checked when the statement commits`)

**Interfaces:**
- Produces: table `quote_options (lead_id uuid, letter text, created_by text, created_at timestamptz, primary key (lead_id, letter))` with `quote_options_letter_check`. Column `dc_quote_versions.option text not null default 'A'` with `dc_quote_versions_option_check`. Constraint `dc_quote_versions_lead_option_version_key unique (lead_id, option, version)`. Constraint `dc_quote_versions_one_offered exclude using btree (lead_id with =, option with =) where (status = 'offered') deferrable initially deferred`.

- [ ] **Step 1: Confirm the worktree and install dependencies**

```bash
cd /Users/jenniferjordan/pss/.claude/worktrees/quote-options
git rev-parse --show-toplevel   # must print /Users/jenniferjordan/pss/.claude/worktrees/quote-options
git branch --show-current       # must print feat/quote-options
npm ci
```

- [ ] **Step 2: Baseline the suites this plan touches**

Run: `npx vitest run --maxWorkers=2 tests/dc tests/portal tests/db tests/admin`
Expected: all pass. If anything fails before you change a line, stop and report it.

- [ ] **Step 3: Confirm the per-job unique key's real name on the Neon test branch (read-only)**

The controller gives you the test branch URL. Write it to `$SCRATCH/e2e-db-url.txt` without echoing it. Then run:

```bash
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node --input-type=module -e '
import { neon } from "@neondatabase/serverless";
const url = process.env.E2E_POSTGRES_URL;
if (!url || url.includes("cold-term")) throw new Error("not a test branch: refusing");
console.log("endpoint", new URL(url).hostname.split(".")[0]);
const sql = neon(url);
console.log(await sql.query("select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass order by conname", ["dc_quote_versions"]));
'
```

Expected: the endpoint prints as `ep-…` and is NOT `ep-cold-term`. The list includes a row `conname: 'dc_quote_versions_lead_id_version_key', contype: 'u', def: 'UNIQUE (lead_id, version)'` and `dc_quote_versions_one_offered` (`EXCLUDE USING btree (lead_id WITH =) …`). If the unique key has a different name, use that name in Step 6's `drop constraint if exists` line and in Step 4's expected list, and tell the controller.

- [ ] **Step 4: Write the failing migration tests**

Create `tests/db/migration-040.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const source = readFileSync("db/migrations/040_quote_options.sql", "utf8");
const statements = source
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 040", () => {
  it("has whole-line comments only, and never a semicolon in one", () => {
    for (const line of source.split("\n")) {
      if (line.trim().startsWith("--")) expect(line).not.toContain(";");
      else expect(line).not.toContain("--");
    }
  });

  it("is exactly these re-runnable statements, in this order", () => {
    expect(statements).toEqual([
      "create table if not exists quote_options ( lead_id uuid not null references leads(id) on delete cascade, letter text not null, created_by text not null, created_at timestamptz not null default now(), primary key (lead_id, letter) )",
      "alter table quote_options drop constraint if exists quote_options_letter_check",
      "alter table quote_options add constraint quote_options_letter_check check ( letter ~ '^[B-Z]$' )",
      "alter table dc_quote_versions add column if not exists option text not null default 'A'",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_option_check",
      "alter table dc_quote_versions add constraint dc_quote_versions_option_check check ( option ~ '^[A-Z]$' )",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_id_version_key",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_option_version_key",
      "alter table dc_quote_versions add constraint dc_quote_versions_lead_option_version_key unique (lead_id, option, version)",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered",
      "alter table dc_quote_versions add constraint dc_quote_versions_one_offered exclude using btree (lead_id with =, option with =) where (status = 'offered') deferrable initially deferred",
    ]);
  });

  it("is the only migration that defines the one-offered rule, so no older file can put the per-job rule back on a re-run", () => {
    const files = readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort();
    const defining = files.filter((file) => readFileSync(`db/migrations/${file}`, "utf8").split("\n")
      .some((line) => !line.trim().startsWith("--") && line.includes("dc_quote_versions_one_offered")));
    expect(defining).toEqual(["040_quote_options.sql"]);
  });
});
```

In `tests/db/migration-030.test.ts`, replace the whole test `it("allows one offered version per job, checked when the statement commits", () => { … });` with:

```ts
  // Quote options (migration 040): the rule is per option and lives in 040. Re-adding the per-job rule here on
  // every migrate run would fail as soon as one job has two options offered at once.
  it("leaves the one-offered rule to 040", () => {
    expect(statements.some((s) => s.includes("dc_quote_versions_one_offered"))).toBe(false);
  });
```

- [ ] **Step 5: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-040.test.ts tests/db/migration-030.test.ts`
Expected: FAIL. migration-040 fails with `ENOENT … 040_quote_options.sql`, and migration-030's new test fails because 030 still names the constraint.

- [ ] **Step 6: Write migration 040**

Create `db/migrations/040_quote_options.sql`:

```sql
-- Quote options (spec docs/superpowers/specs/2026-10-02-quote-options-design.md)
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments.

-- One row per extra quote option of a job, B to Z. Option A is never stored: every job has it.
create table if not exists quote_options (
  lead_id    uuid not null references leads(id) on delete cascade,
  letter     text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (lead_id, letter)
);

alter table quote_options drop constraint if exists quote_options_letter_check;
alter table quote_options add constraint quote_options_letter_check check (
  letter ~ '^[B-Z]$'
);

-- Every DC version belongs to an option. Existing rows become option A, so every existing quote reads as before.
alter table dc_quote_versions add column if not exists option text not null default 'A';

alter table dc_quote_versions drop constraint if exists dc_quote_versions_option_check;
alter table dc_quote_versions add constraint dc_quote_versions_option_check check (
  option ~ '^[A-Z]$'
);

-- Versions are numbered within an option. 024 declared unique (lead_id, version) inline, so Postgres named it
-- dc_quote_versions_lead_id_version_key (confirmed on the Neon test branch before this file was written).
alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_id_version_key;
alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_option_version_key;
alter table dc_quote_versions add constraint dc_quote_versions_lead_option_version_key unique (lead_id, option, version);

-- At most one offered version per option of a job. Deferred to commit, because Send quote supersedes the old
-- offered version and offers the new one in ONE statement (see 030 for the history).
-- This file is the only one that defines the rule. 030 defined it per job until 2026-10-02, and re-adding that
-- on every migrate run would fail once a job has two options offered at once. Never migrate production from a
-- checkout without this file (the stale-worktree rule).
alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered;
alter table dc_quote_versions add constraint dc_quote_versions_one_offered
  exclude using btree (lead_id with =, option with =) where (status = 'offered') deferrable initially deferred;
```

- [ ] **Step 7: Remove the per-job rule from 030**

In `db/migrations/030_deposit_flow.sql`, replace this block:

```sql
-- At most one offered version per job. An exclusion constraint deferred to commit rather than a unique
-- index, because Send quote supersedes the old offered version and offers the new one in ONE statement,
-- and a unique index would be checked row by row in whichever order Postgres runs the two updates.
alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered;

alter table dc_quote_versions add constraint dc_quote_versions_one_offered
  exclude using btree (lead_id with =) where (status = 'offered') deferrable initially deferred;
```

with:

```sql
-- At most one offered version: an exclusion constraint deferred to commit rather than a unique index, because
-- Send quote supersedes the old offered version and offers the new one in ONE statement, and a unique index would
-- be checked row by row in whichever order Postgres runs the two updates.
-- The rule now lives in 040_quote_options.sql, per option. It was defined here per job until 2026-10-02, and
-- re-adding the per-job rule on every migrate run would fail once a job has two options offered at once.
```

- [ ] **Step 8: Run the migration tests**

Run: `npx vitest run --maxWorkers=2 tests/db`
Expected: PASS (all migration tests, including `migration-checks-consistent`).

- [ ] **Step 9: Commit**

```bash
git add db/migrations/040_quote_options.sql db/migrations/030_deposit_flow.sql tests/db/migration-040.test.ts tests/db/migration-030.test.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: migration 040 adds quote options; the one-offered rule is per option and lives only in 040" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Mutation check (the guard test)**

Put the two removed statements back at the end of `db/migrations/030_deposit_flow.sql`:

```sql
alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered;
alter table dc_quote_versions add constraint dc_quote_versions_one_offered
  exclude using btree (lead_id with =) where (status = 'offered') deferrable initially deferred;
```

Run: `npx vitest run --maxWorkers=2 tests/db/migration-040.test.ts tests/db/migration-030.test.ts`
Expected: FAIL. Both "is the only migration…" and "leaves the one-offered rule to 040" fail. Restore: `git checkout -- db/migrations/030_deposit_flow.sql`, and the tests PASS again.

- [ ] **Step 11: Apply all migrations to the test branch, twice**

`scripts/migrate.mjs` reads `.env.local` before it looks at `MIGRATE_DATABASE_URL`, and a fresh worktree has none. Create an empty one (it is gitignored, and it must stay empty: never copy production credentials into it):

```bash
test -e .env.local || : > .env.local
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs | grep -E "^Using|040_quote_options" 
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs | grep -E "^Using|040_quote_options"
```

Expected: both runs print `Using MIGRATE_DATABASE_URL -> ep-…` (a test-branch host, never `ep-cold-term`) and the eleven `040_quote_options.sql:` lines, with no error.

- [ ] **Step 12: Read the constraints back (read-only)**

Re-run the Step 3 command.
Expected: `dc_quote_versions_lead_id_version_key` is gone. `dc_quote_versions_lead_option_version_key` reads `UNIQUE (lead_id, option, version)`. `dc_quote_versions_one_offered` reads `EXCLUDE USING btree (lead_id WITH =, option WITH =) WHERE ((status = 'offered'::text)) DEFERRABLE INITIALLY DEFERRED`. `dc_quote_versions_option_check` is present.

---

### Task 2: `formatOptionNo` and the PO parser

**Files:**
- Modify: `lib/portal/project-no.ts`
- Modify: `lib/dc/types.ts` (`DcQuote`)
- Modify: `lib/dc/parse.ts` (`PO` constant and the `po` check)
- Test: `tests/portal/project-no.test.ts`, `tests/dc/parse.test.ts`

**Interfaces:**
- Produces: `formatOptionNo(n: number | null | undefined, option: string): string | null` (`PSS-1042` for `"A"`, `PSS-1042-B` for `"B"`, null without a number or for anything but one capital letter). `DcQuote.option: string` (`"A"` for `PSS-1042`, `"B"`…`"Z"` for `PSS-1042-B`…).

- [ ] **Step 1: Write the failing tests**

Append to `tests/portal/project-no.test.ts` (and change its import line to `import { formatOptionNo, formatProjectNo } from "@/lib/portal/project-no";`):

```ts
describe("formatOptionNo", () => {
  it("is the job's own number for option A", () => {
    expect(formatOptionNo(1042, "A")).toBe("PSS-1042");
  });

  it("adds the letter for options B to Z, padded like the project number", () => {
    expect(formatOptionNo(1042, "B")).toBe("PSS-1042-B");
    expect(formatOptionNo(7, "Z")).toBe("PSS-0007-Z");
    expect(formatOptionNo(120456, "C")).toBe("PSS-120456-C");
  });

  it("is null without a project number, or for anything but one capital letter", () => {
    expect(formatOptionNo(null, "B")).toBeNull();
    expect(formatOptionNo(undefined, "A")).toBeNull();
    for (const bad of ["b", "AA", "", "-", "1"]) expect(formatOptionNo(1042, bad)).toBeNull();
  });
});
```

Append to `tests/dc/parse.test.ts`:

```ts
describe("parseDealerCopy — PO Reference and quote options", () => {
  const withPo = (po: string) => {
    const html = ONE.replace("<td>PSS-1042</td>", `<td>${po}</td>`);
    if (html === ONE && po !== "PSS-1042") throw new Error("fixture has no PSS-1042 cell");
    return html;
  };

  it("PSS-1042 is option A of job 1042", () => {
    const quote = ok(withPo("PSS-1042"));
    expect(quote).toMatchObject({ projectNo: 1042, option: "A", poReference: "PSS-1042" });
  });

  it("PSS-1042-B is option B of job 1042", () => {
    const quote = ok(withPo("PSS-1042-B"));
    expect(quote).toMatchObject({ projectNo: 1042, option: "B", poReference: "PSS-1042-B" });
  });

  it.each(["PSS-1042-A", "PSS-1042-b", "PSS-1042-", "PSS-1042-BB", "PSS-1042 B"])("refuses %s as no-po: A is never written, letters are capitals", (po) => {
    const result = parseDealerCopy(withPo(po));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.outcome).toBe("no-po");
  });

  it("refuses a PO Reference over DC's 20-character limit", () => {
    expect(ok(withPo("PSS-12345678901234-B")).option).toBe("B"); // 20 characters
    const result = parseDealerCopy(withPo("PSS-123456789012345-B")); // 21 characters
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.outcome).toBe("no-po");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/project-no.test.ts tests/dc/parse.test.ts`
Expected: FAIL. `formatOptionNo` is not exported, `option` is undefined, and `PSS-1042-B` is refused as no-po.

- [ ] **Step 3: Implement**

`lib/portal/project-no.ts`, the whole file:

```ts
/** The customer-facing project number. Internal ids never reach the portal. */
export const formatProjectNo = (n: number | null | undefined): string | null =>
  typeof n === "number" ? `PSS-${String(n).padStart(4, "0")}` : null;

/**
 * A quote option's number (quote options spec §2): option A is the job's own number (PSS-1042), option B
 * is PSS-1042-B, and so on to Z. Null without a project number, or for anything but one capital letter.
 */
export const formatOptionNo = (n: number | null | undefined, option: string): string | null => {
  const projectNo = formatProjectNo(n);
  if (projectNo === null || !/^[A-Z]$/.test(option)) return null;
  return option === "A" ? projectNo : `${projectNo}-${option}`;
};
```

`lib/dc/types.ts`: in `DcQuote`, after `projectNo: number;` add:

```ts
  /** The quote option (quote options spec §2): "A" for PSS-1042, "B"–"Z" for PSS-1042-B … PSS-1042-Z. */
  option: string;
```

`lib/dc/parse.ts`: replace `const PO = /^PSS-(\d{4,})$/;` with:

```ts
/** PSS-1042 is the job's own quote (option A). PSS-1042-B … PSS-1042-Z are its other options. A is never written. */
const PO = /^PSS-(\d{4,})(?:-([B-Z]))?$/;
/** DC's PO Reference field holds at most 20 characters. */
const PO_MAX = 20;
```

Then replace:

```ts
  const po = PO.exec(poReference);
  if (!po) return refusal("no-po", `Quote ${quoteNo} has PO Reference "${poReference}"`);
```

with:

```ts
  const po = poReference.length <= PO_MAX ? PO.exec(poReference) : null;
  if (!po) return refusal("no-po", `Quote ${quoteNo} has PO Reference "${poReference}"`);
```

and in the returned `quote`, replace `quoteNo, poReference, projectNo: Number(po[1]), clientName: valueAfter("Client:") ?? "",` with:

```ts
      quoteNo, poReference, projectNo: Number(po[1]), option: po[2] ?? "A", clientName: valueAfter("Client:") ?? "",
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/portal/project-no.test.ts tests/dc/parse.test.ts tests/dc/import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/project-no.ts lib/dc/types.ts lib/dc/parse.ts tests/portal/project-no.test.ts tests/dc/parse.test.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: PSS-1042-B parses as option B of job 1042; formatOptionNo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutation checks**

1. In `lib/dc/parse.ts` change `[B-Z]` to `[A-Z]` in `PO`. Run `npx vitest run --maxWorkers=2 tests/dc/parse.test.ts`. Expected: FAIL on `refuses PSS-1042-A`. Restore with `git checkout -- lib/dc/parse.ts`.
2. In `lib/dc/parse.ts` change `poReference.length <= PO_MAX ? PO.exec(poReference) : null` to `PO.exec(poReference)`. Run the same. Expected: FAIL on the 21-character test. Restore with `git checkout -- lib/dc/parse.ts`, and the tests PASS.

---

### Task 3: The store, per option

**Files:**
- Modify: `lib/dc/store.ts` (`StoredVersion`, `latestSha`, `importVersion`, `listVersions`, plus three new functions and one constant)
- Modify: `tests/dc/store.test.ts`
- Modify (fixtures only, for typecheck): `tests/dc/send.test.ts` (the `version` literal), `tests/dc/quote-review.test.tsx` (the `version()` builder)

**Interfaces:**
- Consumes: `DcQuote.option` (Task 2).
- Produces:
  - `StoredVersion.option: string`
  - `latestSha(leadId: string, option: string): Promise<string | null>` (null when the option has no versions, or when its newest is `superseded`/`cancelled`)
  - `importVersion(...)`: same signature, numbers per `(lead, option)` and stores `option`
  - `quoteOptionExists(leadId: string, option: string): Promise<boolean>`
  - `listQuoteOptions(leadId: string): Promise<string[]>` (`["A", …stored letters]`)
  - `addQuoteOption(leadId: string, actor: string): Promise<{ letter: string } | { error: string }>`
  - `OPTION_SIGNED = "This job has a signed quote. Make changes as a new version of the signed option."`

- [ ] **Step 1: Update the two fixtures so the type change compiles**

In `tests/dc/send.test.ts`, in `const version: StoredVersion = {`, change the first line `id: V1, leadId: JOB, version: 1, dcQuoteNo: quote.quoteNo, poReference: quote.poReference,` to:

```ts
  id: V1, leadId: JOB, version: 1, option: "A", dcQuoteNo: quote.quoteNo, poReference: quote.poReference,
```

In `tests/dc/quote-review.test.tsx`, in `const version = (over: Partial<StoredVersion> = {}): StoredVersion => ({`, change `id: V, leadId: J, version: 2, dcQuoteNo: "12345678",` to:

```ts
  id: V, leadId: J, version: 2, option: "A", dcQuoteNo: "12345678",
```

- [ ] **Step 2: Write the failing store tests**

In `tests/dc/store.test.ts`, replace the `describe("listVersions", …)` block with:

```ts
describe("listVersions", () => {
  const row = { id: VERSION, lead_id: JOB, version: 1, dc_quote_no: "1", po_reference: "PSS-1042", client_name: "Jane Client",
    source_file_id: FILE, source_sha256: "x", status: "draft", dealer_subtotal_cents: 1, handling_fee_cents: 0, oversized_fee_cents: 0,
    dealer_total_cents: 1, created_at: new Date().toISOString(),
    quote_file_id: "q1", offered_at: "2026-09-21T18:00:00.000Z", approved_at: null, option: "A" };
  it("reads the DC Client name back", async () => {
    sql.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    const [version] = await store.listVersions(JOB);
    expect(version.clientName).toBe("Jane Client");
    expect(version).toMatchObject({ quoteFileId: "q1", offeredAt: new Date("2026-09-21T18:00:00.000Z"), approvedAt: null });
  });
  it("reads each version's option back", async () => {
    sql.mockResolvedValueOnce([{ ...row, option: "B", po_reference: "PSS-1042-B" }]).mockResolvedValueOnce([]);
    const [version] = await store.listVersions(JOB);
    expect(version.option).toBe("B");
  });
});
```

Append to `tests/dc/store.test.ts`:

```ts
/** The values bound right after each template part ending with `fragment`, in order. */
const after = (call: unknown[], fragment: string) => {
  const strings = call[0] as TemplateStringsArray;
  return strings.map((part, i) => [part.replace(/\s+/g, " "), call[1 + i]] as const)
    .filter(([part]) => part.endsWith(fragment)).map(([, value]) => value);
};

describe("quote options in the store (spec §2, §4)", () => {
  const B_QUOTE = { ...parsed.quote, option: "B", poReference: "PSS-1042-B" };

  it("importVersion stores the option and numbers the version within it", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: B_QUOTE, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    const call = sql.mock.calls[0];
    const s = text(call);
    expect(s).toContain("insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, client_name, source_file_id");
    expect(s).toContain("coalesce((select max(version) from dc_quote_versions where lead_id = ? and option = ?), 0) + 1");
    expect(after(call, "and option = ")).toEqual(["B"]);
    expect(call.slice(1)).toContain("Direct Connect quote 22250749 arrived as PSS-1042-B version ");
  });

  it("an option A import keeps today's event wording", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    expect(sql.mock.calls[0].slice(1)).toContain("Direct Connect quote 22250749 arrived as version ");
    expect(after(sql.mock.calls[0], "and option = ")).toEqual(["A"]);
  });

  it("latestSha reads the newest version of that option only", async () => {
    sql.mockResolvedValueOnce([{ source_sha256: "s1", status: "offered" }]);
    expect(await store.latestSha(JOB, "B")).toBe("s1");
    expect(text(sql.mock.calls[0])).toContain("from dc_quote_versions where lead_id = ? and option = ? order by version desc limit 1");
    expect(sql.mock.calls[0].slice(1)).toEqual([JOB, "B"]);
  });

  it.each(["superseded", "cancelled"])("latestSha is null when the option's newest version is %s, so an unchanged re-send comes back as a draft", async (status) => {
    sql.mockResolvedValueOnce([{ source_sha256: "s1", status }]);
    expect(await store.latestSha(JOB, "A")).toBeNull();
  });

  it("latestSha is null for an option with no versions", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.latestSha(JOB, "C")).toBeNull();
  });

  it("option A always exists; B–Z exist once stored; anything else never, and without a query", async () => {
    expect(await store.quoteOptionExists(JOB, "A")).toBe(true);
    expect(sql).not.toHaveBeenCalled();
    sql.mockResolvedValueOnce([{ exists: 1 }]);
    expect(await store.quoteOptionExists(JOB, "B")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("select 1 from quote_options where lead_id = ? and letter = ?");
    sql.mockResolvedValueOnce([]);
    expect(await store.quoteOptionExists(JOB, "C")).toBe(false);
    sql.mockClear();
    expect(await store.quoteOptionExists(JOB, "b")).toBe(false);
    expect(await store.quoteOptionExists("x", "B")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("lists option A first, then every stored letter in order", async () => {
    sql.mockResolvedValueOnce([{ letter: "B" }, { letter: "C" }]);
    expect(await store.listQuoteOptions(JOB)).toEqual(["A", "B", "C"]);
    expect(text(sql.mock.calls[0])).toContain("select letter from quote_options where lead_id = ? order by letter");
    sql.mockClear();
    expect(await store.listQuoteOptions("x")).toEqual(["A"]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("addQuoteOption (spec §3)", () => {
  it("in ONE statement adds the next letter and logs it, only on a job that is not Lost, has no signed version, has a number and is short of Z", async () => {
    sql.mockResolvedValueOnce([{ letter: "B", status: "quoted", signed: false, project_no: 1042, code: 66 }]);
    expect(await store.addQuoteOption(JOB, "o@x.com")).toEqual({ letter: "B" });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "exists (select 1 from dc_quote_versions v where v.lead_id = leads.id and v.status = 'signed') as signed",
      "select coalesce(max(ascii(letter)), ascii('A')) + 1 as code from quote_options where lead_id = ?",
      "insert into quote_options (lead_id, letter, created_by) select job.id, chr(slot.code), ? from job, slot",
      "where job.status <> 'lost' and not job.signed and job.project_no is not null and slot.code <= ascii('Z')",
      "on conflict (lead_id, letter) do nothing",
      "select added.lead_id, ?, 'quote', 'Added quote option PSS-' || lpad(job.project_no::text, greatest(4, length(job.project_no::text)), '0') || '-' || added.letter from added, job",
      "select (select letter from added) as letter, job.status, job.signed, job.project_no, slot.code from job, slot",
    ]) expect(s).toContain(part);
  });

  it.each([
    [{ letter: null, status: "lost", signed: false, project_no: 1042, code: 66 }, "This job is marked Lost."],
    [{ letter: null, status: "signed", signed: true, project_no: 1042, code: 66 }, "This job has a signed quote. Make changes as a new version of the signed option."],
    [{ letter: null, status: "quoted", signed: false, project_no: null, code: 66 }, "This job has no PSS number yet."],
    [{ letter: null, status: "quoted", signed: false, project_no: 1042, code: 91 }, "This job already has options A to Z."],
    [{ letter: null, status: "quoted", signed: false, project_no: 1042, code: 67 }, "Another quote option was just added. Reload and try again."],
  ])("refuses with the reason read in the same statement (%o)", async (row, error) => {
    sql.mockResolvedValueOnce([row]);
    expect(await store.addQuoteOption(JOB, "o@x.com")).toEqual({ error });
  });

  it("refuses a job that does not exist, and never queries a malformed id", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.addQuoteOption(JOB, "o@x.com")).toEqual({ error: "This job no longer exists." });
    sql.mockClear();
    expect(await store.addQuoteOption("x", "o@x.com")).toEqual({ error: "This job no longer exists." });
    expect(sql).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/store.test.ts`
Expected: FAIL. `latestSha` ignores the option, there is no `option` column in the insert, and `quoteOptionExists` / `listQuoteOptions` / `addQuoteOption` are not functions.

- [ ] **Step 4: Implement in `lib/dc/store.ts`**

In `StoredVersion`, after `id: string; leadId: string; version: number; dcQuoteNo: string; poReference: string;` add:

```ts
  /** The quote option (quote options spec §2): "A" is the job's own number, "B"–"Z" its other options (migration 040). */
  option: string;
```

Replace `latestSha` with:

```ts
/**
 * The fingerprint of this option's newest version, or null when the option has none — or when that version is
 * superseded or cancelled (quote options spec §4): re-sending an unchanged Dealer Copy for a closed option brings
 * it back as a new draft, which is how the owner switches the client to it.
 */
export async function latestSha(leadId: string, option: string): Promise<string | null> {
  const rows = await db()`
    select source_sha256, status from dc_quote_versions where lead_id = ${leadId} and option = ${option} order by version desc limit 1`;
  const row = rows[0];
  if (!row || row.status === "superseded" || row.status === "cancelled") return null;
  return row.source_sha256 as string;
}

/** Option A always exists. B–Z exist once Add another quote stored them (the release gate, quote options spec §4). */
export async function quoteOptionExists(leadId: string, option: string): Promise<boolean> {
  if (option === "A") return true;
  if (!isUuid(leadId) || !/^[B-Z]$/.test(option)) return false;
  const rows = await db()`select 1 from quote_options where lead_id = ${leadId} and letter = ${option}`;
  return rows.length > 0;
}

/** The job's options, A first: A always, then every stored letter in order. */
export async function listQuoteOptions(leadId: string): Promise<string[]> {
  if (!isUuid(leadId)) return ["A"];
  const rows = await db()`select letter from quote_options where lead_id = ${leadId} order by letter`;
  return ["A", ...rows.map((r) => r.letter as string)];
}

export const OPTION_SIGNED = "This job has a signed quote. Make changes as a new version of the signed option.";

/**
 * Quote options spec §3, Add another quote. ONE statement inserts the next free letter (B when none) and logs a
 * 'quote' event naming its number, only while the job is not Lost, has no signed version, has a PSS number and is
 * short of Z. The refusal's reason is read in the same statement. A second click racing the first meets the
 * primary key, inserts nothing and is told to reload.
 */
export async function addQuoteOption(leadId: string, actor: string): Promise<{ letter: string } | { error: string }> {
  const NO_JOB = { error: "This job no longer exists." };
  if (!isUuid(leadId)) return NO_JOB;
  const [row] = await db()`
    with job as (
      select id, status, project_no,
        exists (select 1 from dc_quote_versions v where v.lead_id = leads.id and v.status = 'signed') as signed
      from leads where id = ${leadId}
    ),
    slot as (
      select coalesce(max(ascii(letter)), ascii('A')) + 1 as code from quote_options where lead_id = ${leadId}
    ),
    added as (
      insert into quote_options (lead_id, letter, created_by)
      select job.id, chr(slot.code), ${actor} from job, slot
      where job.status <> 'lost' and not job.signed and job.project_no is not null and slot.code <= ascii('Z')
      on conflict (lead_id, letter) do nothing
      returning lead_id, letter
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select added.lead_id, ${actor}, 'quote', 'Added quote option PSS-' || lpad(job.project_no::text, greatest(4, length(job.project_no::text)), '0') || '-' || added.letter from added, job
    )
    select (select letter from added) as letter, job.status, job.signed, job.project_no, slot.code from job, slot`;
  if (!row) return NO_JOB;
  if (row.letter) return { letter: row.letter as string };
  if (row.status === "lost") return { error: "This job is marked Lost." };
  if (row.signed === true) return { error: OPTION_SIGNED };
  if (row.project_no === null) return { error: "This job has no PSS number yet." };
  if (Number(row.code) > 90) return { error: "This job already has options A to Z." };
  return { error: "Another quote option was just added. Reload and try again." };
}
```

In `importVersion`, update the docblock's first sentence to `One statement: the message record, the version (numbered max+1 within its option), every line and the timeline event.` Add this line before `const rows = await db()`:

```ts
  // Option A keeps the wording it always had. Another option names its number, which the release gate made the PO.
  const arrived = q.option === "A" ? `Direct Connect quote ${q.quoteNo} arrived as version ` : `Direct Connect quote ${q.quoteNo} arrived as ${q.poReference} version `;
```

Then replace the `version as ( … )` CTE and the `logged as ( … )` CTE with:

```ts
    version as (
      insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, client_name, source_file_id, source_sha256,
        message_id, status, dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, ${input.leadId}, ${q.option},
        coalesce((select max(version) from dc_quote_versions where lead_id = ${input.leadId} and option = ${q.option}), 0) + 1,
        ${q.quoteNo}, ${q.poReference}, ${q.clientName}, ${input.sourceFileId}, ${input.sha256}, msg.message_id, 'draft',
        ${q.subtotalCents}, ${q.handlingFeeCents}, ${q.oversizedFeeCents}, ${q.dealerTotalCents}
      from msg
      returning id, lead_id, version
    ),
```

```ts
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'quote', ${arrived} || version from version
    )
```

In `listVersions`, in the mapped object, after `id: v.id as string, leadId: v.lead_id as string, version: Number(v.version), dcQuoteNo: v.dc_quote_no as string,` add:

```ts
    option: (v.option as string | null) ?? "A",
```

- [ ] **Step 5: Fix `lib/dc/import.ts`'s call so it compiles (behaviour comes in Task 4)**

In `lib/dc/import.ts`, replace `if ((await latestSha(job.id)) === sha256) {` with `if ((await latestSha(job.id, quote.option)) === sha256) {`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/dc` then `npm run typecheck`
Expected: PASS and no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/dc/store.ts lib/dc/import.ts tests/dc/store.test.ts tests/dc/send.test.ts tests/dc/quote-review.test.tsx
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: versions are stored and numbered per quote option; Add another quote in one statement" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Mutation checks**

1. In `latestSha`, delete ` and option = ${option}`. Run `npx vitest run --maxWorkers=2 tests/dc/store.test.ts`. Expected: FAIL (`latestSha reads the newest version of that option only`). Restore with `git checkout -- lib/dc/store.ts`.
2. In `latestSha`, change the guard to `if (!row) return null;`. Run the same. Expected: FAIL (the `superseded`/`cancelled` cases). Restore.
3. In `addQuoteOption`'s `added` CTE, delete `and not job.signed `. Run the same. Expected: FAIL (the one-statement test). Restore.
4. In `importVersion`, delete ` and option = ${q.option}` from the `max(version)` subselect. Run the same. Expected: FAIL. Restore, and the tests PASS.

---

### Task 4: The import gate and the import emails

**Files:**
- Modify: `lib/dc/import.ts` (`tell`, the release gate, the imported email)
- Modify: `lib/dc/notify.ts` (`importEmail`'s `no-match` text)
- Test: `tests/dc/import.test.ts`, `tests/dc/notify.test.ts`

**Interfaces:**
- Consumes: `DcQuote.option`, `formatOptionNo` (Task 2), `quoteOptionExists`, `latestSha(leadId, option)` (Task 3).
- Produces: no new exports. `importDealerCopy` imports `PSS-1042-B` onto job 1042 only once `quote_options` holds `B`.

- [ ] **Step 1: Write the failing tests**

In `tests/dc/import.test.ts`:
- Change the store mock line to `isProcessed: vi.fn(), recordOutcome: vi.fn(), findJobByProjectNo: vi.fn(), latestSha: vi.fn(), quoteOptionExists: vi.fn(),`.
- In `beforeEach`, after `store.latestSha.mockResolvedValue(null);`, add `store.quoteOptionExists.mockResolvedValue(true);`.

Then append inside `describe("importDealerCopy", …)`:

```ts
  describe("quote options (spec §4)", () => {
    const B_COPY = ONE.replace("<td>PSS-1042</td>", "<td>PSS-1042-B</td>");

    it("imports PSS-1042-B onto job 1042's option B once the option was added, compared and named as B", async () => {
      expect(B_COPY).not.toBe(ONE);
      store.findJobByProjectNo.mockResolvedValue(JOB_A);
      const result = await importDealerCopy({ ...input, html: B_COPY });
      expect(result).toMatchObject({ outcome: "imported", leadId: JOB_A.id });
      expect(store.quoteOptionExists).toHaveBeenCalledWith(JOB_A.id, "B");
      expect(store.latestSha).toHaveBeenCalledWith(JOB_A.id, "B");
      expect(store.importVersion).toHaveBeenCalledWith(expect.objectContaining({ quote: expect.objectContaining({ option: "B", poReference: "PSS-1042-B" }) }));
      expect(notify.importEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "imported", projectNo: "PSS-1042-B" }));
    });

    it("RELEASE GATE: PSS-1042-B on a job with no option B is no-match, and nothing is filed", async () => {
      store.findJobByProjectNo.mockResolvedValue(JOB_A);
      store.quoteOptionExists.mockResolvedValue(false);
      const result = await importDealerCopy({ ...input, html: B_COPY });
      expect(result).toMatchObject({ outcome: "no-match", leadId: null, detail: "PSS-1042-B" });
      expect(files.createFile).not.toHaveBeenCalled();
      expect(store.importVersion).not.toHaveBeenCalled();
      expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-match", leadId: null, detail: "PSS-1042-B" }));
    });

    it("an option A copy is compared with option A's newest version and emailed under the job's own number", async () => {
      store.findJobByProjectNo.mockResolvedValue(JOB_A);
      await importDealerCopy(input);
      expect(store.latestSha).toHaveBeenCalledWith(JOB_A.id, "A");
      expect(notify.importEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "imported", projectNo: "PSS-1042" }));
    });
  });
```

Append to `tests/dc/notify.test.ts`, inside `describe("importEmail", …)`:

```ts
  it("a no-match for an option number says to add the option first", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: "PSS-1042-B" });
    expect(email?.text).toContain("DC quote 22250749 names PSS-1042-B, but that job has no quote option B yet. Add it with Add another quote on the job's Quote tab, then send the Dealer Copy again.");
    expect(email?.text).not.toContain("no job has that number");
  });
  it("an import of an option names the option's number", () => {
    const email = importEmail({ outcome: "imported", dcQuoteNo: "22250749", projectNo: "PSS-1042-B", jobId: "j1", version: 1, detail: null });
    expect(email?.subject).toBe("PSS-1042-B: quote v1 ready to review");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/import.test.ts tests/dc/notify.test.ts`
Expected: FAIL. The B copy is no-match because `formatProjectNo(1042) !== "PSS-1042-B"`, `quoteOptionExists` is never called, and the no-match text lacks the option sentence.

- [ ] **Step 3: Implement**

`lib/dc/import.ts`:
- Change the import `import { formatProjectNo } from "@/lib/portal/project-no";` to `import { formatOptionNo } from "@/lib/portal/project-no";`.
- Change the store import to `import { findJobByProjectNo, getDcSettings, importVersion, isProcessed, latestSha, quoteOptionExists, recordOutcome, setLastPolledAt } from "./store";`.
- Replace `tell` with:

```ts
/** `optionNo` is the printed number of the option the copy was imported onto (PSS-1042 or PSS-1042-B), null when none. */
async function tell(result: Result, dcQuoteNo: string | null, optionNo: string | null) {
  const email = importEmail({ ...result, dcQuoteNo, projectNo: optionNo, jobId: result.leadId });
  if (email) await notifyOwners(email).catch((error) => console.error("DC import email failed", error));
}
```

- Replace the release-gate lines:

```ts
  // The release gate: the job is found by the exact PSS number in PO Reference, or not at all.
  // "Exact" is the printed text: PSS-01042 names 1042 as a number but is not job 1042's number.
  const found = await findJobByProjectNo(quote.projectNo);
  const job = found && formatProjectNo(found.projectNo) === quote.poReference ? found : null;
```

with:

```ts
  // The release gate: the job is found by the exact PSS number in PO Reference, or not at all.
  // "Exact" is the printed text: PSS-01042 names 1042 as a number but is not job 1042's number.
  // Options B–Z (quote options spec §4) must also have been added on the job: a typo never creates one.
  const found = await findJobByProjectNo(quote.projectNo);
  const job = found && formatOptionNo(found.projectNo, quote.option) === quote.poReference
    && (await quoteOptionExists(found.id, quote.option)) ? found : null;
```

- Replace `await tell(result, quote.quoteNo, job.projectNo);` (the imported case near the end of `importDealerCopy`) with `await tell(result, quote.quoteNo, formatOptionNo(job.projectNo, quote.option));`. The two other `tell(…, null)` calls stay as they are.

`lib/dc/notify.ts`: in `importEmail`, replace the `case "no-po": case "no-match":` return with:

```ts
    case "no-po":
    case "no-match": {
      // PSS-1042-B matched job 1042 but no option B: the owner forgot Add another quote (quote options spec §4).
      const option = input.outcome === "no-match" && input.detail ? /^PSS-\d{4,}-([B-Z])$/.exec(input.detail)?.[1] ?? null : null;
      const why = input.outcome === "no-po"
        ? `${quote} has no valid PSS number in PO Reference (${input.detail ?? "blank"}).`
        : option
          ? `${quote} names ${input.detail}, but that job has no quote option ${option} yet. Add it with Add another quote on the job's Quote tab, then send the Dealer Copy again.`
          : `${quote} names ${input.detail ?? "a PSS number"} but no job has that number.`;
      return { subject: `${quote} could not be matched to a job`,
        text: lines(why, "", "Open the quote in Direct Connect, put the job's number (e.g. PSS-1042) in PO Reference, save, and send the Dealer Copy again.", HOW_TO_SEND) };
    }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/dc`
Expected: PASS (including every existing import and notify test).

- [ ] **Step 5: Commit**

```bash
git add lib/dc/import.ts lib/dc/notify.ts tests/dc/import.test.ts tests/dc/notify.test.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: a Dealer Copy for PSS-1042-B imports onto option B only once it was added" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutation check**

In `lib/dc/import.ts`, delete `&& (await quoteOptionExists(found.id, quote.option))` (keep the rest of the expression). Run `npx vitest run --maxWorkers=2 tests/dc/import.test.ts`. Expected: FAIL on `RELEASE GATE: PSS-1042-B on a job with no option B is no-match`. Restore with `git checkout -- lib/dc/import.ts`, and the tests PASS.

---

### Task 5: Review, preview and send, per option

**Files:**
- Modify: `lib/dc/send.ts` (`review`, `loadReview`, `previewQuote`, `sendQuote`, `sendContract`, plus a new export)
- Test: `tests/dc/send.test.ts`

**Interfaces:**
- Consumes: `StoredVersion.option` (Task 3), `formatOptionNo` (Task 2).
- Produces:
  - `loadReview(jobId: string, option = "A"): Promise<Review | null>`
  - `previewQuote(jobId: string, option = "A"): Promise<{ pdf: Uint8Array; name: string } | { error: string }>`
  - `sendQuote` and `sendContract`: same signatures. They work on the posted version's option.
  - `signedElsewhere(option: string): string` → `Option A is signed. Make changes as a new version of Option A.`

- [ ] **Step 1: Write the failing tests**

In `tests/dc/send.test.ts`, in the test `a quote re-sent after approval supersedes the old one, …`, replace the line `expect(superseded).toContain("status in ('draft','offered','sent') and id <> ? and exists (select 1 from offered)");` with:

```ts
    expect(superseded).toContain("status in ('draft','offered','sent') and id <> ? and (option = ? or approved_at is not null) and exists (select 1 from offered)");
```

Append to `tests/dc/send.test.ts`:

```ts
/** The values bound right after each template part ending with `fragment`, in order. */
const after = (call: unknown[], fragment: string) => {
  const strings = call[0] as TemplateStringsArray;
  return strings.map((part, i) => [part.replace(/\s+/g, " "), call[1 + i]] as const)
    .filter(([part]) => part.endsWith(fragment)).map(([, value]) => value);
};

describe("quote options (spec §5)", () => {
  const VB = "12121212-1212-4121-8121-121212121212";
  const optionB: StoredVersion = { ...version, id: VB, option: "B", poReference: "PSS-1042-B" };

  it("reviews each option on its own: its newest version and its own older versions", async () => {
    const olderB = { ...optionB, id: V0, version: 0, status: "superseded" as const };
    store.listVersions.mockResolvedValue([{ ...version, version: 3 }, optionB, olderB]);
    const b = await loadReview(JOB, "B");
    expect(b!.version.id).toBe(VB);
    expect(b!.olderVersions.map((v) => v.id)).toEqual([V0]);
    const a = await loadReview(JOB);
    expect(a!.version.id).toBe(V1);
    expect(a!.olderVersions).toEqual([]);
    expect(await loadReview(JOB, "C")).toBeNull();
  });

  it("sends option B under its own number, newest within B, superseding B's others and any option the client approved", async () => {
    store.listVersions.mockResolvedValue([version, optionB]);
    const review = await loadReview(JOB, "B");
    expect(await sendQuote({ jobId: JOB, versionId: VB, fingerprint: review!.fingerprint, actor: OWNER })).toEqual({ ok: true, emailed: true });
    expect(createFile).toHaveBeenCalledWith(expect.objectContaining({ name: "Quote PSS-1042-B v1.pdf", docType: "quote" }));
    expect(quotePdf.buildQuotePdf.mock.calls[0][0]).toMatchObject({ projectNo: "PSS-1042-B", version: 1 });
    expect(quoteEmail.sendQuoteEmail).toHaveBeenCalledWith(job, "Quote PSS-1042-B v1.pdf");
    const call = sql.mock.calls[0];
    const s = text(call);
    const offeredCte = s.slice(s.indexOf("offered as ("), s.indexOf("priced_lines as ("));
    expect(offeredCte).toContain("and version = (select max(version) from dc_quote_versions where lead_id = ? and option = ?)");
    expect(after(call, "and option = ")).toEqual(["B"]);
    expect(after(call, "and (option = ")).toEqual(["B"]);
    expect(call.slice(1)).toContain(`Sent Quote PSS-1042-B v1.pdf for ${formatCents(review!.priced.clientTotalCents)}`);
  });

  it("refuses while another option is signed: a blocker on the review, and nothing written", async () => {
    const signedA: StoredVersion = { ...offered, status: "signed", signedAt: new Date("2026-09-30T17:00:00Z") };
    store.listVersions.mockResolvedValue([optionB, signedA]);
    const review = await loadReview(JOB, "B");
    expect(review!.blockers).toContain("Option A is signed. Make changes as a new version of Option A.");
    expect(await sendQuote({ jobId: JOB, versionId: VB, fingerprint: review!.fingerprint, actor: OWNER }))
      .toEqual({ error: "Option A is signed. Make changes as a new version of Option A." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("re-checks in the statement that no other option is signed (a signature landing after the review)", async () => {
    store.listVersions.mockResolvedValue([version, optionB]);
    await send();
    const call = sql.mock.calls[0];
    const s = text(call);
    const offeredCte = s.slice(s.indexOf("offered as ("), s.indexOf("priced_lines as ("));
    expect(offeredCte).toContain("and not exists (select 1 from dc_quote_versions s where s.lead_id = ? and s.status = 'signed' and s.option <> ?)");
    expect(after(call, "s.option <> ")).toEqual(["A"]);
  });

  it("a signed earlier version of the SAME option is a change order, not a refusal", async () => {
    store.listVersions.mockResolvedValue([{ ...version, version: 2 }, { ...offered, id: V0, status: "signed" }]);
    expect((await loadReview(JOB))!.blockers).toEqual([]);
  });

  it("previews option B under its number", async () => {
    store.listVersions.mockResolvedValue([version, optionB]);
    expect(await previewQuote(JOB, "B")).toMatchObject({ name: "Quote PSS-1042-B v1 PREVIEW.pdf" });
    expect(quotePdf.buildQuotePdf.mock.calls[0][0]).toMatchObject({ projectNo: "PSS-1042-B" });
  });

  it("sends option B's contract under its number, checking it is the newest within B", async () => {
    const approvedB: StoredVersion = { ...offered, id: VB, option: "B", poReference: "PSS-1042-B" };
    store.listVersions.mockResolvedValue([version, approvedB]);
    jobs.getJob.mockResolvedValue({ ...job, status: "approved" });
    expect(await sendContract({ jobId: JOB, versionId: VB, actor: "Sent on approval" })).toEqual({ ok: true, emailed: true });
    expect(pdf.renderContractPdf.mock.calls[0][0]).toMatchObject({ projectNo: "PSS-1042-B", version: 1 });
    expect(createFile).toHaveBeenCalledWith(expect.objectContaining({ name: "Contract PSS-1042-B v1.pdf", docType: "contract" }));
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("and version = (select max(version) from dc_quote_versions where lead_id = ? and option = ?)");
    expect(after(call, "and option = ")).toEqual(["B"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/send.test.ts`
Expected: FAIL. `loadReview(JOB, "B")` returns option A's version, names carry `PSS-1042`, and there is no signed-elsewhere blocker.

- [ ] **Step 3: Implement in `lib/dc/send.ts`**

- Change `import { formatProjectNo } from "@/lib/portal/project-no";` to `import { formatOptionNo } from "@/lib/portal/project-no";`.
- After the `TERMS_UNREADABLE` constant, add:

```ts
/** Quote options spec §5: once one option is signed, changes are new versions of that option, never a switch. */
export const signedElsewhere = (option: string): string => `Option ${option} is signed. Make changes as a new version of Option ${option}.`;

/** Which option to review: by letter (the Quote tab, Preview), or by a version id (Send quote, Send contract). */
type Which = { option: string } | { versionId: string };
```

- Replace the whole `review` function with:

```ts
/** The review plus the job and settings it was computed from, so Send quote and the contract use the very same reads. */
async function review(jobId: string, which: Which): Promise<{ review: Review; job: Job; settings: DcSettings; termsTemplate: DocumentTemplate | null } | null> {
  const [job, all, rules, installs, settings, termsTemplate] = await Promise.all([
    getJob(jobId), listVersions(jobId), listMarkupRules(), listInstallQuotes(jobId), getDcSettings(), liveTemplateOfKind("terms"),
  ]);
  if (!job) return null;
  // A version id this job never had falls to option A, whose newest version is not it, so the caller answers NEWER.
  const option = "option" in which ? which.option : all.find((v) => v.id === which.versionId)?.option ?? "A";
  const versions = all.filter((v) => v.option === option);
  if (versions.length === 0) return null;
  const [version, ...olderVersions] = versions;
  const choices: InstallChoice[] = installs.map((q) => ({ id: q.id, kind: q.kind, totalCents: q.totalCents, createdAt: q.createdAt }));
  let install: InstallChoice | null;
  let priced: PricedVersion;
  if (version.status === "draft") {
    install = pickInstallQuote(choices);
    priced = priceVersion({
      lines: version.lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection, msrpUnitCents: l.msrpUnitCents, costExtendedCents: l.costExtendedCents, pctOverride: l.pctOverride })),
      rules, handlingFeeCents: version.handlingFeeCents, oversizedFeeCents: version.oversizedFeeCents,
      dealerTotalCents: version.dealerTotalCents, waiveHandling: version.waiveHandling, install, noInstall: version.noInstall,
    });
  } else {
    // Offered, sent, signed, superseded or cancelled: what was sent, never a re-price with today's markup or install price.
    install = version.installQuoteId ? choices.find((q) => q.id === version.installQuoteId) ?? null : null;
    priced = frozenPrice(version);
  }
  const blockers = sendBlockers(priced, {
    hasTerms: termsTemplate !== null || settings.termsPathname !== null, isLatest: true, versionStatus: version.status,
    jobStatus: job.status, customerEmail: job.email,
  });
  const signed = all.find((v) => v.status === "signed" && v.option !== option);
  if (signed) blockers.push(signedElsewhere(signed.option));
  // Shown before Send quote; Send quote and the contract fill and check again with their own `now`.
  if (termsTemplate) {
    const filled = fillTerms(termsTemplate, job, new Date());
    if ("error" in filled) blockers.push(filled.error);
    if (carriesDraftLine(termsTemplate.body)) blockers.push(DRAFT_TERMS);
  }
  return { review: { version, priced, blockers, fingerprint: pricingFingerprint(priced), install, rules, olderVersions }, job, settings, termsTemplate };
}

/** The latest version of one option of a job's DC quote (A unless named), priced exactly as Send quote would price it. */
export async function loadReview(jobId: string, option = "A"): Promise<Review | null> {
  return (await review(jobId, { option }))?.review ?? null;
}
```

- In `previewQuote`, change the signature to `export async function previewQuote(jobId: string, option = "A"): Promise<{ pdf: Uint8Array; name: string } | { error: string }> {` and `const loaded = await review(jobId);` to `const loaded = await review(jobId, { option });`. Replace:

```ts
  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const pdf = await buildQuotePdf(pricedInput(job, version, priced, projectNo, new Date()), { preview: true });
  return { pdf, name: `Quote ${projectNo} v${version.version} PREVIEW.pdf` };
```

with:

```ts
  const optionNo = formatOptionNo(job.projectNo, version.option) ?? "PSS";
  const pdf = await buildQuotePdf(pricedInput(job, version, priced, optionNo, new Date()), { preview: true });
  return { pdf, name: `Quote ${optionNo} v${version.version} PREVIEW.pdf` };
```

- Replace the `sendQuote` docblock's last two sentences with: `… moves New / Appointment booked / Approved to Quoted (an approval of a superseded price no longer stands), and logs it. Quote options spec §5: everything is scoped to the version's option. The supersede set also takes any other option's unsigned version the client approved (sending B after the client approved A is the switch), and the send is refused while another option is signed. The client email goes last: a failed email leaves the quote sent and answers emailed false.`
- In `sendQuote`: change `const loaded = await review(input.jobId);` to `const loaded = await review(input.jobId, { versionId: input.versionId });`. Replace

```ts
  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const name = `Quote ${projectNo} v${version.version}.pdf`;
  const pdf = await buildQuotePdf(pricedInput(job, version, priced, projectNo, now));
```

with:

```ts
  const optionNo = formatOptionNo(job.projectNo, version.option) ?? "PSS";
  const name = `Quote ${optionNo} v${version.version}.pdf`;
  const pdf = await buildQuotePdf(pricedInput(job, version, priced, optionNo, now));
```

- In `sendQuote`'s statement, replace the line `and version = (select max(version) from dc_quote_versions where lead_id = ${job.id})` in the `offered` CTE with:

```ts
          and version = (select max(version) from dc_quote_versions where lead_id = ${job.id} and option = ${version.option})
          -- Quote options spec §5: never while another option is signed.
          and not exists (select 1 from dc_quote_versions s where s.lead_id = ${job.id} and s.status = 'signed' and s.option <> ${version.option})
```

- Replace the `superseded` CTE with:

```ts
      superseded as (
        update dc_quote_versions set status = 'superseded'
        where lead_id = ${job.id} and status in ('draft','offered','sent') and id <> ${version.id} and (option = ${version.option} or approved_at is not null) and exists (select 1 from offered)
        returning contract_file_id, quote_file_id
      ),
```

- In `sendContract`: change `const loaded = await review(input.jobId);` to `const loaded = await review(input.jobId, { versionId: input.versionId });`. Replace

```ts
  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const name = `Contract ${projectNo} v${version.version}.pdf`;
  const rendered = await renderContractPdf(pricedInput(job, version, priced, projectNo, now), terms);
```

with:

```ts
  const optionNo = formatOptionNo(job.projectNo, version.option) ?? "PSS";
  const name = `Contract ${optionNo} v${version.version}.pdf`;
  const rendered = await renderContractPdf(pricedInput(job, version, priced, optionNo, now), terms);
```

and in its `frozen` CTE replace `and version = (select max(version) from dc_quote_versions where lead_id = ${job.id})` with `and version = (select max(version) from dc_quote_versions where lead_id = ${job.id} and option = ${version.option})`. Also change the docblock phrase `(approved, still the newest, job not Lost and with an email)` to `(approved, still the newest of its option, job not Lost and with an email)`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/dc` then `npm run typecheck`
Expected: PASS and no type errors. The existing `refuses a version that is no longer the newest` tests still pass: V0 is not in the list, so it falls to option A, whose newest is V1, and the answer is NEWER.

- [ ] **Step 5: Commit**

```bash
git add lib/dc/send.ts tests/dc/send.test.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: review, preview, Send quote and Send contract work per quote option" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutation checks**

Run `npx vitest run --maxWorkers=2 tests/dc/send.test.ts` after each one. See it FAIL, then restore with `git checkout -- lib/dc/send.ts`:
1. Delete the line `if (signed) blockers.push(signedElsewhere(signed.option));`. Expected FAIL: `refuses while another option is signed`.
2. Delete the `and not exists (select 1 from dc_quote_versions s … s.option <> ${version.option})` line (and its comment) from the `offered` CTE. Expected FAIL: `re-checks in the statement…`.
3. In `superseded`, change `(option = ${version.option} or approved_at is not null)` to `option = ${version.option}`. Expected FAIL: `sends option B …` (`after(call, "and (option = ")`) and the updated supersede test.
4. In `sendQuote`'s `offered` CTE, delete ` and option = ${version.option}` from the `max(version)` subselect. Expected FAIL: `sends option B …`.
5. In `sendContract`'s `frozen` CTE, delete ` and option = ${version.option}`. Expected FAIL: `sends option B's contract …`.

After restoring, run the file once more. Expected: PASS.

---

### Task 6: Approval closes the other options

**Files:**
- Modify: `lib/dc/approve.ts` (add `offeredVersions`, extend `OfferedVersion`, rewrite `approveDcQuote`'s statement)
- Modify: `scripts/verify-dc-quote-import.ts` (one `check` that compares `approveDcQuote`'s answer)
- Test: `tests/dc/approve.test.ts`

**Interfaces:**
- Consumes: the `option` column (Task 1).
- Produces:
  - `OfferedVersion = { id: string; version: number; option: string; quoteFileId: string | null; approvedAt: Date | null; clientTotalCents: number | null }`
  - `offeredVersions(leadId: string): Promise<OfferedVersion[]>`: every `offered` version of the job, approved or not, ordered by option.
  - `approveDcQuote(leadId, versionId, actor): Promise<{ version: number; option: string; moved: boolean } | null>`
  - `offeredVersion` stays for now. Task 8 deletes it.

- [ ] **Step 1: Write the failing tests**

In `tests/dc/approve.test.ts`:
- Change the import to `const { approveDcQuote, offeredVersion, offeredVersions } = await import("@/lib/dc/approve");`.
- In the `describe("offeredVersion", …)` test, change the mocked row to `{ id: V, version: 2, option: "A", quote_file_id: "f1", approved_at: "2026-09-29T17:00:00Z", client_total_cents: 184834 }` and its expectation to `toEqual({ id: V, version: 2, option: "A", quoteFileId: "f1", approvedAt: new Date("2026-09-29T17:00:00Z"), clientTotalCents: 184834 })`.
- Replace the whole `describe("approveDcQuote", …)` block with:

```ts
describe("offeredVersions", () => {
  it("reads every offered version of the job, one per option, A first", async () => {
    const VB = "8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
    sql.mockResolvedValueOnce([
      { id: V, version: 2, option: "A", quote_file_id: "fa", approved_at: null, client_total_cents: 184834 },
      { id: VB, version: 1, option: "B", quote_file_id: "fb", approved_at: "2026-09-29T17:00:00Z", client_total_cents: null },
    ]);
    expect(await offeredVersions(JOB)).toEqual([
      { id: V, version: 2, option: "A", quoteFileId: "fa", approvedAt: null, clientTotalCents: 184834 },
      { id: VB, version: 1, option: "B", quoteFileId: "fb", approvedAt: new Date("2026-09-29T17:00:00Z"), clientTotalCents: null },
    ]);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("select id, version, option, quote_file_id, approved_at, client_total_cents from dc_quote_versions");
    expect(s).toContain("where lead_id = ? and status = 'offered' order by option, version desc");
  });
  it("is empty for a malformed id, without a query", async () => {
    expect(await offeredVersions("x")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("approveDcQuote", () => {
  it("in ONE statement stamps the approval once, only on a shared offered quote of a job that is not Lost", async () => {
    sql.mockResolvedValueOnce([{ version: 2, option: "A", moved: true }]);
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toEqual({ version: 2, option: "A", moved: true });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set approved_at = now(), approved_by = ?",
      "where id = ? and lead_id = ? and status = 'offered' and approved_at is null",
      "exists (select 1 from leads where id = ? and status <> 'lost')",
      "exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)",
      "returning id, version, option, po_reference, client_total_cents",
      "select version, option, exists (select 1 from moved) as moved from approved",
    ]) expect(s).toContain(part);
  });

  it("closes every other option's draft or offered version in the same statement, and unshares their quotes unless signed", async () => {
    await approveDcQuote(JOB, V, "maria@example.com");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("closed as ( update dc_quote_versions set status = 'superseded' where lead_id = ? and status in ('draft','offered') and option <> (select option from approved) returning quote_file_id )");
    expect(s).toContain("unshared as ( update job_files set shared_at = null where lead_id = ? and id in (select quote_file_id from closed) and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id) returning id )");
  });

  it("records the approved total as quote_cents and moves Quoted to Approved in the ONE update of the job", async () => {
    await approveDcQuote(JOB, V, "maria@example.com");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("updated as ( update leads set quote_cents = (select client_total_cents from approved), status = case when status = 'quoted' then 'approved' else status end, stage_changed_at = case when status = 'quoted' then now() else stage_changed_at end, updated_at = now() where id = ? and exists (select 1 from approved) returning id )");
    expect(s).toContain("moved as (select 1 from prev, updated where prev.status = 'quoted')");
    expect(s.match(/update leads/g)).toHaveLength(1);
  });

  it("names the option in the events: option A as before, another option by its number", async () => {
    await approveDcQuote(JOB, V, "maria@example.com");
    const s = text(sql.mock.calls[0]);
    const label = "case when approved.option = 'A' then 'Approved quote version ' || approved.version else 'Approved ' || approved.po_reference || ' version ' || approved.version end";
    expect(s).toContain(`select ?, ?, 'stage', prev.status, 'approved', ${label} from prev, moved, approved`);
    expect(s).toContain(`select ?, ?, 'quote', ${label} || ' from their project page' from approved where not exists (select 1 from moved)`);
  });

  it("answers null for a second approval, which changes nothing", async () => {
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/approve.test.ts`
Expected: FAIL. `offeredVersions` is not a function, and the statement has no `closed`/`unshared`/`updated` CTEs.

- [ ] **Step 3: Implement in `lib/dc/approve.ts`**

Replace the `OfferedVersion` type and `offeredVersion` function with:

```ts
export type OfferedVersion = { id: string; version: number; option: string; quoteFileId: string | null; approvedAt: Date | null; clientTotalCents: number | null };

const toOffered = (row: Record<string, unknown>): OfferedVersion => ({
  id: row.id as string, version: Number(row.version), option: (row.option as string | null) ?? "A",
  quoteFileId: (row.quote_file_id as string | null) ?? null,
  approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
  clientTotalCents: row.client_total_cents === null || row.client_total_cents === undefined ? null : Number(row.client_total_cents),
});

/** The job's newest offered DC version, or null. Replaced by offeredVersions once its callers move (quote options Task 8). */
export async function offeredVersion(leadId: string): Promise<OfferedVersion | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select id, version, option, quote_file_id, approved_at, client_total_cents from dc_quote_versions
    where lead_id = ${leadId} and status = 'offered'
    order by version desc limit 1`;
  return rows[0] ? toOffered(rows[0] as Record<string, unknown>) : null;
}

/**
 * Every offered DC version of the job, at most one per option (dc_quote_versions_one_offered, per option since
 * migration 040), ordered by option. Approved ones are included: the page shows only those still awaiting the
 * client, and the approve action answers a second tap on an approved one with "approved".
 */
export async function offeredVersions(leadId: string): Promise<OfferedVersion[]> {
  if (!isUuid(leadId)) return [];
  const rows = await db()`
    select id, version, option, quote_file_id, approved_at, client_total_cents from dc_quote_versions
    where lead_id = ${leadId} and status = 'offered'
    order by option, version desc`;
  return rows.map((row) => toOffered(row as Record<string, unknown>));
}
```

Replace `approveDcQuote` (docblock and function) with:

```ts
/**
 * Spec §2, the client's approval of a DC quote. One statement: stamps approved_at once (a second approval
 * matches nothing and answers null), only on this job's offered version whose quote PDF is shared and only while
 * the job is not Lost. Quote options spec §6: in the same statement every OTHER option's draft or offered version
 * is superseded and its quote PDF unshared (never one tied to a signature, as Send quote does), and the job's
 * quote_cents becomes the approved total. That leads update also moves Quoted to Approved with a 'stage' event, or
 * — for a change to a job already past Quoted — leaves the stage alone and logs a 'quote' event. One update of the
 * job, never two: two CTEs updating the same row in one statement would apply only one. `moved` says which, from
 * the same statement, so the owners' email never claims a move that did not happen.
 */
export async function approveDcQuote(leadId: string, versionId: string, actor: string): Promise<{ version: number; option: string; moved: boolean } | null> {
  if (!isUuid(leadId) || !isUuid(versionId)) return null;
  const rows = await db()`
    with approved as (
      update dc_quote_versions set approved_at = now(), approved_by = ${actor}
      where id = ${versionId} and lead_id = ${leadId} and status = 'offered' and approved_at is null
        and exists (select 1 from leads where id = ${leadId} and status <> 'lost')
        and exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)
      returning id, version, option, po_reference, client_total_cents
    ),
    closed as (
      update dc_quote_versions set status = 'superseded'
      where lead_id = ${leadId} and status in ('draft','offered') and option <> (select option from approved)
      returning quote_file_id
    ),
    unshared as (
      update job_files set shared_at = null
      where lead_id = ${leadId} and id in (select quote_file_id from closed)
        and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)
      returning id
    ),
    prev as (select status from leads where id = ${leadId}),
    updated as (
      update leads set quote_cents = (select client_total_cents from approved),
        status = case when status = 'quoted' then 'approved' else status end,
        stage_changed_at = case when status = 'quoted' then now() else stage_changed_at end,
        updated_at = now()
      where id = ${leadId} and exists (select 1 from approved)
      returning id
    ),
    moved as (select 1 from prev, updated where prev.status = 'quoted'),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select ${leadId}, ${actor}, 'stage', prev.status, 'approved',
        case when approved.option = 'A' then 'Approved quote version ' || approved.version else 'Approved ' || approved.po_reference || ' version ' || approved.version end
      from prev, moved, approved
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select ${leadId}, ${actor}, 'quote',
        case when approved.option = 'A' then 'Approved quote version ' || approved.version else 'Approved ' || approved.po_reference || ' version ' || approved.version end || ' from their project page'
      from approved
      where not exists (select 1 from moved)
    )
    select version, option, exists (select 1 from moved) as moved from approved`;
  return rows[0] ? { version: Number(rows[0].version), option: (rows[0].option as string | null) ?? "A", moved: rows[0].moved === true } : null;
}
```

- [ ] **Step 4: Keep the existing verify script's comparison true**

In `scripts/verify-dc-quote-import.ts`, replace

```ts
    check(same(approved, { version: 2, moved: true }), "approveDcQuote answers version 2 and that it moved A", `got ${JSON.stringify(approved)}`);
```

with

```ts
    check(same(approved, { version: 2, option: "A", moved: true }), "approveDcQuote answers version 2 of option A and that it moved A", `got ${JSON.stringify(approved)}`);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/dc tests/portal` then `npm run typecheck`
Expected: PASS. `tests/portal/approve.test.ts` still mocks `offeredVersion` and is untouched until Task 8.

- [ ] **Step 6: Commit**

```bash
git add lib/dc/approve.ts tests/dc/approve.test.ts scripts/verify-dc-quote-import.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: approving one quote option closes the others and records its total, in one statement" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Mutation checks**

Run `npx vitest run --maxWorkers=2 tests/dc/approve.test.ts` after each one. See it FAIL, then restore with `git checkout -- lib/dc/approve.ts`:
1. Delete the `not exists (select 1 from contract_signatures s …)` line from `unshared`. Expected FAIL: `closes every other option's …`.
2. Change `quote_cents = (select client_total_cents from approved),` to nothing (delete it). Expected FAIL: `records the approved total …`.
3. Change `status in ('draft','offered')` in `closed` to `status = 'offered'`. Expected FAIL: `closes every other option's …`.

After restoring, run the file once more. Expected: PASS.

---

### Task 7: The admin Quote tab, per option

**Files:**
- Modify: `app/admin/jobs/[id]/QuoteTab.tsx`
- Modify: `app/admin/jobs/[id]/QuoteReview.tsx` (ids, preview link)
- Modify: `app/admin/jobs/[id]/DcButtons.tsx` (new `AddQuoteOptionButton`)
- Modify: `app/admin/jobs/[id]/quote-actions.ts` (new `addQuoteOptionAction`)
- Modify: `app/admin/jobs/[id]/quote-preview/route.ts` (`?option=`)
- Test: `tests/dc/quote-review.test.tsx`, `tests/dc/quote-actions.test.ts`, `tests/dc/quote-preview-route.test.ts`

**Interfaces:**
- Consumes: `listQuoteOptions`, `addQuoteOption` (Task 3), `loadReview(jobId, option)`, `previewQuote(jobId, option)` (Task 5), `formatOptionNo` (Task 2).
- Produces: `addQuoteOptionAction(jobId: string): Promise<{ error?: string; letter?: string }>`, and `AddQuoteOptionButton({ jobId })`, which lives in `DcButtons.tsx`.

- [ ] **Step 1: Write the failing tests**

`tests/dc/quote-review.test.tsx`:
- Change the quote-actions mock to:

```ts
const addQuoteOptionAction = vi.fn();
vi.mock("@/app/admin/jobs/[id]/quote-actions", () => ({ setLinePctAction, setChoicesAction, sendQuoteAction, sendContractAction, checkNowAction, addQuoteOptionAction }));
```

(declare `addQuoteOptionAction` next to the other `vi.fn()`s, above the mock).
- After the `depositState` mock, add:

```ts
const listQuoteOptions = vi.fn(async (_id: string) => ["A"]);
vi.mock("@/lib/dc/store", () => ({ listQuoteOptions }));
```

- Change `const { DcButtons, CheckNowButton } = await import("@/app/admin/jobs/[id]/DcButtons");` to `const { AddQuoteOptionButton, DcButtons, CheckNowButton } = await import("@/app/admin/jobs/[id]/DcButtons");`.
- In the `beforeEach`, add `addQuoteOptionAction.mockResolvedValue({ letter: "B" });` and `listQuoteOptions.mockResolvedValue(["A"]);`.
- In `describe("QuoteTab")`, change `expect(loadReview).toHaveBeenCalledWith(J);` to `expect(loadReview).toHaveBeenCalledWith(J, "A");`.
- Append inside `describe("QuoteTab", …)`:

```tsx
  it("shows one card per option, A first, each headed with its number, once the job has two", async () => {
    listQuoteOptions.mockResolvedValueOnce(["A", "B"]);
    loadReview.mockResolvedValueOnce(review()).mockResolvedValueOnce(null);
    render(await QuoteTab({ job }));
    expect(loadReview).toHaveBeenNthCalledWith(1, J, "A");
    expect(loadReview).toHaveBeenNthCalledWith(2, J, "B");
    const a = screen.getByRole("region", { name: "Option A · PSS-1042" });
    const b = screen.getByRole("region", { name: "Option B · PSS-1042-B" });
    expect(within(a).getByRole("button", { name: "Send quote" })).toBeInTheDocument();
    expect(within(a).getByRole("link", { name: "Open quote 12345678 in Direct Connect" })).toBeInTheDocument();
    expect(within(b).getByText("No Direct Connect quote yet. Put PSS-1042-B in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.")).toBeInTheDocument();
    expect(within(b).getByRole("link", { name: "Create quote in Direct Connect" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Check for new quotes" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Add another quote" })).toHaveLength(1);
  });

  it("heads nothing with an option while the job has one", async () => {
    loadReview.mockResolvedValueOnce(review());
    render(await QuoteTab({ job }));
    expect(screen.queryByRole("region", { name: /^Option / })).toBeNull();
    expect(screen.getByRole("button", { name: "Add another quote" })).toBeInTheDocument();
  });
```

- Append:

```tsx
describe("AddQuoteOptionButton", () => {
  it("adds an option, and shows a refusal", async () => {
    addQuoteOptionAction.mockResolvedValueOnce({ error: "This job is marked Lost." });
    render(<AddQuoteOptionButton jobId={J} />);
    fireEvent.click(screen.getByRole("button", { name: "Add another quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This job is marked Lost.");
    expect(addQuoteOptionAction).toHaveBeenCalledWith(J);
  });
});

describe("QuoteReview per option", () => {
  it("previews option B's quote by its option, and option A's at the plain address", () => {
    const { unmount } = render(<QuoteReview jobId={J} review={review({ version: version({ option: "B" }) })} />);
    expect(screen.getByRole("link", { name: "Preview quote" })).toHaveAttribute("href", `/admin/jobs/${J}/quote-preview?option=B`);
    unmount();
    render(<QuoteReview jobId={J} review={review()} />);
    expect(screen.getByRole("link", { name: "Preview quote" })).toHaveAttribute("href", `/admin/jobs/${J}/quote-preview`);
  });

  it("two reviews on one page keep their own headings and blocker lists", () => {
    const blocked = { blockers: ["Add the client's email address to the job first."] };
    render(<>
      <QuoteReview jobId={J} review={review(blocked)} />
      <QuoteReview jobId={J} review={review({ ...blocked, version: version({ id: "other-version", option: "B" }) })} />
    </>);
    expect(screen.getAllByRole("region", { name: /^DC quote 12345678/ })).toHaveLength(2);
    expect(screen.getAllByRole("list", { name: "Before you can send" })).toHaveLength(2);
  });
});
```

`tests/dc/quote-actions.test.ts`:
- Before the `vi.mock("@/lib/dc/store", …)` line, add:

```ts
const addQuoteOption = vi.fn(async (..._args: unknown[]): Promise<{ letter: string } | { error: string }> => {
  order.push("store");
  return { letter: "B" };
});
```

and change that mock to `vi.mock("@/lib/dc/store", () => ({ setLineOverride, setVersionChoices, addQuoteOption }));`.
- Change the action import to `const { setLinePctAction, setChoicesAction, sendQuoteAction, sendContractAction, checkNowAction, addQuoteOptionAction } = await import("@/app/admin/jobs/[id]/quote-actions");`.
- Append:

```ts
describe("addQuoteOptionAction", () => {
  it("checks the admin first, adds the option as that owner and refreshes the job", async () => {
    expect(await addQuoteOptionAction(J)).toEqual({ letter: "B" });
    expect(order).toEqual(["auth", "store"]);
    expect(addQuoteOption).toHaveBeenCalledWith(J, "o@x.com");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });
  it("returns the refusal verbatim and refreshes nothing", async () => {
    addQuoteOption.mockResolvedValueOnce({ error: "This job is marked Lost." });
    expect(await addQuoteOptionAction(J)).toEqual({ error: "This job is marked Lost." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
```

`tests/dc/quote-preview-route.test.ts`:
- Change `const get = () => GET(new Request("http://x"), { params: Promise.resolve({ id: J }) });` to `const get = (query = "") => GET(new Request(`http://x/admin/jobs/${J}/quote-preview${query}`), { params: Promise.resolve({ id: J }) });`.
- Change `expect(previewQuote).toHaveBeenCalledWith(J);` to `expect(previewQuote).toHaveBeenCalledWith(J, "A");`.
- Append inside the describe:

```ts
  it("previews the option the link names", async () => {
    await get("?option=B");
    expect(previewQuote).toHaveBeenCalledWith(J, "B");
  });

  it("refuses an option that is not one capital letter, without building anything", async () => {
    for (const query of ["?option=b", "?option=AA", "?option="]) {
      const response = await get(query);
      expect(response.status).toBe(404);
    }
    expect(previewQuote).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/quote-review.test.tsx tests/dc/quote-actions.test.ts tests/dc/quote-preview-route.test.ts`
Expected: FAIL. There are no option regions, no `AddQuoteOptionButton`/`addQuoteOptionAction`, the preview has no `?option=` link, and the route ignores the query.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/quote-actions.ts`:
- Change the store import to `import { addQuoteOption, setLineOverride, setVersionChoices } from "@/lib/dc/store";`.
- Append:

```ts
/** Add another quote (quote options spec §3): the next letter, B when none. The store refuses a Lost or signed job and past Z. */
export async function addQuoteOptionAction(jobId: string): Promise<{ error?: string; letter?: string }> {
  const admin = await requireAdmin();
  const result = await addQuoteOption(jobId, admin.email);
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { letter: result.letter };
}
```

`app/admin/jobs/[id]/DcButtons.tsx`:
- Change the action import to `import { addQuoteOptionAction, checkNowAction } from "./quote-actions";`.
- Append:

```tsx
/** Add another quote (quote options spec §3). On success the page refreshes and the new option's card appears. */
export function AddQuoteOptionButton({ jobId }: { jobId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className={`${ACTION_LINK} self-start`} disabled={pending}
        onClick={() => startTransition(async () => setError((await addQuoteOptionAction(jobId)).error ?? null))}>
        {pending ? "Adding…" : "Add another quote"}
      </button>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
```

`app/admin/jobs/[id]/QuoteReview.tsx`:
- After `const [refusals, setRefusals] = useState(0);` add:

```tsx
  // Ids unique per version: the Quote tab renders one review per quote option on the same page.
  const ids = { heading: `dc-quote-heading-${version.id}`, changes: `dc-changes-${version.id}`, blockers: `dc-blockers-${version.id}` };
  const previewHref = `/admin/jobs/${jobId}/quote-preview${version.option === "A" ? "" : `?option=${version.option}`}`;
```

- Replace `<section aria-labelledby="dc-quote-heading" className="flex flex-col gap-5">` with `<section aria-labelledby={ids.heading} className="flex flex-col gap-5">`, and `<h2 id="dc-quote-heading" className="text-lg font-semibold">` with `<h2 id={ids.heading} className="text-lg font-semibold">`.
- Replace `<p id="dc-changes">` with `<p id={ids.changes}>`, and `<ul aria-labelledby="dc-changes" className="list-disc pl-5">` with `<ul aria-labelledby={ids.changes} className="list-disc pl-5">`.
- Replace `<p id="dc-blockers" className={HEADING}>` with `<p id={ids.blockers} className={HEADING}>`, and `<ul aria-labelledby="dc-blockers" className="list-disc pl-5">` with `<ul aria-labelledby={ids.blockers} className="list-disc pl-5">`.
- Replace `<a href={`/admin/jobs/${jobId}/quote-preview`} target="_blank" rel="noreferrer"` with `<a href={previewHref} target="_blank" rel="noreferrer"`.
- Change the component docblock's first line to `The owner's review of the latest version of one quote option. …` (keep the rest).

`app/admin/jobs/[id]/quote-preview/route.ts`, the whole file:

```ts
import { requireAdmin } from "@/lib/admin/session";
import { contentDisposition } from "@/lib/admin/uploads";
import { previewQuote } from "@/lib/dc/send";

/**
 * The quote PDF as Send quote would build it, marked PREVIEW, opened in the owner's browser. Nothing is saved or sent.
 * `?option=B` previews quote option B (quote options spec §3). Without it, option A.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const plain = { ...headers, "Content-Type": "text/plain; charset=utf-8" };
  const option = new URL(request.url).searchParams.get("option") ?? "A";
  if (!/^[A-Z]$/.test(option)) return new Response("No such quote option.", { status: 404, headers: plain });
  const result = await previewQuote(id, option);
  if ("error" in result) return new Response(result.error, { status: 409, headers: plain });
  return new Response(new Uint8Array(result.pdf), {
    headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(result.name) },
  });
}
```

`app/admin/jobs/[id]/QuoteTab.tsx`: keep `toDepositView` and `depositPanelShows` exactly as they are. Replace the imports and the `QuoteTab` function with:

```tsx
import type { Job } from "@/lib/admin/jobs";
import { loadReview, type Review } from "@/lib/dc/send";
import { listQuoteOptions } from "@/lib/dc/store";
import { cancellationWindowLastDay, inCancellationWindow } from "@/lib/docs/business-days";
import { depositState, type DepositState } from "@/lib/payments/deposits";
import { formatOptionNo } from "@/lib/portal/project-no";
import { AddQuoteOptionButton, CheckNowButton, DcButtons } from "./DcButtons";
import { DepositPanel, type DepositView } from "./DepositPanel";
import { QuoteReview } from "./QuoteReview";
import { HEADING } from "./ui";
```

```tsx
/**
 * One quote option's card (quote options spec §3): its Direct Connect button (copying that option's number), then
 * its review or how to start it. Headed "Option B · PSS-1042-B" only once the job has two or more options, so a
 * one-quote job reads exactly as before.
 */
function OptionCard({ jobId, letter, optionNo, review, now, labelled }: {
  jobId: string; letter: string; optionNo: string | null; review: Review | null; now: Date; labelled: boolean;
}) {
  const body = (
    <>
      <DcButtons projectNo={optionNo} dcQuoteNo={review?.version.dcQuoteNo ?? null} />
      {review ? (
        <QuoteReview jobId={jobId} review={review} now={now} />
      ) : (
        <p className="text-sm">
          No Direct Connect quote yet. Put {optionNo ?? "the job's PSS number"} in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.
        </p>
      )}
    </>
  );
  if (!labelled) return <div className="flex flex-col gap-6">{body}</div>;
  const headingId = `quote-option-${letter}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6 border-t border-rule pt-6">
      <h2 id={headingId} className={HEADING}>Option {letter}{optionNo ? ` · ${optionNo}` : ""}</h2>
      {body}
    </section>
  );
}

export async function QuoteTab({ job }: { job: Pick<Job, "id" | "projectNo"> }) {
  const [letters, deposit] = await Promise.all([listQuoteOptions(job.id), depositState(job.id)]);
  const reviews = await Promise.all(letters.map((letter) => loadReview(job.id, letter)));
  const now = new Date();
  const depositView = deposit ? toDepositView(deposit, now) : null;
  const labelled = letters.length > 1;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-end gap-4">
        <CheckNowButton jobId={job.id} />
      </div>
      {letters.map((letter, i) => (
        <OptionCard key={letter} jobId={job.id} letter={letter} optionNo={formatOptionNo(job.projectNo, letter)}
          review={reviews[i]} now={now} labelled={labelled} />
      ))}
      <AddQuoteOptionButton jobId={job.id} />
      {depositView && depositPanelShows(depositView) ? <DepositPanel jobId={job.id} view={depositView} /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/dc tests/admin` then `npm run typecheck` then `npm run lint`
Expected: PASS, with no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/jobs/[id]/QuoteTab.tsx app/admin/jobs/[id]/QuoteReview.tsx app/admin/jobs/[id]/DcButtons.tsx app/admin/jobs/[id]/quote-actions.ts app/admin/jobs/[id]/quote-preview/route.ts tests/dc/quote-review.test.tsx tests/dc/quote-actions.test.ts tests/dc/quote-preview-route.test.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: the Quote tab shows one card per quote option and adds another" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutation check**

In `quote-preview/route.ts`, delete the line `if (!/^[A-Z]$/.test(option)) return new Response("No such quote option.", { status: 404, headers: plain });`. Run `npx vitest run --maxWorkers=2 tests/dc/quote-preview-route.test.ts`. Expected: FAIL (`refuses an option that is not one capital letter`). Restore with `git checkout -- "app/admin/jobs/[id]/quote-preview/route.ts"`, and the test PASSES.

---

### Task 8: The client sees every option and approves one

**Files:**
- Create: `app/(site)/project/QuoteOptions.tsx`
- Modify: `app/(site)/project/ApproveQuote.tsx` (`ApproveQuote` props)
- Modify: `app/(site)/project/StatusBanner.tsx` (`quoteLabel`)
- Modify: `app/(site)/project/ProjectView.tsx`
- Modify: `app/(site)/project/actions.ts` (`approveQuoteAction`, `approveOfferedQuote`, `approveQuoteFormAction`)
- Modify: `lib/portal/send-approval-email.ts` (`optionNo` parameter)
- Modify: `lib/dc/approve.ts` (delete `offeredVersion`)
- Test: `tests/portal/approve.test.ts`, `tests/portal/project-view.test.tsx`, `tests/portal/approve-ui.test.tsx`, `tests/portal/approval-email.test.ts`, `tests/dc/approve.test.ts`

**Interfaces:**
- Consumes: `offeredVersions`, `OfferedVersion`, `approveDcQuote → { version, option, moved }` (Task 6), `formatOptionNo` (Task 2).
- Produces:
  - `approveQuoteAction(jobId: string, versionId?: string): Promise<ApproveResult>`
  - `ApproveQuote({ jobId, versionId?, option? })`
  - `QuoteOptions({ jobId, options: QuoteOptionChoice[] })`
  - `StatusBanner`'s new optional `quoteLabel`
  - `notifyOwnersOfApproval(job, quoteName, approvedBy, outcome = "paperwork", optionNo?: string | null)`

- [ ] **Step 1: Write the failing tests**

`tests/portal/approval-email.test.ts`, append inside the describe:

```ts
  it("names the approved quote option's number where it would name the project", async () => {
    await notifyOwnersOfApproval(JOB, "Quote PSS-1048-B v1.pdf", EMAIL, "contract-sent", "PSS-1048-B");
    const sent = send.mock.calls[0][0] as { subject: string; text: string };
    expect(sent.subject).toBe("Quote approved — contract sent — PSS-1048-B");
    expect(sent.text).toContain("Project:     PSS-1048-B");
  });
```

`tests/portal/approve-ui.test.tsx`, append inside `describe("ApproveQuote", …)`:

```tsx
  it("carries the version it approves, and words one of several options by its letter", () => {
    render(<ApproveQuote jobId={JOB} versionId="7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" option="B" />);
    expect(document.querySelector('input[name="versionId"]')).toHaveValue("7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
    expect(screen.getByText("Approve Option B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, approve Option B" })).toBeInTheDocument();
    expect(screen.getByText("Approving accepts Option B and closes the other options. Your contract comes next, to read and sign.")).toBeInTheDocument();
  });

  it("carries no version field when it is given none (an uploaded quote)", () => {
    render(<ApproveQuote jobId={JOB} />);
    expect(document.querySelector('input[name="versionId"]')).toBeNull();
  });
```

`tests/portal/approve.test.ts`:
- Replace the `dcApprove` object with:

```ts
const dcApprove = {
  offeredVersions: vi.fn(async (_id: string) => [] as unknown[]), approveDcQuote: vi.fn(), APPROVAL_ACTOR: "Sent on approval",
};
```

- In the top-level `beforeEach`, replace `dcApprove.offeredVersion.mockReset().mockResolvedValue(null);` with `dcApprove.offeredVersions.mockReset().mockResolvedValue([]);`.
- Replace every remaining `dcApprove.offeredVersion` with `dcApprove.offeredVersions` (the `not.toHaveBeenCalled()` assertions stay as they are).
- In `describe("a Direct Connect quote (spec §2)", …)`:
  - Change `const offered = { id: V, version: 2, quoteFileId: "fq", approvedAt: null as Date | null };` to `const offered = { id: V, version: 2, option: "A", quoteFileId: "fq", approvedAt: null as Date | null, clientTotalCents: 450000 };`.
  - In its `beforeEach`, change `dcApprove.offeredVersion.mockResolvedValue(offered);` to `dcApprove.offeredVersions.mockResolvedValue([offered]);` and `dcApprove.approveDcQuote.mockResolvedValue({ version: 2, moved: true });` to `dcApprove.approveDcQuote.mockResolvedValue({ version: 2, option: "A", moved: true });`.
  - Change `dcApprove.approveDcQuote.mockResolvedValue({ version: 3, moved: false });` to `dcApprove.approveDcQuote.mockResolvedValue({ version: 3, option: "A", moved: false });`.
  - In every `notifyOwnersOfApproval` expectation in this describe, add the 5th argument `"PSS-1048"`. For example: `toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), "Quote PSS-1048 v2.pdf", EMAIL, "contract-sent", "PSS-1048")`, and the same for `"change-contract-sent"`, `"change-contract-failed"` and `"contract-failed"` (four `toHaveBeenLastCalledWith` and two `toHaveBeenCalledWith`).
  - Change `dcApprove.offeredVersions.mockResolvedValue({ ...offered, approvedAt: new Date() });` to `dcApprove.offeredVersions.mockResolvedValue([{ ...offered, approvedAt: new Date() }]);`.
  - Change `dcApprove.offeredVersions.mockResolvedValueOnce(offered).mockResolvedValueOnce({ ...offered, approvedAt: new Date() });` to `dcApprove.offeredVersions.mockResolvedValueOnce([offered]).mockResolvedValueOnce([{ ...offered, approvedAt: new Date() }]);`.
  - Append inside this describe:

```ts
  it("refuses a posted version id when nothing is offered, never approving an uploaded quote instead", async () => {
    dcApprove.offeredVersions.mockResolvedValue([]);
    SHARED = [quoteDoc];
    results = MOVED();
    await expect(approveQuoteAction(MINE, V)).resolves.toBe("wrong-status");
    expect(query).not.toHaveBeenCalled();
  });

  describe("with two options offered (quote options spec §6)", () => {
    const VB = "8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
    const optionB = { id: VB, version: 1, option: "B", quoteFileId: "fqb", approvedAt: null as Date | null, clientTotalCents: 500000 };

    beforeEach(() => {
      dcApprove.offeredVersions.mockResolvedValue([offered, optionB]);
      dcApprove.approveDcQuote.mockResolvedValue({ version: 1, option: "B", moved: true });
      SHARED = [dcQuote, { id: "fqb", name: "Quote PSS-1048-B v1.pdf", docType: "quote" }];
    });

    it("approves the option the form names, from this job's own offered versions, and names it to the owners", async () => {
      await expect(approveQuoteAction(MINE, VB)).resolves.toBe("approved");
      expect(dcApprove.approveDcQuote).toHaveBeenCalledWith(MINE, VB, EMAIL);
      expect(dcSend.sendContract).toHaveBeenCalledWith({ jobId: MINE, versionId: VB, actor: "Sent on approval" });
      expect(notifyOwnersOfApproval).toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), "Quote PSS-1048-B v1.pdf", EMAIL, "contract-sent", "PSS-1048-B");
    });

    it("refuses a version id that is not one of this job's offered versions, approving nothing", async () => {
      await expect(approveQuoteAction(MINE, "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f")).resolves.toBe("wrong-status");
      expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
      expect(dcSend.sendContract).not.toHaveBeenCalled();
    });

    it("refuses to guess when two are offered and the form names none", async () => {
      await expect(approveQuoteAction(MINE)).resolves.toBe("wrong-status");
      expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
    });

    it("the form carries the version id through", async () => {
      const data = new FormData();
      data.set("jobId", MINE);
      data.set("versionId", VB);
      await expect(approveQuoteFormAction(data)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?approved=1`);
      expect(dcApprove.approveDcQuote).toHaveBeenCalledWith(MINE, VB, EMAIL);
    });
  });
```

`tests/portal/project-view.test.tsx`:
- Replace the two lines `const offeredVersion = vi.fn(…); vi.mock("@/lib/dc/approve", () => ({ offeredVersion }));` with:

```ts
const offeredVersions = vi.fn(async (_id: string) => [] as unknown[]);
vi.mock("@/lib/dc/approve", () => ({ offeredVersions }));
```

- In `beforeEach`, replace `offeredVersion.mockReset().mockResolvedValue(null);` with `offeredVersions.mockReset().mockResolvedValue([]);`.
- In `describe("ProjectView approval")`, replace the three `offeredVersion.mockResolvedValue({ id: "v", version: 2, quoteFileId: "fq", approvedAt: … })` calls with `offeredVersions.mockResolvedValue([{ id: "v", version: 2, option: "A", quoteFileId: "fq", approvedAt: …, clientTotalCents: 450000 }])` (keep each one's `approvedAt` value).
- Append inside `describe("ProjectView approval")`:

```tsx
  describe("two or more options offered (quote options spec §6)", () => {
    const quoteA = { id: "fa", name: "Quote PSS-1048 v1.pdf", docType: "quote" as const };
    const quoteB = { id: "fb", name: "Quote PSS-1048-B v1.pdf", docType: "quote" as const };
    const versions = [
      { id: "va", version: 1, option: "A", quoteFileId: "fa", approvedAt: null, clientTotalCents: 450000 },
      { id: "vb", version: 1, option: "B", quoteFileId: "fb", approvedAt: null, clientTotalCents: 512345 },
    ];
    beforeEach(() => {
      listSharedDocuments.mockResolvedValue([quoteA, quoteB]);
      offeredVersions.mockResolvedValue(versions);
    });

    it("lists each option with its total, its own PDF and its own Approve", async () => {
      render(await ProjectView({ job: { ...job, status: "quoted" } }));
      const options = screen.getByRole("region", { name: "Your quote options" });
      const a = within(options).getByRole("listitem", { name: "Option A" });
      const b = within(options).getByRole("listitem", { name: "Option B" });
      expect(a).toHaveTextContent("$4,500");
      expect(b).toHaveTextContent("$5,123.45");
      expect(within(a).getByRole("link", { name: "Quote PSS-1048 v1.pdf" })).toHaveAttribute("href", "/project/files/fa");
      expect(within(b).getByRole("link", { name: "Quote PSS-1048-B v1.pdf" })).toHaveAttribute("href", "/project/files/fb");
      expect(within(b).getByText("Approve Option B")).toBeInTheDocument();
      expect(b.querySelector('input[name="versionId"]')).toHaveValue("vb");
      expect(a.querySelector('input[name="versionId"]')).toHaveValue("va");
    });

    it("keeps the banner's link to the options but drops its single Approve, and still asks for action", async () => {
      render(await ProjectView({ job: { ...job, status: "quoted" } }));
      const banner = screen.getByRole("region", { name: "Where your project stands" });
      expect(within(banner).queryByText("Approve this quote")).toBeNull();
      expect(within(banner).getByRole("link", { name: "Review your options" })).toHaveAttribute("href", "#quote-options");
      expect(within(screen.getByRole("region", { name: "Next step" })).getByText("Action required")).toBeInTheDocument();
    });

    it("lists only options still awaiting the client whose own PDF is shared", async () => {
      listSharedDocuments.mockResolvedValue([quoteA]);
      render(await ProjectView({ job: { ...job, status: "quoted" } }));
      expect(screen.queryByRole("region", { name: "Your quote options" })).toBeNull();
      const banner = screen.getByRole("region", { name: "Where your project stands" });
      expect(within(banner).getByRole("link", { name: "Review quote" })).toHaveAttribute("href", "/project/files/fa");
      expect(within(banner).getByText("Approve this quote")).toBeInTheDocument();
      expect(banner.querySelector('input[name="versionId"]')).toHaveValue("va");
    });
  });
```

`tests/dc/approve.test.ts`: delete the whole `describe("offeredVersion", …)` block, and change the import to `const { approveDcQuote, offeredVersions } = await import("@/lib/dc/approve");`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/portal tests/dc/approve.test.ts`
Expected: FAIL. `ApproveQuote` has no version field, there is no options region, the action ignores `versionId`, and the email has no option number.

- [ ] **Step 3: Implement the email parameter**

`lib/portal/send-approval-email.ts`: change the signature to:

```ts
export async function notifyOwnersOfApproval(
  job: ApprovedJob,
  quoteName: string,
  approvedBy: string,
  outcome: ApprovalOutcome = "paperwork",
  /** The approved quote option's number (quote options spec §6), named where the project number would be. */
  optionNo?: string | null,
): Promise<void> {
```

and replace `const projectNo = formatProjectNo(job.projectNo);` with `const projectNo = optionNo ?? formatProjectNo(job.projectNo);`.

- [ ] **Step 4: Implement `ApproveQuote`, `QuoteOptions` and `StatusBanner`'s label**

`app/(site)/project/ApproveQuote.tsx`: replace the `ApproveQuote` docblock and function (everything from `/**` above `export function ApproveQuote` to that function's closing `}`) with:

```tsx
/**
 * The one consequential thing a customer can do here: accept the price.
 *
 * Deliberately two steps. The <details> is closed until they open it, so the sentence about
 * what approving means is read before the button is reachable, and no stray tap can
 * accept a price. Both halves are plain HTML — the reveal is the browser's, the submit is a form
 * post — so the whole thing works with JavaScript off.
 *
 * `versionId` names the Direct Connect version the form approves (quote options spec §6). It is only a
 * key into the job's own offered versions, which the action re-derives. `option` words the control for
 * one of several options.
 */
export function ApproveQuote({ jobId, versionId, option }: { jobId: string; versionId?: string; option?: string }) {
  const what = option ? `Option ${option}` : "this quote";
  return (
    <details className="w-full sm:w-auto">
      <summary className="inline-flex min-h-11 cursor-pointer items-center border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory">
        Approve {what}
      </summary>
      <form
        action={approveQuoteFormAction}
        className="mt-3 flex max-w-sm flex-col gap-3 border border-rule bg-sand/50 p-4"
      >
        {/* Carries the job with JavaScript off; the action still re-derives ownership itself. */}
        <input type="hidden" name="jobId" value={jobId} />
        {versionId ? <input type="hidden" name="versionId" value={versionId} /> : null}
        <p className="text-sm text-ink-soft">
          {option
            ? `Approving accepts Option ${option} and closes the other options. Your contract comes next, to read and sign.`
            : "Approving accepts this quote. Your contract comes next, to read and sign."}
        </p>
        <button
          type="submit"
          className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory"
        >
          Yes, approve {what}
        </button>
      </form>
    </details>
  );
}
```

Create `app/(site)/project/QuoteOptions.tsx`:

```tsx
import { formatCents } from "@/lib/admin/money";
import { ApproveQuote } from "./ApproveQuote";

const heading = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

/** One option the client can choose, read server-side: the offered version, its total and its own shared quote PDF. */
export type QuoteOptionChoice = { versionId: string; option: string; totalCents: number | null; file: { id: string; name: string } };

/**
 * Quote options spec §6: two or more offered options, each with its total, its own PDF to view or download and its
 * own Approve. Approving one closes the others (approveDcQuote). One offered quote keeps the banner's Review / Approve
 * instead, so this renders only for two or more.
 */
export function QuoteOptions({ jobId, options }: { jobId: string; options: QuoteOptionChoice[] }) {
  return (
    <section id="quote-options" className="flex flex-col gap-4" aria-labelledby="quote-options-heading">
      <h2 id="quote-options-heading" className={heading}>Your quote options</h2>
      <ul className="flex flex-col divide-y divide-rule border-t border-rule">
        {options.map((choice) => (
          <li key={choice.versionId} aria-label={`Option ${choice.option}`} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Option {choice.option}</h3>
              <p className="tabular-nums">{formatCents(choice.totalCents)}</p>
            </div>
            <a href={`/project/files/${choice.file.id}`} target="_blank" rel="noreferrer" className="min-h-11 break-all underline underline-offset-4">
              {choice.file.name}
            </a>
            <ApproveQuote jobId={jobId} versionId={choice.versionId} option={choice.option} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`app/(site)/project/StatusBanner.tsx`: in the props, after `quoteHref: string | null;` add:

```ts
  /** The quote link's words: "Review quote", or "Review your options" when several options are listed below. */
  quoteLabel?: string;
```

Add `quoteLabel = "Review quote",` to the destructured parameters (after `quoteHref,`). Replace the link's text `Review quote` (inside the `<a href={quoteHref} …>`) with `{quoteLabel}`.

- [ ] **Step 5: Implement `ProjectView`**

In `app/(site)/project/ProjectView.tsx`:
- Replace `import { offeredVersion } from "@/lib/dc/approve";` with `import { offeredVersions } from "@/lib/dc/approve";`, and add `import { QuoteOptions } from "./QuoteOptions";` directly after `import { MessageForm } from "./MessageForm";`.
- In the docblock, change `so nothing private can slip onto the page: no money, notes,` to `so nothing private can slip onto the page: no money but the client's own quote totals, no notes,`.
- In the `Promise.all`, replace the last entry's comment and call:

```ts
    // Spec §2 and quote options §6: the Direct Connect quotes the owner sent, if any; the approve action re-derives them.
    offeredVersions(job.id),
```

- Replace the block from `// Spec §2: a Direct Connect quote the owner sent and the client has not approved yet — offered at any` through `const quote = awaitingOffer ? offeredQuote : documents.find((file) => file.docType === "quote");` with:

```ts
  // Spec §2: Direct Connect quotes the owner sent and the client has not approved yet — offered at any stage but
  // Lost, so a change sent after the contract can be approved too (Review Focus 5). One per option at most.
  const awaiting = job.status === "lost" ? [] : offered.filter((version) => !version.approvedAt);
  const awaitingOffer = awaiting.length > 0;
  // T9: an offered version is approved on the DC path and needs ITS OWN PDF shared. One without is not offered here,
  // and while any version awaits the client there is no fallback to another shared quote.
  const offeredQuotes = awaiting.flatMap((version) => {
    const file = documents.find((candidate) => candidate.id === version.quoteFileId);
    return file ? [{ version, file }] : [];
  });
  const single = offeredQuotes.length === 1 ? offeredQuotes[0] : null;
  // Quote options §6: two or more listed together, each with its own Approve. The banner then only links to them.
  const choosing = offeredQuotes.length > 1;
  const quote = awaitingOffer ? single?.file ?? null : documents.find((file) => file.docType === "quote");
```

- Replace the `<StatusBanner … />` element with:

```tsx
      <StatusBanner
        step={current}
        quoteHref={choosing ? "#quote-options" : quote ? `/project/files/${quote.id}` : null}
        quoteLabel={choosing ? "Review your options" : undefined}
        approve={single
          ? <ApproveQuote jobId={job.id} versionId={single.version.id} />
          : !awaitingOffer && quote && project.status === "quoted" ? <ApproveQuote jobId={job.id} /> : null}
        acknowledge={job.status === "installed" ? <AcknowledgeInstall jobId={job.id} /> : null}
      />
      {choosing ? (
        <QuoteOptions jobId={job.id} options={offeredQuotes.map(({ version, file }) => ({
          versionId: version.id, option: version.option, totalCents: version.clientTotalCents, file: { id: file.id, name: file.name },
        }))} />
      ) : null}
```

- In the Next step section, replace `{(job.status === "quoted" && quote) || depositDue ? (` with `{(job.status === "quoted" && (quote || choosing)) || depositDue ? (`.

- [ ] **Step 6: Implement the action**

In `app/(site)/project/actions.ts`:
- Change the DC import to `import { APPROVAL_ACTOR, approveDcQuote, offeredVersions, type OfferedVersion } from "@/lib/dc/approve";` and the project-no import to `import { formatOptionNo, formatProjectNo } from "@/lib/portal/project-no";`.
- In the `approveQuoteAction` docblock, after point 3 (the lines ending `the uploaded path a shared Quote document.`), add these docblock lines:

```ts
 * 4. Which option (quote options spec §6). The form's versionId is only a key into this job's own offered
 *    versions: one matching none is refused, never read as approval of an uploaded quote. Without one, a job
 *    offering exactly one version takes it.
```
- Replace the signature and the first DC lines:

```ts
export async function approveQuoteAction(jobId: string, versionId?: string): Promise<ApproveResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  if (job.status === "lost") return "wrong-status";

  const offered = await offeredVersions(job.id);
  const target = versionId
    ? offered.find((version) => version.id === versionId)
    : offered.length === 1 ? offered[0] : undefined;
  if (target) return approveOfferedQuote(job, target, email);
  if (versionId || offered.length > 0) return "wrong-status";
```

(The uploaded-quote path below stays unchanged.)
- In `approveOfferedQuote`, replace

```ts
    const again = await offeredVersion(job.id);
    return again?.approvedAt ? "approved" : "wrong-status";
```

with

```ts
    const again = (await offeredVersions(job.id)).find((version) => version.id === offered.id);
    return again?.approvedAt ? "approved" : "wrong-status";
```

and replace `void notifyOwnersOfApproval(job, quote.name, email, outcome).catch(console.error);` with `void notifyOwnersOfApproval(job, quote.name, email, outcome, formatOptionNo(job.projectNo, approved.option)).catch(console.error);`.
- In `approveQuoteFormAction`, replace

```ts
  const jobId = text(formData.get("jobId"));
  const result = await approveQuoteAction(jobId);
```

with

```ts
  const jobId = text(formData.get("jobId"));
  const versionId = text(formData.get("versionId"));
  const result = await approveQuoteAction(jobId, versionId || undefined);
```

and change its docblock's first line to `The form's wrapper. The post carries the job id and, for a Direct Connect quote, the version id. Every other fact is re-derived.`

- [ ] **Step 7: Delete `offeredVersion`**

In `lib/dc/approve.ts`, delete the `offeredVersion` function and its docblock. Then confirm nothing still uses it:

Run: `grep -rn "offeredVersion\b" app lib tests scripts e2e`
Expected: no output.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/portal tests/dc` then `npm run typecheck` then `npm run lint`
Expected: PASS, with no type or lint errors.

- [ ] **Step 9: Commit**

```bash
git add "app/(site)/project" lib/portal/send-approval-email.ts lib/dc/approve.ts tests/portal tests/dc/approve.test.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "feat: the client sees every sent quote option and approves one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Mutation checks**

Run `npx vitest run --maxWorkers=2 tests/portal/approve.test.ts` after each one. See it FAIL, then restore with `git checkout -- "app/(site)/project/actions.ts"`:
1. Change `? offered.find((version) => version.id === versionId)` to `? offered.find((version) => version.id === versionId) ?? offered[0]`. Expected FAIL: `refuses a version id that is not one of this job's offered versions`.
2. Delete the line `if (versionId || offered.length > 0) return "wrong-status";`. Expected FAIL: `refuses a posted version id when nothing is offered…` and `refuses to guess when two are offered…`.

Then, in `ProjectView.tsx`, change `const choosing = offeredQuotes.length > 1;` to `const choosing = false;`. Run `npx vitest run --maxWorkers=2 tests/portal/project-view.test.tsx`. Expected FAIL. Restore with `git checkout -- "app/(site)/project/ProjectView.tsx"`, and every test PASSES.

---

### Task 9: Prove the SQL on a Neon test branch

**Files:**
- Create: `scripts/verify-quote-options.ts`
- Create: `scripts/verify-quote-options.config.mts`

**Interfaces:**
- Consumes: everything above, for real, against the test branch migrated in Task 1 Step 11.

- [ ] **Step 1: Create the config**

`scripts/verify-quote-options.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-quote-options.ts and nothing else. Its own config for the `@` alias and the server-only stub,
 * and deliberately NOT reachable from vitest.config.mts (tests/** only): this script must never be counted as
 * coverage. It is run by hand.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-quote-options.ts"],
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

`scripts/verify-quote-options.ts`:

```ts
/**
 * Behavioural proof of the quote options SQL: migration 040 (and 030 no longer defining the one-offered rule),
 * lib/dc/store.ts (addQuoteOption, latestSha, importVersion per option), the release gate in lib/dc/import.ts,
 * sendQuote and sendContract per option (lib/dc/send.ts), and approveDcQuote closing the other options
 * (lib/dc/approve.ts).
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, it is in no suite, and CI does not execute it. If you change
 * any of that SQL, run it yourself, and if you cannot, call the SQL unverified. The unit tests mock db(): they
 * prove text only. The mocks here are @vercel/blob (in memory), the quote and contract PDF builders and the client
 * emails. None of them touches the database.
 *
 * What it does, against a throwaway database:
 *   1. import A: the 4-line fixture at J's number imports as option A version 1.
 *   2. the gate: the fixture at J's number with -B is no-match while J has no option B, and nothing is written on J.
 *   3. add: addQuoteOption gives J option B (one quote_options row, one 'quote' event naming PSS-…-B). A job that
 *      already holds B to Z is refused past Z.
 *   4. import B and a change to A: B arrives as option B version 1 (its event names PSS-…-B). An unchanged A
 *      re-send is unchanged. A changed A is A version 2. A second B version 1 violates the per-option unique key.
 *   5. send A and B: both offered at once (the per-option one-offered rule), each under its own number, A v1
 *      superseded, quote_cents the last total sent. A second offered B version still fails at commit (23P01).
 *   6. re-apply every migration file, in order, with A and B both offered: no error, and the rules are still per option.
 *   7. approve B: A's offered version is superseded and its quote unshared, B's stays shared, J is approved with
 *      quote_cents = B's total, and the stage event names PSS-…-B.
 *   8. B's contract (Contract PSS-…-B v1.pdf) and signature: B signed, J signed, sold_cents = B's total.
 *   9. signed elsewhere: a changed A imports but cannot be sent (blocker and refusal, nothing written), and Add
 *      another quote is refused.
 *  10. the switch, on lead S: A approved and its contract sent. Re-sending B's unchanged Dealer Copy imports a new
 *      draft (B's newest had been closed), and sending it supersedes A, unshares A's quote and contract and puts
 *      S back to Quoted.
 *  11. deletes everything it wrote and restores the markup rules and dc_settings, even on failure.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch already migrated with 040. It takes
 * its connection from E2E_POSTGRES_URL alone and refuses production (cold-term). Never print the URL.
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" \
 *     npx vitest run --config scripts/verify-quote-options.config.mts --disableConsoleIntercept
 *
 * To watch it fail: put 030's old per-job one-offered statements back and run it. Step 6 must fail with
 * "could not create exclusion constraint". Then restore 030 and re-run scripts/migrate.mjs on the branch.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

const blobs = vi.hoisted(() => new Map<string, Buffer>());
const hooks = vi.hoisted(() => ({ emails: [] as string[], printed: [] as string[] }));
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
vi.mock("../lib/dc/contract-pdf", () => ({
  renderContractPdf: async (input: { projectNo: string; version: number }) => {
    hooks.printed.push(`Contract ${input.projectNo} v${input.version}`);
    return {
      bytes: new Uint8Array(Buffer.from(`%PDF-1.4 verify contract ${input.projectNo} v${input.version}`)),
      marks: { initials: [], signature: { page: 0, x: 154, y: 300 } },
    };
  },
}));
vi.mock("../lib/dc/quote-pdf", () => ({
  buildQuotePdf: async (input: { projectNo: string; version: number }) => {
    hooks.printed.push(`Quote ${input.projectNo} v${input.version}`);
    return new Uint8Array(Buffer.from(`%PDF-1.4 verify quote ${input.projectNo} v${input.version}`));
  },
}));
vi.mock("../lib/dc/send-quote-email", () => ({
  sendQuoteEmail: async (_job: unknown, fileName: string) => {
    hooks.emails.push(fileName);
  },
}));
vi.mock("../lib/dc/send-contract-email", () => ({
  sendContractEmail: async (_job: unknown, fileName: string) => {
    hooks.emails.push(fileName);
  },
}));

import { getFile } from "../lib/admin/files";
import { approveDcQuote, offeredVersions } from "../lib/dc/approve";
import { importDealerCopy } from "../lib/dc/import";
import { loadReview, sendContract, sendQuote, signedElsewhere } from "../lib/dc/send";
import { addQuoteOption, OPTION_SIGNED, saveMarkupRule, setLineOverride } from "../lib/dc/store";
import { recordSignature } from "../lib/portal/sign";
import { formatOptionNo } from "../lib/portal/project-no";

const FORBIDDEN_HOSTS = ["cold-term"];
const BANNER = "\n================ verify-quote-options REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-quote-options refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL or .env.local.\n" +
      "Give it a Neon test branch. It does not skip: no result means it did not run, not that the SQL holds.",
  );
}
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse("E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.");
  }
})();
for (const forbidden of FORBIDDEN_HOSTS) {
  if (url.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at ${host.split(".")[0]}, the production endpoint. Cut a Neon branch instead.`);
}
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;

const sql = neon(url);
const ACTOR = "verify-quote-options@example.com";
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Quote Options";
const MESSAGE_PREFIX = `<verify-qo-${STAMP}`;
const message = (n: number) => `${MESSAGE_PREFIX}-${n}@example.com>`;
const FIXTURE = readFileSync("tests/fixtures/dc/dealer-copy-4-lines.html", "utf8");
const COLLECTIONS = ["Duette", "Silhouette", "Palm Beach Shutters", "Motorization"];
const RULES: Record<string, number> = { Duette: 200, Silhouette: 185.5, "Palm Beach Shutters": 150, Motorization: 120 };
const INSTALL_CENTS = 25000;

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const failure = (error: { code?: string; constraint?: string }) => `${error.code}:${error.constraint}`;

type Lead = { id: string; projectNo: number };
const newLead = async (suffix: string): Promise<Lead> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550199', ${`verify-qo-${STAMP}-${suffix}@example.com`}, 'Henderson', 'phone', 'visit_booked')
    returning id, project_no`;
  return { id: rows[0].id as string, projectNo: Number(rows[0].project_no) };
};
const installFor = (leadId: string) => sql`
  insert into install_quotes (id, lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
  values (${randomUUID()}, ${leadId}, 'final', 0, ${INSTALL_CENTS}, ${INSTALL_CENTS}, ${ACTOR})`;
const optionNo = (lead: Lead, letter: string) => formatOptionNo(lead.projectNo, letter)!;
/** The fixture as DC prints it with `po` in PO Reference and `client` as the Client (another client is a changed quote). */
const dealerCopy = (po: string, client = "Test") => {
  const html = FIXTURE.replace("<td>PSS-1042</td>", `<td>${po}</td>`).replace("<b>Client:</b></td><td>Test<", `<b>Client:</b></td><td>${client}<`);
  if (!html.includes(`<td>${po}</td>`) || !html.includes(`<td>${client}<`)) throw new Error(`setup: the fixture has no PO or Client cell for ${po}`);
  return html;
};
const importAs = (n: number, html: string) => importDealerCopy({ internetMessageId: message(n), receivedAt: new Date(), html });
const versionsOf = (leadId: string) => sql`
  select id, option, version, status, po_reference, client_total_cents, quote_file_id, contract_file_id, approved_at
  from dc_quote_versions where lead_id = ${leadId} order by option, version`;
const fileRow = async (id: unknown) =>
  (await sql`select name, doc_type, (shared_at is not null) as shared from job_files where id = ${id as string}`)[0];
const leadRow = async (id: string) => (await sql`select status, quote_cents, sold_cents from leads where id = ${id}`)[0];
const send = async (lead: Lead, letter: string) => {
  const review = await loadReview(lead.id, letter);
  if (!review) throw new Error(`setup: no review for option ${letter}`);
  return { review, answer: await sendQuote({ jobId: lead.id, versionId: review.version.id, fingerprint: review.fingerprint, actor: ACTOR }) };
};
/** Every migration file, in order, split exactly as scripts/migrate.mjs splits it. */
const reapplyMigrations = async () => {
  const dir = "db/migrations";
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(join(dir, file), "utf8").replace(/^\s*--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) {
      try {
        await sql.query(statement);
      } catch (error) {
        throw new Error(`FAILED: re-applying ${file}: ${(error as Error).message}\n  ${statement.split("\n")[0]}`);
      }
    }
  }
};
const scriptLeads = async () => (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

test("quote options: import, add, send two, approve one, sign, and switch against a real database", async () => {
  console.log("\nverify-quote-options: writing to a test branch\n");
  const priorRules = await sql`
    select collection, pct_of_msrp, updated_by, updated_at from markup_rules
    where lower(collection) = any(${COLLECTIONS.map((c) => c.toLowerCase())})`;
  const [priorSettings] = await sql`select terms_file_pathname, terms_updated_by, terms_updated_at from dc_settings where id`;
  if (!priorSettings) throw new Error("setup: dc_settings has no row — is migration 024 applied?");

  const J = await newLead("J");
  const K = await newLead("K");
  const S = await newLead("S");
  try {
    const termsPathname = `verify/terms-qo-${STAMP}.pdf`;
    blobs.set(termsPathname, Buffer.from("%PDF-1.4 verify terms"));
    await sql`update dc_settings set terms_file_pathname = ${termsPathname} where id`;
    for (const [collection, pct] of Object.entries(RULES)) await saveMarkupRule(collection, pct, ACTOR);
    await installFor(J.id);
    await installFor(S.id);

    console.log("step 1: import option A");
    const a1 = await importAs(1, dealerCopy(optionNo(J, "A")));
    check(a1.outcome === "imported" && a1.leadId === J.id && a1.version === 1, "option A imports as version 1", JSON.stringify(a1));
    let rows = await versionsOf(J.id);
    check(rows.length === 1 && rows[0].option === "A" && rows[0].po_reference === optionNo(J, "A"), "the version is option A, at J's own number", JSON.stringify(rows));

    console.log("step 2: the release gate");
    const early = await importAs(2, dealerCopy(optionNo(J, "B")));
    check(early.outcome === "no-match" && early.leadId === null && early.detail === optionNo(J, "B"),
      "PSS-…-B is no-match while J has no option B", JSON.stringify(early));
    const recorded = (await sql`select outcome, lead_id, detail from ingested_messages where message_id = ${message(2)}`)[0];
    check(recorded?.outcome === "no-match" && recorded.lead_id === null && recorded.detail === optionNo(J, "B"),
      "the message is recorded no-match with the PO it printed", JSON.stringify(recorded));
    const jFiles = (await sql`select count(*)::int as n from job_files where lead_id = ${J.id}`)[0].n;
    check((await versionsOf(J.id)).length === 1 && jFiles === 1, "nothing new on J: one version, one Dealer Copy", `files ${jFiles}`);

    console.log("step 3: Add another quote");
    check(same(await addQuoteOption(J.id, ACTOR), { letter: "B" }), "J gets option B", "");
    const stored = await sql`select letter, created_by from quote_options where lead_id = ${J.id}`;
    check(same(stored.map((r) => [r.letter, r.created_by]), [["B", ACTOR]]), "one quote_options row, B, by the owner", JSON.stringify(stored));
    const added = await sql`select kind, body from job_events where lead_id = ${J.id} and body like 'Added quote option%'`;
    check(same(added.map((e) => [e.kind, e.body]), [["quote", `Added quote option ${optionNo(J, "B")}`]]),
      "one 'quote' event names the new number", JSON.stringify(added));
    await sql`insert into quote_options (lead_id, letter, created_by) select ${K.id}, chr(c), ${ACTOR} from generate_series(66, 90) as c`;
    check(same(await addQuoteOption(K.id, ACTOR), { error: "This job already has options A to Z." }), "a job holding B to Z is refused past Z", "");
    check((await sql`select count(*)::int as n from quote_options where lead_id = ${K.id}`)[0].n === 25, "K still has 25 stored options", "");

    console.log("step 4: import option B, and a change to option A");
    const b1 = await importAs(3, dealerCopy(optionNo(J, "B")));
    check(b1.outcome === "imported" && b1.leadId === J.id && b1.version === 1, "option B imports as version 1 once B exists", JSON.stringify(b1));
    const bEvent = await sql`select body from job_events where lead_id = ${J.id} and kind = 'quote' and body like ${`%arrived as ${optionNo(J, "B")} version 1`}`;
    check(bEvent.length === 1, "B's import event names PSS-…-B version 1", JSON.stringify(bEvent));
    const unchangedA = await importAs(4, dealerCopy(optionNo(J, "A")));
    check(unchangedA.outcome === "unchanged", "an unchanged A copy is unchanged (compared with option A only)", JSON.stringify(unchangedA));
    const a2 = await importAs(5, dealerCopy(optionNo(J, "A"), "Test Revised"));
    check(a2.outcome === "imported" && a2.version === 2, "a changed A copy is A version 2, numbered within A", JSON.stringify(a2));
    rows = await versionsOf(J.id);
    check(same(rows.map((r) => [r.option, r.version, r.status]), [["A", 1, "draft"], ["A", 2, "draft"], ["B", 1, "draft"]]),
      "A v1, A v2 and B v1, all drafts", JSON.stringify(rows));
    const [, a2Id, bId] = rows.map((r) => r.id as string);
    const dupe = await sql`
      insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
        dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, lead_id, 'B', 1, dc_quote_no, po_reference, source_file_id, ${"0".repeat(64)}, 'draft', 1, 0, 0, 1
      from dc_quote_versions where id = ${bId}`.then(() => "inserted", failure);
    check(dupe === "23505:dc_quote_versions_lead_option_version_key", "a second B version 1 violates the per-option unique key", dupe);

    console.log("step 5: send A and B");
    check(await setLineOverride(J.id, bId, 1, 250, ACTOR), "setup: B's line 1 is priced differently from A's", "refused");
    const sentA = await send(J, "A");
    check(same(sentA.answer, { ok: true, emailed: true }) && sentA.review.version.id === a2Id, "Send quote sends A version 2", JSON.stringify(sentA.answer));
    const sentB = await send(J, "B");
    check(same(sentB.answer, { ok: true, emailed: true }) && sentB.review.version.id === bId, "Send quote sends B version 1 while A is offered", JSON.stringify(sentB.answer));
    const totalA = sentA.review.priced.clientTotalCents;
    const totalB = sentB.review.priced.clientTotalCents;
    check(totalA !== null && totalB !== null && totalA !== totalB, "setup: A and B have different totals", `${totalA} ${totalB}`);
    rows = await versionsOf(J.id);
    check(same(rows.map((r) => [r.option, r.version, r.status, r.client_total_cents]),
      [["A", 1, "superseded", null], ["A", 2, "offered", totalA], ["B", 1, "offered", totalB]]),
      "A v1 superseded; A v2 and B v1 both offered at their own totals (the per-option one-offered rule)", JSON.stringify(rows));
    const quoteA = rows[1].quote_file_id;
    const quoteB = rows[2].quote_file_id;
    check(same(await fileRow(quoteA), { name: `Quote ${optionNo(J, "A")} v2.pdf`, doc_type: "quote", shared: true }) &&
        same(await fileRow(quoteB), { name: `Quote ${optionNo(J, "B")} v1.pdf`, doc_type: "quote", shared: true }),
      "each option's quote PDF is shared under its own number", JSON.stringify([await fileRow(quoteA), await fileRow(quoteB)]));
    check(same(hooks.printed, [`Quote ${optionNo(J, "A")} v2`, `Quote ${optionNo(J, "B")} v1`]), "each PDF is headed with its option's number", JSON.stringify(hooks.printed));
    check(same(await leadRow(J.id), { status: "quoted", quote_cents: totalB, sold_cents: null }), "J is Quoted at the last total sent, B's", JSON.stringify(await leadRow(J.id)));
    const second = await sql`
      insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
        dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, lead_id, 'B', 2, dc_quote_no, po_reference, source_file_id, ${"0".repeat(64)}, 'offered', 1, 0, 0, 1
      from dc_quote_versions where id = ${bId}`.then(() => "inserted", failure);
    check(second === "23P01:dc_quote_versions_one_offered", "a second offered B version still fails at commit", second);
    const offeredNow = await offeredVersions(J.id);
    check(same(offeredNow.map((v) => [v.option, v.id, v.clientTotalCents]), [["A", a2Id, totalA], ["B", bId, totalB]]),
      "offeredVersions lists A then B, with their totals", JSON.stringify(offeredNow));

    console.log("step 6: re-apply every migration with two options offered");
    await reapplyMigrations();
    console.log("  ok  every migration file re-applied in order");
    const constraints = await sql`
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'dc_quote_versions'::regclass
        and conname in ('dc_quote_versions_one_offered','dc_quote_versions_lead_option_version_key','dc_quote_versions_lead_id_version_key')`;
    const def = (name: string) => (constraints.find((c) => c.conname === name)?.def as string | undefined) ?? "";
    check(/\(lead_id WITH =, "?option"? WITH =\)/.test(def("dc_quote_versions_one_offered")) && def("dc_quote_versions_one_offered").includes("DEFERRABLE INITIALLY DEFERRED"),
      "the one-offered rule is still per option, and deferred", JSON.stringify(constraints));
    check(/UNIQUE \(lead_id, "?option"?, version\)/.test(def("dc_quote_versions_lead_option_version_key")) && def("dc_quote_versions_lead_id_version_key") === "",
      "versions are unique per (lead, option, version), and the per-job key is gone", JSON.stringify(constraints));
    check(same((await versionsOf(J.id)).map((r) => r.status), ["superseded", "offered", "offered"]), "the re-run changed no version", "");

    console.log("step 7: the client approves B");
    const approved = await approveDcQuote(J.id, bId, ACTOR);
    check(same(approved, { version: 1, option: "B", moved: true }), "approveDcQuote answers B version 1, and that J moved", JSON.stringify(approved));
    rows = await versionsOf(J.id);
    check(same(rows.map((r) => [r.option, r.version, r.status, r.approved_at !== null]),
      [["A", 1, "superseded", false], ["A", 2, "superseded", false], ["B", 1, "offered", true]]),
      "A's offered version is superseded in the same statement, and B is approved", JSON.stringify(rows));
    check((await fileRow(quoteA)).shared === false && (await fileRow(quoteB)).shared === true, "A's quote PDF is unshared, B's stays shared", "");
    check(same(await leadRow(J.id), { status: "approved", quote_cents: totalB, sold_cents: null }), "J is Approved at B's total", JSON.stringify(await leadRow(J.id)));
    const stages = await sql`select from_status, to_status, body from job_events where lead_id = ${J.id} and kind = 'stage' order by created_at`;
    check(same(stages.at(-1), { from_status: "quoted", to_status: "approved", body: `Approved ${optionNo(J, "B")} version 1` }),
      "the stage event names PSS-…-B version 1", JSON.stringify(stages));
    check((await approveDcQuote(J.id, a2Id, ACTOR)) === null, "approving the closed A answers null", "not null");
    const offeredAfter = await offeredVersions(J.id);
    check(offeredAfter.length === 1 && offeredAfter[0].id === bId && offeredAfter[0].approvedAt !== null, "only B is still offered, and approved", JSON.stringify(offeredAfter));

    console.log("step 8: B's contract and signature");
    check(same(await sendContract({ jobId: J.id, versionId: bId, actor: ACTOR }), { ok: true, emailed: true }), "sendContract sends B's contract", "");
    const bSent = (await versionsOf(J.id))[2];
    check(bSent.status === "sent" && bSent.contract_file_id !== null && bSent.client_total_cents === totalB, "B is sent at its total", JSON.stringify(bSent));
    check(same(await fileRow(bSent.contract_file_id), { name: `Contract ${optionNo(J, "B")} v1.pdf`, doc_type: "contract", shared: true }),
      "the contract is shared as Contract PSS-…-B v1.pdf", JSON.stringify(await fileRow(bSent.contract_file_id)));
    const contractFile = await getFile(bSent.contract_file_id as string);
    if (!contractFile) throw new Error("setup: B's contract file is gone");
    const signed = await recordSignature({ jobId: J.id, file: contractFile, name: "Jane Doe", email: ACTOR, ip: null, userAgent: null, adoption: { method: "typed", initials: null } });
    check(signed === "signed", "recordSignature answers signed", signed);
    check((await versionsOf(J.id))[2].status === "signed" && same(await leadRow(J.id), { status: "signed", quote_cents: totalB, sold_cents: totalB }),
      "B is signed, and J is Signed with sold_cents = B's total", JSON.stringify(await leadRow(J.id)));

    console.log("step 9: once B is signed, A cannot be sent and no option can be added");
    const a3 = await importAs(6, dealerCopy(optionNo(J, "A"), "Test Third"));
    check(a3.outcome === "imported" && a3.version === 3, "a changed A still imports, as A version 3", JSON.stringify(a3));
    const blocked = await loadReview(J.id, "A");
    check(blocked !== null && blocked.blockers.includes(signedElsewhere("B")), "A's review is blocked: Option B is signed", JSON.stringify(blocked?.blockers));
    const quotesBefore = (await sql`select count(*)::int as n from job_files where lead_id = ${J.id} and doc_type = 'quote'`)[0].n;
    const refused = await sendQuote({ jobId: J.id, versionId: blocked!.version.id, fingerprint: blocked!.fingerprint, actor: ACTOR });
    check(same(refused, { error: signedElsewhere("B") }), "Send quote on A is refused", JSON.stringify(refused));
    const quotesAfter = (await sql`select count(*)::int as n from job_files where lead_id = ${J.id} and doc_type = 'quote'`)[0].n;
    check((await versionsOf(J.id)).find((r) => r.option === "A" && r.version === 3)?.status === "draft" && quotesAfter === quotesBefore,
      "A v3 is still a draft and no quote file was made", `quote files ${quotesBefore} -> ${quotesAfter}`);
    check(same(await addQuoteOption(J.id, ACTOR), { error: OPTION_SIGNED }), "Add another quote is refused on a signed job", "");

    console.log("step 10: switching after approval");
    check((await importAs(7, dealerCopy(optionNo(S, "A")))).outcome === "imported", "setup: S's option A imports", "");
    check(same(await addQuoteOption(S.id, ACTOR), { letter: "B" }), "setup: S gets option B", "");
    const sB = dealerCopy(optionNo(S, "B"));
    check((await importAs(8, sB)).outcome === "imported", "setup: S's option B imports", "");
    const sA = await send(S, "A");
    check(same(sA.answer, { ok: true, emailed: true }), "setup: S's A is sent", JSON.stringify(sA.answer));
    const sAId = sA.review.version.id;
    check(same(await approveDcQuote(S.id, sAId, ACTOR), { version: 1, option: "A", moved: true }), "the client approves A", "");
    let sRows = await versionsOf(S.id);
    check(same(sRows.map((r) => [r.option, r.version, r.status]), [["A", 1, "offered"], ["B", 1, "superseded"]]),
      "approving A closed B's draft in the same statement", JSON.stringify(sRows));
    check(same(await sendContract({ jobId: S.id, versionId: sAId, actor: ACTOR }), { ok: true, emailed: true }), "A's contract is sent", "");
    const sARow = (await versionsOf(S.id))[0];
    const resent = await importAs(9, sB);
    check(resent.outcome === "imported" && resent.version === 2,
      "B's unchanged Dealer Copy, re-sent, comes back as B version 2 (its newest had been closed)", JSON.stringify(resent));
    const sBsend = await send(S, "B");
    check(same(sBsend.answer, { ok: true, emailed: true }), "Send quote sends B version 2", JSON.stringify(sBsend.answer));
    sRows = await versionsOf(S.id);
    check(same(sRows.map((r) => [r.option, r.version, r.status]), [["A", 1, "superseded"], ["B", 1, "superseded"], ["B", 2, "offered"]]),
      "sending B closed the approved A (contract sent, unsigned)", JSON.stringify(sRows));
    check((await fileRow(sARow.quote_file_id)).shared === false && (await fileRow(sARow.contract_file_id)).shared === false,
      "A's quote and unsigned contract are unshared", "");
    check(same(await leadRow(S.id), { status: "quoted", quote_cents: sBsend.review.priced.clientTotalCents, sold_cents: null }),
      "S is back to Quoted at B's total", JSON.stringify(await leadRow(S.id)));
    check(same((await offeredVersions(S.id)).map((v) => v.id), [sRows[2].id]), "only B version 2 is offered", "");

    console.log("\nPASSED: quote options hold against a real database. Manual run, not coverage.\n");
  } finally {
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`step 11: cleanup could not ${label}:`, (error as Error).message);
      }
    };
    await attempt("restore the markup rules", async () => {
      await sql`delete from markup_rules where lower(collection) = any(${COLLECTIONS.map((c) => c.toLowerCase())})`;
      for (const rule of priorRules) {
        await sql`insert into markup_rules (collection, pct_of_msrp, updated_by, updated_at)
                  values (${rule.collection}, ${rule.pct_of_msrp}, ${rule.updated_by}, ${rule.updated_at})`;
      }
    });
    await attempt("restore dc_settings", () => sql`
      update dc_settings set terms_file_pathname = ${priorSettings.terms_file_pathname},
        terms_updated_by = ${priorSettings.terms_updated_by}, terms_updated_at = ${priorSettings.terms_updated_at}
      where id`);
    let leads = [J.id, K.id, S.id];
    await attempt("find leftover leads", async () => { leads = [...new Set([...leads, ...(await scriptLeads())])]; });
    await attempt("delete signatures", () => sql`delete from contract_signatures where lead_id = any(${leads})`);
    await attempt("delete versions", () => sql`delete from dc_quote_versions where lead_id = any(${leads})`);
    await attempt("delete messages", () => sql`delete from ingested_messages where lead_id = any(${leads}) or message_id like ${"<verify-qo-%"}`);
    await attempt("delete events", () => sql`delete from job_events where lead_id = any(${leads})`);
    await attempt("delete files", () => sql`delete from job_files where lead_id = any(${leads})`);
    await attempt("delete leads", () => sql`delete from leads where id = any(${leads})`);
    await attempt("report what is left", async () => {
      const residue = await sql`select count(*)::int as n from leads where name like ${`${NAME_PREFIX} %`}`;
      const options = await sql`select count(*)::int as n from quote_options where lead_id = any(${leads})`;
      console.log(`step 11: cleanup, ${residue[0].n} leads and ${options[0].n} quote options left`);
    });
  }
});
```

- [ ] **Step 3: Typecheck and commit before running**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add scripts/verify-quote-options.ts scripts/verify-quote-options.config.mts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "test: verify-quote-options proves the quote options SQL on a Neon branch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Run it twice against the test branch**

Only against the Neon test branch migrated in Task 1 Step 11, never production:

```bash
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-quote-options.config.mts --disableConsoleIntercept
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-quote-options.config.mts --disableConsoleIntercept
```

Expected: both runs print every `ok` line, then `PASSED: quote options hold against a real database.` and `step 11: cleanup, 0 leads and 0 quote options left`. If a step fails, fix the code (not the check) unless the check contradicts the spec, and say which.

- [ ] **Step 5: Mutation check (the 030 change, for real)**

Append the old statements to the end of `db/migrations/030_deposit_flow.sql`:

```sql
alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered;
alter table dc_quote_versions add constraint dc_quote_versions_one_offered
  exclude using btree (lead_id with =) where (status = 'offered') deferrable initially deferred;
```

Run the Step 4 command once. Expected: FAIL at step 6 with `FAILED: re-applying 030_deposit_flow.sql: could not create exclusion constraint "dc_quote_versions_one_offered"`. The cleanup still runs. Then restore and repair the branch:

```bash
git checkout -- db/migrations/030_deposit_flow.sql
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs | grep -E "^Using|one_offered"
```

Expected: `Using MIGRATE_DATABASE_URL -> ep-…` (not cold-term), and `040_quote_options.sql: alter table dc_quote_versions add constraint dc_quote_versions_one_offered` with no error. Re-run Step 4 once. Expected: PASSED.

- [ ] **Step 6: Re-run the existing verify scripts**

```bash
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-dc-quote-import.config.mts --disableConsoleIntercept
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-deposit-flow.config.mts --disableConsoleIntercept
```

Expected: both PASS. `verify-dc-quote-import` exercises option A end to end (its step 6b now expects `option: "A"`). `verify-deposit-flow` step 14 still gets `23P01:dc_quote_versions_one_offered` for two offered versions of one option.

---

### Task 10: E2E, two options from the owner to the client's contract

**Files:**
- Modify: `e2e/dc-quote.spec.ts` (`seedImport`, imports, a new describe at the end of the file)

**Interfaces:**
- Consumes: the whole feature, through a production build against the migrated test branch.

- [ ] **Step 1: Let `seedImport` seed any option**

In `e2e/dc-quote.spec.ts`:
- Change `import { formatProjectNo } from "../lib/portal/project-no";` to `import { formatOptionNo, formatProjectNo } from "../lib/portal/project-no";`.
- Replace the whole `seedImport` function with:

```ts
/**
 * What importDealerCopy would store, without its blob write: the Dealer Copy's job_files row
 * (a pathname this test never reads), then importVersion's own statement — the message record,
 * the version (numbered within its quote option) as a draft, its lines and the timeline event.
 */
async function seedImport(jobId: string, html: string, quote: DcQuote, messageId = MESSAGE_ID): Promise<string> {
  const [file] = await sql()`insert into job_files
    (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${jobId}, 'Direct Connect', 'document', ${`DEALER COPY ${quote.quoteNo}.html`}, 'text/html',
            ${Buffer.byteLength(html)}, ${`e2e/${jobId}/dealer-copy-${messageId}.html`}, 'dealer_copy')
    returning id`;
  const lines = JSON.stringify(quote.lines.map((l) => ({
    position: l.position, qty: l.qty, room: l.room, description: l.description, collection: l.collection,
    base_cents: l.baseCents, promotion_cents: l.promotionCents, options_cents: l.optionsCents,
    msrp_unit_cents: l.msrpUnitCents, cost_factor: l.costFactor, cost_unit_cents: l.costUnitCents,
    cost_extended_cents: l.costExtendedCents, options: l.options,
  })));
  const sha256 = createHash("sha256").update(html).digest("hex");
  const arrived = quote.option === "A" ? `Direct Connect quote ${quote.quoteNo} arrived as version ` : `Direct Connect quote ${quote.quoteNo} arrived as ${quote.poReference} version `;
  const rows = await sql()`
    with msg as (
      insert into ingested_messages (message_id, received_at, outcome, lead_id, dc_quote_no)
      values (${messageId}, now(), 'imported', ${jobId}, ${quote.quoteNo})
      on conflict (message_id) do nothing
      returning message_id
    ),
    version as (
      insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, source_file_id, source_sha256,
        message_id, status, dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, ${jobId}, ${quote.option},
        coalesce((select max(version) from dc_quote_versions where lead_id = ${jobId} and option = ${quote.option}), 0) + 1,
        ${quote.quoteNo}, ${quote.poReference}, ${file.id}, ${sha256}, msg.message_id, 'draft',
        ${quote.subtotalCents}, ${quote.handlingFeeCents}, ${quote.oversizedFeeCents}, ${quote.dealerTotalCents}
      from msg
      returning id, lead_id, version
    ),
    inserted as (
      insert into dc_quote_lines (version_id, position, qty, room, description, collection, base_cents, promotion_cents,
        options_cents, msrp_unit_cents, cost_factor, cost_unit_cents, cost_extended_cents, options)
      select version.id, l.position, l.qty, l.room, l.description, l.collection, l.base_cents, l.promotion_cents,
        l.options_cents, l.msrp_unit_cents, l.cost_factor, l.cost_unit_cents, l.cost_extended_cents, l.options
      from version, jsonb_to_recordset(${lines}::jsonb) as l(position int, qty int, room text, description text,
        collection text, base_cents int, promotion_cents int, options_cents int, msrp_unit_cents int,
        cost_factor numeric, cost_unit_cents int, cost_extended_cents int, options jsonb)
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, 'Direct Connect', 'quote', ${arrived} || version from version
    )
    select id from version`;
  return rows[0].id as string;
}
```

- [ ] **Step 2: Add the two-option journey at the end of the file**

Append to `e2e/dc-quote.spec.ts`:

```ts
test.describe("two quote options: the client sees both, approves B, A closes and B's contract arrives", () => {
  // Send stores PDFs in Blob, like the describe above. The file runs serially, so the markups set in Settings and
  // the terms template saved above are still in place when this runs.
  test.beforeAll(() => {
    if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
      throw new Error("E2E_BLOB_READ_WRITE_TOKEN is not set. The two-option journey sends real PDFs and must run.");
    }
  });

  const OPTIONS_CUSTOMER = `e2e-dc-options-${STAMP}@example.com`;
  let optionsJob: { id: string; projectNo: number };
  const optionNo = (letter: string) => formatOptionNo(optionsJob.projectNo, letter)!;
  let totalA = 0;
  let totalB = 0;

  test("the owner adds option B, both options import, and both are sent at once", async ({ page }) => {
    optionsJob = await lead(`${NAME} Options`, OPTIONS_CUSTOMER, "visit_booked");
    await sql()`insert into install_quotes (lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
      values (${optionsJob.id}, 'final', 0, ${INSTALL_CENTS}, ${INSTALL_CENTS}, ${OWNER})`;
    const htmlFor = (letter: string) => readFileSync(FIXTURE, "utf8").replace("PSS-1042", optionNo(letter));
    const parsedA = parseDealerCopy(htmlFor("A"));
    if (!parsedA.ok) throw new Error(`The fixture did not parse: ${parsedA.refusal.detail}`);
    await seedImport(optionsJob.id, htmlFor("A"), parsedA.quote, `${MESSAGE_ID}-option-a`);

    await signInOwner(page);
    await page.goto(`/admin/jobs/${optionsJob.id}?tab=quote`);
    await expect(page.getByRole("region", { name: /^DC quote / })).toBeVisible();
    // One option: no option headings, exactly as before.
    await expect(page.getByRole("region", { name: /^Option / })).toHaveCount(0);
    await page.getByRole("button", { name: "Add another quote" }).click();
    const cardB = page.getByRole("region", { name: `Option B · ${optionNo("B")}` });
    await expect(cardB).toBeVisible();
    await expect(cardB).toContainText(`No Direct Connect quote yet. Put ${optionNo("B")} in PO Reference`);
    expect(await sql()`select letter, created_by from quote_options where lead_id = ${optionsJob.id}`).toEqual([{ letter: "B", created_by: OWNER }]);
    expect(await sql()`select kind, body from job_events where lead_id = ${optionsJob.id} and body like 'Added quote option%'`)
      .toEqual([{ kind: "quote", body: `Added quote option ${optionNo("B")}` }]);

    // B's Dealer Copy as the import stores it once option B exists, with its first line priced up so the totals differ.
    const parsedB = parseDealerCopy(htmlFor("B"));
    if (!parsedB.ok) throw new Error(`The B copy did not parse: ${parsedB.refusal.detail}`);
    expect(parsedB.quote.option).toBe("B");
    const versionB = await seedImport(optionsJob.id, htmlFor("B"), parsedB.quote, `${MESSAGE_ID}-option-b`);
    await sql()`update dc_quote_lines set pct_override = 80 where version_id = ${versionB} and position = 1`;
    const price = (override: number | null) => priceVersion({
      lines: parsedA.quote.lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection, msrpUnitCents: l.msrpUnitCents,
        costExtendedCents: l.costExtendedCents, pctOverride: l.position === 1 ? override : null })),
      rules: MARKUPS, handlingFeeCents: parsedA.quote.handlingFeeCents, oversizedFeeCents: parsedA.quote.oversizedFeeCents,
      dealerTotalCents: parsedA.quote.dealerTotalCents, waiveHandling: false,
      install: { id: "e2e", kind: "final", totalCents: INSTALL_CENTS, createdAt: new Date() }, noInstall: false,
    });
    totalA = price(null).clientTotalCents!;
    totalB = price(80).clientTotalCents!;
    expect(totalB).not.toBe(totalA);

    await page.reload();
    const cardA = page.getByRole("region", { name: `Option A · ${optionNo("A")}` });
    for (const [card, total] of [[cardA, totalA], [cardB, totalB]] as const) {
      await expect(figure(card, "Client total")).toHaveText(formatCents(total));
      await card.getByRole("button", { name: "Send quote" }).click();
      await expect(card.getByRole("status")).toHaveText("Quote sent, but the email to the client failed — send them their project page link yourself.");
    }

    const versions = await sql()`select option, status, client_total_cents, quote_file_id from dc_quote_versions where lead_id = ${optionsJob.id} order by option`;
    expect(versions).toEqual([
      { option: "A", status: "offered", client_total_cents: totalA, quote_file_id: expect.any(String) },
      { option: "B", status: "offered", client_total_cents: totalB, quote_file_id: expect.any(String) },
    ]);
    const quotes = await sql()`select name, (shared_at is not null) as shared from job_files where lead_id = ${optionsJob.id} and doc_type = 'quote'`;
    expect(quotes.map((f) => `${f.name}:${f.shared}`).sort()).toEqual([`Quote ${optionNo("A")} v1.pdf:true`, `Quote ${optionNo("B")} v1.pdf:true`].sort());
    expect(await sql()`select status, quote_cents from leads where id = ${optionsJob.id}`).toEqual([{ status: "quoted", quote_cents: totalB }]);
    expect(pdfText(await fetchBytes(page, `/admin/files/${versions[1].quote_file_id}`))).toContain(`Quote ${optionNo("B")} · Version 1`);
  });

  test("the client sees both options with their own PDFs, approves B, A is gone and B's contract arrives", async ({ browser }) => {
    const [a, b] = await sql()`select id, quote_file_id from dc_quote_versions where lead_id = ${optionsJob.id} order by option`;
    const customer = await customerPage(browser, OPTIONS_CUSTOMER);
    const banner = customer.getByRole("region", { name: "Where your project stands" });
    await expect(banner.getByText("Approve this quote", { exact: true })).toHaveCount(0);
    await expect(banner.getByRole("link", { name: "Review your options" })).toHaveAttribute("href", "#quote-options");

    const options = customer.getByRole("region", { name: "Your quote options" });
    const optionA = options.getByRole("listitem", { name: "Option A" });
    const optionB = options.getByRole("listitem", { name: "Option B" });
    await expect(optionA).toContainText(formatCents(totalA));
    await expect(optionB).toContainText(formatCents(totalB));
    await expect(optionA.getByRole("link", { name: `Quote ${optionNo("A")} v1.pdf` })).toHaveAttribute("href", `/project/files/${a.quote_file_id}`);
    await expect(optionB.getByRole("link", { name: `Quote ${optionNo("B")} v1.pdf` })).toHaveAttribute("href", `/project/files/${b.quote_file_id}`);
    // Each option's PDF downloads on its own.
    for (const fileId of [a.quote_file_id, b.quote_file_id]) {
      const bytes = await fetchBytes(customer, `/project/files/${fileId}`);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    }

    await optionB.getByText("Approve Option B", { exact: true }).click();
    await optionB.getByRole("button", { name: "Yes, approve Option B" }).click();
    await expect(customer).toHaveURL(new RegExp(`/project/${optionsJob.id}\\?approved=1$`));
    await expect(customer.getByRole("status")).toContainText("Thank you — we have your approval");
    await expect(customer.getByRole("region", { name: "Your quote options" })).toHaveCount(0);
    await expect(customer.getByRole("heading", { name: "Documents to sign" })).toBeVisible();
    await expect(customer.locator("details", { hasText: `Contract ${optionNo("B")} v1.pdf` })).toHaveCount(1);
    await expect(customer.locator("main")).not.toContainText(`Quote ${optionNo("A")} v1.pdf`);
    expect(await download(customer, `/project/files/${a.quote_file_id}`)).toEqual({ status: 404, html: false });

    const after = await sql()`select option, status, (approved_at is not null) as approved, contract_file_id from dc_quote_versions
      where lead_id = ${optionsJob.id} order by option`;
    expect(after).toEqual([
      { option: "A", status: "superseded", approved: false, contract_file_id: null },
      { option: "B", status: "sent", approved: true, contract_file_id: expect.any(String) },
    ]);
    expect(await sql()`select status, quote_cents from leads where id = ${optionsJob.id}`).toEqual([{ status: "approved", quote_cents: totalB }]);
    const stages = await sql()`select to_status, body from job_events where lead_id = ${optionsJob.id} and kind = 'stage' order by created_at`;
    expect(stages.at(-1)).toEqual({ to_status: "approved", body: `Approved ${optionNo("B")} version 1` });
    expect(await sql()`select name, (shared_at is not null) as shared from job_files where id = ${after[1].contract_file_id}`)
      .toEqual([{ name: `Contract ${optionNo("B")} v1.pdf`, shared: true }]);
    const printed = pdfText(await fetchBytes(customer, `/project/files/${after[1].contract_file_id}`));
    expect(printed).toContain(`Contract ${optionNo("B")} · Version 1`);
    expect(printed).toContain(formatCents(totalB));
  });
});
```

The existing `afterAll` already cleans this lead (`name like 'E2E DC %'`), its customer (`e2e-dc-%`) and its messages (`e2e-dc-%`). `quote_options` and `install_quotes` cascade with the lead.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add e2e/dc-quote.spec.ts
git -c user.name=Joshua -c user.email=whirleyjoshua@gmail.com commit -m "test(e2e): two quote options sent, the client approves B, A closes and B's contract arrives" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Run the DC spec against the test branch**

Follow the `pss local verification quirks` memory: e2e runs only against `next start` on 127.0.0.1, with the Neon test branch. Use the test blob token the controller provides. If port 3100 is taken by another checkout's server, set `E2E_PORT`. If the branch is not `ep-lingering-fog`, set `E2E_TEST_ENDPOINT` to its `ep-…` id.

```bash
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" E2E_BLOB_READ_WRITE_TOKEN="$(cat "$SCRATCH/e2e-blob-token.txt")" \
  npx playwright test e2e/dc-quote.spec.ts --project=desktop
```

Expected: every test in the file passes, including the two new ones. If one fails, read the trace, fix the code or the selector, and re-run. Never weaken an assertion to make it pass.

---

### Task 11: Final verification

**Files:** none changed, unless a check fails.

- [ ] **Step 1: The whole unit suite**

Run: `npx vitest run --maxWorkers=2`
Expected: all pass.

- [ ] **Step 2: Types and lint**

Run: `npm run typecheck` then `npm run lint`
Expected: no type errors and no lint errors. Lint warnings in files this branch did not touch are not yours: report only warnings in files listed in `git diff --name-only main...HEAD`.

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: the build completes. A fresh-worktree build takes about 34s. A stale `.next/dev` made one take 56 min, so delete `.next` first if it exists from an earlier dev run.

- [ ] **Step 4: Confirm the tree**

Run: `git status --short` and `git log --oneline main..HEAD`
Expected: clean, apart from the untracked, gitignored `.env.local`. The log shows the commits from Tasks 1–10. Report the commit list and the verify-script results (both runs, the mutation run, and the two existing scripts) to the controller. Do not deploy and do not migrate production.

---

## Self-review against the spec

| Spec | Where |
|---|---|
| §2 `quote_options`, `option` column, unique per option, one-offered per option, re-run order | Task 1 (with Judgment 1: 030 no longer defines the rule), proven in Task 9 step 6 |
| §2 `formatOptionNo` | Task 2 |
| §3 one card per option, A first, heading only with 2+, DC button per card, Check for new quotes once, Preview/Send per card, older versions per card | Task 7 (`OptionCard`, `review()` per option in Task 5) |
| §3 Add another quote: one statement, next letter, `quote` event, refused when signed/Lost/past Z, empty card text | Task 3 (`addQuoteOption`), Task 7 (button, action), Task 9 step 3/9 |
| §3 Deposit panel once below the cards | Task 7 |
| §4 parse `^PSS-(\d{4,})(?:-([B-Z]))?$`, gate on exact text plus a `quote_options` row, latestSha/version per option, duplicate check only against a live newest version, event wording | Tasks 2, 3, 4; Task 9 steps 2, 4, 10 |
| §5 per-option newer check, `max(version)`, supersede set, file names, PDF header, quote_cents, approved-other-option switch, signed-other-option refusal | Task 5; Task 9 steps 5, 9, 10 |
| §6 `offeredVersions`, one option unchanged, 2+ list with total/PDF/Approve, banner keeps link and drops Approve, versionId re-derived, approval closes others and unshares their PDFs, quote_cents, event wording, sendContract newest within option | Tasks 6, 8; Task 9 steps 7, 8; Task 10 |
| §7 each option's PDF downloadable separately; Preview per card | Task 7 (`?option=`), Task 8 (links), Task 10 (downloads) |
| §8 unit tests listed, mutation checks, real SQL twice, verify script, existing scripts re-run, E2E | Tasks 1–10 (mutation steps in each), Task 9, Task 10 |
| Owner emails name the option number | Task 4 (import email), Task 8 (approval email) |
