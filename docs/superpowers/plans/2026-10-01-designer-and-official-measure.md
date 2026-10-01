# Designer and Official Measure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Measure app asks "Designer measure or Official measure?" first, keeps the two lists apart, and lets a designer tick "Keep as official measure" so no second trip is needed.

**Architecture:** Each `window_measurements` row gets a `kind` (`designer`/`official`); the job (`leads`) records who kept the designer measure as official and when. A pure module (`lib/admin/measure-kinds.ts`) decides which list each reader uses; the data layer enforces "one official list per job" inside its single-statement writes.

**Tech Stack:** Next.js 16 App Router (server components, server actions — read `node_modules/next/dist/docs/` before touching routing or `searchParams`), Neon serverless Postgres (`db()` tagged templates), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-designer-and-official-measure-design.md`

**Worktree:** `C:\Users\whirl\pss\.claude\worktrees\measure-kinds`, branch `feat/measure-kinds` (from `origin/main` 957214c). Run `git rev-parse --show-toplevel` before every edit; it must print that path. Never work in `C:\Users\whirl\pss` (main checkout, 227 behind).

## Global Constraints

- Migration number is **031** (`db/migrations/031_measure_kinds.sql`), every statement re-runnable (`migrate.mjs` re-applies every file).
- Kinds are exactly `'designer'` and `'official'`; default `'designer'`.
- Labels, verbatim: "Designer measure", "Official measure", "Keep as official measure".
- Activity bodies use `job_events.kind = 'measure'` (already allowed by `job_events_kind_check`); kept wording verbatim: "Designer measure kept as official" / "Designer measure no longer kept as official".
- The official measure screen shows **no** designer numbers and no room prefill from the designer list.
- No comparison flags, no quote re-pricing, no job-stage changes, no change to the Home Depot import, no change to `lib/portal/timeline.ts` or `lib/portal/progress.ts`.
- Atomic writes are ONE data-modifying CTE per write (precedent `addMeasurement`, `createFile`) — never two `db()` calls, never `sql.transaction()`.
- Unit tests: `npx vitest run --maxWorkers=2 <files>`. Typecheck: `npx tsc --noEmit`. Never print connection strings.

## Review Focus

1. A bookmarked or stale `?kind=` (missing, repeated `?kind=a&kind=b`, garbage, or `official` on a kept job) → the chooser, never a crash or a form that will be refused. *(Task 4, Step 1 tests)*
2. An official form left open in another tab after someone ticks "Keep as official" → Save is refused with a plain sentence and the typed numbers stay on screen. *(Task 3 + Task 4 tests)*
3. Editing a window never changes its kind. *(Task 2 test: the update statement never assigns `kind`)*
4. The rare race leaving a job both kept AND holding official rows → the Official section still lists those rows under the kept note; nothing is hidden. *(Task 5 test)*
5. Ticking/unticking twice (double tap, two tabs) → no second Activity entry. *(Task 2 test + Task 6 real-SQL check)*

Accepted limitation (write it in the code comment of `setKeptOfficial`): ticking the box in the same instant another person saves the *first* official window can, under READ COMMITTED, let both succeed. With three owners this is accepted; item 4 guarantees nothing is hidden if it ever happens.

---

### Task 1: Migration 031 and the pure kind rules

**Files:**
- Create: `db/migrations/031_measure_kinds.sql`
- Create: `lib/admin/measure-kinds.ts`
- Test: `tests/admin/measure-kinds.test.ts`

**Interfaces:**
- Produces:
  - `MEASURE_KINDS: readonly ["designer","official"]`, `type MeasureKind`, `isMeasureKind(v: unknown): v is MeasureKind`
  - `MEASURE_KIND_LABEL: Record<MeasureKind, string>`
  - `type KeptOfficial = { at: Date; by: string } | null`
  - `type MeasureSet<W extends { kind: MeasureKind }> = { windows: W[]; kept: KeptOfficial }`
  - `windowsOfKind(set, kind): W[]`, `officialWindows(set): W[]`, `workingWindows(set): W[]`, `workingSource(set): MeasureKind | null`

- [ ] **Step 1: Write the migration**

```sql
-- Designer measure vs Official measure. A job is measured by the designer at the consult (for the
-- quote) and officially later (the numbers that are ordered). Each window says which it belongs to.
-- When the designer is confident, the job records that its designer measure IS the official one
-- (who and when) instead of copying rows, so there is only ever one set of numbers to edit.
-- Every statement is safe to re-run. Rows measured before this read 'designer'.

alter table window_measurements add column if not exists kind text not null default 'designer';
alter table window_measurements drop constraint if exists window_measurements_kind_check;
alter table window_measurements add constraint window_measurements_kind_check check (kind in ('designer', 'official'));

alter table leads add column if not exists designer_kept_official_at timestamptz;
alter table leads add column if not exists designer_kept_official_by text;
alter table leads drop constraint if exists leads_designer_kept_official_check;
alter table leads add constraint leads_designer_kept_official_check
  check ((designer_kept_official_at is null) = (designer_kept_official_by is null));
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  isMeasureKind, officialWindows, windowsOfKind, workingSource, workingWindows, type MeasureSet,
} from "@/lib/admin/measure-kinds";

type W = { id: string; kind: "designer" | "official" };
const d1: W = { id: "d1", kind: "designer" };
const d2: W = { id: "d2", kind: "designer" };
const o1: W = { id: "o1", kind: "official" };
const KEPT = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
const set = (windows: W[], kept: MeasureSet<W>["kept"] = null): MeasureSet<W> => ({ windows, kept });

