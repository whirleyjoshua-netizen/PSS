/**
 * Behavioural proof of the PSS Ops sign-in SQL: the 6-digit code (consumeSignInCode), the link
 * (consumeSignIn), sliding sessions (touchSession), the Face ID store (lib/admin/passkeys.ts),
 * removeAdmin's passkey cleanup, and migration 034. See
 * docs/superpowers/specs/2026-10-01-pss-ops-app-design.md §2, §2b and §3.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no
 * suite, and CI does not execute it. If you change consumeSignInCode, consumeSignIn, touchSession,
 * the passkey store, removeAdmin or 034_sign_in_code.sql, run it yourself — and if you cannot, say
 * the sign-in rules are unverified rather than assuming they hold.
 *
 * Why it exists: the unit tests mock the database, so they pin the SQL *text*. Whether the one
 * statement really picks the newest row, really stops at 5 tries, whether a session really slides,
 * and whether a challenge is really used once are things only the database can answer. This
 * script calls the real functions — no mocks — except where a real authenticator is needed (see 13).
 *
 * What it does, against a throwaway database, as its own owner address (ADMIN_EMAILS is set to it):
 *   1. the right code returns the email and sets used_at;
 *   2. the same code again returns null;
 *   3. 5 wrong codes leave code_attempts at 5, a 6th wrong one leaves it at 5, and then the RIGHT
 *      code returns null;
 *  3b. the daily cap: three sign-ins with 5 wrong codes each (15 for the address today) make a
 *      fourth, fresh sign-in's RIGHT code return null; once those three are over a day old, it works;
 *   4. with two rows, the older row's code returns null and the newer row's code works;
 *   5. an expired row's code fails;
 *   6. a row used by its link (consumeSignIn) makes its code fail;
 *   7. a raw update to code_attempts = 6 throws admin_login_tokens_code_attempts_check;
 *   8. touchSession slides a 2-day session to ~30 days, leaves a 30-day one untouched, and
 *      returns null for an expired one;
 *   9. every statement of 034_sign_in_code.sql re-runs without error;
 *  10. challenges, through finishSignIn and finishRegistration with a dummy response (it never
 *      verifies, but each function deletes its challenge BEFORE verifying, and finishSignIn tells
 *      "challenge consumed, passkey unknown" apart from "challenge not consumed"): a challenge is
 *      used exactly once, an expired one is not used, a register challenge cannot be used as
 *      sign-in, a register challenge is only used for its own address, and a sign-in challenge
 *      carrying the same address cannot be used as register. The run prints one
 *      expected "Face ID registration did not verify" stack trace from the dummy response;
 *  11. admin_webauthn_challenges_email_check refuses a 'register' row with a null email;
 *  12. startSignIn stores the MAX_WAITING_SIGN_INS-th (5000th) live sign-in challenge and refuses
 *      the next (the rest are inserted directly, in one insert ... select from generate_series);
 *  13. the counter update — finishSignIn's own statement, which this script checks is still
 *      verbatim in lib/admin/passkeys.ts, run directly (that same text, with $1/$2 for its two
 *      placeholders) because reaching it needs a real signature —
 *      moves 0 → 0 and 0 → 5, and refuses 5 → 3 and 5 → 5;
 *  14. removePasskey cannot delete another address's passkey, and can delete its own;
 *  15. removeAdmin for an added admin deletes their passkeys (and leaves another address's).
 * Then it deletes every row it made and checks nothing is left.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch. Step 9 re-runs
 * migration 034 against the whole branch.
 * It takes its connection from E2E_POSTGRES_URL alone — never POSTGRES_URL,
 * DATABASE_URL or .env.local, all of which may hold production credentials —
 * and it refuses to start if that URL looks like production (ep-cold-term).
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-sign-in-code.config.mts
 *
 * To watch it fail (which is the only way to know it works), one at a time:
 *   - in consumeSignInCode's `used` update, delete `and code_attempts < ${CODE_TRIES}::int` —
 *     step 3 "after 5 wrong tries the right code returns null" must fail;
 *   - in consumeSignInCode's `target`, delete the `and (select coalesce(sum(code_attempts), 0) ...)
 *     < ${DAILY_WRONG_CODES}` line — step 3b "a fresh sign-in's RIGHT code returns null" must fail;
 *   - in consumeSignInCode, delete `order by created_at desc limit 1` — step 4 must fail (the
 *     subquery then returns several rows, which is an error, and counts as the fail);
 *   - in touchSession, delete the `bumped` CTE — step 8 "a 2-day session slides" must fail.
 * Put each back.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import { codeHash, consumeSignIn, consumeSignInCode, DAILY_WRONG_CODES } from "../lib/admin/login";
import { touchSession } from "../lib/admin/session";
import { finishRegistration, finishSignIn, MAX_WAITING_SIGN_INS, removePasskey, startSignIn } from "../lib/admin/passkeys";
import { addAdmin, removeAdmin } from "../lib/admin/admin-access";
import { hashToken, newToken } from "../lib/admin/tokens";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["ep-cold-term"];

const BANNER = "\n================ verify-sign-in-code REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message is what sets the exit code,
  // the print is what a human actually reads in the terminal.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-sign-in-code refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-sign-in-code.config.mts\n\n" +
      "It does not skip. No result means it did not run, not that the rules hold.",
  );
}

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse(`E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.`);
  }
})();

for (const forbidden of FORBIDDEN_HOSTS) {
  if (host.includes(forbidden)) {
    refuse(
      `E2E_POSTGRES_URL points at ${host}, which matches the production endpoint "${forbidden}".\n\n` +
        "This script inserts and deletes rows and re-runs a migration. Running it there would\n" +
        "touch the owners' real data. Cut a Neon branch and point it at that instead.",
    );
  }
}

// The functions under test read the connection through lib/db's db(), at call time, from
// POSTGRES_URL. Set it from the vetted URL so the module under test cannot reach anything
// this script has not just checked.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

const STAMP = Date.now();
// The script's own owner, so isAllowed passes without an admin_access row. A fixed https origin
// so rpId() and expectedOrigin() are defined and never come from a real deployment.
const OWNER = `verify-sign-in-code-${STAMP}@example.com`;
const ADDED = `verify-sign-in-added-${STAMP}@example.com`;
const OTHER = `verify-sign-in-other-${STAMP}@example.com`;
const EMAILS = [OWNER, ADDED, OTHER];
process.env.ADMIN_EMAILS = OWNER;
process.env.ADMIN_BASE_URL = "https://verify-sign-in.example.com";

const sql = neon(url);
/** Every challenge and passkey id this script made, for cleanup. All start with ID_PREFIX. */
const ID_PREFIX = `verify-sign-in-${STAMP}-`;
const challengeIds: string[] = [];

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}

