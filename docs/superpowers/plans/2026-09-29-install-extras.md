# Installation Extras (Takedown + App Set-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner charge blinds/drapery takedown, shutter takedown and motorization app set-up on an installation price, at rates set in Settings, with every saved price recording exactly what it charged.

**Architecture:** Four new rate columns on the single `install_settings` row; a new `install_quote_extras` snapshot table plus `install_quotes.extras_cents`. The pure pricing module gains an `ExtrasInput` and returns priced extra rows that count toward the minimum and are part of the save fingerprint. Settings form and the job Install calculator get the new inputs.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Neon Postgres via `@neondatabase/serverless` tagged templates, zod 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-install-extras-design.md`

**Worktree:** `C:\Users\whirl\pss\.claude\worktrees\install-extras`, branch `feat/install-extras`. Run every command from there. Before editing, confirm `git rev-parse --abbrev-ref HEAD` prints `feat/install-extras`.

## Global Constraints

- Migration number is **027** (024 dc-quote-import and 026 documents are claimed on other branches).
- Every migration statement is safe to re-run; each new check is its own named constraint (drop if exists, then add), as in `020_install_measure_fee.sql`.
- Money is integer cents everywhere; every amount, sum and total must be `<= 2_147_483_647` (`MAX_CENTS` in install-pricing.ts) or pricing throws "This job is too large to price."
- A rate of 0 means "not set": using an extra whose rate is 0 throws by name, never prices at zero.
- Saved prices are immutable snapshots: rates are copied onto rows, never joined back.
- One data-modifying CTE per save (no `sql.transaction()`, no second `db()` call) — see `saveInstallQuote`.
- `job_events.kind` stays `'edit'` (CHECK constraint).
- Test commands: `npx vitest run --maxWorkers=2 <files>`; typecheck `npx tsc --noEmit` (ignore errors under `.next/`; run `npx next typegen` first in a fresh worktree); lint changed files by path: `npx eslint <files>`.
- Neon test-branch runs need the owner's OK **each time** before creating a branch. Never print a connection string; write it to the scratchpad and check it does **not** contain `ep-cold-term` (production).
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL
  ```

## Review Focus

1. **Playwright `getByLabel` is a case-insensitive substring match.** A new calculator label containing "windows" or "treatment" breaks the existing e2e `getByLabel("Windows")`. Labels are therefore "Blinds/drapery takedown (count)", "Shutter takedown (sq ft)" and "Set-up price" — Task 5 adds a unit test that exactly one control is labelled with the text "Windows".
2. **Motor count crossing 9 → 10 while a custom price is typed, then back.** Below 10 the typed price must not be sent or charged; the fingerprint must match the server. Task 5 tests that the box disappears and the total drops back to the 4–9 rate.
3. **Takedown-only save** (no lines). The action must accept it and the minimum must apply; the old "Add at least one line" refusal must still fire when there is truly nothing. Tasks 3 and 4 test both.
4. **Saved prices from before extras** have no extra rows and `extras_cents = 0`; the list must show them exactly as today. Task 4 tests a list with no extra rows.
5. **Settings save with the new fields blank** (an old tab open during deploy submits no extras fields). The action must refuse with a named message, not write NaN or wipe rates. Task 2 tests a missing field.

---

### Task 1: Migration 027 and the settings row

**Files:**
- Create: `db/migrations/027_install_extras.sql`
- Modify: `lib/admin/install-pricing.ts` (the `InstallSettings` type only)
- Modify: `lib/admin/install-rates.ts`
- Test: `tests/admin/install-rates.test.ts`
- Modify fixtures (add the four new fields, value 0 unless stated): `tests/admin/install-pricing.test.ts`, `tests/admin/install-actions.test.ts`, `tests/admin/install-tab.test.tsx`, `tests/admin/install-rates-section.test.tsx`, `tests/admin/settings-actions.test.ts`, `tests/admin/settings-page.test.tsx` — every object literal typed or used as `InstallSettings`. Find them with `grep -rn "measureCents" tests app`.

**Interfaces:**
- Produces: `InstallSettings` = `{ minimumCents; hardSurfaceCents; highLadderCents; motorizedCents; measureCents; takedownCents; shutterTakedownCents; appSetupSmallCents; appSetupLargeCents }` (all `number`). `getInstallSettings()` returns all nine; `saveInstallRates(rates, settings, actor)` writes all nine.

- [ ] **Step 1: Write the migration**

```sql
-- Installation extras: takedown of what is on the windows now, and motorization app set-up.
-- Every statement is safe to re-run. Checks are their own named constraints (see 020 for why).

-- The rates as the owner sets them in Settings. 0 means "not set", and pricing refuses to use it.
alter table install_settings add column if not exists takedown_cents integer not null default 0;
alter table install_settings add column if not exists shutter_takedown_cents integer not null default 0;
alter table install_settings add column if not exists app_setup_small_cents integer not null default 0;
alter table install_settings add column if not exists app_setup_large_cents integer not null default 0;

alter table install_settings drop constraint if exists install_settings_extras_cents_check;
alter table install_settings add constraint install_settings_extras_cents_check check (
  takedown_cents >= 0 and shutter_takedown_cents >= 0 and app_setup_small_cents >= 0 and app_setup_large_cents >= 0
);

-- What a saved price charged in extras. Prices saved before extras existed read 0, which is true.
alter table install_quotes add column if not exists extras_cents integer not null default 0;

alter table install_quotes drop constraint if exists install_quotes_extras_cents_check;
alter table install_quotes add constraint install_quotes_extras_cents_check check (extras_cents >= 0);

-- Each extra a saved price charged. rate_cents is copied in, never joined back to install_settings.
-- For app set-up rows, quantity is the motor count and amount_cents equals the flat rate_cents.
create table if not exists install_quote_extras (
  id uuid primary key default gen_random_uuid(),
  install_quote_id uuid not null references install_quotes(id) on delete cascade,
  position integer not null,
  kind text not null,
  quantity integer not null,
  rate_cents integer not null,
  amount_cents integer not null
);

alter table install_quote_extras drop constraint if exists install_quote_extras_kind_check;
alter table install_quote_extras add constraint install_quote_extras_kind_check check (
  kind in ('takedown','shutter_takedown','app_setup_small','app_setup_large','app_setup_custom')
);

alter table install_quote_extras drop constraint if exists install_quote_extras_numbers_check;
alter table install_quote_extras add constraint install_quote_extras_numbers_check check (
  position >= 0 and quantity >= 0 and rate_cents >= 0 and amount_cents >= 0
);

create index if not exists install_quote_extras_quote_idx on install_quote_extras (install_quote_id, position);
```

- [ ] **Step 2: Update the failing tests in `tests/admin/install-rates.test.ts`**

Replace the `getInstallSettings` and first `saveInstallRates` tests' data:

```ts
describe("getInstallSettings", () => {
  it("reads the single settings row", async () => {
    sql.mockResolvedValue([{
      minimum_cents: 15_000, hard_surface_cents: 1000, high_ladder_cents: 5000, motorized_cents: 1500, measure_cents: 7500,
      takedown_cents: 1860, shutter_takedown_cents: 233, app_setup_small_cents: 6975, app_setup_large_cents: 15_113,
    }]);
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, measureCents: 7500,
      takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113,
    });
  });

  it("falls back to zeroes when the row is somehow missing", async () => {
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0,
      takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0,
    });
  });
});
```

In the "upserts each rate…" test pass
`{ minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, measureCents: 7500, takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113 }`
and expect the bound values:

```ts
    expect(call.slice(1)).toEqual([
      ["roller_shades", "shutters"],
      ["roller_shades", "shutters"], ["window", "sq_ft"], [2500, 300],
      15_000, 1000, 5000, 1500, 7500, 1860, 233, 6975, 15_113,
      "owner@example.com",
    ]);
```

