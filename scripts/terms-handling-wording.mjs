/**
 * One-off, 2026-10-02: the owner's live contract terms said the Hunter Douglas handling fee "appears as its
 * own line". From this release the fee is built into the line prices, so the owner approved two edits:
 *   §1  "…installation, the Hunter Douglas handling fee and your total." → "…installation and your total."
 *   §14 "The manufacturer's handling charge appears as its own line on your contract. We may waive it at our
 *        discretion, and if we do, the contract will show it."
 *       → "Your line prices include the manufacturer's handling charge; it is not listed separately. We may
 *          waive it at our discretion."
 * Nothing else in the terms changes. It refuses unless the live terms template carries each old sentence
 * exactly once, and it writes only if the body is still exactly what it read (so an edit the owner makes
 * meanwhile is never overwritten). It prints the two changes, never the connection string.
 *
 * Usage: node scripts/terms-handling-wording.mjs <file holding the database url> [--write]
 *   Without --write it is a dry run: it shows the change and writes nothing.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const EDITS = [
  ["The priced contract lists each window, the products chosen, installation, the Hunter Douglas handling fee and your total.",
    "The priced contract lists each window, the products chosen, installation and your total."],
  ["The manufacturer's handling charge appears as its own line on your contract. We may waive it at our discretion, and if we do, the contract will show it.",
    "Your line prices include the manufacturer's handling charge; it is not listed separately. We may waive it at our discretion."],
];
const ACTOR = "whirleyjoshua@gmail.com";

const [file, flag] = process.argv.slice(2);
const sql = neon(readFileSync(file, "utf8").trim());
const live = await sql`select id, body from document_templates where kind = 'terms' and archived_at is null`;
if (live.length !== 1) throw new Error(`Expected one live terms template, found ${live.length}.`);
const { id, body } = live[0];

let next = body;
for (const [from, to] of EDITS) {
  const count = next.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected this sentence exactly once, found ${count}: "${from.slice(0, 60)}…"`);
  next = next.replace(from, to);
  console.log(`- ${from}\n+ ${to}\n`);
}
if (next.length - body.length !== EDITS.reduce((d, [from, to]) => d + to.length - from.length, 0)) throw new Error("Unexpected change size.");

if (flag !== "--write") {
  console.log("Dry run: nothing written.");
} else {
  const rows = await sql`update document_templates set body = ${next}, updated_by = ${ACTOR}, updated_at = now()
    where id = ${id} and archived_at is null and body = ${body} returning body`;
  if (rows.length !== 1 || rows[0].body !== next) throw new Error("Not written: the terms changed since they were read. Run it again.");
  console.log("Written. Read back and it matches.");
}
