/**
 * Behavioural proof of the Resources library's SQL: lib/admin/resources.ts and migration 036.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, is in no suite, and CI does not run it. If you
 * change lib/admin/resources.ts or migration 036, run it yourself, or say the library's SQL is unverified.
 * The unit tests mock the database, so they pin the SQL's text only.
 *
 * What it does, against a throwaway database:
 *   1. applies migration 036, twice (re-runnable);
 *   2. createResource, getResource, listResources (size back as a number), listCategories;
 *   3. a second createResource of the same upload answers null and changes nothing;
 *   4. renameResource and recategorizeResource change one row and answer false for a missing id;
 *   5. raw inserts THROW each check: name, category, size, pathname (wrong folder, wrong shape),
 *      and the unique pathname index;
 *   6. deleteResource answers the pathname, then null.
 * It deletes its rows, so repeated runs leave nothing behind.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and
 * refuses production (ep-cold-term).
 *
 * Usage: E2E_POSTGRES_URL='<neon test branch url>' npx vitest run --config scripts/verify-resources.config.mts
 *
 * To watch it fail: delete `on conflict do nothing` in createResource (step 3 throws), or delete the
 * pathname check from migration 036 on a fresh branch (step 5 "wrong folder" fails).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import {
  createResource, deleteResource, getResource, listCategories, listResources, recategorizeResource, renameResource,
} from "../lib/admin/resources";

const FORBIDDEN_HOSTS = ["ep-cold-term"];
function refuse(reason: string): never {
  console.error(`\n================ verify-resources REFUSED TO RUN ================\n${reason}\n`);
  throw new Error(`verify-resources refused to run: ${reason}`);
}
const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. This script WRITES rows: give it a Neon test branch, never production.");
const host = (() => { try { return new URL(url).host; } catch { return refuse("E2E_POSTGRES_URL is not a valid URL."); } })();
for (const forbidden of FORBIDDEN_HOSTS) if (host.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at production (${forbidden}).`);
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

const sql = neon(url);
const OWNER = "verify-resources@example.com";
const CATEGORY = `VERIFY ${Date.now()}`;

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}
async function migrate() {
  const statements = readFileSync("db/migrations/036_company_files.sql", "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
}
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: "W-9.pdf", category: CATEGORY, contentType: "application/pdf", sizeBytes: 52341,
  pathname: `resources/${id}/W-9.pdf`, uploadedBy: OWNER, ...over,
});
const rawInsert = (id: string, name: string, category: string, size: number, pathname: string) => sql`
  insert into company_files (id, name, category, content_type, size_bytes, blob_pathname, uploaded_by)
  values (${id}, ${name}, ${category}, 'application/pdf', ${size}, ${pathname}, ${OWNER})`;

test("Resources library against a real database", async () => {
  console.log(`\nverify-resources: writing to ${host}\n`);
  await migrate();
  await migrate();
  check(true, "migration 036 applies, and re-applies", "");
  const ids: string[] = [];
  try {
    const a = randomUUID(); ids.push(a);
    const created = await createResource(row(a));
    check(created?.id === a && created.sizeBytes === 52341, "createResource stores a row with the path's id", JSON.stringify(created));
    const got = await getResource(a);
    check(got?.pathname === `resources/${a}/W-9.pdf` && got.category === CATEGORY, "getResource answers it with its pathname", JSON.stringify(got));
    const listed = (await listResources()).find((r) => r.id === a);
    check(listed?.sizeBytes === 52341 && typeof listed.sizeBytes === "number", "listResources reads size_bytes back as a number", JSON.stringify(listed));
    check((await listCategories()).includes(CATEGORY), "listCategories includes it", "");

    check((await createResource(row(a, { name: "other.pdf" }))) === null, "a second save of the same upload answers null", "");
    check((await getResource(a))?.name === "W-9.pdf", "and changes nothing", "");

    check(await renameResource(a, "Form W-9.pdf"), "renameResource changes the row", "");
    check(await recategorizeResource(a, `${CATEGORY} B`), "recategorizeResource changes the row", "");
    const moved = await getResource(a);
    check(moved?.name === "Form W-9.pdf" && moved.category === `${CATEGORY} B`, "both changes stored", JSON.stringify(moved));
    const missing = randomUUID();
    check(!(await renameResource(missing, "x")) && !(await recategorizeResource(missing, "x")), "a missing id answers false", "");

    const b = randomUUID(); ids.push(b);
    const path = `resources/${b}/x.pdf`;
    const cases: [string, () => Promise<unknown>, string][] = [
      ["an untrimmed name", () => rawInsert(b, " x.pdf", CATEGORY, 1, path), "company_files_name_check"],
      ["an empty category", () => rawInsert(b, "x.pdf", "", 1, path), "company_files_category_check"],
      ["a 61-character category", () => rawInsert(b, "x.pdf", "x".repeat(61), 1, path), "company_files_category_check"],
      ["a zero-byte file", () => rawInsert(b, "x.pdf", CATEGORY, 0, path), "company_files_size_check"],
      ["a file over 200 MB", () => rawInsert(b, "x.pdf", CATEGORY, 209715201, path), "company_files_size_check"],
      ["a path in another row's folder", () => rawInsert(b, "x.pdf", CATEGORY, 1, `resources/${a}/x.pdf`), "company_files_pathname_check"],
      ["a path outside resources/", () => rawInsert(b, "x.pdf", CATEGORY, 1, `jobs/${b}/x.pdf`), "company_files_pathname_check"],
      ["a path with a space", () => rawInsert(b, "x.pdf", CATEGORY, 1, `resources/${b}/x y.pdf`), "company_files_pathname_check"],
    ];
    for (const [what, run, constraint] of cases) {
      const message = await throwsWith(run);
      check(message?.includes(constraint) ?? false, `the database refuses ${what} (${constraint})`, `got ${message}`);
    }
    await rawInsert(b, "x.pdf", CATEGORY, 1, path);
    const dupe = await throwsWith(() => rawInsert(b, "y.pdf", CATEGORY, 1, path));
    check(dupe !== null, "the same id and path can't be stored twice", `got ${dupe}`);

    check((await deleteResource(a)) === `resources/${a}/W-9.pdf`, "deleteResource answers the pathname", "");
    check((await deleteResource(a)) === null, "a second delete answers null", "");
  } finally {
    await sql`delete from company_files where id = any(${ids}::uuid[])`;
  }
});