Distinct values per field are deliberate: a swapped column cannot pass. Add the four zero fields to the other `saveInstallRates` calls in this file.

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/install-rates.test.ts`
Expected: FAIL — the returned settings lack `takedownCents`, and the bound values stop at 7500.

- [ ] **Step 4: Implement**

In `lib/admin/install-pricing.ts`, extend the type:

```ts
export type InstallSettings = {
  minimumCents: number;
  hardSurfaceCents: number;
  highLadderCents: number;
  motorizedCents: number;
  /** A flat fee for an installer's measuring visit, whatever the number of windows. */
  measureCents: number;
  /** Per window of blinds or drapery taken down. */
  takedownCents: number;
  /** Per whole square foot of shutters taken down. */
  shutterTakedownCents: number;
  /** Flat app set-up for 1–3 motors. */
  appSetupSmallCents: number;
  /** Flat app set-up for 4–9 motors. 10 or more is priced by hand on the job. */
  appSetupLargeCents: number;
};
```

In `lib/admin/install-rates.ts`:

```ts
const ZERO: InstallSettings = {
  minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0,
  takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0,
};
```

`getInstallSettings` selects `takedown_cents, shutter_takedown_cents, app_setup_small_cents, app_setup_large_cents` in addition and maps them with `Number(...)` to the four fields. In `saveInstallRates`, after `measure_cents = ${settings.measureCents},` add:

```ts
      takedown_cents = ${settings.takedownCents},
      shutter_takedown_cents = ${settings.shutterTakedownCents},
      app_setup_small_cents = ${settings.appSetupSmallCents},
      app_setup_large_cents = ${settings.appSetupLargeCents},
```

Then add `takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0` to every settings fixture listed under **Files** (so `tsc` passes).

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS.
Run: `npx tsc --noEmit` → exactly one expected error outside `.next/`: `app/admin/settings/actions.ts`, where `settings.data` lacks the four new fields. Task 2 (Settings) fixes it by adding them to the schema. Do **not** silence it by padding zeros in the action: that would reset the live extras rates to 0 on every Settings save. Tasks 1 and 2 are never deployed apart.

- [ ] **Step 6: Run the migration twice on a Neon test branch**

Ask the owner for OK first. Then:

```bash
npx -y neonctl@latest branches create --project-id misty-fire-51038688 --name e2e-install-extras-20260929 --parent main --output json
npx -y neonctl@latest connection-string <branch-id> --project-id misty-fire-51038688 --pooled > "$SCRATCH/e2e-db-url.txt"
grep -q ep-cold-term "$SCRATCH/e2e-db-url.txt" && echo "REFUSE: production" || echo "branch ok"
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs
```

(`scripts/migrate.mjs` needs a `.env.local` to exist — create an empty one in the worktree if missing, and delete it after.) Both runs must succeed. Then with a small node script using `neon(url)` (reading the URL from the file, never printing it) check:

```sql
select column_name from information_schema.columns
where table_name = 'install_settings' and column_name like '%setup%' or column_name like '%takedown%';
select conname from pg_constraint where conname like 'install_quote_extras_%' or conname like '%extras_cents_check';
```

Expect the four settings columns and the four named constraints. Keep the branch for Task 6.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/027_install_extras.sql lib/admin/install-pricing.ts lib/admin/install-rates.ts tests/admin
git commit -m "feat: migration 027 and settings for takedown and app set-up rates"
```

---

### Task 2: Settings — four new rates

**Files:**
- Modify: `lib/admin/schema.ts` (`installSettingsSchema`)
- Modify: `app/admin/settings/actions.ts` (`SETTING_LABEL`, `saveInstallRatesAction`)
- Modify: `app/admin/settings/InstallRatesSection.tsx`
- Test: `tests/admin/schema.test.ts`, `tests/admin/settings-actions.test.ts`, `tests/admin/install-rates-section.test.tsx`

**Interfaces:**
- Consumes: `InstallSettings` (Task 1), `saveInstallRates` (Task 1).
- Produces: form field names `takedownCents`, `shutterTakedownCents`, `appSetupSmallCents`, `appSetupLargeCents`; labels "Takedown, blinds or drapery (per window)", "Takedown, shutters (per sq ft)", "App set-up, 1–3 motors", "App set-up, 4–9 motors".

- [ ] **Step 1: Write failing tests**

`tests/admin/schema.test.ts` — extend the `settings` fixture near line 259 with `takedownCents: "18.60", shutterTakedownCents: "2.33", appSetupSmallCents: "$69.75", appSetupLargeCents: "151.13"` and add:

```ts
  it("parses the four extras rates as money", () => {
    expect(installSettingsSchema.safeParse(settings).data).toMatchObject({
      takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113,
    });
  });

  it("requires each extras rate, even if it is 0", () => {
    for (const key of ["takedownCents", "shutterTakedownCents", "appSetupSmallCents", "appSetupLargeCents"]) {
      expect(installSettingsSchema.safeParse({ ...settings, [key]: "" }).success).toBe(false);
      expect(installSettingsSchema.safeParse({ ...settings, [key]: "0" }).success).toBe(true);
    }
  });
```

`tests/admin/settings-actions.test.ts` — extend `jobLevel` (line ~127) with `takedownCents: "18.60", shutterTakedownCents: "2.33", appSetupSmallCents: "69.75", appSetupLargeCents: "151.13"`, extend the expected settings object (line ~156) with `takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113`, and add:

```ts
  it("names the extras box that is missing, and saves nothing", async () => {
    const { appSetupLargeCents: _omit, ...submitted } = { ...jobLevel, "rate-roller_shades": "25", "basis-roller_shades": "window" };
    const result = await saveInstallRatesAction({}, form(submitted));
    expect(result.error).toBe("App set-up, 4–9 motors: Enter an amount, or 0");
    expect(saveInstallRates).not.toHaveBeenCalled();
  });
```