const migrationStatements = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);

/** Mirrors requestSignIn's insert, with a known code. Returns the link token. */
const newSignIn = async (code: string, opts: { ageMinutes?: number; expired?: boolean } = {}): Promise<string> => {
  const token = newToken();
  const age = `${opts.ageMinutes ?? 0} minutes`;
  const expiresIn = opts.expired ? "-1 minutes" : "15 minutes";
  await sql`
    insert into admin_login_tokens (token_hash, email, created_at, expires_at, code_hash)
    values (${hashToken(token)}, ${OWNER}, now() - ${age}::interval, now() + ${expiresIn}::interval, ${codeHash(OWNER, code)})`;
  return token;
};

const tokenRow = async (token: string) =>
  (await sql`select used_at, code_attempts from admin_login_tokens where token_hash = ${hashToken(token)}`)[0];

const clearSignIns = () => sql`delete from admin_login_tokens where email = ${OWNER}`;

const newChallenge = async (purpose: "register" | "sign-in", email: string | null, expired = false): Promise<string> => {
  const id = `${ID_PREFIX}c${challengeIds.length}`;
  challengeIds.push(id);
  const expiresIn = expired ? "-1 minutes" : "5 minutes";
  await sql`
    insert into admin_webauthn_challenges (id, challenge, purpose, email, expires_at)
    values (${id}, ${`challenge-${id}`}, ${purpose}, ${email}, now() + ${expiresIn}::interval)`;
  return id;
};

const challengeExists = async (id: string): Promise<boolean> =>
  (await sql`select 1 from admin_webauthn_challenges where id = ${id}`).length === 1;

const newPasskey = async (suffix: string, email: string, counter = 0): Promise<string> => {
  const id = `${ID_PREFIX}pk-${suffix}`;
  await sql`
    insert into admin_passkeys (id, email, public_key, counter, transports, label)
    values (${id}, ${email}, decode('00', 'hex'), ${counter}, '{internal}'::text[], 'VERIFY device')`;
  return id;
};

