# Installation Price Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PSS prices its own installation labour per job, from a rate table the owner edits in Settings, saving each calculation as an immutable snapshot.

**Architecture:** A pure pricing function with no I/O holds every money rule and is tested exhaustively without a database. Three thin data modules wrap it: rates and settings the owner edits, and priced snapshots that copy their rates in so history never moves. The UI is a new **Install** tab on the job page plus a Settings section, both following the existing server-component-plus-action patterns.

**Tech Stack:** Next.js App Router (server components, server actions), Neon Postgres via `@/lib/db` tagged templates, Zod for input parsing, vitest + @testing-library/react for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-09-16-install-calculator-design.md`

## Global Constraints

- **Money is always integer cents.** No floating-point value ever represents a price. Existing helpers `dollarsToCents` / `formatCents` in `lib/admin/money.ts` are the only conversion points.
- **Dimensions are whole eighths of an inch**, matching `lib/admin/measure-units.ts`. A width of 35 5/8″ is the integer 285.
- **Rounding is per window and always up.** Linear feet and square feet round up for each window, then multiply by the line's count. Never round money.
- **The minimum applies to the labour subtotal.** There are no job-level fees; do not add a trip fee or a removal fee.
- **Snapshots copy `basis` and `rate_cents` onto each line.** Never join a saved snapshot back to `install_rates`.
- **`quote_cents`, `sold_cents` and `deposit_cents` are not touched by this feature.**
- Every server action calls `requireAdmin()` before reading its input, as in `app/admin/settings/actions.ts`.
- Data modules start with `import "server-only";` and use `db()` tagged templates, as in `lib/admin/team.ts`.
- `not_sure` is a questionnaire answer, not an installable treatment. It never appears in rates or lines.
- Run tests with `npx vitest run <path> --maxWorkers=2`. The full local production build is slow; rely on tests and let the Vercel deploy be the build check.

---

## File Structure

**Created:**
- `db/migrations/0NN_install_pricing.sql` — four tables. **The number is the next free one; check `ls db/migrations` at execution time.** 015 is taken and another session has work in flight.
- `lib/admin/install-pricing.ts` — the pure engine. Types, bases, quantity and money rules. No imports from `@/lib/db`.
- `lib/admin/install-rates.ts` — read and write rates and settings.
- `lib/admin/install-quotes.ts` — save and list priced snapshots.
- `app/admin/settings/InstallRatesSection.tsx` — the Settings form.
- `app/admin/jobs/[id]/InstallTab.tsx` — server component: loads rates, settings, snapshots.
- `app/admin/jobs/[id]/InstallCalculator.tsx` — client component: the line editor and live total.
- `app/admin/jobs/[id]/install-actions.ts` — save a snapshot.
- `tests/admin/install-pricing.test.ts`, `tests/admin/install-rates.test.ts`, `tests/admin/install-quotes.test.ts`, `tests/admin/install-rates-section.test.tsx`, `tests/admin/install-tab.test.tsx`
- `e2e/install.spec.ts`

**Modified:**
- `lib/admin/schema.ts` — Zod schemas for the rate form and a line.
- `app/admin/settings/actions.ts` — the save-rates action.
- `app/admin/settings/page.tsx` — render the new section.
- `app/admin/jobs/[id]/tabs.ts` — add the `install` tab.
- `app/admin/jobs/[id]/page.tsx` — render the tab.

---

### Task 1: The pricing engine

The whole feature's money rules, as a pure function. Nothing here touches a database, a date, or a request.

**Files:**
- Create: `lib/admin/install-pricing.ts`
- Test: `tests/admin/install-pricing.test.ts`

**Interfaces:**
- Consumes: `TreatmentType` from `@/lib/leads/treatment-types`.
- Produces:
  - `INSTALL_BASES: readonly ["window", "linear_ft", "sq_ft"]`, `type Basis`
  - `INSTALLABLE_TREATMENTS: readonly TreatmentType[]` (the seven, minus `not_sure`)
  - `type InstallRate = { treatment: TreatmentType; basis: Basis; rateCents: number }`
  - `type InstallSettings = { minimumCents: number; hardSurfaceCents: number; highLadderCents: number; motorizedCents: number }`
  - `type LineInput = { treatment: TreatmentType; count: number; widthEighths: number | null; heightEighths: number | null; hardSurface: boolean; highLadder: boolean; motorized: boolean }`
  - `type PricedLine = LineInput & { basis: Basis; rateCents: number; quantity: number; amountCents: number }`
  - `type PricedQuote = { lines: PricedLine[]; subtotalCents: number; totalCents: number; minimumApplied: boolean }`
  - `quantityFor(basis: Basis, line: LineInput): number`
  - `priceQuote(lines: LineInput[], rates: InstallRate[], settings: InstallSettings): PricedQuote`

- [ ] **Step 1: Write the failing test**

Create `tests/admin/install-pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  INSTALLABLE_TREATMENTS, quantityFor, priceQuote,
  type InstallRate, type InstallSettings, type LineInput,
} from "@/lib/admin/install-pricing";

const settings: InstallSettings = {
  minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0,
};
const rate = (over: Partial<InstallRate> = {}): InstallRate =>
  ({ treatment: "roller_shades", basis: "window", rateCents: 2500, ...over });
const line = (over: Partial<LineInput> = {}): LineInput => ({
  treatment: "roller_shades", count: 1, widthEighths: null, heightEighths: null,
  hardSurface: false, highLadder: false, motorized: false, ...over,
});

describe("INSTALLABLE_TREATMENTS", () => {
  it("is the treatment list without the questionnaire's not-sure answer", () => {
    expect(INSTALLABLE_TREATMENTS).toContain("roller_shades");
    expect(INSTALLABLE_TREATMENTS).not.toContain("not_sure");
    expect(INSTALLABLE_TREATMENTS).toHaveLength(7);
  });
});

describe("quantityFor", () => {
  it("counts windows when priced per window, ignoring dimensions", () => {
    expect(quantityFor("window", line({ count: 6, widthEighths: 999 }))).toBe(6);
  });

  it("rounds each window up to a whole foot, then multiplies by the count", () => {
    // 100 eighths = 12.5 inches = 1.04 ft, up to 2 ft per window.
    expect(quantityFor("linear_ft", line({ count: 3, widthEighths: 100 }))).toBe(6);
  });

  it("does not round a width that is already whole feet", () => {
    // 96 eighths = 12 inches = exactly 1 ft.
    expect(quantityFor("linear_ft", line({ count: 1, widthEighths: 96 }))).toBe(1);
  });

  it("rounds each window up to a whole square foot, then multiplies", () => {
    // 30" x 40" = 1200 sq in = 8.33 sq ft, up to 9 per window.
    expect(quantityFor("sq_ft", line({ count: 3, widthEighths: 240, heightEighths: 320 }))).toBe(27);
  });

  it("does not round an area that is already whole square feet", () => {
    // 12" x 12" = 144 sq in = exactly 1 sq ft.
    expect(quantityFor("sq_ft", line({ count: 1, widthEighths: 96, heightEighths: 96 }))).toBe(1);
  });

  it("refuses to price by the foot without the dimensions it needs", () => {
    expect(() => quantityFor("linear_ft", line({ widthEighths: null })))
      .toThrow("Width is needed to price by the foot");
    expect(() => quantityFor("sq_ft", line({ widthEighths: 240, heightEighths: null })))
      .toThrow("Width and height are needed to price by the square foot");
  });
});