(Use the file's existing helpers for building `FormData` and for the mocked `saveInstallRates`; match their names.)

`tests/admin/install-rates-section.test.tsx` — extend `settings` with `takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113` and add:

```ts
  it("shows the four extras rates in their own group", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    const extras = screen.getByRole("group", { name: "Extras" });
    expect(within(extras).getByLabelText("Takedown, blinds or drapery (per window)")).toHaveValue("18.60");
    expect(within(extras).getByLabelText("Takedown, shutters (per sq ft)")).toHaveValue("2.33");
    expect(within(extras).getByLabelText("App set-up, 1–3 motors")).toHaveValue("69.75");
    expect(within(extras).getByLabelText("App set-up, 4–9 motors")).toHaveValue("151.13");
    expect(extras).toHaveTextContent("10 or more motors: you enter the set-up price on the job.");
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/schema.test.ts tests/admin/settings-actions.test.ts tests/admin/install-rates-section.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`lib/admin/schema.ts`:

```ts
export const installSettingsSchema = z.object({
  minimumCents: rateAmount,
  hardSurfaceCents: rateAmount,
  highLadderCents: rateAmount,
  motorizedCents: rateAmount,
  measureCents: rateAmount,
  takedownCents: rateAmount,
  shutterTakedownCents: rateAmount,
  appSetupSmallCents: rateAmount,
  appSetupLargeCents: rateAmount,
});
```

`app/admin/settings/actions.ts` — add to `SETTING_LABEL`:

```ts
  takedownCents: "Takedown, blinds or drapery",
  shutterTakedownCents: "Takedown, shutters",
  appSetupSmallCents: "App set-up, 1–3 motors",
  appSetupLargeCents: "App set-up, 4–9 motors",
```

and to the `installSettingsSchema.safeParse({...})` object:

```ts
    takedownCents: formData.get("takedownCents") ?? "",
    shutterTakedownCents: formData.get("shutterTakedownCents") ?? "",
    appSetupSmallCents: formData.get("appSetupSmallCents") ?? "",
    appSetupLargeCents: formData.get("appSetupLargeCents") ?? "",
```

`app/admin/settings/InstallRatesSection.tsx` — after the surcharges `</fieldset>`:

```tsx
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Extras</legend>
          <label className="flex items-center justify-between gap-3">
            Takedown, blinds or drapery (per window)
            <input name="takedownCents" inputMode="decimal" defaultValue={shown("takedownCents", amount(settings.takedownCents))} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            Takedown, shutters (per sq ft)
            <input name="shutterTakedownCents" inputMode="decimal" defaultValue={shown("shutterTakedownCents", amount(settings.shutterTakedownCents))} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            App set-up, 1–3 motors
            <input name="appSetupSmallCents" inputMode="decimal" defaultValue={shown("appSetupSmallCents", amount(settings.appSetupSmallCents))} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            App set-up, 4–9 motors
            <input name="appSetupLargeCents" inputMode="decimal" defaultValue={shown("appSetupLargeCents", amount(settings.appSetupLargeCents))} className={field} />
          </label>
          <p className="text-xs text-ink-soft">10 or more motors: you enter the set-up price on the job.</p>
        </fieldset>
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS. `npx tsc --noEmit` → clean outside `.next/`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/schema.ts app/admin/settings tests/admin
git commit -m "feat: set takedown and app set-up rates in Settings"
```

---

### Task 3: Pricing rules for extras

**Files:**
- Modify: `lib/admin/install-pricing.ts`
- Modify callers to the new signature: `app/admin/jobs/[id]/install-actions.ts`, `app/admin/jobs/[id]/InstallCalculator.tsx` (pass `NO_EXTRAS` for now), `tests/admin/install-actions.test.ts`, `tests/admin/install-tab.test.tsx`
- Test: `tests/admin/install-pricing.test.ts`

**Interfaces:**
- Consumes: `InstallSettings` from Task 1.
- Produces:
  ```ts
  export const EXTRA_KINDS = ["takedown", "shutter_takedown", "app_setup_small", "app_setup_large", "app_setup_custom"] as const;
  export type ExtraKind = (typeof EXTRA_KINDS)[number];
  export type ExtrasInput = { takedownWindows: number; shutterTakedownSqFt: number; customSetupCents: number | null };
  export const NO_EXTRAS: ExtrasInput;
  export const CUSTOM_SETUP_MOTORS = 10;
  export type PricedExtra = { kind: ExtraKind; quantity: number; rateCents: number; amountCents: number };
  export function motorCount(lines: LineInput[]): number;
  export function extraLabel(extra: Pick<PricedExtra, "kind" | "quantity">): string;
  export function priceQuote(lines: LineInput[], rates: InstallRate[], settings: InstallSettings, extras: ExtrasInput, chargeMeasure: boolean): PricedQuote;
  // PricedQuote gains: extras: PricedExtra[]; extrasCents: number;
  ```

- [ ] **Step 1: Update existing tests to the new signature**

In `tests/admin/install-pricing.test.ts` import `NO_EXTRAS` and change every `priceQuote(a, b, c, x)` call to `priceQuote(a, b, c, NO_EXTRAS, x)`. Do the same in the `shown` helper of `tests/admin/install-actions.test.ts` and any `priceQuote` call in `tests/admin/install-tab.test.tsx`. Find them: `grep -rn "priceQuote(" tests`.

- [ ] **Step 2: Write the failing tests**

Append to `tests/admin/install-pricing.test.ts`:

```ts
const extrasSettings: InstallSettings = {
  ...settings, takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113,
};
const extras = (over: Partial<ExtrasInput> = {}): ExtrasInput => ({ ...NO_EXTRAS, ...over });
const motorized = (count: number) => line({ count, motorized: true });

describe("motorCount", () => {
  it("adds the window counts of motorized lines only", () => {
    expect(motorCount([motorized(2), line({ count: 5 }), motorized(3)])).toBe(5);
    expect(motorCount([])).toBe(0);
  });
});

describe("priceQuote extras", () => {
  it("charges no extras when none are asked for and nothing is motorized", () => {
    const priced = priceQuote([line({ count: 2 })], [rate()], extrasSettings, NO_EXTRAS, false);
    expect(priced.extras).toEqual([]);
    expect(priced.extrasCents).toBe(0);
  });

  it("charges takedown per window and shutter takedown per square foot", () => {
    const priced = priceQuote([], [rate()], extrasSettings, extras({ takedownWindows: 3, shutterTakedownSqFt: 10 }), false);
    expect(priced.extras).toEqual([
      { kind: "takedown", quantity: 3, rateCents: 1860, amountCents: 5580 },
      { kind: "shutter_takedown", quantity: 10, rateCents: 233, amountCents: 2330 },
    ]);
    expect(priced.extrasCents).toBe(7910);
  });

  it.each([
    [1, "app_setup_small", 6975], [3, "app_setup_small", 6975],
    [4, "app_setup_large", 15_113], [9, "app_setup_large", 15_113],
  ] as const)("prices app set-up for %i motors as %s", (motors, kind, cents) => {
    const priced = priceQuote([motorized(motors)], [rate()], extrasSettings, NO_EXTRAS, false);
    expect(priced.extras).toEqual([{ kind, quantity: motors, rateCents: cents, amountCents: cents }]);
  });

  it("refuses 10 or more motors without a typed set-up price", () => {
    expect(() => priceQuote([motorized(10)], [rate()], extrasSettings, NO_EXTRAS, false))
      .toThrow("10 or more motors: enter the app set-up price");
  });

  it("charges the typed set-up price at 10 or more motors", () => {
    const priced = priceQuote([motorized(6), motorized(6)], [rate()], extrasSettings, extras({ customSetupCents: 25_000 }), false);
    expect(priced.extras).toEqual([{ kind: "app_setup_custom", quantity: 12, rateCents: 25_000, amountCents: 25_000 }]);
  });

  it("ignores a typed set-up price below 10 motors", () => {
    const priced = priceQuote([motorized(2)], [rate()], extrasSettings, extras({ customSetupCents: 25_000 }), false);
    expect(priced.extras).toEqual([{ kind: "app_setup_small", quantity: 2, rateCents: 6975, amountCents: 6975 }]);
  });

  it.each([
    [{ takedownCents: 0 }, extras({ takedownWindows: 1 }), [], "No rate is set for blinds/drapery takedown"],
    [{ shutterTakedownCents: 0 }, extras({ shutterTakedownSqFt: 1 }), [], "No rate is set for shutter takedown"],
    [{ appSetupSmallCents: 0 }, NO_EXTRAS, [motorized(1)], "No rate is set for app set-up, 1–3 motors"],
    [{ appSetupLargeCents: 0 }, NO_EXTRAS, [motorized(4)], "No rate is set for app set-up, 4–9 motors"],
  ] as const)("refuses an extra whose rate is not set (%o)", (unset, input, lines, message) => {
    expect(() => priceQuote([...lines], [rate()], { ...extrasSettings, ...unset }, input, false)).toThrow(message);
  });

  it("does not need a rate for an extra that is not used", () => {
    const unset = { ...extrasSettings, takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0 };
    expect(() => priceQuote([line({ count: 2 })], [rate()], unset, NO_EXTRAS, false)).not.toThrow();
  });

  it("counts extras toward the minimum", () => {
    const withMinimum = { ...extrasSettings, minimumCents: 20_925 };
    // 3 x $25 = $75 of lines + $55.80 takedown = $130.80, raised to $209.25.
    const priced = priceQuote([line({ count: 3 })], [rate()], withMinimum, extras({ takedownWindows: 3 }), false);
    expect(priced.subtotalCents).toBe(7500);
    expect(priced.extrasCents).toBe(5580);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.totalCents).toBe(20_925);
  });

  it("does not apply the minimum when lines and extras together reach it", () => {
    const withMinimum = { ...extrasSettings, minimumCents: 10_000 };
    // $75 of lines alone is under $100; with $55.80 takedown it is $130.80.
    const priced = priceQuote([line({ count: 3 })], [rate()], withMinimum, extras({ takedownWindows: 3 }), false);
    expect(priced.minimumApplied).toBe(false);
    expect(priced.totalCents).toBe(13_080);
  });

  it("applies the minimum to a takedown-only job, and puts measuring on top", () => {
    const withMinimum = { ...extrasSettings, minimumCents: 20_925, measureCents: 7500 };
    const priced = priceQuote([], [rate()], withMinimum, extras({ takedownWindows: 2 }), true);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.totalCents).toBe(20_925 + 7500);
  });

  it("refuses extras too large to store", () => {
    const huge = { ...extrasSettings, takedownCents: 2_000_000_000 };
    expect(() => priceQuote([], [rate()], huge, extras({ takedownWindows: 2 }), false)).toThrow("This job is too large to price.");
    const pair = { ...extrasSettings, takedownCents: 1_100_000_000, shutterTakedownCents: 1_100_000_000 };
    expect(() => priceQuote([], [rate()], pair, extras({ takedownWindows: 1, shutterTakedownSqFt: 1 }), false))
      .toThrow("This job is too large to price.");
  });

  it("changes the fingerprint when any extra changes", () => {
    const base = priceQuote([motorized(2)], [rate()], extrasSettings, extras({ takedownWindows: 1 }), false);
    const print = (p: typeof base) => priceFingerprint(p, 0);
    const moreTakedown = priceQuote([motorized(2)], [rate()], extrasSettings, extras({ takedownWindows: 2 }), false);
    const newRate = priceQuote([motorized(2)], [rate()], { ...extrasSettings, takedownCents: 1900 }, extras({ takedownWindows: 1 }), false);
    const newSetup = priceQuote([motorized(2)], [rate()], { ...extrasSettings, appSetupSmallCents: 7000 }, extras({ takedownWindows: 1 }), false);
    expect(print(moreTakedown)).not.toBe(print(base));
    expect(print(newRate)).not.toBe(print(base));
    expect(print(newSetup)).not.toBe(print(base));
  });
});