const passkeyExists = async (id: string): Promise<boolean> =>
  (await sql`select 1 from admin_passkeys where id = ${id}`).length === 1;

/** A response that passes the shape guard but can never verify. Its id names no passkey. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dummyResponse = (id = `${ID_PREFIX}no-such-passkey`): any => ({ id, rawId: id, type: "public-key", response: {} });

/** finishSignIn's counter update, verbatim. Step 13 checks the source still contains it. */
const COUNTER_UPDATE_SOURCE =
  "update admin_passkeys set counter = ${newCounter}, last_used_at = now()\n" +
  "    where id = ${response.id} and (counter < ${newCounter}::bigint or (counter = 0 and ${newCounter}::bigint = 0))\n" +
  "    returning email";
/** The same text, run with $1 = the new counter and $2 = the passkey id, so what is asserted is what runs. */
const COUNTER_UPDATE_QUERY = COUNTER_UPDATE_SOURCE.replaceAll("${newCounter}", "$1").replaceAll("${response.id}", "$2");
const counterUpdate = (id: string, newCounter: number) => sql.query(COUNTER_UPDATE_QUERY, [newCounter, id]);
const counterOf = async (id: string): Promise<number> =>
  Number((await sql`select counter from admin_passkeys where id = ${id}`)[0]?.counter);

