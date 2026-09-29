# Installation extras — takedown and app set-up — design

## Goal

When pricing a job, the owner can charge for taking down what is on the windows now and for setting up the motorization app, at rates set in Settings. Rates are 1.5× the Home Depot installer sheet (Premier, 2026-09-28):

| Extra | Sheet SKU | Sheet | Customer rate |
|---|---|---|---|
| Takedown, blinds or drapery | 3300 | $12.40 / window | $18.60 / window |
| Takedown, shutters | 3310 | $1.55 / sq ft | $2.33 / sq ft |
| App set-up, 1–3 motors | 3112 | $46.50 flat | $69.75 |
| App set-up, 4–9 motors | 3113 | $100.75 flat | $151.13 |

Half cents round up. Every other sheet line (fuel, mileage, freight, drapery, skylights, …) is out of scope.

## What stays the same

- Treatment rates, surcharges, the minimum and the measuring fee work as today (entered live 2026-09-29).
- A saved price is immutable and copies every rate it used; nothing joins back to current rates.
- The server re-prices and saves only when its fingerprint equals the one the owner saw.
- "Fill from measurements" leaves Motorized unticked.

## Data — migration 027_install_extras.sql

024 (dc-quote-import) and 026 (documents) are claimed on other branches. Safe to re-run; each check is its own named constraint, as in 020.

```sql
alter table install_settings add column if not exists takedown_cents integer not null default 0;
alter table install_settings add column if not exists shutter_takedown_cents integer not null default 0;
alter table install_settings add column if not exists app_setup_small_cents integer not null default 0;
alter table install_settings add column if not exists app_setup_large_cents integer not null default 0;
-- named check: all four >= 0

-- Everything a saved price charged in extras; 0 for every price saved before extras existed, which is true.
alter table install_quotes add column if not exists extras_cents integer not null default 0;
-- named check: extras_cents >= 0

create table if not exists install_quote_extras (
  id uuid primary key default gen_random_uuid(),
  install_quote_id uuid not null references install_quotes(id) on delete cascade,
  position integer not null,
  kind text not null,
  quantity integer not null,
  rate_cents integer not null,
  amount_cents integer not null
);
-- named check: kind in ('takedown','shutter_takedown','app_setup_small','app_setup_large','app_setup_custom')
-- named check: position, quantity, rate_cents, amount_cents all >= 0
create index if not exists install_quote_extras_quote_idx on install_quote_extras (install_quote_id, position);
```

Row meaning: takedown — quantity windows × rate; shutter_takedown — quantity sq ft × rate; app_setup_* — quantity is the motor count, rate_cents is the flat charge, amount_cents = rate_cents.

A rate of 0 means "not set".

## Pricing rules — lib/admin/install-pricing.ts (pure)

- `InstallSettings` gains `takedownCents`, `shutterTakedownCents`, `appSetupSmallCents`, `appSetupLargeCents`.
- New input `ExtrasInput = { takedownWindows: number; shutterTakedownSqFt: number; customSetupCents: number | null }`, whole numbers ≥ 0. `priceQuote(lines, rates, settings, extras, chargeMeasure)` — `extras` is required, never defaulted.
- Motors = sum of `count` over lines with `motorized`.
- Set-up: 0 motors → none; 1–3 → `app_setup_small`; 4–9 → `app_setup_large`; 10+ → `app_setup_custom` at `customSetupCents`, and a null value throws "10 or more motors: enter the app set-up price". `customSetupCents` is ignored below 10 motors.
- Takedown rows appear only when their quantity > 0.
- A used extra whose rate is 0 throws by name: "No rate is set for blinds/drapery takedown", "… shutter takedown", "… app set-up, 1–3 motors", "… app set-up, 4–9 motors".
- `PricedQuote` gains `extras: PricedExtra[]` (`{ kind, quantity, rateCents, amountCents }`) and `extrasCents`.
- Work = `subtotalCents + extrasCents`. Has work when any line quantity > 0 or any extra row exists. Minimum applies when has work and work < minimum. Total = (minimum or work) + measuring fee.
- Every amount, the extras sum, the work and the total are checked against `MAX_CENTS`.
- `priceFingerprint` adds `extrasCents` and each extra row `[kind, quantity, rateCents, amountCents]`.

## Saving — lib/admin/install-quotes.ts, install-actions.ts

- `saveInstallQuote` writes `extras_cents` and the extra rows in the same single data-modifying CTE as the quote, lines and job event (no `sql.transaction()`).
- `listInstallQuotes` returns `extrasCents` and `extras` per quote.
- `saveInstallQuoteAction(jobId, kind, lines, extras, chargeMeasure, fingerprint)` validates `extras` with a zod schema (whole numbers ≥ 0, sane caps; custom set-up null or cents). Refuses when there are no lines, no extra rows and no measuring charge: "Add at least one line before saving."
- `saveInstallRates` writes the four new settings columns in its existing statement; the Settings action and `installSettingsSchema` accept them as money like the other fees.

## Screens

**Settings → Installation rates:** an "Extras" group after the surcharges with four money inputs (Takedown, blinds or drapery — per window; Takedown, shutters — per sq ft; App set-up, 1–3 motors; App set-up, 4–9 motors) and the note "10 or more motors: you enter the set-up price on the job."

**Job → Install calculator,** between the lines and "Charge for measuring":
- "Blinds/drapery to take down (windows)" and "Shutters to take down (sq ft)", both starting at 0.
- The set-up line, derived live: "App set-up, 5 motors — $151.13". At 10+ motors a "Set-up price" input instead; Save stays disabled until it holds a price.
- The preview lists each extra with its amount; the minimum note reads "Lines and extras come to …".

**Saved prices:** each lists its extras ("Includes takedown 3 windows ($55.80), app set-up 5 motors ($151.13)"). Minimum-applied test becomes `subtotal + extras < total − measure`.

## Testing

- Pricing unit tests: set-up at 0, 1, 3, 4, 9, 10 motors; 10+ with null refused; custom ignored below 10; takedown arithmetic; minimum over lines + extras; takedown-only job gets the minimum; measuring on top; each zero-rate refusal; overflow; fingerprint changes when any extra field changes.
- Settings form/action: the four fields round-trip; negative or non-numeric refused.
- Calculator component: set-up follows Motorized; 10+ input blocks Save until filled; takedown inputs move the total.
- Test power: break each key rule and watch its test go red.
- Real SQL: migration 027 run twice on a Neon test branch; the save CTE run there; an e2e test against `next start` on 127.0.0.1 prices takedown + motorized, saves, and compares every stored field of the quote, lines and extras.

## Rollout

1. Build on `feat/install-extras` in its own worktree.
2. After review: run 027 on production (verify the target endpoint without printing it), read-only verify.
3. Merge to main — a push to main deploys production, so the migration goes first.
4. Enter the four rates in Settings on the live site and read them back.