describe("extraLabel", () => {
  it("names each kind with its quantity", () => {
    expect(extraLabel({ kind: "takedown", quantity: 3 })).toBe("Takedown, 3 windows");
    expect(extraLabel({ kind: "takedown", quantity: 1 })).toBe("Takedown, 1 window");
    expect(extraLabel({ kind: "shutter_takedown", quantity: 24 })).toBe("Shutter takedown, 24 sq ft");
    expect(extraLabel({ kind: "app_setup_large", quantity: 5 })).toBe("App set-up, 5 motors");
    expect(extraLabel({ kind: "app_setup_small", quantity: 1 })).toBe("App set-up, 1 motor");
  });
});
```

Add `ExtrasInput`, `NO_EXTRAS`, `motorCount`, `extraLabel` to the file's import from `@/lib/admin/install-pricing`.

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/install-pricing.test.ts`
Expected: FAIL — `NO_EXTRAS` / `motorCount` / `extraLabel` are not exported.

- [ ] **Step 4: Implement in `lib/admin/install-pricing.ts`**

Add after `LineInput`:

```ts
export const EXTRA_KINDS = ["takedown", "shutter_takedown", "app_setup_small", "app_setup_large", "app_setup_custom"] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];

/**
 * The extras the owner asks for on a job. App set-up is not asked for: it follows from the
 * motorized lines. `customSetupCents` is the price typed for 10 or more motors, and is
 * ignored below that.
 */
export type ExtrasInput = { takedownWindows: number; shutterTakedownSqFt: number; customSetupCents: number | null };
export const NO_EXTRAS: ExtrasInput = { takedownWindows: 0, shutterTakedownSqFt: 0, customSetupCents: null };

/** From this many motors the set-up is quoted by hand; the sheet has no flat price for it. */
export const CUSTOM_SETUP_MOTORS = 10;

export type PricedExtra = { kind: ExtraKind; quantity: number; rateCents: number; amountCents: number };

/** One motor per motorized shade. */
export const motorCount = (lines: LineInput[]): number =>
  lines.reduce((sum, line) => sum + (line.motorized ? line.count : 0), 0);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function extraLabel(extra: Pick<PricedExtra, "kind" | "quantity">): string {
  if (extra.kind === "takedown") return `Takedown, ${plural(extra.quantity, "window", "windows")}`;
  if (extra.kind === "shutter_takedown") return `Shutter takedown, ${extra.quantity} sq ft`;
  return `App set-up, ${plural(extra.quantity, "motor", "motors")}`;
}

const notSet = (name: string) => new Error(`No rate is set for ${name}`);

/** Rows only for extras actually charged, in a fixed order: takedown, shutter takedown, set-up. */
function priceExtras(lines: LineInput[], settings: InstallSettings, extras: ExtrasInput): PricedExtra[] {
  const priced: PricedExtra[] = [];
  const perUnit = (kind: ExtraKind, quantity: number, rateCents: number, name: string) => {
    if (quantity <= 0) return;
    // A missing rate must be loud, as with treatments: zero would quietly give the work away.
    if (rateCents <= 0) throw notSet(name);
    priced.push({ kind, quantity, rateCents, amountCents: rateCents * quantity });
  };
  perUnit("takedown", extras.takedownWindows, settings.takedownCents, "blinds/drapery takedown");
  perUnit("shutter_takedown", extras.shutterTakedownSqFt, settings.shutterTakedownCents, "shutter takedown");

  const motors = motorCount(lines);
  if (motors === 0) return priced;
  if (motors >= CUSTOM_SETUP_MOTORS) {
    if (extras.customSetupCents === null) throw new Error("10 or more motors: enter the app set-up price");
    priced.push({ kind: "app_setup_custom", quantity: motors, rateCents: extras.customSetupCents, amountCents: extras.customSetupCents });
    return priced;
  }
  const small = motors <= 3;
  const rateCents = small ? settings.appSetupSmallCents : settings.appSetupLargeCents;
  if (rateCents <= 0) throw notSet(small ? "app set-up, 1–3 motors" : "app set-up, 4–9 motors");
  priced.push({ kind: small ? "app_setup_small" : "app_setup_large", quantity: motors, rateCents, amountCents: rateCents });
  return priced;
}
```

Add to `PricedQuote`:

```ts
  /** Each extra charged, in order. Counts toward the minimum like the lines. */
  extras: PricedExtra[];
  extrasCents: number;
```

Change `priceQuote`:

```ts
export function priceQuote(
  lines: LineInput[],
  rates: InstallRate[],
  settings: InstallSettings,
  extras: ExtrasInput,
  chargeMeasure: boolean,
): PricedQuote {
  // ... existing line pricing and subtotal check unchanged ...
  const pricedExtras = priceExtras(lines, settings, extras);
  if (pricedExtras.some((extra) => extra.amountCents > MAX_CENTS)) throw new Error(TOO_LARGE);
  const extrasCents = pricedExtras.reduce((sum, extra) => sum + extra.amountCents, 0);
  if (extrasCents > MAX_CENTS) throw new Error(TOO_LARGE);
  // Takedown and set-up happen on the install trip, so they count toward the minimum.
  const workCents = subtotalCents + extrasCents;
  if (workCents > MAX_CENTS) throw new Error(TOO_LARGE);
  // A job with nothing to install and nothing to take down is not a job.
  const hasWork = priced.some((l) => l.quantity > 0) || pricedExtras.length > 0;
  const minimumApplied = hasWork && workCents < settings.minimumCents;
  const measureCents = chargeMeasure ? settings.measureCents : 0;
  const totalCents = (minimumApplied ? settings.minimumCents : workCents) + measureCents;
  if (totalCents > MAX_CENTS) throw new Error(TOO_LARGE);
  return { lines: priced, subtotalCents, extras: pricedExtras, extrasCents, measureCents, totalCents, minimumApplied };
}
```