describe("measure kinds", () => {
  it("knows exactly the two kinds", () => {
    expect(isMeasureKind("designer")).toBe(true);
    expect(isMeasureKind("official")).toBe(true);
    for (const v of ["", "Designer", "final", undefined, null, ["official"]]) expect(isMeasureKind(v)).toBe(false);
  });

  it("splits windows by kind, keeping order", () => {
    const s = set([d1, o1, d2]);
    expect(windowsOfKind(s, "designer")).toEqual([d1, d2]);
    expect(windowsOfKind(s, "official")).toEqual([o1]);
  });

  it("the official list is the official windows, or the designer windows when kept", () => {
    expect(officialWindows(set([d1, o1]))).toEqual([o1]);
    expect(officialWindows(set([d1, d2], KEPT))).toEqual([d1, d2]);
    expect(officialWindows(set([d1]))).toEqual([]);
  });

  it("kept wins even if official rows also exist (the accepted race)", () => {
    expect(officialWindows(set([d1, o1], KEPT))).toEqual([d1]);
  });

  it("works from the official list, falling back to the designer list", () => {
    expect(workingWindows(set([d1, o1]))).toEqual([o1]);
    expect(workingWindows(set([d1, d2]))).toEqual([d1, d2]);
    expect(workingWindows(set([d1], KEPT))).toEqual([d1]);
    expect(workingWindows(set([]))).toEqual([]);
  });

  it("names which list is being worked from", () => {
    expect(workingSource(set([d1, o1]))).toBe("official");
    expect(workingSource(set([d1], KEPT))).toBe("official");
    expect(workingSource(set([d1]))).toBe("designer");
    expect(workingSource(set([]))).toBeNull();
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/measure-kinds.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/measure-kinds`.

- [ ] **Step 4: Implement**

```ts
/**
 * Designer measure vs Official measure. The database enforces the same pair with
 * window_measurements_kind_check (031). No "server-only": the job page, the measure screens and
 * their tests all read these rules.
 */
export const MEASURE_KINDS = ["designer", "official"] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];

export const isMeasureKind = (value: unknown): value is MeasureKind =>
  typeof value === "string" && (MEASURE_KINDS as readonly string[]).includes(value);

export const MEASURE_KIND_LABEL: Record<MeasureKind, string> = {
  designer: "Designer measure",
  official: "Official measure",
};

/** Set when the designer measure IS the job's official measure: who said so, and when. */
export type KeptOfficial = { at: Date; by: string } | null;

/** Every window of a job, both kinds, with the job's keep-as-official record. */
export type MeasureSet<W extends { kind: MeasureKind }> = { windows: W[]; kept: KeptOfficial };

export const windowsOfKind = <W extends { kind: MeasureKind }>(set: MeasureSet<W>, kind: MeasureKind): W[] =>
  set.windows.filter((window) => window.kind === kind);

/** The numbers to order from: the designer's when kept as official, else the official measure's. */
export const officialWindows = <W extends { kind: MeasureKind }>(set: MeasureSet<W>): W[] =>
  windowsOfKind(set, set.kept ? "designer" : "official");

/** What pricing, counts and the customer's window picker use: official if there is one, else designer. */
export function workingWindows<W extends { kind: MeasureKind }>(set: MeasureSet<W>): W[] {
  const official = officialWindows(set);
  return official.length ? official : windowsOfKind(set, "designer");
}

/** Which list workingWindows came from, or null when nothing is measured. */
export function workingSource<W extends { kind: MeasureKind }>(set: MeasureSet<W>): MeasureKind | null {
  if (officialWindows(set).length) return "official";
  return windowsOfKind(set, "designer").length ? "designer" : null;
}
```

- [ ] **Step 5: Run to see it pass, then prove its power**

Run: `npx vitest run --maxWorkers=2 tests/admin/measure-kinds.test.ts` → PASS.
Then change `set.kept ? "designer" : "official"` to `"official"`, rerun: the "kept" tests must FAIL. Restore. Change `official.length ?` to `true ?` in `workingWindows`: the fallback test must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/031_measure_kinds.sql lib/admin/measure-kinds.ts tests/admin/measure-kinds.test.ts
git commit -m "feat: migration 031 and the rules for designer vs official measure"
```

---

### Task 2: Data layer — kind on windows, the keep-as-official write

**Files:**
- Modify: `lib/admin/measurements.ts` (whole file shown below where changed)
- Test: `tests/admin/measurements.test.ts`

**Interfaces:**
- Consumes: Task 1 `MeasureKind`, `MeasureSet`, `workingWindows`.
- Produces:
  - `WindowMeasurement` gains `kind: MeasureKind`
  - `type AddResult = { id: string } | { refused: "missing" | "kept" }`
  - `addMeasurement(leadId: string, kind: MeasureKind, input: MeasurementInput, actor: string): Promise<AddResult>`
  - `getMeasureSet(leadId: string): Promise<MeasureSet<WindowMeasurement>>`
  - `listWorkingWindows(leadId: string): Promise<WindowMeasurement[]>`
  - `type KeepResult = "ok" | "unchanged" | "has-official" | "missing"`
  - `setKeptOfficial(leadId: string, kept: boolean, actor: string): Promise<KeepResult>`
  - `updateMeasurement` / `deleteMeasurement` / `listMeasurements` / `getMeasurement` keep their signatures.

- [ ] **Step 1: Update existing tests and add new ones (failing)**

In `tests/admin/measurements.test.ts`, inside `describe("measurements")`:

1. Every `m.addMeasurement(LEAD, input, ...)` call becomes `m.addMeasurement(LEAD, "designer", input, ...)`. The mocked row for a successful add becomes `[{ id: WIN, found: true }]`.
2. Replace the three wording assertions:
   - `"Added 10 windows: Kitchen, Left of sink"` → `"Added 10 windows (designer): Kitchen, Left of sink"`
   - `"Added window: Kitchen, Left of sink"` → `"Added window (designer): Kitchen, Left of sink"`
   - `expect(await m.addMeasurement(LEAD, input, "owner@example.com")).toBe(WIN)` → `.toEqual({ id: WIN })`
3. Replace the test "logs the quantity change on an edit, reading the old quantity in the same statement" body's regex and strings with:

```ts
    expect(statement).toMatch(/with previous as \(select [^)]*\bquantity\b[^)]*\bkind\b[^)]*from window_measurements/);
    expect(statement).toMatch(
      /case when previous\.quantity = \? then \? \|\| previous\.kind \|\| \?\s+else \? \|\| previous\.kind \|\| '\): ' \|\| previous\.quantity::text \|\| \? end/,
    );
    expect(sql.mock.calls[0]).toContain("Edited 7 windows (");
    expect(sql.mock.calls[0]).toContain("): Kitchen, Left of sink");
    expect(sql.mock.calls[0]).toContain("Edited Kitchen, Left of sink (");
    expect(sql.mock.calls[0]).toContain(" → 7 windows");
```

   In "saves a changed quantity when a window is edited…" replace `toContain("Edited 7 windows: Kitchen, Left of sink")` with `toContain("Edited 7 windows (")`. In "says one window, not windows…" replace `"Edited window: Kitchen, Left of sink"` with `"Edited window ("`.
4. In "logs how many windows a deleted line stood for…" expect:

```ts
    expect(statement).toMatch(/returning [^)]*\bquantity\b[^)]*\bkind\b/);
    expect(statement).toContain(
      "case when quantity > 1 then 'Deleted ' || quantity::text || ' windows (' || kind || '): '"
        + " else 'Deleted window (' || kind || '): ' end || room || coalesce(', ' || label, '')",
    );
```

5. In "reads the quantity back from the row" add `kind: "official"` to the row and `expect((await m.getMeasurement(LEAD, WIN))?.kind).toBe("official");`.
6. Replace "returns null for a missing or non-uuid job" with:

```ts
  it("refuses a missing or non-uuid job as missing", async () => {
    sql.mockResolvedValue([{ id: null, found: false }]);
    expect(await m.addMeasurement(LEAD, "designer", input, "o")).toEqual({ refused: "missing" });
    sql.mockClear();
    expect(await m.addMeasurement("nope", "designer", input, "o")).toEqual({ refused: "missing" });
    expect(sql).not.toHaveBeenCalled();
  });
```

7. Add these new tests:

```ts
  it("saves the window's kind and refuses an official window on a kept job, in the same statement", async () => {
    sql.mockResolvedValue([{ id: WIN, found: true }]);
    await m.addMeasurement(LEAD, "official", input, "o");
    expect(sql).toHaveBeenCalledOnce();
    const [strings, ...values] = sql.mock.calls[0];
    const statement = (strings as TemplateStringsArray).join("?");
    expect(statement).toMatch(/insert into window_measurements \(lead_id, kind,/);
    expect(statement).toContain("designer_kept_official_at is null");
    expect(values).toContain("official");
    expect(values).toContain("Added window (official): Kitchen, Left of sink");
  });

  it("says kept when the job exists but the official window was refused", async () => {
    sql.mockResolvedValue([{ id: null, found: true }]);
    expect(await m.addMeasurement(LEAD, "official", input, "o")).toEqual({ refused: "kept" });
  });

  it("never changes a window's kind on edit", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: null, new_photo_id: null }]);
    await m.updateMeasurement(LEAD, WIN, input, "o");
    expect(text(sql.mock.calls[0])).not.toMatch(/\bkind\s*=/);
  });

  it("reads both lists and the kept record for a job", async () => {
    const row = {
      id: WIN, lead_id: LEAD, position: 1, room: "Kitchen", label: null, width_eighths: 285, height_eighths: 384,
      depth_eighths: null, mount: "inside", requirements: [], notes: null, photo_file_id: null, quantity: 1,
      kind: "designer", measured_by: "o", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    };
    sql.mockResolvedValueOnce([row]).mockResolvedValueOnce([
      { designer_kept_official_at: "2026-10-01T15:00:00Z", designer_kept_official_by: "owner@example.com" },
    ]);
    const set = await m.getMeasureSet(LEAD);
    expect(set.windows.map((w) => w.kind)).toEqual(["designer"]);
    expect(set.kept).toEqual({ at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" });
  });

  it("reads no kept record when the job has none", async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ designer_kept_official_at: null, designer_kept_official_by: null }]);
    expect((await m.getMeasureSet(LEAD)).kept).toBeNull();
  });
```

Add a new `describe("setKeptOfficial")` block:

```ts
describe("setKeptOfficial", () => {
  it("ticks only when no official window exists, with its event, in one statement", async () => {
    sql.mockResolvedValue([{ changed: true, found: true, was_kept: false, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, true, "owner@example.com")).toBe("ok");
    expect(sql).toHaveBeenCalledOnce();
    const [strings, ...values] = sql.mock.calls[0];
    const statement = (strings as TemplateStringsArray).join("?");
    expect(statement).toContain("update leads set designer_kept_official_at");
    expect(statement).toContain("kind = 'official'");
    expect(statement).toContain("insert into job_events");
    expect(values).toContain("Designer measure kept as official");
  });

  it("logs the untick wording", async () => {
    sql.mockResolvedValue([{ changed: true, found: true, was_kept: true, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, false, "o")).toBe("ok");
    expect(sql.mock.calls[0]).toContain("Designer measure no longer kept as official");
  });

  it("says unchanged when the box already says so (no second event)", async () => {
    sql.mockResolvedValue([{ changed: false, found: true, was_kept: true, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, true, "o")).toBe("unchanged");
  });

  it("refuses to tick when an official measure is recorded", async () => {
    sql.mockResolvedValue([{ changed: false, found: true, was_kept: false, has_official: true }]);
    expect(await m.setKeptOfficial(LEAD, true, "o")).toBe("has-official");
  });

  it("says missing for an unknown or non-uuid job", async () => {
    sql.mockResolvedValue([{ changed: false, found: false, was_kept: null, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, true, "o")).toBe("missing");
    sql.mockClear();
    expect(await m.setKeptOfficial("nope", true, "o")).toBe("missing");
    expect(sql).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/measurements.test.ts`
Expected: FAIL (new signatures, wording, functions missing).

- [ ] **Step 3: Implement in `lib/admin/measurements.ts`**

Imports and type:

```ts
import "server-only";
import { db } from "@/lib/db";
import { deleteFile } from "./files";
import { workingWindows, type MeasureKind, type MeasureSet } from "./measure-kinds";
import type { Requirement } from "./measure-units";
import type { MeasurementInput } from "./schema";

export type WindowMeasurement = MeasurementInput & {
  id: string;
  leadId: string;
  kind: MeasureKind;
  position: number;
  measuredBy: string;
  createdAt: Date;
  updatedAt: Date;
};
```

In `toMeasurement` add `kind: row.kind as MeasureKind,` after `leadId`.

After `getMeasurement`, add:

```ts
/** Every window of the job (both kinds) and whether its designer measure is kept as official. */
export async function getMeasureSet(leadId: string): Promise<MeasureSet<WindowMeasurement>> {
  if (!UUID.test(leadId)) return { windows: [], kept: null };
  const [windows, rows] = await Promise.all([
    listMeasurements(leadId),
    db()`select designer_kept_official_at, designer_kept_official_by from leads where id = ${leadId}`,
  ]);
  const at = rows[0]?.designer_kept_official_at as string | Date | null | undefined;
  return { windows, kept: at ? { at: new Date(at), by: rows[0].designer_kept_official_by as string } : null };
}

/** The windows pricing and the customer's picker use: official if there is one, else designer. */
export async function listWorkingWindows(leadId: string): Promise<WindowMeasurement[]> {
  return workingWindows(await getMeasureSet(leadId));
}
```

Replace `addMeasurement`:

```ts
export type AddResult = { id: string } | { refused: "missing" | "kept" };

/**
 * Adds a window to the end of the job's list, with its event, in one statement.
 * An official window is refused while the job keeps its designer measure as official, so a job
 * never has two competing official lists. A photo id is kept only if that file belongs to the
 * same job.
 */
export async function addMeasurement(
  leadId: string, kind: MeasureKind, input: MeasurementInput, actor: string,
): Promise<AddResult> {
  if (!UUID.test(leadId)) return { refused: "missing" };
  const rows = await db()`
    with job as (select id, designer_kept_official_at from leads where id = ${leadId}),
    allowed as (select id from job where ${kind}::text = 'designer' or designer_kept_official_at is null),
    photo as (select id from job_files where id = ${input.photoFileId} and lead_id = ${leadId} and kind = 'photo'),
    created as (
      insert into window_measurements (lead_id, kind, measured_by, position, room, label, width_eighths,
        height_eighths, depth_eighths, mount, requirements, notes, photo_file_id, quantity)
      select allowed.id, ${kind}, ${actor},
        (select coalesce(max(position), 0) + 1 from window_measurements where lead_id = ${leadId}),
        ${input.room}, ${input.label}, ${input.widthEighths}, ${input.heightEighths}, ${input.depthEighths},
        ${input.mount}, ${input.requirements}, ${input.notes}, (select id from photo), ${input.quantity}
      from allowed
      returning id, lead_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure', ${`Added ${windows(input.quantity)} (${kind}): ${describe(input)}`} from created
    )
    select (select id from created) as id, exists (select 1 from job) as found`;
  const id = rows[0]?.id as string | null | undefined;
  if (id) return { id };
  return { refused: rows[0]?.found ? "kept" : "missing" };
}
```

In `updateMeasurement`, change the `previous` CTE to `select photo_file_id, quantity, kind from window_measurements …` and the `logged` select to:

```ts
      select changed.lead_id, ${actor}, 'measure',
        case when previous.quantity = ${input.quantity} then ${`Edited ${windows(input.quantity)} (`} || previous.kind || ${`): ${describe(input)}`}
        else ${`Edited ${describe(input)} (`} || previous.kind || '): ' || previous.quantity::text || ${` → ${input.quantity} ${input.quantity > 1 ? "windows" : "window"}`} end
      from changed, previous
```

(The `update … set` list is unchanged and must NOT assign `kind`.)

In `deleteMeasurement`, `returning lead_id, room, label, photo_file_id, quantity, kind` and the body:

```sql
        case when quantity > 1 then 'Deleted ' || quantity::text || ' windows (' || kind || '): ' else 'Deleted window (' || kind || '): ' end || room || coalesce(', ' || label, '') from removed
```

Append `setKeptOfficial`:

```ts
export type KeepResult = "ok" | "unchanged" | "has-official" | "missing";

/**
 * Ticks or unticks "Keep as official measure", with its event, in one statement. Ticking is
 * refused while the job has any official window (one official list per job). Asking for what the
 * job already says changes nothing and logs nothing.
 *
 * Accepted limitation: someone ticking in the same instant another person saves the job's FIRST
 * official window can, under READ COMMITTED, let both succeed. officialWindows() then prefers the
 * designer list and the Measurements tab still shows the official rows, so nothing is hidden.
 */
export async function setKeptOfficial(leadId: string, kept: boolean, actor: string): Promise<KeepResult> {
  if (!UUID.test(leadId)) return "missing";
  const rows = await db()`
    with job as (select id, designer_kept_official_at is not null as was_kept from leads where id = ${leadId}),
    official as (select 1 from window_measurements where lead_id = ${leadId} and kind = 'official' limit 1),
    changed as (
      update leads set designer_kept_official_at = case when ${kept}::boolean then now() else null end,
        designer_kept_official_by = case when ${kept}::boolean then ${actor}::text else null end
      where id = ${leadId}
        and (designer_kept_official_at is not null) <> ${kept}::boolean
        and (not ${kept}::boolean or not exists (select 1 from official))
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'measure', ${kept ? "Designer measure kept as official" : "Designer measure no longer kept as official"}
      from changed
    )
    select exists (select 1 from changed) as changed, exists (select 1 from job) as found,
      (select was_kept from job) as was_kept, exists (select 1 from official) as has_official`;
  const row = rows[0];
  if (row?.changed) return "ok";
  if (!row?.found) return "missing";
  if (row.was_kept === kept) return "unchanged";
  return "has-official";
}
```

- [ ] **Step 4: Run to see it pass, prove power, typecheck**

Run: `npx vitest run --maxWorkers=2 tests/admin/measurements.test.ts` → PASS.
Power: delete `or designer_kept_official_at is null` → the "refuses an official window on a kept job" test must FAIL; restore. Delete `and (not ${kept}::boolean or not exists (select 1 from official))` → "ticks only when no official window exists" must FAIL; restore.
Run `npx tsc --noEmit` — it will list callers broken by the new `addMeasurement` signature and the new `kind` field (measure-actions, test literals). Those are fixed in Tasks 3–5; note the list in your report, do not fix them here except test literals in `tests/admin/measurements.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/measurements.ts tests/admin/measurements.test.ts
git commit -m "feat: windows carry their measure kind; keep a designer measure as official in one statement"
```

---

### Task 3: Server actions

**Files:**
- Modify: `app/admin/jobs/measure-actions.ts:1-60`
- Test: `tests/admin/measure-actions.test.ts`

**Interfaces:**
- Consumes: Task 2 `addMeasurement`, `setKeptOfficial`, `AddResult`, `KeepResult`; Task 1 `isMeasureKind`, `MeasureKind`.
- Produces:
  - `saveMeasurement(jobId: string, windowId: string | null, kind: MeasureKind, formData: FormData): Promise<FormState>`
  - `setKeptOfficialAction(jobId: string, kept: boolean): Promise<{ error?: string }>`

- [ ] **Step 1: Update and add tests (failing)**

In `tests/admin/measure-actions.test.ts`: add `setKeptOfficial: vi.fn()` to the `measurements` mock object. Every `actions.saveMeasurement(LEAD, x, window(...))` becomes `actions.saveMeasurement(LEAD, x, "designer", window(...))`. `addMeasurement.mockResolvedValue(WIN)` becomes `.mockResolvedValue({ id: WIN })`, and the `toHaveBeenCalledWith(LEAD, expect.objectContaining…` assertions become `toHaveBeenCalledWith(LEAD, "designer", expect.objectContaining(...), "owner@example.com")`. Then add:

```ts
  it("adds an official window as official", async () => {
    measurements.addMeasurement.mockResolvedValue({ id: WIN });
    expect(await actions.saveMeasurement(LEAD, null, "official", window())).toEqual({ ok: true });
    expect(measurements.addMeasurement).toHaveBeenCalledWith(LEAD, "official", expect.any(Object), "owner@example.com");
  });

  it("explains a kept job and keeps what was typed", async () => {
    measurements.addMeasurement.mockResolvedValue({ refused: "kept" });
    const state = await actions.saveMeasurement(LEAD, null, "official", window());
    expect(state.error).toBe(
      "This job is using the designer measure as its official measure. Untick “Keep as official measure” to take a separate one.",
    );
    expect(state.values).toMatchObject({ room: "Kitchen", widthIn: "35" });
  });

  it("refuses an unknown kind before saving anything", async () => {
    const state = await actions.saveMeasurement(LEAD, null, "final" as never, window());
    expect(state.error).toBe("Choose Designer measure or Official measure first.");
    expect(measurements.addMeasurement).not.toHaveBeenCalled();
  });
});

describe("setKeptOfficialAction", () => {
  it("keeps the designer measure as official as the signed-in owner", async () => {
    measurements.setKeptOfficial.mockResolvedValue("ok");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({});
    expect(measurements.setKeptOfficial).toHaveBeenCalledWith(LEAD, true, "owner@example.com");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${LEAD}`);
  });

  it("treats anything but true as untick", async () => {
    measurements.setKeptOfficial.mockResolvedValue("ok");
    await actions.setKeptOfficialAction(LEAD, "yes" as never);
    expect(measurements.setKeptOfficial).toHaveBeenCalledWith(LEAD, false, "owner@example.com");
  });

  it("explains why it cannot keep when an official measure exists", async () => {
    measurements.setKeptOfficial.mockResolvedValue("has-official");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({
      error: "An official measure is already recorded, so the designer measure can’t be kept as official.",
    });
  });

  it("says when the job is gone, and is quiet when nothing changed", async () => {
    measurements.setKeptOfficial.mockResolvedValue("missing");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({ error: "That job no longer exists." });
    measurements.setKeptOfficial.mockResolvedValue("unchanged");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({});
  });

  it("requires an admin before anything else", async () => {
    requireAdmin.mockRejectedValue(new Error("redirect"));
    await expect(actions.setKeptOfficialAction(LEAD, true)).rejects.toThrow("redirect");
    expect(measurements.setKeptOfficial).not.toHaveBeenCalled();
  });
});
```

(Close the existing `describe("saveMeasurement")` where it already closes — put the three new `it`s inside it and the new `describe` after it.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/measure-actions.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Imports: add `setKeptOfficial` to the `@/lib/admin/measurements` import and `import { isMeasureKind, type MeasureKind } from "@/lib/admin/measure-kinds";`. Replace `saveMeasurement` and add the new action after `removeMeasurement`:

```ts
// Not exported: a "use server" file may export only async functions.
const KEPT_REFUSAL =
  "This job is using the designer measure as its official measure. Untick “Keep as official measure” to take a separate one.";

