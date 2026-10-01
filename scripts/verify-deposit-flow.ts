/**
 * Behavioural proof of the deposit flow's SQL (migration 030, lib/payments/deposits.ts) against a real Postgres.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, it is in no suite, and CI does not execute it. If you
 * change a statement in lib/payments/deposits.ts or a constraint in 030, run it yourself — and if you cannot,
 * call that SQL unverified. This feature moves money.
 *
 * What it does, against a throwaway database (leads named "VERIFY Deposit Flow <stamp> …"):
 *   1. setup: signed leads A (total 184833) and B (100000), quoted C with two draft versions, signed D;
 *   2. claimStripeDeposit on A twice answers the SAME pending row at 92417; a wrong amount claims nothing;
 *   3. attachSession sets the session once and refuses a second, different one;
 *   4. markStripeDepositPaid at a wrong amount changes nothing;
 *   5. markStripeDepositPaid pays A: every deposits field, what it answers, A sold with deposit_cents, two events;
 *   6. the same delivery again changes nothing (rows and events identical);
 *   7. expireDeposit on the paid session changes nothing, and A can no longer be claimed;
 *   8. depositState(A) reads it all back;
 *   9. B: an open card checkout, then recordDepositPayment by check — the pending row expires, one paid row,
 *      B sold; the card payment that lands anyway matches nothing (Review Focus 3); recording again, on a
 *      Sold job, answers null;
 *  10. a second paid row, and a second pending row, on one version violate their unique indexes (23505);
 *  11. expireStaleDeposits expires a pending row older than 23 hours;
 *  12. the deposits checks refuse a bad method, a zero amount and a paid row with no paid_at (23514);
 *  13. cancelDeposit on A: refunded, version cancelled, A lost with deposit_cents cleared, two events; again → false;
 *  13b. Stripe replays A's completed checkout after the refund: markStripeDepositPaid answers null, the row stays
 *      refunded, A stays Lost with no deposit_cents, and no event is written;
 *  14. dc_quote_versions_one_offered: two offered versions for C fail at commit (23P01), but superseding one and
 *      offering the other in ONE statement succeeds — the shape sendQuote relies on;
 *  15. the new stages and 'payment' are accepted, a bogus stage is not;
 *  15a. depositState's ranking (ruling P5, amended; ruling P20) and the Task 3 report's cases (a)–(e): a paid
 *      deposit on an older version beats a newer signed version with none; a newer signed version beats an
 *      older one whose deposit was refunded (with or without a pending deposit of its own); a lone refunded
 *      version reports its refund; no deposits → the newest signed version; no signed version → null;
 *      (f, P20) a newer signed version with no deposit beats an older one holding only a pending deposit, and
 *      expirePendingOnOtherVersions expires that older pending row (answering its session) and nothing else;
 *  15b. markStripeDepositPaid on an EXPIRED row whose own session completed (ruling P11b): paid, another pending
 *      row of the version expired in the same statement, stageBefore and otherSessionIds answered; a wrong
 *      session matches nothing; a job not in Signed keeps its stage and gets no stage event;
 *  15c. a claimStripeDeposit race: three concurrent claims per version leave ONE pending row, and every claim
 *      that answers names it (a loser may answer null — the portal then reads pendingStripeDeposit);
 *  15d. expireSessionlessDeposit expires a pending row with no session, once, and never one with a session;
 *  15e. cancelDeposit on a job the owner already moved to Lost: deposit_cents cleared, its own lost reason
 *      kept, a payment event and NO second stage event;
 *  16. deleteJob(A), with its deposits, succeeds and leaves no deposit rows;
 *  17. deletes everything it wrote, even on failure.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and refuses
 * production (cold-term). Usage (bash):
 *   E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-deposit-flow.config.mts
 *
 * To watch it fail: in markStripeDepositPaid's `paid` CTE, drop the status branch — replace
 * `and ((status = 'pending' and (…)) or (status = 'expired' and …))` with `and stripe_session_id = ${input.sessionId}` —
 * and step 13b goes red: the replay re-pays the refunded deposit and moves Lost A's deposit_cents back.
 * (Step 6 alone stays green under that break: the not-exists-paid guard still stops a duplicate while the
 * row is paid. After a refund nothing is paid, so the status branch is the only guard.) Delete
 * `and exists (select 1 from paid)` from recordDepositPayment — nothing visible changes here, so also delete
 * `and l.status = 'signed'` from its insert and run step 9 on a Sold lead by hand. Put everything back.
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

// deleteJob removes the job's blobs; this script's files have made-up pathnames, so the delete is a no-op.
vi.mock("@vercel/blob", () => ({ del: async () => undefined, put: async () => ({}), get: async () => null }));

import { deleteJob } from "../lib/admin/jobs";
import {
  attachSession, cancelDeposit, claimStripeDeposit, depositState, expireDeposit, expirePendingOnOtherVersions, expireSessionlessDeposit,
  expireStaleDeposits, markStripeDepositPaid, pendingStripeDeposit, recordDepositPayment,
} from "../lib/payments/deposits";

const BANNER = "\n================ verify-deposit-flow REFUSED TO RUN ================\n";

/** Printed as well as thrown. Every reason names hosts or endpoint ids only, never the URL (it carries the password). */
function refuse(reason: string): never {
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-deposit-flow refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. It never falls back to POSTGRES_URL, DATABASE_URL or .env.local.");
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return refuse("E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.");
  }
})();
if (url.includes("cold-term")) refuse(`E2E_POSTGRES_URL points at ${host}, which is production (cold-term).`);
const endpoint = process.env.E2E_TEST_ENDPOINT;
if (endpoint !== undefined && (!endpoint.startsWith("ep-") || endpoint.includes("cold-term"))) {
  refuse("E2E_TEST_ENDPOINT must be a Neon test-branch endpoint (ep-…), never production.");
}
if (endpoint && !host.includes(endpoint)) refuse(`E2E_POSTGRES_URL is not the named test branch ${endpoint} (it points at ${host}).`);