describe("priceQuote", () => {
  it("prices a simple per-window line", () => {
    const priced = priceQuote([line({ count: 4 })], [rate()], settings);
    expect(priced.lines[0].amountCents).toBe(10_000);
    expect(priced.subtotalCents).toBe(10_000);
    expect(priced.totalCents).toBe(10_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("copies the basis and rate onto the priced line", () => {
    const priced = priceQuote([line()], [rate({ rateCents: 3300 })], settings);
    expect(priced.lines[0]).toMatchObject({ basis: "window", rateCents: 3300, quantity: 1 });
  });

  it("adds each flagged surcharge once per window", () => {
    const priced = priceQuote(
      [line({ count: 2, hardSurface: true, motorized: true })],
      [rate()],
      { ...settings, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 },
    );
    // 2 x 2500 labour, plus 2 x (1000 + 1500) surcharges. High ladder is not flagged.
    expect(priced.lines[0].amountCents).toBe(10_000);
  });

  it("sums several lines", () => {
    const priced = priceQuote(
      [line({ count: 2 }), line({ treatment: "shutters", count: 1, widthEighths: 240, heightEighths: 320 })],
      [rate(), rate({ treatment: "shutters", basis: "sq_ft", rateCents: 100 })],
      settings,
    );
    expect(priced.subtotalCents).toBe(5000 + 900);
  });

  it("raises a job under the minimum, and says the minimum applied", () => {
    const priced = priceQuote([line({ count: 2 })], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.subtotalCents).toBe(5000);
    expect(priced.totalCents).toBe(15_000);
    expect(priced.minimumApplied).toBe(true);
  });

  it("leaves a job over the minimum alone", () => {
    const priced = priceQuote([line({ count: 10 })], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.totalCents).toBe(25_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("does not claim the minimum applied when the job lands exactly on it", () => {
    const priced = priceQuote([line({ count: 6 })], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.totalCents).toBe(15_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("prices an empty job as nothing, not as the minimum", () => {
    const priced = priceQuote([], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.subtotalCents).toBe(0);
    expect(priced.totalCents).toBe(0);
    expect(priced.minimumApplied).toBe(false);
  });

  it("treats a zero rate as a real price, not as missing", () => {
    const priced = priceQuote([line({ count: 3 })], [rate({ rateCents: 0 })], settings);
    expect(priced.totalCents).toBe(0);
  });

  it("says which treatment has no rate rather than pricing it at zero", () => {
    expect(() => priceQuote([line({ treatment: "shutters" })], [rate()], settings))
      .toThrow("No installation rate is set for Shutters");
  });

  it("ignores a line with a count of zero", () => {
    const priced = priceQuote([line({ count: 0 })], [rate()], settings);
    expect(priced.lines[0].amountCents).toBe(0);
    expect(priced.subtotalCents).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/admin/install-pricing.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/admin/install-pricing`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/admin/install-pricing.ts`:

```ts
/**
 * Every rule about what an installation costs. Pure: no database, no clock, no
 * request. Rates and lines in, cents out — so the money rules can be tested
 * exhaustively without a database, and a caller cannot accidentally price a job
 * against rates that have moved since.
 */
import { TREATMENT_TYPES, type TreatmentType } from "@/lib/leads/treatment-types";

export const INSTALL_BASES = ["window", "linear_ft", "sq_ft"] as const;
export type Basis = (typeof INSTALL_BASES)[number];

/** `not_sure` is a questionnaire answer, not something anyone installs. */
export const INSTALLABLE_TREATMENTS = TREATMENT_TYPES
  .filter((type) => type.key !== "not_sure")
  .map((type) => type.key) as readonly TreatmentType[];

const LABEL = new Map(TREATMENT_TYPES.map((type) => [type.key, type.label]));

export const basisLabel = (basis: Basis): string =>
  basis === "window" ? "Per window" : basis === "linear_ft" ? "Per foot" : "Per square foot";

export type InstallRate = { treatment: TreatmentType; basis: Basis; rateCents: number };

export type InstallSettings = {
  minimumCents: number;
  hardSurfaceCents: number;
  highLadderCents: number;
  motorizedCents: number;
};

export type LineInput = {
  treatment: TreatmentType;
  count: number;
  /** Whole eighths of an inch, as measurements are stored. Needed by the foot. */
  widthEighths: number | null;
  heightEighths: number | null;
  hardSurface: boolean;
  highLadder: boolean;
  motorized: boolean;
};

export type PricedLine = LineInput & {
  basis: Basis;
  rateCents: number;
  quantity: number;
  amountCents: number;
};

export type PricedQuote = {
  lines: PricedLine[];
  subtotalCents: number;
  totalCents: number;
  minimumApplied: boolean;
};

const EIGHTHS_PER_FOOT = 96; // 12 inches
const SQ_EIGHTHS_PER_SQ_FOOT = 9216; // 144 sq in, in eighths squared

/**
 * Windows, whole feet, or whole square feet. Rounding is per window and always
 * up, then multiplied by the count: three windows at 8.33 sq ft bill as 27, not 25.
 */
export function quantityFor(basis: Basis, line: LineInput): number {
  if (basis === "window") return line.count;
  if (line.widthEighths === null) {
    throw new Error(
      basis === "linear_ft"
        ? "Width is needed to price by the foot"
        : "Width and height are needed to price by the square foot",
    );
  }
  if (basis === "linear_ft") return Math.ceil(line.widthEighths / EIGHTHS_PER_FOOT) * line.count;
  if (line.heightEighths === null) throw new Error("Width and height are needed to price by the square foot");
  const area = Math.ceil((line.widthEighths * line.heightEighths) / SQ_EIGHTHS_PER_SQ_FOOT);
  return area * line.count;
}

const surchargeFor = (line: LineInput, settings: InstallSettings): number =>
  (line.hardSurface ? settings.hardSurfaceCents : 0) +
  (line.highLadder ? settings.highLadderCents : 0) +
  (line.motorized ? settings.motorizedCents : 0);

export function priceQuote(
  lines: LineInput[],
  rates: InstallRate[],
  settings: InstallSettings,
): PricedQuote {
  const byTreatment = new Map(rates.map((r) => [r.treatment, r]));
  const priced = lines.map((line): PricedLine => {
    const rate = byTreatment.get(line.treatment);
    // A missing rate must be loud. Pricing it at zero would quietly under-quote a job.
    if (!rate) throw new Error(`No installation rate is set for ${LABEL.get(line.treatment) ?? line.treatment}`);
    const quantity = quantityFor(rate.basis, line);
    const amountCents = rate.rateCents * quantity + line.count * surchargeFor(line, settings);
    return { ...line, basis: rate.basis, rateCents: rate.rateCents, quantity, amountCents };
  });
  const subtotalCents = priced.reduce((sum, l) => sum + l.amountCents, 0);
  // An empty job is not a job; the minimum should not invent a charge out of nothing.
  const minimumApplied = priced.length > 0 && subtotalCents < settings.minimumCents;
  return {
    lines: priced,
    subtotalCents,
    totalCents: minimumApplied ? settings.minimumCents : subtotalCents,
    minimumApplied,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/admin/install-pricing.test.ts --maxWorkers=2`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/install-pricing.ts tests/admin/install-pricing.test.ts
git commit -m "feat: the installation pricing engine"
```

---

### Task 2: Migration and the rates data module

**Files:**
- Create: `db/migrations/0NN_install_pricing.sql` (**check the next free number first**)
- Create: `lib/admin/install-rates.ts`
- Test: `tests/admin/install-rates.test.ts`

**Interfaces:**
- Consumes: `Basis`, `InstallRate`, `InstallSettings` from Task 1.
- Produces:
  - `listInstallRates(): Promise<InstallRate[]>`
  - `getInstallSettings(): Promise<InstallSettings>`
  - `saveInstallRates(rates: InstallRate[], settings: InstallSettings, actor: string): Promise<void>`

- [ ] **Step 1: Check the migration number and write the migration**

Run `ls db/migrations | tail -3` and use the next free number. With 015 present, the file is `db/migrations/016_install_pricing.sql` — but another session may have taken 016, so verify.

```sql
-- Installation pricing: rates the owner edits, and immutable priced snapshots.
-- Every statement is safe to re-run. Rates are deliberately not seeded: a missing
-- row means "not configured yet", which the calculator must say out loud rather
-- than price at zero.

create table if not exists install_rates (
  treatment text primary key,
  basis text not null,
  rate_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table install_rates drop constraint if exists install_rates_basis_check;
alter table install_rates add constraint install_rates_basis_check check (
  basis in ('window','linear_ft','sq_ft')
);

alter table install_rates drop constraint if exists install_rates_rate_check;
alter table install_rates add constraint install_rates_rate_check check (rate_cents >= 0);

-- One row, enforced by the primary key plus a check that it is always true.
create table if not exists install_settings (
  id boolean primary key default true,
  minimum_cents integer not null default 0,
  hard_surface_cents integer not null default 0,
  high_ladder_cents integer not null default 0,
  motorized_cents integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint install_settings_single check (id)
);

insert into install_settings (id) values (true) on conflict (id) do nothing;

create table if not exists install_quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  kind text not null,
  minimum_cents integer not null,
  subtotal_cents integer not null,
  total_cents integer not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

alter table install_quotes drop constraint if exists install_quotes_kind_check;
alter table install_quotes add constraint install_quotes_kind_check check (
  kind in ('estimate','final')
);

-- basis and rate_cents are copied in, never joined back to install_rates:
-- a snapshot that looked up its rate would change when a rate changed.
create table if not exists install_quote_lines (
  id uuid primary key default gen_random_uuid(),
  install_quote_id uuid not null references install_quotes(id) on delete cascade,
  position integer not null,
  treatment text not null,
  basis text not null,
  quantity integer not null,
  rate_cents integer not null,
  hard_surface boolean not null default false,
  high_ladder boolean not null default false,
  motorized boolean not null default false,
  amount_cents integer not null
);

create index if not exists install_quotes_lead_idx on install_quotes (lead_id, created_at desc);
create index if not exists install_quote_lines_quote_idx on install_quote_lines (install_quote_id, position);
```

- [ ] **Step 2: Write the failing test**

Create `tests/admin/install-rates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const rates = await import("@/lib/admin/install-rates");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

describe("listInstallRates", () => {
  it("reads every configured rate", async () => {
    sql.mockResolvedValue([{ treatment: "roller_shades", basis: "window", rate_cents: 2500 }]);
    expect(await rates.listInstallRates()).toEqual([
      { treatment: "roller_shades", basis: "window", rateCents: 2500 },
    ]);
  });

  it("returns nothing when no rate has been set yet", async () => {
    expect(await rates.listInstallRates()).toEqual([]);
  });
});

describe("getInstallSettings", () => {
  it("reads the single settings row", async () => {
    sql.mockResolvedValue([{
      minimum_cents: 15_000, hard_surface_cents: 1000, high_ladder_cents: 5000, motorized_cents: 1500,
    }]);
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500,
    });
  });

  it("falls back to zeroes when the row is somehow missing", async () => {
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0,
    });
  });
});

describe("saveInstallRates", () => {
  it("upserts each rate and the settings row", async () => {
    await rates.saveInstallRates(
      [{ treatment: "roller_shades", basis: "window", rateCents: 2500 }],
      { minimumCents: 15_000, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0 },
      "owner@example.com",
    );
    const statements = sql.mock.calls.map(text);
    expect(statements.some((s) => s.includes("insert into install_rates") && s.includes("on conflict"))).toBe(true);
    expect(statements.some((s) => s.includes("update install_settings"))).toBe(true);
  });

  it("writes no job event, because rates belong to the business rather than to one job", async () => {
    await rates.saveInstallRates([], { minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0 }, "owner@example.com");
    expect(sql.mock.calls.map(text).some((s) => s.includes("insert into job_events"))).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/admin/install-rates.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/admin/install-rates`.

- [ ] **Step 4: Write minimal implementation**

Create `lib/admin/install-rates.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import type { TreatmentType } from "@/lib/leads/treatment-types";
import type { Basis, InstallRate, InstallSettings } from "./install-pricing";

const ZERO: InstallSettings = {
  minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0,
};

/** Only treatments the owner has actually priced. A missing row is "not set yet". */
export async function listInstallRates(): Promise<InstallRate[]> {
  const rows = await db()`select treatment, basis, rate_cents from install_rates order by treatment`;
  return rows.map((row) => ({
    treatment: row.treatment as TreatmentType,
    basis: row.basis as Basis,
    rateCents: Number(row.rate_cents),
  }));
}

export async function getInstallSettings(): Promise<InstallSettings> {
  const rows = await db()`select minimum_cents, hard_surface_cents, high_ladder_cents, motorized_cents
    from install_settings where id = true`;
  const row = rows[0];
  if (!row) return ZERO;
  return {
    minimumCents: Number(row.minimum_cents),
    hardSurfaceCents: Number(row.hard_surface_cents),
    highLadderCents: Number(row.high_ladder_cents),
    motorizedCents: Number(row.motorized_cents),
  };
}

/** `actor` is recorded on the settings row so a rate change has an author. */
export async function saveInstallRates(
  rates: InstallRate[],
  settings: InstallSettings,
  actor: string,
): Promise<void> {
  for (const rate of rates) {
    await db()`insert into install_rates (treatment, basis, rate_cents, updated_at)
      values (${rate.treatment}, ${rate.basis}, ${rate.rateCents}, now())
      on conflict (treatment) do update
        set basis = excluded.basis, rate_cents = excluded.rate_cents, updated_at = now()`;
  }
  await db()`update install_settings set
      minimum_cents = ${settings.minimumCents},
      hard_surface_cents = ${settings.hardSurfaceCents},
      high_ladder_cents = ${settings.highLadderCents},
      motorized_cents = ${settings.motorizedCents},
      updated_at = now()
    where id = true`;
  console.info(`Installation rates updated by ${actor}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/admin/install-rates.test.ts --maxWorkers=2`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0*_install_pricing.sql lib/admin/install-rates.ts tests/admin/install-rates.test.ts
git commit -m "feat: installation rate tables and their data module"
```

---

### Task 3: The snapshot data module

**Files:**
- Create: `lib/admin/install-quotes.ts`
- Test: `tests/admin/install-quotes.test.ts`

**Interfaces:**
- Consumes: `PricedQuote`, `PricedLine`, `Basis` from Task 1.
- Produces:
  - `type InstallQuoteKind = "estimate" | "final"`
  - `type SavedInstallQuote = { id: string; kind: InstallQuoteKind; subtotalCents: number; totalCents: number; minimumCents: number; createdBy: string; createdAt: Date; lines: SavedInstallLine[] }`
  - `type SavedInstallLine = { treatment: TreatmentType; basis: Basis; quantity: number; rateCents: number; hardSurface: boolean; highLadder: boolean; motorized: boolean; amountCents: number }`
  - `saveInstallQuote(leadId: string, kind: InstallQuoteKind, priced: PricedQuote, minimumCents: number, actor: string): Promise<string>`
  - `listInstallQuotes(leadId: string): Promise<SavedInstallQuote[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/admin/install-quotes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const quotes = await import("@/lib/admin/install-quotes");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const QUOTE = "9c8b7a65-4d3e-4f21-8a0b-1c2d3e4f5a6b";

const priced = {
  lines: [{
    treatment: "roller_shades" as const, count: 4, widthEighths: null, heightEighths: null,
    hardSurface: false, highLadder: true, motorized: false,
    basis: "window" as const, rateCents: 2500, quantity: 4, amountCents: 30_000,
  }],
  subtotalCents: 30_000, totalCents: 30_000, minimumApplied: false,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([{ id: QUOTE }]);
});

describe("saveInstallQuote", () => {
  it("writes the snapshot and returns its id", async () => {
    const id = await quotes.saveInstallQuote(JOB, "estimate", priced, 15_000, "owner@example.com");
    expect(id).toBe(QUOTE);
    expect(sql.mock.calls.map(text).some((s) => s.includes("insert into install_quotes"))).toBe(true);
  });

  it("writes one line row per priced line, carrying its rate and basis", async () => {
    await quotes.saveInstallQuote(JOB, "estimate", priced, 15_000, "owner@example.com");
    const lineCall = sql.mock.calls.find((c) => text(c).includes("insert into install_quote_lines"));
    expect(lineCall).toBeDefined();
    expect(lineCall!.slice(1)).toEqual(
      expect.arrayContaining([QUOTE, 0, "roller_shades", "window", 4, 2500, false, true, false, 30_000]),
    );
  });

  it("records the job event, so the snapshot shows in the job's history", async () => {
    await quotes.saveInstallQuote(JOB, "final", priced, 15_000, "owner@example.com");
    expect(sql.mock.calls.map(text).some((s) => s.includes("insert into job_events"))).toBe(true);
  });

  it("refuses an id that is not a uuid rather than querying with it", async () => {
    await expect(quotes.saveInstallQuote("nope", "estimate", priced, 0, "owner@example.com"))
      .rejects.toThrow("Not a job id");
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("listInstallQuotes", () => {
  it("returns nothing for a job with no snapshots", async () => {
    sql.mockResolvedValue([]);
    expect(await quotes.listInstallQuotes(JOB)).toEqual([]);
  });

  it("groups line rows under their snapshot, newest first", async () => {
    sql
      .mockResolvedValueOnce([
        { id: QUOTE, kind: "estimate", minimum_cents: 15_000, subtotal_cents: 30_000,
          total_cents: 30_000, created_by: "owner@example.com", created_at: "2026-09-16T10:00:00Z" },
      ])
      .mockResolvedValueOnce([
        { install_quote_id: QUOTE, treatment: "roller_shades", basis: "window", quantity: 4,
          rate_cents: 2500, hard_surface: false, high_ladder: true, motorized: false, amount_cents: 30_000 },
      ]);
    const [saved] = await quotes.listInstallQuotes(JOB);
    expect(saved.totalCents).toBe(30_000);
    expect(saved.lines).toHaveLength(1);
    expect(saved.lines[0]).toMatchObject({ treatment: "roller_shades", rateCents: 2500, highLadder: true });
  });

  it("refuses an id that is not a uuid", async () => {
    expect(await quotes.listInstallQuotes("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/admin/install-quotes.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/admin/install-quotes`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/admin/install-quotes.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import type { TreatmentType } from "@/lib/leads/treatment-types";
import type { Basis, PricedQuote } from "./install-pricing";

export type InstallQuoteKind = "estimate" | "final";

export type SavedInstallLine = {
  treatment: TreatmentType;
  basis: Basis;
  quantity: number;
  rateCents: number;
  hardSurface: boolean;
  highLadder: boolean;
  motorized: boolean;
  amountCents: number;
};

export type SavedInstallQuote = {
  id: string;
  kind: InstallQuoteKind;
  minimumCents: number;
  subtotalCents: number;
  totalCents: number;
  createdBy: string;
  createdAt: Date;
  lines: SavedInstallLine[];
};

/**
 * A snapshot is written once and never edited. The rate and basis are copied onto
 * each line so raising a rate later cannot rewrite what was quoted.
 */
export async function saveInstallQuote(
  leadId: string,
  kind: InstallQuoteKind,
  priced: PricedQuote,
  minimumCents: number,
  actor: string,
): Promise<string> {
  if (!isUuid(leadId)) throw new Error("Not a job id");
  const [row] = await db()`insert into install_quotes
      (lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
    values (${leadId}, ${kind}, ${minimumCents}, ${priced.subtotalCents}, ${priced.totalCents}, ${actor})
    returning id`;
  const id = row.id as string;
  for (const [position, line] of priced.lines.entries()) {
    await db()`insert into install_quote_lines
        (install_quote_id, position, treatment, basis, quantity, rate_cents,
         hard_surface, high_ladder, motorized, amount_cents)
      values (${id}, ${position}, ${line.treatment}, ${line.basis}, ${line.quantity}, ${line.rateCents},
         ${line.hardSurface}, ${line.highLadder}, ${line.motorized}, ${line.amountCents})`;
  }
  const label = kind === "estimate" ? "Estimate" : "Final";
  await db()`insert into job_events (lead_id, actor, kind, body)
    values (${leadId}, ${actor}, 'install_price', ${`${label} installation price: ${formatCents(priced.totalCents)}`})`;
  return id;
}

export async function listInstallQuotes(leadId: string): Promise<SavedInstallQuote[]> {
  if (!isUuid(leadId)) return [];
  const quoteRows = await db()`select id, kind, minimum_cents, subtotal_cents, total_cents, created_by, created_at
    from install_quotes where lead_id = ${leadId} order by created_at desc`;
  if (quoteRows.length === 0) return [];
  const ids = quoteRows.map((row) => row.id as string);
  const lineRows = await db()`select install_quote_id, treatment, basis, quantity, rate_cents,
      hard_surface, high_ladder, motorized, amount_cents
    from install_quote_lines where install_quote_id = any(${ids}) order by position`;
  return quoteRows.map((row) => ({
    id: row.id as string,
    kind: row.kind as InstallQuoteKind,
    minimumCents: Number(row.minimum_cents),
    subtotalCents: Number(row.subtotal_cents),
    totalCents: Number(row.total_cents),
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string),
    lines: lineRows
      .filter((line) => line.install_quote_id === row.id)
      .map((line) => ({
        treatment: line.treatment as TreatmentType,
        basis: line.basis as Basis,
        quantity: Number(line.quantity),
        rateCents: Number(line.rate_cents),
        hardSurface: Boolean(line.hard_surface),
        highLadder: Boolean(line.high_ladder),
        motorized: Boolean(line.motorized),
        amountCents: Number(line.amount_cents),
      })),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/admin/install-quotes.test.ts --maxWorkers=2`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/install-quotes.ts tests/admin/install-quotes.test.ts
git commit -m "feat: immutable installation price snapshots"
```

---

### Task 4: Settings — the rate table

**Files:**
- Modify: `lib/admin/schema.ts` (append near `teamMemberSchema`)
- Create: `app/admin/settings/InstallRatesSection.tsx`
- Modify: `app/admin/settings/actions.ts`
- Modify: `app/admin/settings/page.tsx`
- Test: `tests/admin/install-rates-section.test.tsx`

**Interfaces:**
- Consumes: `listInstallRates`, `getInstallSettings`, `saveInstallRates` (Task 2); `INSTALLABLE_TREATMENTS`, `INSTALL_BASES`, `basisLabel` (Task 1).
- Produces: `saveInstallRatesAction(prev: InstallRatesFormState, formData: FormData): Promise<InstallRatesFormState>` and `type InstallRatesFormState = { error?: string; ok?: boolean }`.

- [ ] **Step 1: Add the schema**

Append to `lib/admin/schema.ts`:

```ts
/** A money field on the installation rates form. Blank counts as zero, not as "unset". */
const rateAmount = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value))
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "Enter an amount like 25 or 25.00")
  .transform((value) => Math.round(Number(value) * 100))
  .refine((cents) => cents <= 2_147_483_647, "Enter an amount under $21,474,836");

export const installRateSchema = z.object({
  treatment: z.enum(INSTALLABLE_TREATMENTS as [string, ...string[]]),
  basis: z.enum(INSTALL_BASES),
  rateCents: rateAmount,
});

export const installSettingsSchema = z.object({
  minimumCents: rateAmount,
  hardSurfaceCents: rateAmount,
  highLadderCents: rateAmount,
  motorizedCents: rateAmount,
});
```

Add at the top of the file, with the other imports:

```ts
import { INSTALLABLE_TREATMENTS, INSTALL_BASES } from "@/lib/admin/install-pricing";
```

- [ ] **Step 2: Write the failing test**

Create `tests/admin/install-rates-section.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/settings/actions", () => ({ saveInstallRatesAction: vi.fn() }));

const { InstallRatesSection } = await import("@/app/admin/settings/InstallRatesSection");

const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 };

describe("InstallRatesSection", () => {
  it("lists every installable treatment, and never the not-sure answer", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Roller shades rate")).toBeInTheDocument();
    expect(screen.getByLabelText("Shutters rate")).toBeInTheDocument();
    expect(screen.queryByLabelText(/not sure/i)).toBeNull();
  });

  it("shows a configured rate and its basis", () => {
    render(<InstallRatesSection rates={[{ treatment: "roller_shades", basis: "window", rateCents: 2500 }]} settings={settings} />);
    expect(screen.getByLabelText("Roller shades rate")).toHaveValue("25");
    expect(screen.getByLabelText("Roller shades priced by")).toHaveValue("window");
  });

  it("leaves an unconfigured rate blank rather than showing a misleading zero", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Shutters rate")).toHaveValue("");
  });

  it("shows the job-level numbers", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Minimum job cost")).toHaveValue("150");
    expect(screen.getByLabelText("Hard surface")).toHaveValue("10");
    expect(screen.getByLabelText("High ladder")).toHaveValue("50");
    expect(screen.getByLabelText("Motorized")).toHaveValue("15");
  });

  it("says the surcharges are charged per window", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(within(screen.getByRole("group", { name: /surcharges/i })).getByText(/per window/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/admin/install-rates-section.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `@/app/admin/settings/InstallRatesSection`.

- [ ] **Step 4: Write the section**

Create `app/admin/settings/InstallRatesSection.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { TREATMENT_TYPES } from "@/lib/leads/treatment-types";
import { INSTALL_BASES, INSTALLABLE_TREATMENTS, basisLabel, type InstallRate, type InstallSettings } from "@/lib/admin/install-pricing";
import { saveInstallRatesAction, type InstallRatesFormState } from "./actions";

const LABEL = new Map(TREATMENT_TYPES.map((type) => [type.key, type.label]));
/** Cents to a plain form value: 2500 → "25", 2550 → "25.50", unset → "". */
const amount = (cents: number | null): string =>
  cents === null ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

const field = "min-h-11 w-28 border border-rule px-2";

export function InstallRatesSection({ rates, settings }: { rates: InstallRate[]; settings: InstallSettings }) {
  const [state, action, pending] = useActionState<InstallRatesFormState, FormData>(saveInstallRatesAction, {});
  const byTreatment = new Map(rates.map((rate) => [rate.treatment, rate]));

  return (
    <section aria-labelledby="install-rates-heading" className="flex flex-col gap-3">
      <h2 id="install-rates-heading" className="text-lg font-semibold">Installation rates</h2>
      <p className="text-sm text-ink-soft">What PSS charges to install, before any Hunter Douglas product cost.</p>
      <form action={action} className="flex flex-col gap-4">
        <table className="text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.1em] text-ink-soft">
            <tr><th scope="col" className="py-2">Treatment</th><th scope="col">Priced by</th><th scope="col">Rate</th></tr>
          </thead>
          <tbody>
            {INSTALLABLE_TREATMENTS.map((treatment) => {
              const rate = byTreatment.get(treatment);
              const label = LABEL.get(treatment) ?? treatment;
              return (
                <tr key={treatment}>
                  <th scope="row" className="py-1 font-normal">{label}</th>
                  <td>
                    <label className="sr-only" htmlFor={`basis-${treatment}`}>{label} priced by</label>
                    <select id={`basis-${treatment}`} name={`basis-${treatment}`}
                      defaultValue={rate?.basis ?? "window"} className={field}>
                      {INSTALL_BASES.map((basis) => (
                        <option key={basis} value={basis}>{basisLabel(basis)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`rate-${treatment}`}>{label} rate</label>
                    <input id={`rate-${treatment}`} name={`rate-${treatment}`} inputMode="decimal"
                      defaultValue={amount(rate ? rate.rateCents : null)} placeholder="—" className={field} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Surcharges, per window</legend>
          <label className="flex items-center justify-between gap-3">
            Hard surface
            <input name="hardSurfaceCents" inputMode="decimal" defaultValue={amount(settings.hardSurfaceCents)} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            High ladder
            <input name="highLadderCents" inputMode="decimal" defaultValue={amount(settings.highLadderCents)} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            Motorized
            <input name="motorizedCents" inputMode="decimal" defaultValue={amount(settings.motorizedCents)} className={field} />
          </label>
        </fieldset>

        <label className="flex items-center justify-between gap-3 text-sm">
          Minimum job cost
          <input name="minimumCents" inputMode="decimal" defaultValue={amount(settings.minimumCents)} className={field} />
        </label>
        <p className="text-xs text-ink-soft">The minimum covers the trip. There is no separate trip charge.</p>

        {state.error ? <p role="alert" className="text-sm text-overdue">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm">Saved.</p> : null}
        <button type="submit" disabled={pending}
          className="min-h-11 self-start bg-charcoal px-4 text-sm text-ivory">
          {pending ? "Saving…" : "Save rates"}
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Write the action**

Append to `app/admin/settings/actions.ts`:

```ts
import { INSTALLABLE_TREATMENTS } from "@/lib/admin/install-pricing";
import { installRateSchema, installSettingsSchema } from "@/lib/admin/schema";
import { saveInstallRates } from "@/lib/admin/install-rates";

export type InstallRatesFormState = { error?: string; ok?: boolean };

export async function saveInstallRatesAction(
  _prev: InstallRatesFormState,
  formData: FormData,
): Promise<InstallRatesFormState> {
  const admin = await requireAdmin();
  const settings = installSettingsSchema.safeParse({
    minimumCents: formData.get("minimumCents") ?? "",
    hardSurfaceCents: formData.get("hardSurfaceCents") ?? "",
    highLadderCents: formData.get("highLadderCents") ?? "",
    motorizedCents: formData.get("motorizedCents") ?? "",
  });
  if (!settings.success) return { error: settings.error.issues[0].message };

  const rates = [];
  for (const treatment of INSTALLABLE_TREATMENTS) {
    const raw = String(formData.get(`rate-${treatment}`) ?? "").trim();
    // A blank rate means "not priced yet"; saving a zero would claim it is free.
    if (raw === "") continue;
    const parsed = installRateSchema.safeParse({
      treatment, basis: formData.get(`basis-${treatment}`), rateCents: raw,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    rates.push(parsed.data);
  }

  await saveInstallRates(rates, settings.data, admin.email);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/jobs/[id]", "page");
  return { ok: true };
}
```

- [ ] **Step 6: Render it in Settings**

In `app/admin/settings/page.tsx`, add to the imports:

```ts
import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { InstallRatesSection } from "./InstallRatesSection";
```

Add both reads to the existing `Promise.all`, and render `<InstallRatesSection rates={rates} settings={installSettings} />` directly after `<TeamSection team={team} />`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/admin/install-rates-section.test.tsx tests/admin/settings-page.test.tsx --maxWorkers=2`
Expected: PASS. If `settings-page.test.tsx` asserts an exact set of sections, update it to expect the new one.

- [ ] **Step 8: Commit**

```bash
git add lib/admin/schema.ts app/admin/settings tests/admin/install-rates-section.test.tsx
git commit -m "feat: installation rates in Settings"
```

---

### Task 5: The Install tab

**Files:**
- Modify: `app/admin/jobs/[id]/tabs.ts`
- Create: `app/admin/jobs/[id]/InstallTab.tsx`
- Create: `app/admin/jobs/[id]/InstallCalculator.tsx`
- Create: `app/admin/jobs/[id]/install-actions.ts`
- Modify: `app/admin/jobs/[id]/page.tsx`
- Test: `tests/admin/install-tab.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `saveInstallQuoteAction(jobId: string, kind: InstallQuoteKind, lines: LineInput[]): Promise<{ error?: string; ok?: boolean }>`.

- [ ] **Step 1: Add the tab**

In `app/admin/jobs/[id]/tabs.ts`, add `{ value: "install", label: "Install" }` to `JOB_TABS`, after `files`.

- [ ] **Step 2: Write the failing test**

Create `tests/admin/install-tab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/jobs/[id]/install-actions", () => ({ saveInstallQuoteAction: vi.fn() }));

const { InstallCalculator } = await import("@/app/admin/jobs/[id]/InstallCalculator");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 };
const rates = [{ treatment: "roller_shades" as const, basis: "window" as const, rateCents: 2500 }];

describe("InstallCalculator", () => {
  it("says so plainly when no rates are configured, instead of pricing at zero", () => {
    render(<InstallCalculator jobId={JOB} rates={[]} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no installation rates/i);
    expect(screen.queryByRole("button", { name: /save as estimate/i })).toBeNull();
  });

  it("offers a line editor once rates exist", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByRole("button", { name: /add line/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save as estimate/i })).toBeInTheDocument();
  });

  it("shows nothing owed before a line is added", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByTestId("install-total")).toHaveTextContent("$0");
  });

  it("lists past snapshots newest first, with kind, total and author", () => {
    render(
      <InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]} saved={[{
        id: "a", kind: "final", minimumCents: 15_000, subtotalCents: 40_000, totalCents: 40_000,
        createdBy: "owner@example.com", createdAt: new Date("2026-09-16T10:00:00Z"), lines: [],
      }, {
        id: "b", kind: "estimate", minimumCents: 15_000, subtotalCents: 30_000, totalCents: 30_000,
        createdBy: "owner@example.com", createdAt: new Date("2026-09-10T10:00:00Z"), lines: [],
      }]} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Final");
    expect(items[0]).toHaveTextContent("$400");
    expect(items[1]).toHaveTextContent("Estimate");
  });

  it("offers to fill from measurements only when the job has some", () => {
    const { rerender } = render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.queryByRole("button", { name: /fill from measurements/i })).toBeNull();

    rerender(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[{
      id: "m", room: "Kitchen", label: null, widthEighths: 240, heightEighths: 320,
      requirements: ["high_ladder"],
    }]} />);
    expect(screen.getByRole("button", { name: /fill from measurements/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/admin/install-tab.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `@/app/admin/jobs/[id]/InstallCalculator`.

- [ ] **Step 4: Write the action**

Create `app/admin/jobs/[id]/install-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { saveInstallQuote, type InstallQuoteKind } from "@/lib/admin/install-quotes";
import { priceQuote, type LineInput } from "@/lib/admin/install-pricing";

/**
 * Prices on the server from the stored rates. The browser's total is a preview;
 * what gets saved is priced here, so a stale page cannot write a stale price.
 */
export async function saveInstallQuoteAction(
  jobId: string,
  kind: InstallQuoteKind,
  lines: LineInput[],
): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  if (lines.length === 0) return { error: "Add at least one line before saving." };
  const [rates, settings] = await Promise.all([listInstallRates(), getInstallSettings()]);
  try {
    const priced = priceQuote(lines, rates, settings);
    await saveInstallQuote(jobId, kind, priced, settings.minimumCents, admin.email);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not price this job." };
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: true };
}
```

- [ ] **Step 5: Write the calculator**

Create `app/admin/jobs/[id]/InstallCalculator.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { TREATMENT_TYPES, type TreatmentType } from "@/lib/leads/treatment-types";
import {
  INSTALLABLE_TREATMENTS, priceQuote,
  type InstallRate, type InstallSettings, type LineInput, type PricedQuote,
} from "@/lib/admin/install-pricing";
import type { InstallQuoteKind, SavedInstallQuote } from "@/lib/admin/install-quotes";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatCents } from "@/lib/admin/money";
import { formatWhen } from "@/lib/admin/time";
import { saveInstallQuoteAction } from "./install-actions";

/** Only what filling from measurements reads, so callers and tests need not build whole rows. */
export type MeasuredWindow = Pick<
  WindowMeasurement,
  "id" | "room" | "label" | "widthEighths" | "heightEighths" | "requirements"
>;

const LABEL = new Map(TREATMENT_TYPES.map((type) => [type.key, type.label]));
const field = "min-h-11 border border-rule px-2";

const blankLine = (treatment: TreatmentType): LineInput => ({
  treatment, count: 1, widthEighths: null, heightEighths: null,
  hardSurface: false, highLadder: false, motorized: false,
});

/** Inches typed by the owner, stored as eighths like every other dimension. */
const inchesToEighths = (value: string): number | null => {
  const inches = Number(value);
  return value.trim() === "" || !Number.isFinite(inches) || inches <= 0 ? null : Math.round(inches * 8);
};

/**
 * Preview only. Pricing can fail — a treatment with no rate, a per-foot line with
 * no width — and that must read as a message, not crash the page. The saved price
 * is computed again on the server from the stored rates.
 */
function preview(lines: LineInput[], rates: InstallRate[], settings: InstallSettings):
  { priced: PricedQuote; error: null } | { priced: null; error: string } {
  try {
    return { priced: priceQuote(lines, rates, settings), error: null };
  } catch (error) {
    return { priced: null, error: error instanceof Error ? error.message : "Could not price this job." };
  }
}

const FLAG_LABEL = { hardSurface: "Hard surface", highLadder: "High ladder", motorized: "Motorized" } as const;

export function InstallCalculator({ jobId, rates, settings, saved, measurements }: {
  jobId: string;
  rates: InstallRate[];
  settings: InstallSettings;
  saved: SavedInstallQuote[];
  measurements: MeasuredWindow[];
}) {
  const [lines, setLines] = useState<LineInput[]>([]);
  const [fillTreatment, setFillTreatment] = useState<TreatmentType>(INSTALLABLE_TREATMENTS[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rates.length === 0) {
    return (
      <p role="alert" className="text-sm text-overdue">
        No installation rates are set. Add them in Settings before pricing a job.
      </p>
    );
  }

  const basisOf = new Map(rates.map((rate) => [rate.treatment, rate.basis]));
  const { priced, error } = preview(lines, rates, settings);

  const update = (index: number, patch: Partial<LineInput>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  // One line per measured window. A line holds a single width and height, so
  // merging windows of different sizes would misprice anything sold by the foot.
  const fillFromMeasurements = () =>
    setLines(measurements.map((window) => ({
      treatment: fillTreatment,
      count: 1,
      widthEighths: window.widthEighths,
      heightEighths: window.heightEighths,
      hardSurface: window.requirements.includes("hard_surface"),
      highLadder: window.requirements.includes("high_ladder"),
      motorized: false,
    })));

  const save = (kind: InstallQuoteKind) =>
    startTransition(async () => {
      const result = await saveInstallQuoteAction(jobId, kind, lines);
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage(null);
        setLines([]);
      }
    });

  const blocked = pending || lines.length === 0 || error !== null;

  return (
    <div className="flex flex-col gap-6">
      {measurements.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Treatment for measured windows
            <select value={fillTreatment} onChange={(e) => setFillTreatment(e.target.value as TreatmentType)} className={field}>
              {INSTALLABLE_TREATMENTS.map((t) => <option key={t} value={t}>{LABEL.get(t)}</option>)}
            </select>
          </label>
          <button type="button" onClick={fillFromMeasurements} className={`${field} bg-ivory`}>
            Fill from measurements
          </button>
        </div>
      ) : null}

      <div aria-label="Lines" role="group" className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const basis = basisOf.get(line.treatment);
          return (
            <div key={index} className="flex flex-wrap items-end gap-3 border border-rule p-3">
              <label className="flex flex-col gap-1 text-sm">
                Treatment
                <select value={line.treatment} onChange={(e) => update(index, { treatment: e.target.value as TreatmentType })} className={field}>
                  {INSTALLABLE_TREATMENTS.map((t) => <option key={t} value={t}>{LABEL.get(t)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Windows
                <input inputMode="numeric" value={String(line.count)}
                  onChange={(e) => update(index, { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  className={`${field} w-20`} />
              </label>
              {basis === "linear_ft" || basis === "sq_ft" ? (
                <label className="flex flex-col gap-1 text-sm">
                  Width (in)
                  <input inputMode="decimal"
                    defaultValue={line.widthEighths === null ? "" : String(line.widthEighths / 8)}
                    onChange={(e) => update(index, { widthEighths: inchesToEighths(e.target.value) })}
                    className={`${field} w-24`} />
                </label>
              ) : null}
              {basis === "sq_ft" ? (
                <label className="flex flex-col gap-1 text-sm">
                  Height (in)
                  <input inputMode="decimal"
                    defaultValue={line.heightEighths === null ? "" : String(line.heightEighths / 8)}
                    onChange={(e) => update(index, { heightEighths: inchesToEighths(e.target.value) })}
                    className={`${field} w-24`} />
                </label>
              ) : null}
              {(Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((flag) => (
                <label key={flag} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={line[flag]} onChange={(e) => update(index, { [flag]: e.target.checked })} />
                  {FLAG_LABEL[flag]}
                </label>
              ))}
              <button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                className="min-h-11 px-2 text-sm underline">
                Remove
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => setLines((current) => [...current, blankLine(rates[0].treatment)])}
        className={`${field} self-start bg-ivory`}>
        Add line
      </button>

      <div className="flex flex-col gap-1">
        {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}
        {priced && priced.minimumApplied ? (
          <p className="text-sm text-ink-soft">
            Lines come to {formatCents(priced.subtotalCents)}. Minimum job cost applied.
          </p>
        ) : null}
        <p className="text-lg font-semibold">
          Total <span data-testid="install-total">{formatCents(priced ? priced.totalCents : 0)}</span>
        </p>
      </div>

      {message ? <p role="alert" className="text-sm text-overdue">{message}</p> : null}
      <div className="flex gap-3">
        <button type="button" disabled={blocked} onClick={() => save("estimate")}
          className="min-h-11 bg-charcoal px-4 text-sm text-ivory">
          Save as estimate
        </button>
        <button type="button" disabled={blocked} onClick={() => save("final")}
          className="min-h-11 border border-charcoal px-4 text-sm">
          Save as final
        </button>
      </div>

      {saved.length > 0 ? (
        <section aria-labelledby="install-history" className="flex flex-col gap-2">
          <h3 id="install-history" className="text-sm font-semibold">Saved prices</h3>
          <ul className="flex flex-col divide-y divide-rule border border-rule">
            {saved.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-semibold">{quote.kind === "estimate" ? "Estimate" : "Final"}</span>
                <span>{formatCents(quote.totalCents)}</span>
                <span className="text-ink-soft">{quote.createdBy} · {formatWhen(quote.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
```

Two behaviours here deserve a reason, since a reviewer could fairly question either:

- **Filling from measurements makes one line per window, not grouped lines.** A line holds one width and one height. Merging a 30″ and a 72″ window into a "count 2" line would price both at a single size, so every treatment sold by the foot or square foot would come out wrong. One line per window is always correct; the owner can merge lines by hand for a per-window treatment, where size does not matter.
- **The line editor is a `role="group"` of `<div>`s, and only the saved-prices history is a `<ul>`.** That keeps `getAllByRole("listitem")` in the unit test and `getByRole("listitem")` in the e2e pointed unambiguously at saved snapshots, however many lines are being edited.

- [ ] **Step 6: Write the server tab and wire the page**

Create `app/admin/jobs/[id]/InstallTab.tsx`:

```tsx
import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { listInstallQuotes } from "@/lib/admin/install-quotes";
import { InstallCalculator, type MeasuredWindow } from "./InstallCalculator";

export async function InstallTab({ jobId, measurements }: { jobId: string; measurements: MeasuredWindow[] }) {
  const [rates, settings, saved] = await Promise.all([
    listInstallRates(),
    getInstallSettings(),
    listInstallQuotes(jobId),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Installation price</h2>
      <InstallCalculator jobId={jobId} rates={rates} settings={settings} saved={saved} measurements={measurements} />
    </div>
  );
}
```

In `app/admin/jobs/[id]/page.tsx`, import it and add beside the other tabs:

```tsx
{tab === "install" ? <InstallTab jobId={job.id} measurements={measurements} /> : null}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/admin/install-tab.test.tsx tests/admin/job-page.test.tsx --maxWorkers=2`
Expected: PASS. If `job-page.test.tsx` asserts the exact tab list, update it to include Install.

- [ ] **Step 8: Commit**

```bash
git add app/admin/jobs tests/admin/install-tab.test.tsx
git commit -m "feat: the Install tab prices a job"
```

---

### Task 6: End to end

**Files:**
- Create: `e2e/install.spec.ts`
- Modify: `playwright.config.ts` — add `e2e-install@example.com` to the webServer's `ADMIN_EMAILS`.

**Interfaces:**
- Consumes: the Settings section (Task 4) and the Install tab (Task 5).

- [ ] **Step 1: Write the spec**

Create `e2e/install.spec.ts`, following `e2e/admin.spec.ts`: skip without `E2E_POSTGRES_URL`, `test.describe.configure({ mode: "serial" })`, a `signIn` helper minting a token for `e2e-install@example.com`, and an `afterAll` deleting only rows named `E2E Install %` plus that email's tokens and sessions.

```ts
test("rates set in Settings price a job, and the snapshot survives a rate change", async ({ page }) => {
  const name = `E2E Install ${Date.now()}`;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550401', 'e2e-install@example.com', 'Henderson', 'phone', 'quoted')
    returning id`;
  await signIn(page);

  await page.goto("/admin/settings");
  await page.getByLabel("Roller shades priced by").selectOption("window");
  await page.getByLabel("Roller shades rate").fill("25");
  await page.getByLabel("Minimum job cost").fill("150");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.goto(`/admin/jobs/${row.id}?tab=install`);
  await page.getByRole("button", { name: /add line/i }).click();
  await page.getByLabel("Treatment").selectOption("roller_shades");
  await page.getByLabel("Windows").fill("4");
  await expect(page.getByTestId("install-total")).toHaveText("$150");
  await expect(page.getByText(/minimum job cost applied/i)).toBeVisible();

  await page.getByLabel("Windows").fill("10");
  await expect(page.getByTestId("install-total")).toHaveText("$250");
  await page.getByRole("button", { name: /save as estimate/i }).click();
  await expect(page.getByRole("listitem").first()).toContainText("$250");

  // Raising the rate must not rewrite what was already quoted.
  await page.goto("/admin/settings");
  await page.getByLabel("Roller shades rate").fill("40");
  await page.getByRole("button", { name: "Save rates" }).click();
  await page.goto(`/admin/jobs/${row.id}?tab=install`);
  await expect(page.getByRole("listitem").first()).toContainText("$250");
});
```

- [ ] **Step 2: Run it**

Create a Neon branch, run migrations on it, then:

```bash
E2E_POSTGRES_URL=<branch url> npx playwright test e2e/install.spec.ts --project=desktop --workers=1
```

Expected: PASS. Delete the branch afterwards.

- [ ] **Step 3: Commit**

```bash
git add e2e/install.spec.ts playwright.config.ts
git commit -m "test: e2e for the installation calculator"
```

---

## Self-Review

**Spec coverage.** Rates in Settings — Task 4. The engine, rounding, minimum, surcharges — Task 1. Snapshot tables and immutability — Tasks 2, 3, and the e2e in Task 6. The Install tab, past snapshots, and fill-from-measurements — Task 5. The "no rates configured" state — Tasks 4 and 5. Out-of-scope items are built by none of the tasks, as intended.

**Deviation from the spec, deliberate.** The spec says filling from measurements groups windows into lines by treatment and flags. Writing the code showed that grouping is wrong for any treatment sold by the foot or square foot, because a line holds a single width and height. Task 5 makes one line per window instead, which is always correct. The spec is updated to match.

**Type consistency.** `LineInput`, `PricedLine`, `PricedQuote`, `InstallRate`, `InstallSettings` and `Basis` are defined once in Task 1 and imported everywhere after. `saveInstallQuote` takes `minimumCents` separately from `PricedQuote` because the snapshot records the minimum in force even when it did not apply.

**Coordination.** Another session is editing `app/admin/jobs/[id]/`. Task 5 touches `tabs.ts` and `page.tsx` there — two small additions — and adds otherwise-new files. Pull before starting Task 5, and check the migration number before Task 2.