export async function saveMeasurement(
  jobId: string, windowId: string | null, kind: MeasureKind, formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData);
  if (!isMeasureKind(kind)) return { error: "Choose Designer measure or Official measure first.", values };
  const parsed = measurementSchema.safeParse(captureRaw(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  // An edit keeps the window's own kind; `kind` only decides which list a new window joins.
  if (windowId) {
    if (!(await updateMeasurement(jobId, windowId, parsed.data, email))) {
      return { error: "That job or window no longer exists." };
    }
  } else {
    const added = await addMeasurement(jobId, kind, parsed.data, email);
    if ("refused" in added) {
      return added.refused === "kept" ? { error: KEPT_REFUSAL, values } : { error: "That job or window no longer exists." };
    }
  }

  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  return { ok: true };
}
```

```ts
/** Ticks or unticks "Keep as official measure". Anything but `true` unticks. */
export async function setKeptOfficialAction(jobId: string, kept: boolean): Promise<{ error?: string }> {
  const { email } = await requireAdmin();
  const result = await setKeptOfficial(jobId, kept === true, email);
  if (result === "missing") return { error: "That job no longer exists." };
  if (result === "has-official") {
    return { error: "An official measure is already recorded, so the designer measure can’t be kept as official." };
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}/measure`);
  return {};
}
```

- [ ] **Step 4: Run to pass; power-check**

Run the file → PASS. Delete `if (!isMeasureKind(kind)) …` → the unknown-kind test must FAIL; restore.

- [ ] **Step 5: Commit**

```bash
git add app/admin/jobs/measure-actions.ts tests/admin/measure-actions.test.ts
git commit -m "feat: save a window into the chosen measure; tick keep-as-official from the app"
```

---

### Task 4: Measure screens — chooser, kind-aware form, the checkbox

**Files:**
- Create: `app/admin/jobs/[id]/measure/MeasureChooser.tsx`
- Create: `app/admin/jobs/[id]/KeepOfficialBox.tsx`
- Modify: `app/admin/jobs/[id]/measure/page.tsx` (whole file)
- Modify: `app/admin/jobs/[id]/measure/MeasureForm.tsx:69-73,118`
- Modify: `app/admin/jobs/[id]/measure/[windowId]/page.tsx:13-18`
- Test: `tests/admin/measure-page.test.tsx` (rewrite), `tests/admin/keep-official-box.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1 (`MEASURE_KIND_LABEL`, `isMeasureKind`, `windowsOfKind`, `MeasureSet`, `MeasureKind`), Task 2 `getMeasureSet`, Task 3 `saveMeasurement`, `setKeptOfficialAction`; `firstParam` from `app/admin/jobs/[id]/tabs.ts:13`.
- Produces: `MeasureChooser({ jobId, set })`; `KeepOfficialBox({ jobId, kept: boolean, blocked: boolean })`; `MeasureForm({ jobId, kind, window, defaultRoom })`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/measure-page.test.tsx` (replace the file):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const KEPT = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
const getMeasureSet = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/lib/admin/jobs", () => ({ getJob: vi.fn(async () => ({ id: ID, name: "Dana Reyes" })) }));
vi.mock("@/lib/admin/measurements", () => ({ getMeasureSet }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app/admin/jobs/[id]/measure/MeasureForm", () => ({
  MeasureForm: ({ kind, defaultRoom }: { kind: string; defaultRoom: string }) => <p>{kind} form starting in “{defaultRoom}”</p>,
}));
vi.mock("@/app/admin/jobs/[id]/KeepOfficialBox", () => ({
  KeepOfficialBox: ({ kept, blocked }: { kept: boolean; blocked: boolean }) => <p>box kept={String(kept)} blocked={String(blocked)}</p>,
}));

const { default: MeasurePage } = await import("@/app/admin/jobs/[id]/measure/page");
const open = async (kind?: string | string[]) =>
  render(await MeasurePage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(kind === undefined ? {} : { kind }) }));