test("sign-in code, sessions and passkey store against a real database", async () => {
  console.log(`\nverify-sign-in-code: writing to ${host}\n`);
  try {
    // 1. The right code signs in and uses the row.
    await clearSignIns();
    const t1 = await newSignIn("012345");
    const r1 = await consumeSignInCode(OWNER, "012 345");
    check(r1 === OWNER, "1. the right code (leading zero, with a space) returns the email", `returned ${r1}`);
    const row1 = await tokenRow(t1);
    check(row1?.used_at != null, "1. the row's used_at is set", JSON.stringify(row1));

    // 2. Used once only.
    const r2 = await consumeSignInCode(OWNER, "012345");
    check(r2 === null, "2. the same code again returns null", `returned ${r2}`);

    // 3. Five wrong tries lock the sign-in.
    await clearSignIns();
    const t3 = await newSignIn("111111");
    for (let i = 0; i < 5; i++) {
      const wrong = await consumeSignInCode(OWNER, `22222${i}`);
      if (wrong !== null) throw new Error(`FAILED: 3. wrong code ${i + 1} returned ${wrong}`);
    }
    const row3 = await tokenRow(t3);
    check(Number(row3?.code_attempts) === 5, "3. five wrong codes leave code_attempts at 5", JSON.stringify(row3));
    const sixth = await throwsWith(() => consumeSignInCode(OWNER, "333333"));
    check(sixth === null && Number((await tokenRow(t3))?.code_attempts) === 5,
      "3. a sixth wrong code neither throws nor moves code_attempts past 5", `${sixth}`);
    const r3 = await consumeSignInCode(OWNER, "111111");
    check(r3 === null, "3. after 5 wrong tries the right code returns null", `returned ${r3}`);
    check((await tokenRow(t3))?.used_at == null, "3. the locked row is still unused", JSON.stringify(await tokenRow(t3)));

    // 3b. At most DAILY_WRONG_CODES wrong codes per address per day, across its sign-ins.
    await clearSignIns();
    const spent: string[] = [];
    for (const [n, age] of [3, 2, 1].entries()) {
      spent.push(await newSignIn("121212", { ageMinutes: age }));
      for (let i = 0; i < 5; i++) {
        const wrong = await consumeSignInCode(OWNER, `34343${i}`);
        if (wrong !== null) throw new Error(`FAILED: 3b. sign-in ${n + 1}'s wrong code ${i + 1} returned ${wrong}`);
      }
    }
    const today = Number((await sql`
      select coalesce(sum(code_attempts), 0)::int as n from admin_login_tokens where email = ${OWNER}`)[0].n);
    check(today === DAILY_WRONG_CODES, `3b. three sign-ins with 5 wrong codes each count ${DAILY_WRONG_CODES} for the address`, `found ${today}`);
    const fresh = await newSignIn("565656");
    const capped = await consumeSignInCode(OWNER, "565656");
    check(capped === null, "3b. past the daily cap, a fresh sign-in's RIGHT code returns null", `returned ${capped}`);
    const freshRow = await tokenRow(fresh);
    check(freshRow?.used_at == null && Number(freshRow?.code_attempts) === 0,
      "3b. the fresh sign-in is left unused and uncounted", JSON.stringify(freshRow));
    await sql`update admin_login_tokens set created_at = now() - interval '25 hours'
              where token_hash = any(${spent.map(hashToken)}::text[])`;
    const nextDay = await consumeSignInCode(OWNER, "565656");
    check(nextDay === OWNER, "3b. once those wrong codes are over a day old, the right code works again", `returned ${nextDay}`);

    // 4. Only the newest sign-in accepts a code.
    await clearSignIns();
    await newSignIn("444444", { ageMinutes: 2 });
    const tNew = await newSignIn("555555");
    const rOld = await consumeSignInCode(OWNER, "444444");
    check(rOld === null, "4. the older row's code returns null", `returned ${rOld}`);
    const rNew = await consumeSignInCode(OWNER, "555555");
    check(rNew === OWNER, "4. the newer row's code works", `returned ${rNew}`);
    check((await tokenRow(tNew))?.used_at != null, "4. the newer row is the one used", JSON.stringify(await tokenRow(tNew)));

    // 5. Expired.
    await clearSignIns();
    await newSignIn("666666", { expired: true });
    const r5 = await consumeSignInCode(OWNER, "666666");
    check(r5 === null, "5. an expired row's code fails", `returned ${r5}`);

    // 6. The link uses the code too.
    await clearSignIns();
    const t6 = await newSignIn("777777");
    const viaLink = await consumeSignIn(t6);
    check(viaLink === OWNER, "6. the link (consumeSignIn) signs in", `returned ${viaLink}`);
    const r6 = await consumeSignInCode(OWNER, "777777");
    check(r6 === null, "6. after the link is used its code fails", `returned ${r6}`);

    // 7. The check caps code_attempts at 5.
    await clearSignIns();
    const t7 = await newSignIn("888888");
    const over = await throwsWith(() => sql`update admin_login_tokens set code_attempts = 6 where token_hash = ${hashToken(t7)}`);
    check(over?.includes("admin_login_tokens_code_attempts_check") ?? false,
      "7. code_attempts = 6 is refused by admin_login_tokens_code_attempts_check", `${over}`);

    // 8. Sliding sessions.
    const sessionHash = async (expiresIn: string): Promise<string> => {
      const h = hashToken(newToken());
      await sql`insert into admin_sessions (token_hash, email, expires_at) values (${h}, ${OWNER}, now() + ${expiresIn}::interval)`;
      return h;
    };
    const short = await sessionHash("2 days");
    const s1 = await touchSession(short);
    check(s1 === OWNER, "8. a 2-day session returns its email", `returned ${s1}`);
    const slid = await sql`
      select expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute' as ok, expires_at::text as at
      from admin_sessions where token_hash = ${short}`;
    check(slid[0]?.ok === true, "8. a 2-day session slides to about 30 days out", `expires_at is ${slid[0]?.at}`);
    const full = await sessionHash("30 days");
    const before = (await sql`select expires_at::text as at from admin_sessions where token_hash = ${full}`)[0]?.at;
    const s2 = await touchSession(full);
    const after = (await sql`select expires_at::text as at from admin_sessions where token_hash = ${full}`)[0]?.at;
    check(s2 === OWNER && before === after, "8. a session already 30 days out is returned and unchanged", `${s2} ${before} → ${after}`);
    const dead = await sessionHash("-1 minutes");
    const s3 = await touchSession(dead);
    check(s3 === null, "8. an expired session returns null", `returned ${s3}`);

    // 9. 034 re-runs.
    for (const statement of migrationStatements("db/migrations/034_sign_in_code.sql")) await sql.query(statement);
    console.log("  ok  9. every statement of 034_sign_in_code.sql re-runs without error");
    const c034 = await sql`
      select count(*)::int as n from pg_constraint
      where conname in ('admin_login_tokens_code_attempts_check', 'admin_webauthn_challenges_email_check',
                        'admin_webauthn_challenges_purpose_check', 'admin_passkeys_email_normalized')`;
    check(Number(c034[0].n) === 4, "9. all four 034 constraints exist after the re-run", `found ${c034[0].n}`);

    // 10. Challenges are used once, unexpired, for their purpose and address.
    const once = await newChallenge("sign-in", null);
    const first = await finishSignIn(once, dummyResponse());
    check(JSON.stringify(first) === JSON.stringify({ failed: "unknown-passkey" }) && !(await challengeExists(once)),
      "10. a sign-in challenge is consumed (deleted) on first use", JSON.stringify(first));
    const second = await finishSignIn(once, dummyResponse());
    check(JSON.stringify(second) === JSON.stringify({ failed: "not-verified" }),
      "10. the same challenge a second time is not consumed again", JSON.stringify(second));
    const stale = await newChallenge("sign-in", null, true);
    const staleResult = await finishSignIn(stale, dummyResponse());
    check(JSON.stringify(staleResult) === JSON.stringify({ failed: "not-verified" }) && (await challengeExists(stale)),
      "10. an expired challenge is not consumed", JSON.stringify(staleResult));
    const reg = await newChallenge("register", OWNER);
    const regAsSignIn = await finishSignIn(reg, dummyResponse());
    check(JSON.stringify(regAsSignIn) === JSON.stringify({ failed: "not-verified" }) && (await challengeExists(reg)),
      "10. a register challenge cannot be consumed as sign-in", JSON.stringify(regAsSignIn));
    const wrongAddress = await finishRegistration(OTHER, reg, dummyResponse(), "VERIFY device");
    check(wrongAddress === false && (await challengeExists(reg)),
      "10. a register challenge is not consumed for another address", `returned ${wrongAddress}`);
    const ownAddress = await finishRegistration(OWNER, reg, dummyResponse(), "VERIFY device");
    check(ownAddress === false && !(await challengeExists(reg)),
      "10. a register challenge is consumed for its own address (the dummy response then fails to verify)", `returned ${ownAddress}`);
    // It carries OWNER's address, so only the purpose filter can keep finishRegistration off it.
    const signInAsReg = await newChallenge("sign-in", OWNER);
    await finishRegistration(OWNER, signInAsReg, dummyResponse(), "VERIFY device");
    check(await challengeExists(signInAsReg), "10. a sign-in challenge cannot be consumed as register", "it was deleted");

    // 11. A register challenge must carry its address.
    const nullEmail = await throwsWith(() => sql`
      insert into admin_webauthn_challenges (id, challenge, purpose, email, expires_at)
      values (${`${ID_PREFIX}null-email`}, 'x', 'register', null, now() + interval '5 minutes')`);
    challengeIds.push(`${ID_PREFIX}null-email`);
    check(nullEmail?.includes("admin_webauthn_challenges_email_check") ?? false,
      "11. a 'register' row with a null email is refused by admin_webauthn_challenges_email_check", `${nullEmail}`);

    // 12. The waiting sign-in cap.
    const live = Number((await sql`
      select count(*)::int as n from admin_webauthn_challenges where purpose = 'sign-in' and expires_at > now()`)[0].n);
    const fill = MAX_WAITING_SIGN_INS - 1 - live;
    check(fill >= 0, `12. fewer than ${MAX_WAITING_SIGN_INS} live sign-in challenges exist before filling`, `found ${live}`);
    const filled = await sql`
      insert into admin_webauthn_challenges (id, challenge, purpose, email, expires_at)
      select ${ID_PREFIX} || 'fill-' || g, 'x', 'sign-in', null, now() + interval '5 minutes'
      from generate_series(1, ${fill}::int) g
      returning id`;
    challengeIds.push(...filled.map((row) => row.id as string));
    const belowCap = Number((await sql`
      select count(*)::int as n from admin_webauthn_challenges where purpose = 'sign-in' and expires_at > now()`)[0].n);
    check(belowCap === MAX_WAITING_SIGN_INS - 1, `12. ${MAX_WAITING_SIGN_INS - 1} live sign-in challenges after filling`, `found ${belowCap}`);
    const nth = await startSignIn();
    if (nth) challengeIds.push(nth.challengeId);
    check(nth !== null && (await challengeExists(nth.challengeId)),
      `12. startSignIn stores the ${MAX_WAITING_SIGN_INS}th live sign-in challenge`, `returned ${JSON.stringify(nth)}`);
    const refused = await startSignIn();
    if (refused) challengeIds.push(refused.challengeId);
    check(refused === null, `12. startSignIn refuses the next one (${MAX_WAITING_SIGN_INS + 1})`, `returned ${JSON.stringify(refused)}`);
    const atCap = Number((await sql`
      select count(*)::int as n from admin_webauthn_challenges where purpose = 'sign-in' and expires_at > now()`)[0].n);
    check(atCap === MAX_WAITING_SIGN_INS, `12. exactly ${MAX_WAITING_SIGN_INS} live sign-in challenges remain`, `found ${atCap}`);
    await sql`delete from admin_webauthn_challenges where id = any(${challengeIds}::text[])`;

    // 13. The counter update (finishSignIn's statement; a real signature is needed to reach it).
    const source = readFileSync("lib/admin/passkeys.ts", "utf8");
    check(source.includes(COUNTER_UPDATE_SOURCE), "13. finishSignIn's counter update is still the statement tested here",
      "lib/admin/passkeys.ts no longer contains it verbatim; update COUNTER_UPDATE_SOURCE to match");
    const icloud = await newPasskey("icloud", OWNER, 0);
    const zero = await counterUpdate(icloud, 0);
    check(zero.length === 1 && (await counterOf(icloud)) === 0, "13. counter 0 → 0 (iCloud) is accepted", `moved ${zero.length}`);
    const counting = await newPasskey("counting", OWNER, 0);
    const up = await counterUpdate(counting, 5);
    check(up.length === 1 && (await counterOf(counting)) === 5, "13. counter 0 → 5 is accepted", `moved ${up.length}`);
    const down = await counterUpdate(counting, 3);
    check(down.length === 0 && (await counterOf(counting)) === 5, "13. counter 5 → 3 is refused and left at 5", `moved ${down.length}`);
    const same = await counterUpdate(counting, 5);
    check(same.length === 0 && (await counterOf(counting)) === 5,
      "13. counter 5 → 5 (a replayed signature) is refused and left at 5", `moved ${same.length}`);
    const big = await counterUpdate(counting, 3_000_000_000);
    check(big.length === 1 && (await counterOf(counting)) === 3_000_000_000,
      "13. a counter past 32 bits is accepted (bigint, not int)", `moved ${big.length}`);

    // 14. removePasskey is scoped to the address.
    const others = await newPasskey("other", OTHER);
    const stolen = await removePasskey(OWNER, others);
    check(stolen === false && (await passkeyExists(others)), "14. removePasskey cannot delete another address's passkey", `returned ${stolen}`);
    const own = await removePasskey(OWNER, icloud);
    check(own === true && !(await passkeyExists(icloud)), "14. removePasskey deletes the address's own passkey", `returned ${own}`);

    // 15. removeAdmin takes the added admin's passkeys with them.
    check(await addAdmin(ADDED, OWNER), "15. addAdmin gives the added admin access", "returned false");
    const addedKey = await newPasskey("added", ADDED);
    const removed = await removeAdmin(ADDED);
    check(removed === true, "15. removeAdmin returns true", `returned ${removed}`);
    check(!(await passkeyExists(addedKey)), "15. removeAdmin deletes the added admin's passkey", "it is still there");
    check(await passkeyExists(others), "15. removeAdmin leaves another address's passkey", "it was deleted");
  } finally {
    // Independent deletes, so every one runs even if another throws. The first failure is rethrown.
    const cleanup = await Promise.allSettled([
      sql`delete from admin_login_tokens where email = any(${EMAILS}::text[])`,
      sql`delete from admin_sessions where email = any(${EMAILS}::text[])`,
      sql`delete from admin_passkeys where id like ${`${ID_PREFIX}%`} or email = any(${EMAILS}::text[])`,
      sql`delete from admin_webauthn_challenges where id = any(${challengeIds}::text[]) or id like ${`${ID_PREFIX}%`}
                                                  or email = any(${EMAILS}::text[])`,
      sql`delete from admin_access where email = any(${EMAILS}::text[])`,
    ]);
    const failed = cleanup.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
    const residue = await sql`
      select (select count(*)::int from admin_login_tokens where email = any(${EMAILS}::text[]))
           + (select count(*)::int from admin_sessions where email = any(${EMAILS}::text[]))
           + (select count(*)::int from admin_passkeys where id like ${`${ID_PREFIX}%`} or email = any(${EMAILS}::text[]))
           + (select count(*)::int from admin_webauthn_challenges where id = any(${challengeIds}::text[]) or id like ${`${ID_PREFIX}%`}
                                                                     or email = any(${EMAILS}::text[]))
           + (select count(*)::int from admin_access where email = any(${EMAILS}::text[])) as n`;
    if (Number(residue[0].n) !== 0) throw new Error(`FAILED: cleanup left ${residue[0].n} rows behind`);
    console.log("  ok  cleanup removed every token, session, passkey, challenge and access row it made");
  }
});
