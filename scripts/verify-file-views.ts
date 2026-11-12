/**
 * Behavioural proof of lib/portal/file-views.ts against a real database: the first open of a document
 * writes one Activity line, reopening writes none, another file writes its own, a quote is a 'quote'
 * event and anything else a 'file' event. Run by hand; CI does not run it.
 *
 * It writes a throwaway job. It takes E2E_POSTGRES_URL alone and refuses production (ep-cold-term).
 * Usage: E2E_POSTGRES_URL='<neon test branch url>' npx vitest run --config scripts/verify-file-views.config.mts --disableConsoleIntercept
 *
 * To watch it fail: drop the `where not exists` clause (the reopen check fails).
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";

const url = process.env.E2E_POSTGRES_URL;
if (!url) throw new Error("E2E_POSTGRES_URL is not set: give it a Neon test branch, never production.");
if (new URL(url).host.includes("ep-cold-term")) throw new Error("E2E_POSTGRES_URL points at production (ep-cold-term).");
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
const sql = neon(url);
const { recordFileOpened, openedBody } = await import("../lib/portal/file-views");

function check(condition: boolean, description: string, detail = ""): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

test("file views against a real database", async () => {
  const job = randomUUID();
  const [src] = await sql`select source from leads limit 1`;
  await sql`insert into leads (id, name, phone, city, source, status) values (${job}, 'Verify Viewer', '7025550100', 'Las Vegas', ${src?.source ?? "website"}, 'quoted')`;
  const lines = () => sql`select kind, actor, body from job_events where lead_id = ${job} order by created_at`;

  await recordFileOpened({ leadId: job, fileName: "Quote PSS-0001-2.pdf", docType: "quote", email: "client@example.com" });
  let rows = await lines();
  check(rows.length === 1 && rows[0].kind === "quote" && rows[0].actor === "client@example.com" && rows[0].body === openedBody("Quote PSS-0001-2.pdf"),
    "the first open writes one quote line with the client's email", JSON.stringify(rows));

  await recordFileOpened({ leadId: job, fileName: "Quote PSS-0001-2.pdf", docType: "quote", email: "client@example.com" });
  check((await lines()).length === 1, "reopening the same quote writes nothing");

  await recordFileOpened({ leadId: job, fileName: "Contract PSS-0001.pdf", docType: "contract", email: "client@example.com" });
  rows = await lines();
  check(rows.length === 2 && rows[1].kind === "file", "another document writes its own line, as a file event", JSON.stringify(rows));

  await sql`delete from leads where id = ${job}`;
});