const designer = [{ kind: "designer", room: "Den", quantity: 10 }, { kind: "designer", room: "Office", quantity: 2 }];
const official = [{ kind: "official", room: "Hall", quantity: 3 }];

beforeEach(() => getMeasureSet.mockReset().mockResolvedValue({ windows: [...designer, ...official], kept: null }));

describe("measure page", () => {
  it("asks which measure first, with each one's count", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Measure");
    expect(screen.getByRole("link", { name: /Designer measure.*12 windows/ })).toHaveAttribute("href", `/admin/jobs/${ID}/measure?kind=designer`);
    expect(screen.getByRole("link", { name: /Official measure.*3 windows/ })).toHaveAttribute("href", `/admin/jobs/${ID}/measure?kind=official`);
    expect(screen.queryByText(/form starting/)).toBeNull();
  });

  it("shows the chooser for a missing, repeated-garbage or unknown kind", async () => {
    for (const kind of [undefined, "", "final", ["bogus", "designer"]]) {
      const { unmount } = await open(kind);
      expect(screen.getByRole("link", { name: /Designer measure/ })).toBeInTheDocument();
      unmount();
    }
  });

  it("measures the designer list: its own count, last room, and the keep box", async () => {
    await open("designer");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Designer measure");
    expect(screen.getByText("12 windows so far")).toBeInTheDocument();
    expect(screen.getByText("designer form starting in “Office”")).toBeInTheDocument();
    expect(screen.getByText("box kept=false blocked=true")).toBeInTheDocument();
  });

  it("starts the official measure blank: no designer room, no keep box", async () => {
    getMeasureSet.mockResolvedValue({ windows: designer, kept: null });
    await open("official");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Official measure");
    expect(screen.getByText("0 windows so far")).toBeInTheDocument();
    expect(screen.getByText("official form starting in “”")).toBeInTheDocument();
    expect(screen.queryByText(/box kept/)).toBeNull();
  });

  it("will not open the official form on a kept job, and says why", async () => {
    getMeasureSet.mockResolvedValue({ windows: designer, kept: KEPT });
    await open("official");
    expect(screen.queryByText(/form starting/)).toBeNull();
    expect(screen.getByText(/Using designer measure/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Official measure/ })).toBeNull();
  });
});
```

`tests/admin/keep-official-box.test.tsx` (new):

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const setKeptOfficialAction = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/admin/jobs/measure-actions", () => ({ setKeptOfficialAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { KeepOfficialBox } = await import("@/app/admin/jobs/[id]/KeepOfficialBox");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  setKeptOfficialAction.mockReset().mockResolvedValue({});
  refresh.mockReset();
});

describe("KeepOfficialBox", () => {
  it("ticks keep-as-official and refreshes", async () => {
    render(<KeepOfficialBox jobId={JOB} kept={false} blocked={false} />);
    fireEvent.click(screen.getByLabelText("Keep as official measure"));
    await waitFor(() => expect(setKeptOfficialAction).toHaveBeenCalledWith(JOB, true));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("unticks when kept", async () => {
    render(<KeepOfficialBox jobId={JOB} kept={true} blocked={false} />);
    expect(screen.getByLabelText("Keep as official measure")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Keep as official measure"));
    await waitFor(() => expect(setKeptOfficialAction).toHaveBeenCalledWith(JOB, false));
  });

  it("cannot be ticked once an official measure exists, and says why", () => {
    render(<KeepOfficialBox jobId={JOB} kept={false} blocked={true} />);
    expect(screen.getByLabelText("Keep as official measure")).toBeDisabled();
    expect(screen.getByText("An official measure is already recorded.")).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    setKeptOfficialAction.mockResolvedValue({ error: "An official measure is already recorded, so the designer measure can’t be kept as official." });
    render(<KeepOfficialBox jobId={JOB} kept={false} blocked={false} />);
    fireEvent.click(screen.getByLabelText("Keep as official measure"));
    expect(await screen.findByRole("alert")).toHaveTextContent("can’t be kept as official");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/measure-page.test.tsx tests/admin/keep-official-box.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/KeepOfficialBox.tsx`:

```tsx
"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setKeptOfficialAction } from "@/app/admin/jobs/measure-actions";

/**
 * "Keep as official measure": the designer's numbers become the job's official measure, so no
 * second trip is booked. Refused (and disabled) once an official measure has been recorded.
 */
export function KeepOfficialBox({ jobId, kept, blocked }: { jobId: string; kept: boolean; blocked: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(kept);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await setKeptOfficialAction(jobId, next);
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={shown} disabled={pending || (blocked && !kept)}
          onChange={(e) => change(e.target.checked)} className="size-5" />
        Keep as official measure
      </label>
      {blocked && !kept ? <p className="text-sm text-ink-soft">An official measure is already recorded.</p> : null}
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
    </div>
  );
}
```

`app/admin/jobs/[id]/measure/MeasureChooser.tsx`:

```tsx
import Link from "next/link";
import { MEASURE_KIND_LABEL, windowsOfKind, type MeasureSet } from "@/lib/admin/measure-kinds";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { windowCount } from "@/lib/admin/measure-units";

const CHOICE = "flex min-h-20 flex-col justify-center gap-1 border border-rule bg-ivory px-5 py-4";
const windows = (n: number) => `${n} ${n === 1 ? "window" : "windows"}`;

/** The first screen of the Measure app: which measure is this? */
export function MeasureChooser({ jobId, set }: { jobId: string; set: MeasureSet<WindowMeasurement> }) {
  const href = (kind: string) => `/admin/jobs/${jobId}/measure?kind=${kind}`;
  return (
    <div className="flex flex-col gap-3">
      <Link href={href("designer")} className={CHOICE}>
        <span className="text-lg font-semibold">{MEASURE_KIND_LABEL.designer}</span>
        <span className="text-sm text-ink-soft">{windows(windowCount(windowsOfKind(set, "designer")))}</span>
      </Link>
      {set.kept ? (
        <div className={`${CHOICE} text-ink-soft`}>
          <span className="text-lg font-semibold">{MEASURE_KIND_LABEL.official}</span>
          <span className="text-sm">Using designer measure — untick “Keep as official measure” to measure separately.</span>
        </div>
      ) : (
        <Link href={href("official")} className={CHOICE}>
          <span className="text-lg font-semibold">{MEASURE_KIND_LABEL.official}</span>
          <span className="text-sm text-ink-soft">{windows(windowCount(windowsOfKind(set, "official")))}</span>
        </Link>
      )}
    </div>
  );
}
```

`app/admin/jobs/[id]/measure/page.tsx` (replace). Before writing, read `node_modules/next/dist/docs/` for page `searchParams` (it is a Promise in this version, as `app/admin/jobs/[id]/page.tsx:25` already uses):

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/admin/jobs";
import { isMeasureKind, MEASURE_KIND_LABEL, windowsOfKind } from "@/lib/admin/measure-kinds";
import { getMeasureSet } from "@/lib/admin/measurements";
import { windowCount } from "@/lib/admin/measure-units";
import { requireAdmin } from "@/lib/admin/session";
import { KeepOfficialBox } from "../KeepOfficialBox";
import { firstParam } from "../tabs";
import { MeasureChooser } from "./MeasureChooser";
import { MeasureForm } from "./MeasureForm";