Update the doc comment on `priceQuote` to say `extras` is required, never defaulted, for the same reason as `chargeMeasure`.

In `priceFingerprint`, add `extrasCents: priced.extrasCents,` after `subtotalCents` and, after `lines`, `extras: priced.extras.map((e) => [e.kind, e.quantity, e.rateCents, e.amountCents]),`. Update its doc comment to mention extras.

Temporary callers: in `app/admin/jobs/[id]/install-actions.ts` call `priceQuote(parsedLines.data, rates, settings, NO_EXTRAS, parsedCharge.data)`; in `InstallCalculator.tsx` `preview` call `priceQuote(lines, rates, settings, NO_EXTRAS, chargeMeasure)`. Tasks 4 and 5 replace these.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS. `npx tsc --noEmit` → clean outside `.next/`.

- [ ] **Step 6: Test power**

Temporarily change `hasWork` to drop `|| pricedExtras.length > 0` → the takedown-only test must fail. Temporarily change `motors <= 3` to `motors < 3` → the "3 motors" case must fail. Temporarily remove the `extras:` entry from `priceFingerprint` → the fingerprint test must fail. Restore each.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/install-pricing.ts app/admin/jobs tests/admin
git commit -m "feat: price takedown and app set-up, counted toward the minimum"
```

---

### Task 4: Saving and listing extras

**Files:**
- Modify: `lib/admin/install-quotes.ts`
- Modify: `lib/admin/schema.ts` (add `installExtrasSchema`)
- Modify: `app/admin/jobs/[id]/install-actions.ts`
- Test: `tests/admin/install-quotes.test.ts`, `tests/admin/install-actions.test.ts`, `tests/admin/schema.test.ts`

**Interfaces:**
- Consumes: `PricedQuote` with `extras`/`extrasCents`, `ExtrasInput`, `ExtraKind`, `PricedExtra` (Task 3).
- Produces:
  ```ts
  export type SavedInstallExtra = PricedExtra;
  // SavedInstallQuote gains: extrasCents: number; extras: SavedInstallExtra[];
  export async function saveInstallQuoteAction(jobId: string, kind: InstallQuoteKind, lines: LineInput[], extras: ExtrasInput, chargeMeasure: boolean, previewFingerprint: string): Promise<{ error?: string; ok?: boolean }>;
  export const installExtrasSchema; // zod object parsing ExtrasInput
  ```

- [ ] **Step 1: Write failing tests**

`tests/admin/install-quotes.test.ts` — change `priced` to carry extras (distinct values so a swap cannot pass):

```ts
const priced = {
  lines: [/* unchanged */],
  subtotalCents: 30_000,
  extras: [
    { kind: "takedown" as const, quantity: 3, rateCents: 1860, amountCents: 5580 },
    { kind: "app_setup_large" as const, quantity: 5, rateCents: 15_113, amountCents: 15_113 },
  ],
  extrasCents: 20_693,
  measureCents: 7500, totalCents: 58_193, minimumApplied: false,
};
```

Replace the bind-order test:

```ts
  it("binds the quote, each line column and each extra column in exact order", async () => {
    await quotes.saveInstallQuote(JOB, "estimate", priced, 15_000, "owner@example.com");
    expect(sql.mock.calls[0].slice(1)).toEqual([
      JOB, "estimate", 15_000, 30_000, 7500, 20_693, 58_193, "owner@example.com",
      [0], ["roller_shades"], ["window"], [4], [2500], [false], [true], [false], [30_000],
      [0, 1], ["takedown", "app_setup_large"], [3, 5], [1860, 15_113], [5580, 15_113],
      "owner@example.com", "Estimate installation price: $581.93",
    ]);
  });
```

Extend the one-statement test with `expect(statement).toContain("insert into install_quote_extras");`. In the "no lines" test pass `{ ...priced, lines: [], extras: [], extrasCents: 0 }` and expect `sql.mock.calls[0].slice(9, 18)` to be nine empty arrays and `slice(18, 23)` five empty arrays.

For `listInstallQuotes`, the function now makes a third query; update the grouping test to add `extras_cents: 20_693` to the quote row and a third `.mockResolvedValueOnce([{ install_quote_id: QUOTE, kind: "takedown", quantity: 3, rate_cents: 1860, amount_cents: 5580 }])`, and assert:

```ts
    expect(saved.extrasCents).toBe(20_693);
    expect(saved.extras).toEqual([{ kind: "takedown", quantity: 3, rateCents: 1860, amountCents: 5580 }]);