// The modules under test read the connection through lib/db at call time: point them at the vetted URL only.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;

const sql = neon(url);
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Deposit Flow";
const ACTOR = "verify-deposit-flow@example.com";

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const failure = (error: { code?: string; constraint?: string }) => `${error.code}:${error.constraint}`;

const newLead = async (suffix: string, status: string, soldCents: number | null): Promise<string> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status, sold_cents)
    values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550198', ${`verify-deposit-${STAMP}-${suffix}@example.com`},
            'Henderson', 'phone', ${status}, ${soldCents})
    returning id`;
  return rows[0].id as string;
};

/** A DC version as signing (or a later cancellation) leaves one: signed and cancelled versions carry signed_at. */
const newVersion = async (leadId: string, version: number, status: string, totalCents: number | null): Promise<string> => {
  const [file] = await sql`
    insert into job_files (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${leadId}, ${ACTOR}, 'document', ${`DEALER COPY verify ${version}.html`}, 'text/html', 1,
            ${`verify/${leadId}/dealer-${version}-${STAMP}.html`}, 'dealer_copy')
    returning id`;
  const id = randomUUID();
  const signed = status === "signed" || status === "cancelled";
  await sql`
    insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
      dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents, client_total_cents, signed_at, cancelled_at)
    values (${id}, ${leadId}, ${version}, ${`V${STAMP}`}, 'PSS-0000', ${file.id}, ${"0".repeat(64)}, ${status},
            1, 0, 0, 1, ${totalCents}, ${signed ? new Date() : null}, ${status === "cancelled" ? new Date() : null})`;
  return id;
};

/** A deposit row written directly, for depositState's ranking cases. */
const seedDeposit = async (leadId: string, versionId: string, amountCents: number, status: "pending" | "paid" | "refunded"): Promise<string> => {
  const id = randomUUID();
  await sql`
    insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status, paid_at, refunded_at)
    values (${id}, ${leadId}, ${versionId}, ${amountCents}, ${status === "pending" ? "stripe" : "cash"}, ${status},
            ${status === "pending" ? null : new Date()}, ${status === "refunded" ? new Date() : null})`;
  return id;
};

const depositRows = async (versionId: string) => await sql`
  select method, status, amount_cents, stripe_session_id, stripe_payment_intent_id, recorded_by,
         (paid_at is not null) as paid, (refunded_at is not null) as refunded
  from deposits where dc_quote_version_id = ${versionId} order by created_at, method`;
const leadRow = async (id: string) =>
  (await sql`select status, deposit_cents, sold_cents, lost_reason from leads where id = ${id}`)[0];
const events = async (id: string) => await sql`
  select actor, kind, from_status, to_status, body from job_events
  where lead_id = ${id} and kind in ('payment','stage') order by created_at, kind`;

const scriptLeads = async () =>
  (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

test("the deposit flow's SQL holds against a real database", async () => {
  try {
    console.log("step 1: setup");
    const A = await newLead("A", "signed", 184833);
    const vA = await newVersion(A, 1, "signed", 184833);
    const B = await newLead("B", "signed", 100000);
    const vB = await newVersion(B, 1, "signed", 100000);
    const C = await newLead("C", "quoted", null);
    const vC1 = await newVersion(C, 1, "draft", null);
    const vC2 = await newVersion(C, 2, "draft", null);
    const D = await newLead("D", "signed", 2000);
    const vD = await newVersion(D, 1, "signed", 2000);

    console.log("step 2: claim twice");
    const first = await claimStripeDeposit({ leadId: A, versionId: vA, amountCents: 92417 });
    const second = await claimStripeDeposit({ leadId: A, versionId: vA, amountCents: 92417 });
    check(first !== null && second !== null && first.id === second.id && first.amountCents === 92417 && first.status === "pending",
      "two claims answer the same pending row at 92417", `got ${JSON.stringify([first, second])}`);
    check((await depositRows(vA)).length === 1, "one row for A", JSON.stringify(await depositRows(vA)));
    check((await claimStripeDeposit({ leadId: B, versionId: vB, amountCents: 49999 })) === null,
      "a claim at anything but the stored half claims nothing", "claimed");
    const depositA = first!.id;

    console.log("step 3: attach");
    check(await attachSession(depositA, "cs_verify_A"), "attachSession sets the session", "false");
    check(await attachSession(depositA, "cs_verify_A"), "attaching the same session again answers true", "false");
    check(!(await attachSession(depositA, "cs_verify_other")), "a second, different session is refused", "true");

    console.log("step 4: wrong amount");
    check((await markStripeDepositPaid({ depositId: depositA, sessionId: "cs_verify_A", paymentIntentId: "pi_x", amountCents: 1 })) === null,
      "a payment for the wrong amount changes nothing", "paid");
    check((await depositRows(vA))[0].status === "pending", "A's row is still pending", JSON.stringify(await depositRows(vA)));

    console.log("step 5: paid by card");
    const paid = await markStripeDepositPaid({ depositId: depositA, sessionId: "cs_verify_A", paymentIntentId: "pi_verify_A", amountCents: 92417 });
    check(same(paid, { leadId: A, versionId: vA, stageBefore: "signed", otherSessionIds: [] }),
      "markStripeDepositPaid answers A, its version, stage Signed before, no other sessions", `got ${JSON.stringify(paid)}`);
    const rowsA = await depositRows(vA);
    check(same(rowsA, [{ method: "stripe", status: "paid", amount_cents: 92417, stripe_session_id: "cs_verify_A",
      stripe_payment_intent_id: "pi_verify_A", recorded_by: null, paid: true, refunded: false }]),
      "every stored field of A's deposit", JSON.stringify(rowsA));
    check(same(await leadRow(A), { status: "sold", deposit_cents: 92417, sold_cents: 184833, lost_reason: null }),
      "A is sold with deposit_cents 92417", JSON.stringify(await leadRow(A)));
    const eventsA = await events(A);
    check(same(eventsA, [
      { actor: "Stripe", kind: "payment", from_status: null, to_status: null, body: "Deposit $924.17 paid by card" },
      { actor: "Stripe", kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit paid" },
    ]), "a payment and a stage event, both by Stripe", JSON.stringify(eventsA));

    console.log("step 6: the same delivery again");
    check((await markStripeDepositPaid({ depositId: depositA, sessionId: "cs_verify_A", paymentIntentId: "pi_verify_A", amountCents: 92417 })) === null,
      "a duplicate delivery answers null", "paid again");
    check(same(await depositRows(vA), rowsA) && same(await events(A), eventsA), "rows and events are unchanged", "changed");

    console.log("step 7: expiry after payment");
    check(!(await expireDeposit("cs_verify_A")), "expiring a paid session changes nothing", "expired it");
    check((await claimStripeDeposit({ leadId: A, versionId: vA, amountCents: 92417 })) === null, "a paid deposit cannot be claimed again", "claimed");

    console.log("step 8: depositState");
    const stateA = await depositState(A);
    check(stateA !== null && stateA.jobStatus === "sold" && stateA.versionId === vA && stateA.soldCents === 184833 &&
        stateA.amountCents === 92417 && stateA.paid?.id === depositA && stateA.pending === null && stateA.refunded === null,
      "depositState reads A back", JSON.stringify(stateA));

    console.log("step 9: recorded by hand while a card checkout is open");
    const pendingB = await claimStripeDeposit({ leadId: B, versionId: vB, amountCents: 50000 });
    if (!pendingB) throw new Error("setup: B's claim failed");
    await attachSession(pendingB.id, "cs_verify_B");
    const recorded = await recordDepositPayment({ leadId: B, versionId: vB, amountCents: 49000, method: "check", actor: ACTOR });
    check(recorded !== null, "recordDepositPayment answers a deposit", "null");
    const rowsB = await depositRows(vB);
    check(same(rowsB.map((r) => [r.method, r.status, r.amount_cents, r.recorded_by, r.paid]).sort(), [
      ["check", "paid", 49000, ACTOR, true], ["stripe", "expired", 50000, null, false],
    ].sort()), "the card row expired and one check row is paid", JSON.stringify(rowsB));
    check(same(await leadRow(B), { status: "sold", deposit_cents: 49000, sold_cents: 100000, lost_reason: null }),
      "B is sold with deposit_cents 49000", JSON.stringify(await leadRow(B)));
    const eventsB = await events(B);
    check(same(eventsB, [
      { actor: ACTOR, kind: "payment", from_status: null, to_status: null, body: "Deposit $490 received by check" },
      { actor: ACTOR, kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit recorded" },
    ]), "a payment and a stage event, both by the owner", JSON.stringify(eventsB));
    check((await markStripeDepositPaid({ depositId: pendingB.id, sessionId: "cs_verify_B", paymentIntentId: "pi_verify_B", amountCents: 50000 })) === null,
      "the card payment that lands anyway matches nothing", "paid twice");
    check((await depositRows(vB)).filter((r) => r.status === "paid").length === 1, "still one paid deposit for B", JSON.stringify(await depositRows(vB)));
    check((await recordDepositPayment({ leadId: B, versionId: vB, amountCents: 1000, method: "cash", actor: ACTOR })) === null,
      "recording again on the Sold job answers null", "recorded");
    check((await depositRows(vB)).length === 2 && same(await events(B), eventsB), "B's rows and events are unchanged", JSON.stringify(await depositRows(vB)));

    console.log("step 10: the unique indexes");
    const secondPaid = await sql`
      insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status, paid_at)
      values (${B}, ${vB}, 1, 'cash', 'paid', now())`.then(() => "inserted", failure);
    check(secondPaid === "23505:deposits_one_paid_per_version", "a second paid deposit on one version is refused", secondPaid);
    await sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 1000, 'stripe', 'pending')`;
    const secondPending = await sql`
      insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status)
      values (${D}, ${vD}, 1000, 'stripe', 'pending')`.then(() => "inserted", failure);
    check(secondPending === "23505:deposits_one_pending_per_version", "a second pending deposit on one version is refused", secondPending);

    console.log("step 11: a stale checkout");
    check((await expireStaleDeposits(vD)) === 0, "a fresh pending row is not stale", "expired it");
    await sql`update deposits set created_at = now() - interval '24 hours' where dc_quote_version_id = ${vD}`;
    check((await expireStaleDeposits(vD)) === 1, "expireStaleDeposits expires the day-old pending row", "not 1");
    check((await depositRows(vD))[0].status === "expired", "D's row is expired", JSON.stringify(await depositRows(vD)));

    console.log("step 12: the deposits checks");
    for (const [label, statement, expected] of [
      ["a bad method", sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 1, 'bitcoin', 'expired')`, "23514:deposits_method_check"],
      ["a zero amount", sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 0, 'cash', 'expired')`, "23514:deposits_amount_check"],
      ["a paid row with no paid_at", sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 5, 'cash', 'paid')`, "23514:deposits_paid_at_check"],
      ["a bad status", sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 5, 'cash', 'void')`, "23514:deposits_status_check"],
    ] as const) {
      const answer = await statement.then(() => "inserted", failure);
      check(answer === expected, `${label} is refused`, answer);
    }

    console.log("step 13: cancel and refund");
    const beforeCancel = await depositState(A);
    check(await cancelDeposit({ leadId: A, deposit: beforeCancel!.paid!, actor: ACTOR }), "cancelDeposit answers true", "false");
    const refundedA = await depositRows(vA);
    check(same(refundedA.map((r) => [r.status, r.paid, r.refunded]), [["refunded", true, true]]), "A's deposit is refunded", JSON.stringify(refundedA));
    const [versionA] = await sql`select status, (cancelled_at is not null) as cancelled from dc_quote_versions where id = ${vA}`;
    check(same(versionA, { status: "cancelled", cancelled: true }), "A's version is cancelled", JSON.stringify(versionA));
    check(same(await leadRow(A), { status: "lost", deposit_cents: null, sold_cents: 184833, lost_reason: "Cancelled — deposit refunded" }),
      "A is lost, deposit_cents cleared", JSON.stringify(await leadRow(A)));
    const cancelEvents = (await events(A)).slice(2);
    check(same(cancelEvents, [
      { actor: ACTOR, kind: "payment", from_status: null, to_status: null, body: "Deposit $924.17 refunded to the client's card" },
      { actor: ACTOR, kind: "stage", from_status: "sold", to_status: "lost", body: "Cancelled — deposit refunded" },
    ]), "a payment and a stage event for the cancellation", JSON.stringify(cancelEvents));
    check(!(await cancelDeposit({ leadId: A, deposit: beforeCancel!.paid!, actor: ACTOR })), "cancelling again answers false", "true");
    const afterCancel = await depositState(A);
    check(afterCancel !== null && afterCancel.versionStatus === "cancelled" && afterCancel.paid === null &&
        afterCancel.refunded?.id === depositA && afterCancel.jobStatus === "lost",
      "depositState reads A's refund back on its cancelled version", JSON.stringify(afterCancel));

    console.log("step 13b: Stripe replays the completed checkout after the refund");
    const eventsBeforeReplay = await events(A);
    check((await markStripeDepositPaid({ depositId: depositA, sessionId: "cs_verify_A", paymentIntentId: "pi_verify_A", amountCents: 92417 })) === null,
      "a replayed completion of the refunded deposit answers null", "paid again");
    check(same(await depositRows(vA), refundedA), "A's deposit stays refunded, every field unchanged", JSON.stringify(await depositRows(vA)));
    check(same(await leadRow(A), { status: "lost", deposit_cents: null, sold_cents: 184833, lost_reason: "Cancelled — deposit refunded" }),
      "A stays Lost with deposit_cents null", JSON.stringify(await leadRow(A)));
    check(same(await events(A), eventsBeforeReplay), "A's events are unchanged", JSON.stringify(await events(A)));

    console.log("step 14: one offered version per job");
    await sql`update dc_quote_versions set status = 'offered' where id = ${vC1}`;
    const twoOffered = await sql`update dc_quote_versions set status = 'offered' where id = ${vC2}`.then(() => "updated", failure);
    check(twoOffered === "23P01:dc_quote_versions_one_offered", "a second offered version fails at commit", twoOffered);
    await sql`
      with retired as (update dc_quote_versions set status = 'superseded' where id = ${vC1} returning id)
      update dc_quote_versions set status = 'offered' where id = ${vC2} and exists (select 1 from retired)`;
    const statuses = await sql`select id, status from dc_quote_versions where lead_id = ${C} order by version`;
    check(same(statuses.map((r) => r.status), ["superseded", "offered"]), "superseding and offering in one statement succeeds", JSON.stringify(statuses));

    console.log("step 15: stages and kinds");
    for (const status of ["approved", "signed", "measure"]) await sql`update leads set status = ${status} where id = ${C}`;
    await sql`insert into job_events (lead_id, actor, kind, body) values (${C}, ${ACTOR}, 'payment', 'verify')`;
    const bogus = await sql`update leads set status = 'bogus' where id = ${C}`.then(() => "updated", failure);
    check(bogus === "23514:leads_status_check", "a stage outside the list is refused", bogus);
    const bogusKind = await sql`insert into job_events (lead_id, actor, kind, body) values (${C}, ${ACTOR}, 'refund', 'verify')`.then(() => "inserted", failure);
    check(bogusKind === "23514:job_events_kind_check", "an event kind outside the list is refused", bogusKind);
    const bogusVersion = await sql`update dc_quote_versions set status = 'approved' where id = ${vC2}`.then(() => "updated", failure);
    check(bogusVersion === "23514:dc_quote_versions_status_check", "a version status outside the list is refused", bogusVersion);

    console.log("step 15a: depositState's ranking (ruling P5, amended)");
    // (a) A paid deposit on an older version beats a newer signed version with no deposit.
    const Ra = await newLead("Ra", "sold", 20000);
    const vRa1 = await newVersion(Ra, 1, "signed", 10000);
    await newVersion(Ra, 2, "signed", 20000);
    const paidRa = await seedDeposit(Ra, vRa1, 5000, "paid");
    const stateRa = await depositState(Ra);
    check(stateRa !== null && stateRa.versionId === vRa1 && stateRa.version === 1 && stateRa.soldCents === 10000 &&
        stateRa.amountCents === 5000 && stateRa.paid?.id === paidRa && stateRa.pending === null && stateRa.refunded === null,
      "(a) the older version's paid deposit outranks a newer signed version with none", JSON.stringify(stateRa));
    // (b, report) An older cancelled version with a refund, a newer signed one with a pending deposit: the newer one.
    const Rb = await newLead("Rb", "signed", 30000);
    const vRb1 = await newVersion(Rb, 1, "cancelled", 10000);
    const vRb2 = await newVersion(Rb, 2, "signed", 30000);
    await seedDeposit(Rb, vRb1, 5000, "refunded");
    const pendingRb = await seedDeposit(Rb, vRb2, 15000, "pending");
    const stateRb = await depositState(Rb);
    check(stateRb !== null && stateRb.versionId === vRb2 && stateRb.versionStatus === "signed" && stateRb.pending?.id === pendingRb &&
        stateRb.paid === null && stateRb.refunded === null && stateRb.amountCents === 15000,
      "(b) a newer signed version with a pending deposit beats an older refunded one", JSON.stringify(stateRb));
    // (c, report; the dispatch's (b)) An older refunded version, a newer signed one with nothing yet: the newer one, all null.
    const Rc = await newLead("Rc", "signed", 30000);
    const vRc1 = await newVersion(Rc, 1, "cancelled", 10000);
    const vRc2 = await newVersion(Rc, 2, "signed", 30000);
    await seedDeposit(Rc, vRc1, 5000, "refunded");
    const stateRc = await depositState(Rc);
    check(stateRc !== null && stateRc.versionId === vRc2 && stateRc.version === 2 && stateRc.paid === null &&
        stateRc.pending === null && stateRc.refunded === null && stateRc.amountCents === 15000,
      "(c) a newer signed version beats an older version whose deposit was refunded — a new deposit is asked", JSON.stringify(stateRc));
    // (d) Only a cancelled version with a refunded deposit: it, with its refund.
    const Rd = await newLead("Rd", "lost", 10000);
    const vRd1 = await newVersion(Rd, 1, "cancelled", 10000);
    const refundedRd = await seedDeposit(Rd, vRd1, 5000, "refunded");
    const stateRd = await depositState(Rd);
    check(stateRd !== null && stateRd.versionId === vRd1 && stateRd.versionStatus === "cancelled" && stateRd.refunded?.id === refundedRd &&
        stateRd.paid === null && stateRd.pending === null && stateRd.jobStatus === "lost",
      "(d) a lone refunded version reports its refund", JSON.stringify(stateRd));
    // (e) No deposits anywhere: the newest signed version, one row with no deposit; an offered v3 is not a candidate.
    const Re = await newLead("Re", "signed", 40001);
    await newVersion(Re, 1, "signed", 10000);
    const vRe2 = await newVersion(Re, 2, "signed", 40001);
    await newVersion(Re, 3, "offered", 50000);
    const stateRe = await depositState(Re);
    check(stateRe !== null && stateRe.versionId === vRe2 && stateRe.version === 2 && stateRe.amountCents === 20001 &&
        stateRe.paid === null && stateRe.pending === null && stateRe.refunded === null,
      "(e) no deposits: the newest signed version, and a half cent rounds up", JSON.stringify(stateRe));
    // (f, ruling P20) An older signed version with only a pending card deposit, a newer signed change order with
    // none: the newer one is the one to pay. The pending tier is gone from the ranking.
    const Rf = await newLead("Rf", "signed", 30000);
    const vRf1 = await newVersion(Rf, 1, "signed", 10000);
    const vRf2 = await newVersion(Rf, 2, "signed", 30000);
    const pendingRf = await seedDeposit(Rf, vRf1, 5000, "pending");
    await sql`update deposits set stripe_session_id = ${`cs_verify_Rf_${STAMP}`} where id = ${pendingRf}`;
    const stateRf = await depositState(Rf);
    check(stateRf !== null && stateRf.versionId === vRf2 && stateRf.version === 2 && stateRf.paid === null &&
        stateRf.pending === null && stateRf.amountCents === 15000,
      "(f) a newer signed version with no deposit beats an older version holding only a pending deposit", JSON.stringify(stateRf));
    // startDepositAction's first write for v2: the old version's pending row expires and its session is answered.
    const closedRf = await expirePendingOnOtherVersions(Rf, vRf2);
    const rowsRf1 = await depositRows(vRf1);
    check(same(closedRf, [`cs_verify_Rf_${STAMP}`]) && rowsRf1.length === 1 && rowsRf1[0].status === "expired",
      "(f) expirePendingOnOtherVersions expires the older version's pending row and answers its session", JSON.stringify([closedRf, rowsRf1]));
    const pendingRf2 = await claimStripeDeposit({ leadId: Rf, versionId: vRf2, amountCents: 15000 });
    check(pendingRf2 !== null && (await expirePendingOnOtherVersions(Rf, vRf2)).length === 0 &&
        (await depositRows(vRf2))[0]?.status === "pending",
      "(f) it never touches the chosen version's own pending row", JSON.stringify(await depositRows(vRf2)));
    // No signed version at all: null.
    check((await depositState(C)) === null, "a job with no signed version has no deposit state", JSON.stringify(await depositState(C)));

    console.log("step 15b: a completed checkout on an expired row (ruling P11b)");
    const E = await newLead("E", "signed", 30000);
    const vE = await newVersion(E, 1, "signed", 30000);
    const p1 = await claimStripeDeposit({ leadId: E, versionId: vE, amountCents: 15000 });
    if (!p1) throw new Error("setup: E's first claim failed");
    await attachSession(p1.id, "cs_verify_E1");
    check(await expireDeposit("cs_verify_E1"), "the first checkout expires", "false");
    const p2 = await claimStripeDeposit({ leadId: E, versionId: vE, amountCents: 15000 });
    check(p2 !== null && p2.id !== p1.id && p2.status === "pending", "a fresh pending row replaces it", JSON.stringify(p2));
    await attachSession(p2!.id, "cs_verify_E2");
    check((await markStripeDepositPaid({ depositId: p1.id, sessionId: "cs_verify_other", paymentIntentId: "pi_other", amountCents: 15000 })) === null,
      "an expired row completed under another session matches nothing", "paid");
    const paidE = await markStripeDepositPaid({ depositId: p1.id, sessionId: "cs_verify_E1", paymentIntentId: "pi_verify_E1", amountCents: 15000 });
    check(same(paidE, { leadId: E, versionId: vE, stageBefore: "signed", otherSessionIds: ["cs_verify_E2"] }),
      "the expired row whose own session completed is paid, answering the other open session", `got ${JSON.stringify(paidE)}`);
    const rowsE = await sql`select id, status, stripe_session_id, stripe_payment_intent_id, (paid_at is not null) as paid
      from deposits where dc_quote_version_id = ${vE} order by created_at`;
    check(same(rowsE.map((r) => [r.id, r.status, r.stripe_session_id, r.stripe_payment_intent_id, r.paid]), [
      [p1.id, "paid", "cs_verify_E1", "pi_verify_E1", true], [p2!.id, "expired", "cs_verify_E2", null, false],
    ]), "the expired row is paid and the other pending row expired in the same statement", JSON.stringify(rowsE));
    check(same(await leadRow(E), { status: "sold", deposit_cents: 15000, sold_cents: 30000, lost_reason: null }),
      "E is sold with deposit_cents 15000", JSON.stringify(await leadRow(E)));
    check((await markStripeDepositPaid({ depositId: p1.id, sessionId: "cs_verify_E1", paymentIntentId: "pi_verify_E1", amountCents: 15000 })) === null,
      "E's duplicate delivery answers null", "paid again");
    check((await markStripeDepositPaid({ depositId: p2!.id, sessionId: "cs_verify_E2", paymentIntentId: "pi_verify_E2", amountCents: 15000 })) === null,
      "the other session, if it completes too, matches nothing (the owners are alerted)", "paid twice");
    // A job the owner moved elsewhere: the payment is recorded, the stage stays and no stage event is written.
    const H = await newLead("H", "lost", 8000);
    const vH = await newVersion(H, 1, "signed", 8000);
    const pendingH = await seedDeposit(H, vH, 4000, "pending");
    await attachSession(pendingH, "cs_verify_H");
    const paidH = await markStripeDepositPaid({ depositId: pendingH, sessionId: "cs_verify_H", paymentIntentId: "pi_verify_H", amountCents: 4000 });
    check(same(paidH, { leadId: H, versionId: vH, stageBefore: "lost", otherSessionIds: [] }),
      "a payment on a Lost job answers stageBefore lost", `got ${JSON.stringify(paidH)}`);
    const leadH = await leadRow(H);
    check(leadH.status === "lost" && leadH.deposit_cents === 4000, "H stays Lost with deposit_cents 4000", JSON.stringify(leadH));
    check(same(await events(H), [{ actor: "Stripe", kind: "payment", from_status: null, to_status: null, body: "Deposit $40 paid by card" }]),
      "H has a payment event and no stage event", JSON.stringify(await events(H)));

    console.log("step 15c: a claim race");
    const raced: string[] = [];
    for (const suffix of ["F1", "F2", "F3"]) {
      const F = await newLead(suffix, "signed", 40000);
      const vF = await newVersion(F, 1, "signed", 40000);
      const answers = await Promise.all([1, 2, 3].map(() => claimStripeDeposit({ leadId: F, versionId: vF, amountCents: 20000 })));
      const rowsF = await sql`select id, status from deposits where dc_quote_version_id = ${vF}`;
      const answered = answers.filter((answer) => answer !== null).map((answer) => answer!.id);
      check(rowsF.length === 1 && rowsF[0].status === "pending", `${suffix}: three concurrent claims leave one pending row`, JSON.stringify(rowsF));
      check(answered.length >= 1 && answered.every((id) => id === rowsF[0].id),
        `${suffix}: every claim that answers names that row (${answered.length} of 3 answered)`, JSON.stringify(answers));
      check((await pendingStripeDeposit(vF))?.id === rowsF[0].id, `${suffix}: pendingStripeDeposit reads the same row`, "another row");
      raced.push(rowsF[0].id as string);
    }

    console.log("step 15d: expireSessionlessDeposit");
    check(await expireSessionlessDeposit(raced[0]), "a pending row with no session expires", "false");
    check(!(await expireSessionlessDeposit(raced[0])), "expiring it again answers false", "true");
    await attachSession(raced[1], "cs_verify_F2");
    check(!(await expireSessionlessDeposit(raced[1])), "a pending row with a session is left to expireDeposit", "true");
    const [f1, f2] = await Promise.all(raced.slice(0, 2).map(async (id) => (await sql`select status from deposits where id = ${id}`)[0].status));
    check(f1 === "expired" && f2 === "pending", "F1 expired, F2 still pending", JSON.stringify([f1, f2]));

    console.log("step 15e: cancelling on a job already Lost");
    const G = await newLead("G", "signed", 60000);
    const vG = await newVersion(G, 1, "signed", 60000);
    check((await recordDepositPayment({ leadId: G, versionId: vG, amountCents: 30000, method: "cash", actor: ACTOR })) !== null,
      "setup: G's cash deposit is recorded", "null");
    await sql`update leads set status = 'lost', lost_reason = 'Went with another company' where id = ${G}`;
    const stagesBefore = (await events(G)).filter((e) => e.kind === "stage");
    const stateG = await depositState(G);
    check(await cancelDeposit({ leadId: G, deposit: stateG!.paid!, actor: ACTOR }), "cancelDeposit on the Lost job answers true", "false");
    check(same(await leadRow(G), { status: "lost", deposit_cents: null, sold_cents: 60000, lost_reason: "Went with another company" }),
      "G stays Lost with its own reason, deposit_cents cleared", JSON.stringify(await leadRow(G)));
    const eventsG = await events(G);
    check(same(eventsG.filter((e) => e.kind === "stage"), stagesBefore), "no second stage event", JSON.stringify(eventsG));
    check(same(eventsG.at(-1), { actor: ACTOR, kind: "payment", from_status: null, to_status: null,
      body: "Deposit $300 (cash) marked refunded — return it to the client" }), "one payment event for the refund", JSON.stringify(eventsG));
    const [versionG] = await sql`select status from dc_quote_versions where id = ${vG}`;
    check(versionG.status === "cancelled", "G's version is cancelled", JSON.stringify(versionG));

    console.log("step 16: deleting a job with deposits");
    check((await deleteJob(A, ACTOR)) === "deleted", "deleteJob(A) answers deleted", "not deleted");
    check((await sql`select id from deposits where lead_id = ${A}`).length === 0, "A's deposits went with it", "rows left");
    check((await sql`select id from dc_quote_versions where lead_id = ${A}`).length === 0, "A's versions went with it", "rows left");

    console.log("\nPASSED: the deposit flow's SQL holds against a real database. Manual run, not coverage.\n");
  } finally {
    // Step 17. Runs even on failure, and never throws: a throw here would replace the failure being
    // reported. Deposits first: they reference versions with no on-delete action.
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`step 17: cleanup could not ${label}:`, (error as Error).message);
      }
    };
    let ids: string[] = [];
    await attempt("find the script's leads", async () => { ids = await scriptLeads(); });
    if (ids.length > 0) {
      await attempt("delete deposits", () => sql`delete from deposits where lead_id = any(${ids})`);
      await attempt("delete versions", () => sql`delete from dc_quote_versions where lead_id = any(${ids})`);
      await attempt("delete files", () => sql`delete from job_files where lead_id = any(${ids})`);
      await attempt("delete events", () => sql`delete from job_events where lead_id = any(${ids})`);
      await attempt("delete leads", () => sql`delete from leads where id = any(${ids})`);
    }
    await attempt("report what is left", async () => console.log(`step 17: cleanup, ${(await scriptLeads()).length} leads left`));
  }
}, 300_000);