export default async function MeasurePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [set, query] = await Promise.all([getMeasureSet(id), searchParams]);
  const asked = firstParam(query.kind);
  // A kept job has no separate official measure to take, so that link lands on the chooser's reason.
  const kind = isMeasureKind(asked) && !(asked === "official" && set.kept) ? asked : null;
  const back = `/admin/jobs/${id}?tab=measurements`;

  if (!kind) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Link href={back} className="text-sm underline underline-offset-4">← {job.name}</Link>
        <h1 className="text-2xl font-semibold">Measure</h1>
        <MeasureChooser jobId={id} set={set} />
      </div>
    );
  }

  const windows = windowsOfKind(set, kind);
  const count = windowCount(windows);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={back} className="text-sm underline underline-offset-4">← {job.name}</Link>
        <Link href={back} className="text-sm font-semibold underline underline-offset-4">Finish</Link>
      </div>
      <h1 className="text-2xl font-semibold">{MEASURE_KIND_LABEL[kind]}</h1>
      <p className="text-sm text-ink-soft">{count} {count === 1 ? "window" : "windows"} so far</p>
      {kind === "designer" ? (
        <KeepOfficialBox jobId={id} kept={Boolean(set.kept)} blocked={windowsOfKind(set, "official").length > 0} />
      ) : null}
      <MeasureForm jobId={id} kind={kind} window={null} defaultRoom={windows.at(-1)?.room ?? ""} />
    </div>
  );
}
```

`MeasureForm.tsx`: add `import type { MeasureKind } from "@/lib/admin/measure-kinds";`, add `kind` to the props (`export function MeasureForm({ jobId, kind, window, defaultRoom }: { jobId: string; kind: MeasureKind; window: …; defaultRoom: string; })`) and change line 118 to `const result = await saveMeasurement(jobId, window?.id ?? null, kind, data);`.

Edit page: keep `<h1>Edit window</h1>` and add below it `<p className="text-sm text-ink-soft">{MEASURE_KIND_LABEL[window.kind]}</p>`; pass `kind={window.kind}` to `MeasureForm`. Import `MEASURE_KIND_LABEL` from `@/lib/admin/measure-kinds`.

- [ ] **Step 4: Run to pass; power-check; typecheck**

Run both test files → PASS. Power: remove `&& !(asked === "official" && set.kept)` → the kept test must FAIL; restore. Remove `disabled={…}` → the blocked test must FAIL; restore. `npx tsc --noEmit` → remaining errors only in files owned by Task 5/6.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/measure" "app/admin/jobs/[id]/KeepOfficialBox.tsx" tests/admin/measure-page.test.tsx tests/admin/keep-official-box.test.tsx
git commit -m "feat: Measure asks designer or official first; keep-as-official box on the designer measure"
```

---

### Task 5: Job page — two sections, working list everywhere

**Files:**
- Modify: `app/admin/jobs/[id]/MeasurementsTab.tsx` (whole file)
- Modify: `app/admin/jobs/[id]/page.tsx:5-6,33-44,53-70`
- Modify: `app/admin/jobs/[id]/OverviewTab.tsx:26-36,66`
- Test: `tests/admin/measurements-tab.test.tsx`, `tests/admin/job-page-layout.test.tsx`, `tests/admin/job-page-summary.test.tsx`, `tests/admin/overview-tab.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`windowsOfKind`, `workingWindows`, `workingSource`, `MEASURE_KIND_LABEL`, `MeasureSet`, `MeasureKind`), Task 2 `getMeasureSet`, Task 4 `KeepOfficialBox`.
- Produces: `MeasurementsTab({ jobId, set, files })`; `OverviewTab` gains prop `measureSource: MeasureKind | null`.

- [ ] **Step 1: Update tests (failing)**

`tests/admin/measurements-tab.test.tsx`: add `kind: "designer"` to the `m` literal; add `vi.mock("@/app/admin/jobs/[id]/KeepOfficialBox", () => ({ KeepOfficialBox: ({ kept, blocked }: { kept: boolean; blocked: boolean }) => <p>box kept={String(kept)} blocked={String(blocked)}</p> }));` before the import; change every `<MeasurementsTab jobId={JOB} measurements={X} files={F} />` to `<MeasurementsTab jobId={JOB} set={{ windows: X, kept: null }} files={F} />`; in the first test the add-link assertion becomes `expect(screen.getByRole("link", { name: "Add to designer measure" })).toHaveAttribute("href", \`/admin/jobs/${JOB}/measure?kind=designer\`);`; the heading assertion `"Measurements · 12"` becomes `"Designer measure · 12"`. Any assertion for `"No windows measured yet."` stays (designer section). Then add:

```tsx
  it("keeps the two measures in separate sections", () => {
    const official = { ...m, id: "7d6f2a5c-2a96-4e97-9e5a-5b6c7d8e9f0a", kind: "official" as const, room: "Den", photoFileId: null };
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m, official], kept: null }} files={[photo]} />);
    const designer = screen.getByRole("region", { name: /Designer measure/ });
    const off = screen.getByRole("region", { name: /Official measure/ });
    expect(within(designer).getByRole("row", { name: /Kitchen/ })).toBeInTheDocument();
    expect(within(designer).queryByRole("row", { name: /Den/ })).toBeNull();
    expect(within(off).getByRole("row", { name: /Den/ })).toBeInTheDocument();
    expect(within(off).getByRole("link", { name: "Add to official measure" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure?kind=official`);
    expect(screen.getByText("box kept=false blocked=true")).toBeInTheDocument();
  });

  it("says an empty official measure has not been taken", () => {
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m], kept: null }} files={[photo]} />);
    expect(within(screen.getByRole("region", { name: /Official measure/ })).getByText("No official measure yet.")).toBeInTheDocument();
  });

  it("when kept, says the designer measure is the official one and offers no official add", () => {
    const kept = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m], kept }} files={[photo]} />);
    const off = screen.getByRole("region", { name: /Official measure/ });
    expect(off).toHaveTextContent("Using the designer measure, kept as official by owner@example.com");
    expect(within(off).queryByRole("link", { name: "Add to official measure" })).toBeNull();
    expect(screen.getByText("box kept=true blocked=false")).toBeInTheDocument();
  });

  it("never hides official rows, even on a kept job (the accepted race)", () => {
    const kept = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
    const official = { ...m, id: "8e7a3b6d-3ba7-4fa8-8f6b-6c7d8e9f0a1b", kind: "official" as const, room: "Den", photoFileId: null };
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m, official], kept }} files={[photo]} />);
    expect(within(screen.getByRole("region", { name: /Official measure/ })).getByRole("row", { name: /Den/ })).toBeInTheDocument();
  });
```

`tests/admin/job-page-layout.test.tsx` and `tests/admin/job-page-summary.test.tsx`: the `@/lib/admin/measurements` mock becomes `({ getMeasureSet: vi.fn(async () => ({ windows: [], kept: null })) })` (job-page-summary: rename its `listMeasurements` const to `getMeasureSet` with the same resolved value, and every use). In job-page-layout's "counts windows…" test: add `kind: "designer" as const` to `line`, and replace the `listMeasurements` mock call with `vi.mocked(getMeasureSet).mockResolvedValueOnce({ windows: [line, { ...line, id: "v", quantity: 2 }], kept: null });` (import `getMeasureSet` in place of `listMeasurements`). Add after it:

```tsx
  it("counts the official measure, not the designer one, once there is one", async () => {
    const line = {
      id: "w", leadId: ID, kind: "designer" as const, position: 1, room: "Den", label: null, widthEighths: 240, heightEighths: 320,
      depthEighths: null, mount: "inside" as const, requirements: [], notes: null, photoFileId: null,
      measuredBy: "x", createdAt: new Date(), updatedAt: new Date(), quantity: 10,
    };
    vi.mocked(getMeasureSet).mockResolvedValueOnce({ windows: [line, { ...line, id: "o", kind: "official", quantity: 4 }], kept: null });
    await open({});
    expect(screen.getByRole("link", { name: /Measurements/ })).toHaveTextContent("4");
  });