```

Add:

```ts
  it("reads a price saved before extras existed as having none", async () => {
    sql
      .mockResolvedValueOnce([{ id: QUOTE, kind: "final", minimum_cents: 0, subtotal_cents: 10_000, measure_cents: 0,
        extras_cents: 0, total_cents: 10_000, created_by: "owner@example.com", created_at: "2026-09-16T10:00:00Z" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const [saved] = await quotes.listInstallQuotes(JOB);
    expect(saved.extras).toEqual([]);
    expect(saved.extrasCents).toBe(0);
  });
```

`tests/admin/schema.test.ts`:

```ts
describe("installExtrasSchema", () => {
  const ok = { takedownWindows: 3, shutterTakedownSqFt: 0, customSetupCents: null };
  it("accepts whole numbers and a null set-up price", () => {
    expect(installExtrasSchema.safeParse(ok).success).toBe(true);
    expect(installExtrasSchema.safeParse({ ...ok, customSetupCents: 25_000 }).success).toBe(true);
  });
  it.each([
    [{ takedownWindows: 1.5 }, "Enter a whole number of windows to take down"],
    [{ takedownWindows: -1 }, "Enter a whole number of windows to take down"],
    [{ shutterTakedownSqFt: 2.5 }, "Enter a whole number of square feet to take down"],
    [{ customSetupCents: -1 }, "Enter a set-up price of $0 or more"],
    [{ customSetupCents: 10.5 }, "Enter a set-up price of $0 or more"],
  ])("refuses %o", (over, message) => {
    const result = installExtrasSchema.safeParse({ ...ok, ...over });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});
```

`tests/admin/install-actions.test.ts` — give the `shown` helper a fifth parameter, `(lines, rateCents = 10_000, shownSettings = settings, chargeMeasure = false, extras: ExtrasInput = NO_EXTRAS)`, and pass `extras` to `priceQuote` before `chargeMeasure`; change every `saveInstallQuoteAction(JOB, kind, lines, charge, fp)` call to `saveInstallQuoteAction(JOB, kind, lines, NO_EXTRAS, charge, fp)`; extend `settings` with `takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113`. Add:

```ts
  it("saves a takedown-only price with no lines", async () => {
    const extras = { takedownWindows: 2, shutterTakedownSqFt: 0, customSetupCents: null };
    const result = await saveInstallQuoteAction(JOB, "estimate", [], extras, false, shown([], 10_000, settings, false, extras));
    expect(result).toEqual({ ok: true });
    const savedPrice = saveInstallQuote.mock.calls[0][2];
    expect(savedPrice.extras).toEqual([{ kind: "takedown", quantity: 2, rateCents: 1860, amountCents: 3720 }]);
    expect(savedPrice.totalCents).toBe(15_000); // $37.20 raised to the $150 minimum
  });

  it("still refuses a price with no lines, no extras and no measuring", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [], NO_EXTRAS, false, "x");
    expect(result.error).toBe("Add at least one line before saving.");
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects invalid extras without pricing or saving", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [line], { ...NO_EXTRAS, takedownWindows: -1 }, false, MATCHING());
    expect(result.error).toBe("Enter a whole number of windows to take down");
    expect(calls).toEqual(["requireAdmin"]);
  });

  it("refuses when the extras the owner saw differ from what the server prices", async () => {
    const seen = shown([line], 10_000, settings, false, { ...NO_EXTRAS, takedownWindows: 1 });
    const result = await saveInstallQuoteAction(JOB, "estimate", [line], { ...NO_EXTRAS, takedownWindows: 2 }, false, seen);
    expect(result.error).toMatch(/^Rates changed since this page loaded/);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/install-quotes.test.ts tests/admin/install-actions.test.ts tests/admin/schema.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`lib/admin/schema.ts` (near `installLinesSchema`):

```ts
/** The extras sent from the Install tab. The pricing engine trusts its inputs, so they are checked here. */
export const installExtrasSchema = z.object({
  takedownWindows: z.number({ error: "Enter a whole number of windows to take down" })
    .int("Enter a whole number of windows to take down").min(0, "Enter a whole number of windows to take down")
    .max(1000, "That is more windows than one job can hold"),
  shutterTakedownSqFt: z.number({ error: "Enter a whole number of square feet to take down" })
    .int("Enter a whole number of square feet to take down").min(0, "Enter a whole number of square feet to take down")
    .max(100_000, "That is more square feet than one job can hold"),
  customSetupCents: z.number({ error: "Enter a set-up price of $0 or more" })
    .int("Enter a set-up price of $0 or more").min(0, "Enter a set-up price of $0 or more")
    .max(2_147_483_647, "Enter an amount under $21,474,836")
    .nullable(),
});
```

`lib/admin/install-quotes.ts`:
- import `PricedExtra` and `ExtraKind`; `export type SavedInstallExtra = PricedExtra;`; add `extrasCents: number;` (doc: "What this price charged in extras; 0 for prices saved before extras existed.") and `extras: SavedInstallExtra[];` to `SavedInstallQuote`.
- In `saveInstallQuote`: insert column list becomes `(lead_id, kind, minimum_cents, subtotal_cents, measure_cents, extras_cents, total_cents, created_by)` with values `(${leadId}, ${kind}, ${minimumCents}, ${priced.subtotalCents}, ${priced.measureCents}, ${priced.extrasCents}, ${priced.totalCents}, ${actor})`. Add after the `lines` CTE:

```ts
    extras as (
      insert into install_quote_extras (install_quote_id, position, kind, quantity, rate_cents, amount_cents)
      select quote.id, e.position, e.kind, e.quantity, e.rate_cents, e.amount_cents
      from quote, unnest(
        ${priced.extras.map((_, position) => position)}::int[],
        ${priced.extras.map((extra) => extra.kind)}::text[],
        ${priced.extras.map((extra) => extra.quantity)}::int[],
        ${priced.extras.map((extra) => extra.rateCents)}::int[],
        ${priced.extras.map((extra) => extra.amountCents)}::int[]
      ) as e(position, kind, quantity, rate_cents, amount_cents)
    ),
```

  Update the comment above the statement: "the quote, its lines, its extras and its history event".
- In `listInstallQuotes`: add `extras_cents` to the quote select; after the lines query run

```ts
  const extraRows = await db()`select install_quote_id, kind, quantity, rate_cents, amount_cents
    from install_quote_extras where install_quote_id = any(${ids}) order by position`;
```

  and map `extrasCents: Number(row.extras_cents)` and
  `extras: extraRows.filter((e) => e.install_quote_id === row.id).map((e) => ({ kind: e.kind as ExtraKind, quantity: Number(e.quantity), rateCents: Number(e.rate_cents), amountCents: Number(e.amount_cents) }))`.

`app/admin/jobs/[id]/install-actions.ts`:
- Signature `(jobId, kind, lines: LineInput[], extras: ExtrasInput, chargeMeasure: boolean, previewFingerprint: string)`.
- After lines validation: `const parsedExtras = installExtrasSchema.safeParse(extras); if (!parsedExtras.success) return { error: parsedExtras.error.issues[0].message };`
- Replace the empty check:

```ts
  // A takedown or a measuring visit is real work with no new windows; nothing at all is refused.
  const nothing = parsedLines.data.length === 0 && parsedExtras.data.takedownWindows === 0
    && parsedExtras.data.shutterTakedownSqFt === 0 && !parsedCharge.data;
  if (nothing) return { error: "Add at least one line before saving." };
```

- Price with `priceQuote(parsedLines.data, rates, settings, parsedExtras.data, parsedCharge.data)`.
- Update the doc comment: extras come from the browser too and are validated, and are part of the fingerprint.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS (the calculator still passes `NO_EXTRAS` positionally — update its `saveInstallQuoteAction(jobId, kind, unkeyed, NO_EXTRAS, chargeMeasure, shown)` call now so `tsc` is clean). `npx tsc --noEmit` clean.

- [ ] **Step 5: Test power**

Temporarily drop the `extras as (...)` CTE → the one-statement test must fail. Temporarily revert the empty check to `lines.length === 0 && !chargeMeasure` → the takedown-only test must fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/install-quotes.ts lib/admin/schema.ts app/admin/jobs tests/admin
git commit -m "feat: saved prices record each extra they charged"
```

---

### Task 5: Install calculator — takedown inputs, set-up line, saved extras

**Files:**
- Modify: `app/admin/jobs/[id]/InstallCalculator.tsx`
- Test: `tests/admin/install-tab.test.tsx`

**Interfaces:**
- Consumes: `motorCount`, `extraLabel`, `CUSTOM_SETUP_MOTORS`, `ExtrasInput`, `installExtrasSchema`, `saveInstallQuoteAction(jobId, kind, lines, extras, chargeMeasure, fp)`, `SavedInstallQuote.extras/extrasCents`, `dollarsToCents`.
- Produces: controls labelled "Blinds/drapery takedown (count)", "Shutter takedown (sq ft)", "Set-up price"; test ids `install-extra-<kind>`.

- [ ] **Step 1: Write failing tests**

In `tests/admin/install-tab.test.tsx`, extend `settings` with `takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113`, extend `snapshot` defaults with `extrasCents: 0, extras: []` (and the two inline saved objects in the "lists past snapshots" test), import `NO_EXTRAS`, and update any assertion on `saveInstallQuoteAction` arguments to the new 6-argument order. Add (reuse the file's existing helpers for adding a line and ticking Motorized if present; otherwise use these):

```tsx
  const addRollerLine = async (user: ReturnType<typeof userEvent.setup>, windows: string, motorizedLine = false) => {
    await user.click(screen.getByRole("button", { name: /add line/i }));
    const count = screen.getAllByLabelText("Windows").at(-1)!;
    await user.clear(count);
    await user.type(count, windows);
    if (motorizedLine) await user.click(screen.getAllByRole("checkbox", { name: "Motorized" }).at(-1)!);
  };

  it("has exactly one control labelled Windows per line, so takedown never collides with it", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    await addRollerLine(user, "2");
    expect(screen.getAllByLabelText(/windows/i)).toHaveLength(1);
  });

  it("adds takedown to the total", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={rates} settings={{ ...settings, minimumCents: 0 }} saved={[]} measurements={[]} />);
    await addRollerLine(user, "2"); // $50
    await user.clear(screen.getByLabelText("Blinds/drapery takedown (count)"));
    await user.type(screen.getByLabelText("Blinds/drapery takedown (count)"), "3"); // $55.80
    await user.clear(screen.getByLabelText("Shutter takedown (sq ft)"));
    await user.type(screen.getByLabelText("Shutter takedown (sq ft)"), "10"); // $23.30
    expect(screen.getByTestId("install-extra-takedown")).toHaveTextContent("$55.80");
    expect(screen.getByTestId("install-extra-shutter_takedown")).toHaveTextContent("$23.30");
    expect(screen.getByTestId("install-total")).toHaveTextContent("$129.10");
  });

  it("adds app set-up from the motorized lines, and switches to a typed price at 10 motors", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={rates} settings={{ ...settings, minimumCents: 0, motorizedCents: 0 }} saved={[]} measurements={[]} />);
    await addRollerLine(user, "5", true);
    expect(screen.getByTestId("install-extra-app_setup_large")).toHaveTextContent("App set-up, 5 motors");
    expect(screen.getByTestId("install-extra-app_setup_large")).toHaveTextContent("$151.13");
    expect(screen.queryByLabelText("Set-up price")).toBeNull();

    const count = screen.getByLabelText("Windows");
    await user.clear(count);
    await user.type(count, "10");
    expect(screen.getByRole("button", { name: /save as estimate/i })).toBeDisabled();
    await user.type(screen.getByLabelText("Set-up price"), "250");
    expect(screen.getByTestId("install-total")).toHaveTextContent("$500"); // 10 x $25 + $250
    expect(screen.getByRole("button", { name: /save as estimate/i })).toBeEnabled();

    // Back under 10: the typed price is dropped, the flat rate returns.
    await user.clear(count);
    await user.type(count, "4");
    expect(screen.queryByLabelText("Set-up price")).toBeNull();
    expect(screen.getByTestId("install-total")).toHaveTextContent("$251.13"); // 4 x $25 + $151.13
  });

  it("sends the extras it showed, and allows a takedown-only save", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    await user.clear(screen.getByLabelText("Blinds/drapery takedown (count)"));
    await user.type(screen.getByLabelText("Blinds/drapery takedown (count)"), "2");
    await user.click(screen.getByRole("button", { name: /save as estimate/i }));
    await waitFor(() => expect(saveInstallQuoteAction).toHaveBeenCalled());
    const [, kind, lines, extras, charge, fingerprint] = saveInstallQuoteAction.mock.calls[0];
    expect([kind, lines, extras, charge]).toEqual(["estimate", [], { takedownWindows: 2, shutterTakedownSqFt: 0, customSetupCents: null }, false]);
    expect(fingerprint).toBe(priceFingerprint(
      priceQuote([], rates, settings, { takedownWindows: 2, shutterTakedownSqFt: 0, customSetupCents: null }, false),
      settings.minimumCents,
    ));
  });

  it("lists the extras a saved price charged, and compares the minimum against lines plus extras", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]} saved={[snapshot({
      id: "a", subtotalCents: 5000, totalCents: 15_000,
      extrasCents: 5580, extras: [{ kind: "takedown", quantity: 3, rateCents: 1860, amountCents: 5580 }],
    })]} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Includes Takedown, 3 windows ($55.80)");
    expect(item).toHaveTextContent("Minimum applied (lines and extras came to $105.80)");
  });

  it("does not claim a minimum when extras made up the difference", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]} saved={[snapshot({
      id: "a", subtotalCents: 10_000, totalCents: 15_580,
      extrasCents: 5580, extras: [{ kind: "takedown", quantity: 3, rateCents: 1860, amountCents: 5580 }],
    })]} />);
    expect(screen.getByRole("listitem")).not.toHaveTextContent(/minimum applied/i);
  });
