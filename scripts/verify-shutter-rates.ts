/**
 * Behavioural proof of the shutter rates SQL: lib/admin/shutter-rates.ts and migration 048.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand and CI does not run it. If you change
 * lib/admin/shutter-rates.ts or migration 048, run it yourself, or say the SQL is unverified.
 *
 * Against a throwaway database it:
 *   1. applies migration 048 twice (re-runnable) and finds the single settings row;
 *   2. reads empty rates (no lines, zero freight, markup null) and the shutter install rate;
 *   3. saves a full set and reads back exactly what was saved, in the order entered;
 *   4. saves a smaller set: removed rows are gone, freight and markup are replaced, markup can go back to null;
 *   5. raw inserts THROW each check: supplier, kind, a zero line cost, a markup under 1×, a second settings row.
 * Made-up numbers only: this repo is public.
 *
 * IT REPLACES EVERY SHUTTER RATE IN THE DATABASE IT IS GIVEN. It takes E2E_POSTGRES_URL alone and refuses
 * production (ep-cold-term).
 *
 * Usage: E2E_POSTGRES_URL='<neon test branch url>' npx vitest run --config scripts/verify-shutter-rates.config.mts --disableConsoleIntercept
 *
 * To watch it fail: drop `with ordinality` ordering (`ord - 1`) for 0 in saveShutterRates (step 3 order fails),
 * or delete the `removed_options` CTE (step 4 fails).
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import { getShutterInstallRate, getShutterRates, saveShutterRates } from "../lib/admin/shutter-rates";
import type { RatesInput } from "../lib/admin/shutter-pricing";

function refuse(reason: string): never {
  console.error(`\n================ verify-shutter-rates REFUSED TO RUN ================\n${reason}\n`);
  throw new Error(`verify-shutter-rates refused to run: ${reason}`);
}
const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. This script REPLACES rates: give it a Neon test branch, never production.");
const host = (() => { try { return new URL(url).host; } catch { return refuse("E2E_POSTGRES_URL is not a valid URL."); } })();
if (host.includes("ep-cold-term")) refuse("E2E_POSTGRES_URL points at production (ep-cold-term).");
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
const sql = neon(url);

function check(condition: boolean, description: string, detail = ""): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
async function throws(run: () => Promise<unknown>): Promise<boolean> {
  try { await run(); return false; } catch { return true; }
}
async function apply() {
  const statements = readFileSync("db/migrations/048_shutter_pricing.sql", "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
}
const freight = (supplier: "norman" | "onyx", over: Partial<RatesInput["freight"][number]> = {}) => ({
  supplier, firstCents: 0, additionalCents: 0, oversizeWidthEighths: 0, oversizeFirstCents: 0,
  oversizeAdditionalCents: 0, perSqftCents: 0, minSqft: 0, ...over,
});

test("shutter rates against a real database", async () => {
  console.log(`\nverify-shutter-rates: writing to ${host}\n`);
  await apply();
  await apply();
  const settingsRows = await sql`select count(*)::int as n from shutter_settings`;
  check(settingsRows[0].n === 1, "048 applies twice and leaves exactly one settings row", JSON.stringify(settingsRows));

  await saveShutterRates({ lines: [], options: [], freight: [freight("norman"), freight("onyx")], markupHundredths: null }, "verify@example.com");
  const empty = await getShutterRates();
  check(empty.lines.length === 0 && empty.options.length === 0, "an empty save reads back empty");
  check(empty.markupHundredths === null, "markup reads null when not set");
  check(empty.freight.length === 2 && empty.freight.every((f) => f.firstCents === 0), "freight reads one zero rule per supplier");
  const install = await getShutterInstallRate();
  check(install === null || typeof install.rateCents === "number", "the shutter install rate reads (or is null)", JSON.stringify(install));

  const full: RatesInput = {
    lines: [
      { supplier: "norman", name: "Zeta", costCentsPerSqft: 1111, minSqft: 8 },
      { supplier: "norman", name: "Alpha", costCentsPerSqft: 2222, minSqft: 8 },
      { supplier: "onyx", name: "Gamma", costCentsPerSqft: 999, minSqft: 0 },
    ],
    options: [
      { supplier: "norman", name: "Premium", kind: "percent", amount: 1000 },
      { supplier: "norman", name: "Angle", kind: "per_window", amount: 21_500 },
      { supplier: "onyx", name: "Color", kind: "per_order", amount: 15_000 },
    ],
    freight: [
      freight("norman", { firstCents: 7500, additionalCents: 2500, oversizeWidthEighths: 720, oversizeFirstCents: 8000, oversizeAdditionalCents: 5000 }),
      freight("onyx", { perSqftCents: 100, minSqft: 200 }),
    ],
    markupHundredths: 190,
  };
  await saveShutterRates(full, "verify@example.com");
  const read = await getShutterRates();
  check(JSON.stringify(read.lines.map(({ id: _id, ...l }) => l)) === JSON.stringify(full.lines),
    "lines read back exactly, in the order entered (Zeta before Alpha)", JSON.stringify(read.lines));
  check(JSON.stringify(read.options.map(({ id: _id, ...o }) => o)) === JSON.stringify(full.options),
    "add-ons read back exactly, in order", JSON.stringify(read.options));
  check(JSON.stringify(read.freight) === JSON.stringify(full.freight), "freight reads back exactly", JSON.stringify(read.freight));
  check(read.markupHundredths === 190, "markup reads back");
  const who = await sql`select updated_by from shutter_settings`;
  check(who[0].updated_by === "verify@example.com", "the save records who made it");

  await saveShutterRates({
    lines: [full.lines[2]], options: [], freight: [freight("norman"), freight("onyx", { perSqftCents: 125, minSqft: 150 })], markupHundredths: null,
  }, "verify@example.com");
  const smaller = await getShutterRates();
  check(smaller.lines.length === 1 && smaller.lines[0].name === "Gamma", "removed lines are gone", JSON.stringify(smaller.lines));
  check(smaller.options.length === 0, "removed add-ons are gone");
  check(smaller.freight[0].firstCents === 0 && smaller.freight[1].perSqftCents === 125 && smaller.freight[1].minSqft === 150, "freight is replaced");
  check(smaller.markupHundredths === null, "markup can be cleared back to not set");

  check(await throws(() => sql`insert into shutter_lines (supplier, name, cost_cents_per_sqft) values ('hunter', 'X', 100)`), "a supplier we do not use is refused");
  check(await throws(() => sql`insert into shutter_lines (supplier, name, cost_cents_per_sqft) values ('norman', 'X', 0)`), "a free line is refused");
  check(await throws(() => sql`insert into shutter_options (supplier, name, kind, amount) values ('norman', 'X', 'weekly', 1)`), "an unknown kind is refused");
  check(await throws(() => sql`update shutter_settings set markup_hundredths = 90`), "a markup under 1× is refused");
  check(await throws(() => sql`insert into shutter_settings (id) values (false)`), "a second settings row is refused");

  await saveShutterRates({ lines: [], options: [], freight: [freight("norman"), freight("onyx")], markupHundredths: null }, "verify@example.com");
  console.log("\nverify-shutter-rates: all checks passed, rates cleared.\n");
});