```

`tests/admin/overview-tab.test.tsx`: add `measureSource: null` to the `base` props object; in the test at line ~80 pass `measureSource="designer"` and assert the card shows `12 windows · designer`; add a case with `measureSource="official"` asserting `· official`. Add `kind: "designer"` to the `line` literal there.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/measurements-tab.test.tsx tests/admin/job-page-layout.test.tsx tests/admin/job-page-summary.test.tsx tests/admin/overview-tab.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`MeasurementsTab.tsx` (replace; the table body is today's, moved into `MeasureTable` unchanged):

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { removeMeasurement } from "@/app/admin/jobs/measure-actions";
import { ButtonLink } from "@/components/ui/Button";
import type { JobFile } from "@/lib/admin/files";
import { MEASURE_KIND_LABEL, windowsOfKind, type MeasureKind, type MeasureSet } from "@/lib/admin/measure-kinds";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatEighths, requirementLabel, windowCount } from "@/lib/admin/measure-units";
import { formatWhen } from "@/lib/admin/time";
import { DeleteButton } from "./DeleteButton";
import { KeepOfficialBox } from "./KeepOfficialBox";
import { ShareSwitch } from "./ShareSwitch";
import { HEADING } from "./ui";

const COLUMNS = ["Room", "Window", "Qty", "Width", "Height", "Depth", "Mount", "Notes", "Photo"];
const CELL = "px-3 py-3";

/** The designer's list and the official list, side by side and never compared (owner's choice). */
export function MeasurementsTab({ jobId, set, files }: {
  jobId: string;
  set: MeasureSet<WindowMeasurement>;
  files: JobFile[];
}) {
  const official = windowsOfKind(set, "official");
  return (
    <div className="flex flex-col gap-8">
      <MeasureSection jobId={jobId} kind="designer" windows={windowsOfKind(set, "designer")} files={files}
        empty="No windows measured yet." canAdd
        extra={<KeepOfficialBox jobId={jobId} kept={Boolean(set.kept)} blocked={official.length > 0} />} />
      <MeasureSection jobId={jobId} kind="official" windows={official} files={files}
        empty={set.kept ? null : "No official measure yet."} canAdd={!set.kept}
        extra={set.kept ? (
          <p className="text-sm">
            Using the designer measure, kept as official by {set.kept.by} {formatWhen(set.kept.at)}.
          </p>
        ) : null} />
    </div>
  );
}

function MeasureSection({ jobId, kind, windows, files, empty, canAdd, extra }: {
  jobId: string;
  kind: MeasureKind;
  windows: WindowMeasurement[];
  files: JobFile[];
  empty: string | null;
  canAdd: boolean;
  extra: ReactNode;
}) {
  const headingId = `measure-${kind}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className={HEADING}>{MEASURE_KIND_LABEL[kind]} · {windowCount(windows)}</h2>
        {canAdd ? (
          <ButtonLink href={`/admin/jobs/${jobId}/measure?kind=${kind}`} variant="solid">
            Add to {MEASURE_KIND_LABEL[kind].toLowerCase()}
          </ButtonLink>
        ) : null}
      </div>
      {extra}
      {windows.length > 0 ? <MeasureTable jobId={jobId} windows={windows} files={files} />
        : empty ? <p className="text-sm text-ink-soft">{empty}</p> : null}
    </section>
  );
}
```

Then `function MeasureTable({ jobId, windows, files }: { jobId: string; windows: WindowMeasurement[]; files: JobFile[] })` containing the two `Map`s (`sharedById`, `nameById`) from today's component and today's `<div className="overflow-x-auto …"><table>…</table></div>` verbatim, with `measurements.map` renamed `windows.map`.

`formatWhen(date: Date): string` (`lib/admin/time.ts:32`) prints e.g. "Thu, Oct 1, 8:00 AM".

`page.tsx` (job page): replace the `listMeasurements` import with `getMeasureSet` and add `import { workingSource, workingWindows } from "@/lib/admin/measure-kinds";`. In the `Promise.all`, rename `measurements` → `measureSet` and call `getMeasureSet(id)`. After it: `const working = workingWindows(measureSet);`. Then:
- `JobTabs … counts={{ measurements: windowCount(working), files: files.length }}`
- `OverviewTab … measurements={working} measureSource={workingSource(measureSet)}`
- `<MeasurementsTab jobId={job.id} set={measureSet} files={files} />`
- `<JobFiles jobId={job.id} measurements={measureSet.windows} files={files} />` (window photos of both kinds)
- `<InstallTab jobId={job.id} measurements={working} />`

`OverviewTab.tsx`: add `import type { MeasureKind } from "@/lib/admin/measure-kinds";`, add `measureSource` to the destructured props and type (`measureSource: MeasureKind | null;`), and change the card value to:

```tsx
value={measurements.length ? `${plural(windowCount(measurements), "window")} · ${measureSource === "official" ? "official" : "designer"}` : null}
```

(The card's "Add measurement" link stays `/admin/jobs/${job.id}/measure` — the chooser.)

- [ ] **Step 4: Run to pass; power-check; full unit suite; typecheck**

Run the four files → PASS. Power: in the job page use `measureSet.windows` instead of `working` for the tab count → the "counts the official measure" test must FAIL; restore.
Run `npx vitest run --maxWorkers=2` (whole suite) and `npx tsc --noEmit`. Remaining failures may only be in `tests/portal/*` (Task 6).

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/MeasurementsTab.tsx" "app/admin/jobs/[id]/page.tsx" "app/admin/jobs/[id]/OverviewTab.tsx" tests/admin
git commit -m "feat: job page shows designer and official measures apart and works from the official one"
```

---

### Task 6: Customer service picker + real-database proof

**Files:**
- Modify: `app/(site)/project/[jobId]/service/page.tsx:3,45`
- Modify: `lib/portal/service-request.ts:5,85`
- Create: `scripts/verify-measure-kinds.ts`, `scripts/verify-measure-kinds.config.mts`
- Test: `tests/portal/service-page.test.tsx`, `tests/portal/service-request.test.ts`, `tests/portal/acknowledge.test.ts`

**Interfaces:**
- Consumes: Task 2 `listWorkingWindows`, `addMeasurement`, `setKeptOfficial`, `getMeasureSet`, `updateMeasurement`, `deleteMeasurement`.

- [ ] **Step 1: Switch the portal to the working list (tests first)**

In the three portal test files, rename the mocked `listMeasurements` to `listWorkingWindows` (the const, the `vi.mock` factory key, and every use). Run `npx vitest run --maxWorkers=2 tests/portal` → FAIL. Then in `service/page.tsx` and `lib/portal/service-request.ts` import `listWorkingWindows` instead of `listMeasurements` and call it in the same place (`(await listWorkingWindows(jobId)).map(…)` / `.find(…)`). Update the comment above the page's picker: "The customer picks a window from the measure we ordered from (official, else the designer's)…". Run → PASS.

- [ ] **Step 2: Write the real-database proof script**

Copy the structure of `scripts/verify-share-guard.ts` and its config exactly (E2E_POSTGRES_URL only, `FORBIDDEN_HOSTS = ["ep-cold-term"]`, `refuse()`, `process.env.POSTGRES_URL = url`, `check()`, the "THIS IS NOT AUTOMATED COVERAGE" header naming what to delete to watch it fail). `verify-measure-kinds.config.mts` is the share-guard config with `include: ["scripts/verify-measure-kinds.ts"]`. The script's single `test("measure kinds against a real database", …)` does, with one lead inserted like share-guard's `newLead` and removed (with its job_events and window_measurements) in `finally`:

1. `addMeasurement(lead, "designer", input, ACTOR)` → `{ id }`; row `kind = 'designer'`; event body `Added window (designer): Kitchen`.
2. `setKeptOfficial(lead, true, ACTOR)` → `"ok"`; `designer_kept_official_by = ACTOR`, `_at` not null; one event "Designer measure kept as official".
3. `setKeptOfficial(lead, true, ACTOR)` again → `"unchanged"`; still exactly one such event.
4. `addMeasurement(lead, "official", input, ACTOR)` → `{ refused: "kept" }`; zero official rows; no "(official)" event.
5. `getMeasureSet(lead)` → `kept.by === ACTOR`, one designer window.
6. `setKeptOfficial(lead, false, ACTOR)` → `"ok"`; both columns null; event "Designer measure no longer kept as official".
7. `addMeasurement(lead, "official", { ...input, room: "Den" }, ACTOR)` → `{ id }`; `updateMeasurement` on it with room "Den" → `true`, row still `kind = 'official'`; event body contains `(official)`.
8. `setKeptOfficial(lead, true, ACTOR)` → `"has-official"`; columns still null.
9. `deleteMeasurement` on the official window → event `Deleted window (official): Den`.
10. Raw `insert into window_measurements (…, kind) values (…, 'final')` THROWS (`window_measurements_kind_check`); raw `update leads set designer_kept_official_at = now() where id = lead` (by left null) THROWS (`leads_designer_kept_official_check`).
11. `addMeasurement(randomUUID(), "designer", input, ACTOR)` → `{ refused: "missing" }`; `setKeptOfficial(randomUUID(), true, ACTOR)` → `"missing"`.

Header "to watch it fail": delete `or designer_kept_official_at is null` (step 4 fails); delete the `not exists (select 1 from official)` clause (step 8 fails); delete `and (designer_kept_official_at is not null) <> ${kept}::boolean` (step 3 fails).

- [ ] **Step 3: Cut a Neon test branch and migrate it twice**

Follow memory `pss-production-migrations` / `pss-local-verification-quirks`: create a fresh Neon branch from production, write its URL to a file in the scratchpad (never print it), confirm its host does NOT contain `ep-cold-term`, then:

```bash
MIGRATE_DATABASE_URL="$(cat <scratch>/branch-url)" node scripts/migrate.mjs
MIGRATE_DATABASE_URL="$(cat <scratch>/branch-url)" node scripts/migrate.mjs
```

Both must finish without error (re-runnable). Then `E2E_POSTGRES_URL="$(cat <scratch>/branch-url)" npx vitest run --config scripts/verify-measure-kinds.config.mts` → every `ok` line printed, PASS. Do each "watch it fail" deletion once, rerun, see it fail, restore.

- [ ] **Step 4: Commit**

```bash
git add "app/(site)/project/[jobId]/service/page.tsx" lib/portal/service-request.ts tests/portal scripts/verify-measure-kinds.ts scripts/verify-measure-kinds.config.mts
git commit -m "feat: customer's window picker uses the measure we order from; real-database proof for measure kinds"
```

---

### Task 7: End-to-end

**Files:**
- Modify: `e2e/admin.spec.ts:177` and add a test after the "an owner measures a window with a photo" test

- [ ] **Step 1: Update the existing measure e2e for the chooser**

After `await page.getByRole("link", { name: "Add measurement" }).click();` (line 177) add:

```ts
  await page.getByRole("link", { name: /Designer measure/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Designer measure");
```

- [ ] **Step 2: Add the keep-as-official journey**

```ts
test("a designer measure kept as official, then a separate official measure", async ({ page }) => {
  const name = `${NAME} Kept Official`;
  await signIn(page);
  await page.getByRole("link", { name: "New Job", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0136");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  const jobUrl = page.url().replace(/[?#].*$/, "");

  // Designer measure, kept as official.
  await page.getByRole("link", { name: "Add measurement" }).click();
  await page.getByRole("link", { name: /Designer measure/ }).click();
  await page.getByRole("button", { name: "Kitchen" }).click();
  await page.getByLabel("Width inches").fill("35");
  await page.getByLabel("Height inches").fill("48");
  await page.getByLabel("Inside").check();
  await page.getByRole("button", { name: "Save and next window" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByLabel("Keep as official measure").check();
  await expect(page.getByLabel("Keep as official measure")).toBeChecked();
  await page.getByRole("link", { name: "Finish" }).click();

  const official = page.getByRole("region", { name: /Official measure/ });
  await expect(official).toContainText("Using the designer measure, kept as official");
  await expect(official.getByRole("link", { name: "Add to official measure" })).toHaveCount(0);

  // A stale official link lands on the chooser's reason, not a form.
  await page.goto(`${jobUrl}/measure?kind=official`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Measure");
  await expect(page.getByText(/Using designer measure/)).toBeVisible();

  // Untick, then take a separate official measure: blank, nothing carried over.
  await page.goto(`${jobUrl}?tab=measurements`);
  await page.getByLabel("Keep as official measure").uncheck();
  await expect(official.getByRole("link", { name: "Add to official measure" })).toBeVisible();
  await official.getByRole("link", { name: "Add to official measure" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Official measure");
  await expect(page.getByText("0 windows so far")).toBeVisible();
  await expect(page.getByText("35")).toHaveCount(0);
  await page.getByRole("button", { name: "Office" }).click();
  await page.getByLabel("Width inches").fill("30");
  await page.getByLabel("Height inches").fill("40");
  await page.getByLabel("Outside").check();
  await page.getByLabel("Quantity (identical windows)").fill("4");
  await page.getByRole("button", { name: "Save and next window" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByRole("link", { name: "Finish" }).click();

  await expect(official.getByRole("row", { name: /Office/ })).toBeVisible();
  const designer = page.getByRole("region", { name: /Designer measure/ });
  await expect(designer.getByRole("row", { name: /Kitchen/ })).toBeVisible();
  await expect(designer.getByRole("row", { name: /Office/ })).toHaveCount(0);
  await expect(page.getByLabel("Keep as official measure")).toBeDisabled();

  // Pricing works from the official measure.
  await page.goto(`${jobUrl}?tab=install`);
  await page.getByRole("button", { name: "Fill from measurements" }).click();
  const lines = page.getByRole("group", { name: "Lines" });
  await expect(lines.getByLabel("Windows")).toHaveCount(1);
  await expect(lines.getByLabel("Windows")).toHaveValue("4");

  await page.goto(`${jobUrl}?tab=activity`);
  await expect(page.getByText("Designer measure kept as official")).toBeVisible();
  await expect(page.getByText("Designer measure no longer kept as official")).toBeVisible();
});
```

Rooms come from `ROOMS` in `lib/admin/measure-units.ts` (Kitchen, Office exist). Check the Outside radio label and that `NAME`-prefixed jobs are cleaned by the file's `afterAll`.

- [ ] **Step 3: Run against `next start` + the test branch**

Per memory `pss-local-verification-quirks`: `next build`, then `next start` on 127.0.0.1 with the app's DB pointed at the Task 6 branch (E2E env as the existing e2e specs expect), then `npx playwright test e2e/admin.spec.ts -g "measure|Kept Official"`. Both tests PASS (the photo test skips without `E2E_BLOB_READ_WRITE_TOKEN` — say so if it skips).

- [ ] **Step 4: Commit**

```bash
git add e2e/admin.spec.ts
git commit -m "test: e2e for designer measure kept as official, then a separate official measure"
```

---

### Task 8: Whole-branch review, then ship (owner OK required)

- [ ] **Step 1:** Full suite `npx vitest run --maxWorkers=2`, `npx tsc --noEmit`, `npx next lint` (or the repo's lint script), `next build` — all clean.
- [ ] **Step 2:** Whole-branch review against the spec (fresh reviewer on opus; charge it to re-derive each owner decision in the spec's table from the code).
- [ ] **Step 3: STOP — ask the owner to ship.** Pushing to main deploys production.
- [ ] **Step 4 (after OK):** Per memory `pss-production-migrations`: read-only check prod has 0 rows where it matters (`select count(*) from window_measurements`), confirm target endpoint is `ep-cold-term` without printing the URL, run `node scripts/migrate.mjs` against prod, read-only verify (`kind` column default `'designer'`, both CHECKs present, `leads` columns present), then rebase `feat/measure-kinds` on `origin/main`, re-run unit tests, and `git push origin feat/measure-kinds:main`. Confirm the deploy with `vercel ls --prod`.