```

(`snapshot` must accept `extrasCents` and `extras` overrides — widen its parameter type.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/install-tab.test.tsx` → FAIL.

- [ ] **Step 3: Implement in `InstallCalculator.tsx`**

Imports: add `CUSTOM_SETUP_MOTORS, extraLabel, motorCount, type ExtrasInput` from install-pricing, `installExtrasSchema` from schema, `dollarsToCents` from money.

`preview` gains `extras: ExtrasInput` and validates it:

```ts
function preview(lines: LineInput[], extras: ExtrasInput, rates: InstallRate[], settings: InstallSettings, chargeMeasure: boolean):
  { priced: PricedQuote; error: null } | { priced: null; error: string } {
  const checked = installLinesSchema.safeParse(lines);
  if (!checked.success) return { priced: null, error: checked.error.issues[0].message };
  const checkedExtras = installExtrasSchema.safeParse(extras);
  if (!checkedExtras.success) return { priced: null, error: checkedExtras.error.issues[0].message };
  try {
    return { priced: priceQuote(lines, rates, settings, extras, chargeMeasure), error: null };
  } catch (error) {
    return { priced: null, error: error instanceof Error ? error.message : "Could not price this job." };
  }
}
```

State, next to `chargeMeasure`:

```ts
  const [takedownWindows, setTakedownWindows] = useState(0);
  const [shutterTakedownSqFt, setShutterTakedownSqFt] = useState(0);
  // Dollars as typed; only read at 10 or more motors.
  const [customSetup, setCustomSetup] = useState("");
```

After `unkeyed`:

```ts
  const motors = motorCount(unkeyed);
  const customNeeded = motors >= CUSTOM_SETUP_MOTORS;
  // Below 10 motors the typed price is not sent at all, so what is saved matches what is shown.
  let customSetupCents: number | null = null;
  let customError: string | null = null;
  if (customNeeded) {
    try { customSetupCents = dollarsToCents(customSetup); } catch (e) { customError = (e as Error).message; }
  }
  const extras: ExtrasInput = { takedownWindows, shutterTakedownSqFt, customSetupCents };
  const result = preview(unkeyed, extras, rates, settings, chargeMeasure);
  const priced = result.priced;
  const error = customError ?? result.error;
```

(Replace the existing `const { priced, error } = preview(...)`. Keep `priced` null-safe everywhere it was.)

`save`: call `saveInstallQuoteAction(jobId, kind, unkeyed, extras, chargeMeasure, shown)`; on success also `setTakedownWindows(0); setShutterTakedownSqFt(0); setCustomSetup("");`.

`blocked`:

```ts
  const nothing = lines.length === 0 && takedownWindows === 0 && shutterTakedownSqFt === 0 && !chargeMeasure;
  const blocked = pending || nothing || error !== null;
```

A whole-number input helper (reuse for both takedowns, same rule as the Windows box):

```ts
const wholeNumber = (value: string) => Math.max(0, Math.floor(Number(value) || 0));
```

JSX between the "Add line" button and the "Charge for measuring" label:

```tsx
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Extras</legend>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Blinds/drapery takedown (count)
            <input inputMode="numeric" value={String(takedownWindows)}
              onChange={(e) => setTakedownWindows(wholeNumber(e.target.value))} className={`${field} w-24`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Shutter takedown (sq ft)
            <input inputMode="numeric" value={String(shutterTakedownSqFt)}
              onChange={(e) => setShutterTakedownSqFt(wholeNumber(e.target.value))} className={`${field} w-24`} />
          </label>
          {customNeeded ? (
            <label className="flex flex-col gap-1 text-sm">
              Set-up price
              <input inputMode="decimal" value={customSetup} placeholder={`${motors} motors`}
                onChange={(e) => setCustomSetup(e.target.value)} className={`${field} w-28`} />
            </label>
          ) : null}
        </div>
      </fieldset>
```

In the totals block, before the minimum note:

```tsx
        {priced ? priced.extras.map((extra) => (
          <p key={extra.kind} data-testid={`install-extra-${extra.kind}`} className="text-sm text-ink-soft">
            {extraLabel(extra)} — {formatCents(extra.amountCents)}
          </p>
        )) : null}
```

Minimum note: when `priced.extrasCents > 0` read `Lines and extras come to {formatCents(priced.subtotalCents + priced.extrasCents)}. Minimum job cost applied.`, otherwise keep today's `Lines come to …` text.

Saved list: minimum test becomes `quote.subtotalCents + quote.extrasCents < quote.totalCents - quote.measureCents`, and its text `Minimum applied ({quote.extrasCents > 0 ? "lines and extras" : "lines"} came to {formatCents(quote.subtotalCents + quote.extrasCents)})`. Add:

```tsx
                {quote.extras.length > 0 ? (
                  <span className="w-full text-ink-soft">
                    Includes {quote.extras.map((e) => `${extraLabel(e)} (${formatCents(e.amountCents)})`).join("; ")}
                  </span>
                ) : null}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/admin` → PASS. `npx tsc --noEmit` clean. `npx eslint app/admin/jobs/[id]/InstallCalculator.tsx app/admin/jobs/[id]/install-actions.ts app/admin/settings lib/admin tests/admin` → exit 0.

- [ ] **Step 5: Test power**

Temporarily add `lines.length === 0 &&` back as the only condition in `nothing` (dropping the takedown terms) → the takedown-only save test must fail, because Save stays disabled. Temporarily rename the takedown label to "Takedown windows" → the "exactly one Windows" test must fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add app/admin/jobs tests/admin
git commit -m "feat: takedown and app set-up on the Install calculator and saved prices"
```

---

### Task 6: End-to-end against a real database

**Files:**
- Modify: `e2e/install.spec.ts`

**Interfaces:**
- Consumes: everything above; migration 027 applied to the Task 1 Neon branch.

- [ ] **Step 1: Extend `resetRates`**

```ts
  await sql()`update install_settings set minimum_cents = 0, hard_surface_cents = 0,
    high_ladder_cents = 0, motorized_cents = 0, measure_cents = 0,
    takedown_cents = 0, shutter_takedown_cents = 0, app_setup_small_cents = 0, app_setup_large_cents = 0,
    updated_by = null, updated_at = now()`;
```

- [ ] **Step 2: Add the test**

```ts
test("takedown and app set-up are priced, count toward the minimum, and every stored field matches the screen", async ({ page }) => {
  const name = `E2E Install Extras ${Date.now()}`;
  const [job] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550403', ${EMAIL}, 'Henderson', 'phone', 'quoted')
    returning id`;
  await signIn(page);

  await page.goto("/admin/settings");
  await page.getByLabel("Roller shades priced by").selectOption("window");
  await page.getByLabel("Roller shades rate").fill("25");
  await page.getByLabel("Minimum job cost").fill("150");
  await page.getByLabel("Motorized").fill("0");
  await page.getByLabel("Measurement fee").fill("0");
  await page.getByLabel("Takedown, blinds or drapery (per window)").fill("18.60");
  await page.getByLabel("Takedown, shutters (per sq ft)").fill("2.33");
  await page.getByLabel("App set-up, 1–3 motors").fill("69.75");
  await page.getByLabel("App set-up, 4–9 motors").fill("151.13");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.goto(`/admin/jobs/${job.id}?tab=install`);
  await page.getByRole("button", { name: /add line/i }).click();
  await page.getByLabel("Treatment").selectOption("roller_shades");
  await page.getByLabel("Windows").fill("5");
  await page.getByRole("checkbox", { name: "Motorized" }).check();
  await page.getByLabel("Blinds/drapery takedown (count)").fill("3");
  await page.getByLabel("Shutter takedown (sq ft)").fill("10");
  // $125 lines + $55.80 + $23.30 + $151.13 set-up (5 motors) = $355.23
  await expect(page.getByTestId("install-extra-app_setup_large")).toContainText("$151.13");
  await expect(page.getByTestId("install-total")).toHaveText("$355.23");
  await page.getByRole("button", { name: /save as estimate/i }).click();
  await expect(savedPrices(page).getByRole("listitem").first()).toContainText("$355.23");

  const [quote] = await sql()`select id, minimum_cents, subtotal_cents, extras_cents, measure_cents, total_cents
    from install_quotes where lead_id = ${job.id}`;
  expect({ ...quote, id: undefined }).toEqual({
    id: undefined, minimum_cents: 15_000, subtotal_cents: 12_500, extras_cents: 23_023, measure_cents: 0, total_cents: 35_523,
  });
  const lines = await sql()`select treatment, basis, quantity, rate_cents, hard_surface, high_ladder, motorized, amount_cents
    from install_quote_lines where install_quote_id = ${quote.id} order by position`;
  expect(lines).toEqual([{ treatment: "roller_shades", basis: "window", quantity: 5, rate_cents: 2500,
    hard_surface: false, high_ladder: false, motorized: true, amount_cents: 12_500 }]);
  const extras = await sql()`select position, kind, quantity, rate_cents, amount_cents
    from install_quote_extras where install_quote_id = ${quote.id} order by position`;
  expect(extras).toEqual([
    { position: 0, kind: "takedown", quantity: 3, rate_cents: 1860, amount_cents: 5580 },
    { position: 1, kind: "shutter_takedown", quantity: 10, rate_cents: 233, amount_cents: 2330 },
    { position: 2, kind: "app_setup_large", quantity: 5, rate_cents: 15_113, amount_cents: 15_113 },
  ]);

  // Ten motors: the set-up is typed by hand, and saving waits for it.
  await page.getByRole("button", { name: /add line/i }).click();
  await page.getByLabel("Treatment").selectOption("roller_shades");
  await page.getByLabel("Windows").fill("10");
  await page.getByRole("checkbox", { name: "Motorized" }).check();
  await expect(page.getByRole("button", { name: /save as final/i })).toBeDisabled();
  await page.getByLabel("Set-up price").fill("250");
  await expect(page.getByTestId("install-total")).toHaveText("$500");
  await page.getByRole("button", { name: /save as final/i }).click();
  await expect(savedPrices(page).getByRole("listitem")).toHaveCount(2);
  const [custom] = await sql()`select e.kind, e.quantity, e.rate_cents, e.amount_cents
    from install_quote_extras e join install_quotes q on q.id = e.install_quote_id
    where q.lead_id = ${job.id} and q.kind = 'final'`;
  expect(custom).toEqual({ kind: "app_setup_custom", quantity: 10, rate_cents: 25_000, amount_cents: 25_000 });

  // Takedown only: no new windows, and the minimum applies.
  await page.getByLabel("Blinds/drapery takedown (count)").fill("2");
  await expect(page.getByTestId("install-total")).toHaveText("$150");
  await page.getByRole("button", { name: /save as estimate/i }).click();
  await expect(savedPrices(page).getByRole("listitem")).toHaveCount(3);
  await expect(savedPrices(page).getByRole("listitem").first()).toContainText("Minimum applied (lines and extras came to $37.20)");
  const [takedownOnly] = await sql()`select subtotal_cents, extras_cents, total_cents from install_quotes
    where lead_id = ${job.id} order by created_at desc limit 1`;
  expect(takedownOnly).toEqual({ subtotal_cents: 0, extras_cents: 3720, total_cents: 15_000 });
});
```

Note: `page.getByLabel("Motorized")` on Settings must resolve to the surcharge input only — the Settings page has no other "Motorized" label; if Playwright reports a strict-mode violation, use `page.getByRole("textbox", { name: "Motorized" })`.

- [ ] **Step 3: Run it for real**

Using the Task 1 Neon branch (owner's OK already given for that branch; ask again if it was deleted): build with `npx next build`, then run `E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx playwright test e2e/install.spec.ts --project=desktop` in the **foreground**, letting `playwright.config.ts` start the server with `POSTGRES_URL`/`DATABASE_URL` from the same file. Reconcile the totals: 3 passed, 0 failed, 0 did not run.

- [ ] **Step 4: Falsify**

Temporarily change the save CTE's `extras` unnest to bind `rateCents` into `amount_cents` → the new test must fail **on the `extras` toEqual assertion** (check where it failed). Restore and re-run green.

- [ ] **Step 5: Clean up and commit**

Delete the Neon branch (`npx -y neonctl@latest branches delete <id> --project-id misty-fire-51038688`), the URL file, and any temporary `.env.local`.

```bash
git add e2e/install.spec.ts
git commit -m "test: e2e for takedown and app set-up, every stored field checked"
```

---

## After the plan (owner approval required for each)

1. Whole-branch review.
2. Production migration: run 027 with `MIGRATE_DATABASE_URL` from a file, verify it targets `ep-cold-term` without printing it, then read-only verify the columns and constraints.
3. Merge `feat/install-extras` to `main` and push (push deploys production).
4. Enter $18.60 / $2.33 / $69.75 / $151.13 in Settings on the live site and read them back.
