# Direct Connect Quote Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Hunter Douglas Direct Connect Dealer Copy emailed to support@ becomes a priced, versioned quote on the right job. The owner reviews it and sends one generated contract (products at % of MSRP + HD handling fee + installation) that the client signs on the portal. Signing moves the job to Sold.

**Architecture:** Pure, heavily tested modules do the thinking: `lib/dc/parse.ts` (HTML → typed quote or refusal), `lib/dc/pricing.ts` (lines + rules → priced version + blockers + fingerprint), and `lib/dc/contract-layout.ts` (priced version → printable rows). Thin I/O modules do the work: `lib/dc/store.ts` (SQL, one data-modifying statement per write), `lib/dc/mailbox.ts` (Graph), `lib/dc/import.ts` (pipeline), `lib/dc/send.ts` (freeze + PDF + share + email). The UI is a new **Quote** tab on the job page and two Settings sections.

**Tech Stack:** Next.js 16.3 App Router (read `node_modules/next/dist/docs/` before writing routes or actions; see AGENTS.md), Neon Postgres via `@neondatabase/serverless` tagged templates, `@vercel/blob` (private), Microsoft Graph (app-only, `lib/calendar/graph.ts`), `pdf-lib`, Resend, zod, vitest (`--maxWorkers=2`), Playwright. **New dependency:** `node-html-parser@^9.0.4`.

**Spec:** `docs/superpowers/specs/2026-09-27-dc-quote-import-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Money is **integer cents** everywhere, parsed from strings without floating point. Percentages are `numeric(6,2)`, held in code as basis points (`Math.round(pct * 100)`).
- **Sell unit = round-half-up(MSRP unit × pct / 100)** = `Math.floor((msrpUnitCents * bp + 5000) / 10000)`.
- **Line MSRP = Base Amt + Promotion + Options.** Dealer cost is **never recomputed**. Unit and Extended are taken as printed.
- **The job key** is `PO Reference` matching `^PSS-(\d{4,})$` → `leads.project_no`. There is never a fuzzy fallback.
- **The DC sender** is exactly `retailer@hunterdouglas.com`, the subject must match `^DEALER COPY #(\d+), PO (.+)$`, and there must be exactly one `.html` attachment.
- **The mailbox is read-only:** no PATCH, DELETE, move or mark-read call to Graph, ever.
- **Nothing is shared with a customer except by the owner's Send.** A `dealer_copy` file can never be shared; the database check `job_files_dealer_copy_never_shared` enforces it.
- **Migration** `db/migrations/024_dc_quote_import.sql`. It must be idempotent, use whole-line `--` comments only, and have **no `;` inside comments or string literals** (`scripts/migrate.mjs` splits on `;`). Every re-definition of `job_events_kind_check` / `job_files_doc_type_check` must be **identical in every file** (`tests/db/migration-checks-consistent.test.ts`).
- **One data-modifying SQL statement per logical write.** Use CTEs, not `sql.transaction()` (repo precedent: `createFile`, `saveInstallQuote`).
- **Saved equals shown:** Send recomputes on the server and compares a whole-version fingerprint with the one the owner's screen submitted (precedent: `priceFingerprint` in `install-actions.ts`).
- **Customer-visible text never includes** cost, cost factor, MSRP, percentage, margin or the DC quote number.
- Tests run with `npx vitest run --maxWorkers=2 <path>`. Typecheck with `npm run typecheck`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VsZpDCE8YaRq5jxSkaAZGj
  ```
- **Never print secrets.** Put connection strings in env vars, never in command output.
- Work in the worktree `C:\Users\whirl\pss\.claude\worktrees\dc-quote-import`, branch `docs/dc-quote-import` (rename to `feat/dc-quote-import` in Task 1). Verify with `git rev-parse --show-toplevel` before the first edit of every task.

## Review Focus

1. **A Dealer Copy the owner re-sends after moving the first email to a folder.** Graph's message id changes on a move, so it must be keyed on `internetMessageId`, and an identical file must be reported `unchanged`, not imported as v2. Pinned in Task 6.
2. **A collection printed with stray whitespace or different case** (`Duette `, `duette`) must find the `Duette` markup rule, not block the send as "missing". Pinned in Task 1 (trim) and Task 2 (case-insensitive lookup).
3. **The owner edits a markup rule in Settings while a review page is open elsewhere.** Send must refuse with "Prices changed", never charge the new price unseen. Pinned in Task 8.
4. **Option text PDF standard fonts cannot encode** (`½`, `″`, `—`, emoji in a room name) must not crash contract generation. Pinned in Task 7.
5. **A job with no customer email, or a Lost job,** must block Send with a plain reason, not send an email to nobody or share onto a hidden job. Pinned in Task 2.

---

## File Structure

**Create**
- `lib/dc/types.ts`: shared types (`DcLine`, `DcQuote`, `ParseResult`, outcomes).
- `lib/dc/parse.ts`: `parseDealerCopy(html)`. Pure.
- `lib/dc/money.ts`: `parseMoney`, `pctToBasisPoints`, `sellUnitCents`. Pure.
- `lib/dc/pricing.ts`: `priceVersion`, `pickInstallQuote`, `sendBlockers`, `pricingFingerprint`. Pure.
- `lib/dc/contract-layout.ts`: `contractRows`, `winAnsiSafe`. Pure.
- `lib/dc/contract-pdf.ts`: `buildContractPdf` (pdf-lib).
- `lib/dc/store.ts`: every `dc_*` / `ingested_messages` / `markup_rules` / `dc_settings` read and write.
- `lib/dc/mailbox.ts`: Graph listing and attachments. Read only.
- `lib/dc/import.ts`: `importDealerCopy` (one message) and `pollMailbox` (the run).
- `lib/dc/notify.ts`: owner emails for import outcomes.
- `lib/dc/send.ts`: `sendContract`.
- `lib/dc/send-contract-email.ts`: the customer email.
- `lib/dc/config.ts`: constants (`DC_SENDER`, DC URLs) and `dcMailbox()`.
- `db/migrations/024_dc_quote_import.sql`
- `app/api/cron/dc-quotes/route.ts`
- `app/admin/settings/MarkupSection.tsx`, `app/admin/settings/TermsSection.tsx`, `app/admin/settings/terms/route.ts`
- `app/admin/jobs/[id]/QuoteTab.tsx`, `app/admin/jobs/[id]/QuoteReview.tsx`, `app/admin/jobs/[id]/DcButtons.tsx`, `app/admin/jobs/[id]/quote-actions.ts`
- Tests: `tests/dc/*.test.ts`, `tests/db/migration-024.test.ts`
- Fixtures: `tests/fixtures/dc/dealer-copy-4-lines.html`. The 1-line fixture already exists.
- `scripts/verify-dc-quote-import.ts` and `scripts/verify-dc-quote-import.config.mts`
- `e2e/dc-quote.spec.ts`

**Modify**
- `package.json` (add `node-html-parser`)
- `db/migrations/003,004,011,016,019,021`: identical check lists
- `lib/admin/doc-types.ts`, `lib/admin/files.ts`, `lib/admin/jobs.ts` (`JobEvent.kind`)
- `app/admin/files/[fileId]/route.ts`, `app/admin/jobs/[id]/JobFiles.tsx`, `app/admin/jobs/[id]/EventList.tsx` (only if it switches on kind)
- `lib/portal/sign.ts` (`recordSignature`) and `tests/portal/sign.test.ts`
- `app/admin/jobs/[id]/tabs.ts`, `app/admin/jobs/[id]/page.tsx`
- `app/admin/settings/page.tsx`, `app/admin/settings/actions.ts`
- `vercel.json`
- `tests/db/migration-021.test.ts` (it asserts 021's lists, which grow)

---

### Task 1: Parser — Dealer Copy HTML → typed quote

**Files:**
- Create: `lib/dc/types.ts`, `lib/dc/money.ts`, `lib/dc/parse.ts`
- Create: `tests/dc/money.test.ts`, `tests/dc/parse.test.ts`, `tests/fixtures/dc/dealer-copy-4-lines.html`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces:
  - `parseDealerCopy(html: string): ParseResult`
  - `parseMoney(text: string): number | null`
  - `pctToBasisPoints(pct: number): number`
  - `sellUnitCents(msrpUnitCents: number, pct: number): number`
  - the types in `lib/dc/types.ts` (below)

- [ ] **Step 1: Branch and dependency**

```bash
git rev-parse --show-toplevel   # must end in .claude/worktrees/dc-quote-import
git branch -m docs/dc-quote-import feat/dc-quote-import
npm install node-html-parser@^9.0.4
```

- [ ] **Step 2: Obtain the 4-line fixture (needs the owner)**

The second Dealer Copy (DC quote 22250749 with 4 lines, emailed 2026-09-27 to support@, subject `DEALER COPY #22250749, PO PSS-1042`) must be saved as `tests/fixtures/dc/dealer-copy-4-lines.html`.

The controller **asks the owner for permission to download** its attachment `DEALER COPY 22250749.html` from support@ in Outlook, then copies it byte for byte. Do not reconstruct it by hand. Check it contains `1,619.00`, `690.00`, `48 1/2`, `PowerView Gateway` and `DEALER COSTS`:

```bash
for s in "1,619.00" "690.00" "48 1/2" "PowerView Gateway" "DEALER COSTS"; do grep -c "$s" tests/fixtures/dc/dealer-copy-4-lines.html; done
```

Expected: every count ≥ 1. If `DEALER COSTS` is 0, the copy was sent without costs; ask the owner to resend with the box ticked.

- [ ] **Step 3: Write `lib/dc/types.ts`**

```ts
/** One product line exactly as the Dealer Copy printed it, in cents. */
export type DcLine = {
  position: number;
  qty: number;
  /** "Location:" option; empty for accessories such as a Gateway. */
  room: string;
  description: string;
  /** "Collection:" option, trimmed. The markup key. */
  collection: string;
  baseCents: number;
  promotionCents: number;
  optionsCents: number;
  /** base + promotion + options, per unit. */
  msrpUnitCents: number;
  /** As printed ("0.4940"), or null when the column is blank. */
  costFactor: string | null;
  costUnitCents: number;
  costExtendedCents: number;
  /** Every option row, in printed order, "***" notes excluded. */
  options: [string, string][];
};

export type DcQuote = {
  quoteNo: string;
  poReference: string;
  /** The number inside "PSS-1042". */
  projectNo: number;
  clientName: string;
  lines: DcLine[];
  subtotalCents: number;
  handlingFeeCents: number;
  oversizedFeeCents: number;
  dealerTotalCents: number;
};

export type ParseRefusal = {
  outcome: "no-costs" | "incomplete" | "unreadable" | "no-po";
  detail: string;
};

export type ParseResult = { ok: true; quote: DcQuote } | { ok: false; refusal: ParseRefusal };

export type ImportOutcome =
  | "imported" | "unchanged" | "no-po" | "no-match" | "no-costs" | "incomplete" | "unreadable" | "failed";
```

- [ ] **Step 4: Write the failing money tests** (`tests/dc/money.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { parseMoney, pctToBasisPoints, sellUnitCents } from "@/lib/dc/money";

describe("parseMoney", () => {
  it.each([
    ["655.00", 65500], ["1,619.00", 161900], ["0.01", 1], ["$2,309.00", 230900],
    ["-10.00", -1000], ["(10.00)", -1000], [" 336.67 ", 33667],
  ])("%s → %i cents", (text, cents) => expect(parseMoney(text)).toBe(cents));

  it.each(["", "abc", "1.5", "1,2,3.00x", "12"])("refuses %j", (text) => expect(parseMoney(text)).toBeNull());

  it("never goes through floating point (0.29 is 29, not 28.999…)", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("1,000,000.07")).toBe(100000007);
  });
});

describe("sellUnitCents", () => {
  it("is MSRP × pct, rounded half up to the cent", () => {
    expect(sellUnitCents(65500, 60)).toBe(39300);
    expect(sellUnitCents(230900, 55.5)).toBe(128150); // 128149.5 rounds up
    expect(sellUnitCents(20501, 100)).toBe(20501);
    expect(sellUnitCents(1, 50)).toBe(1); // 0.5 rounds up
  });
  it("uses basis points, so 57.3 is exactly 5730", () => {
    expect(pctToBasisPoints(57.3)).toBe(5730);
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/money.test.ts`
Expected: FAIL, "Cannot find module '@/lib/dc/money'".

- [ ] **Step 6: Implement `lib/dc/money.ts`**

```ts
/**
 * "1,619.00" → 161900. "(10.00)" and "-10.00" are negative (a promotion). Exactly two decimals
 * or null: a Dealer Copy always prints cents, so anything else means the format changed.
 * Digits are joined as strings, never multiplied as floats.
 */
export function parseMoney(text: string): number | null {
  const trimmed = text.replace(/[\s\u00a0$]/g, "");
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  const bare = trimmed.replace(/^\(|\)$/g, "").replace(/^-/, "").replace(/,/g, "");
  const match = /^(\d+)\.(\d{2})$/.exec(bare);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number(match[2]);
  return negative ? -cents : cents;
}

/** 57.3 → 5730. Percentages carry at most two decimals (numeric(6,2)). */
export const pctToBasisPoints = (pct: number): number => Math.round(pct * 100);

/** round-half-up(msrp × pct / 100), in integer arithmetic. */
export function sellUnitCents(msrpUnitCents: number, pct: number): number {
  return Math.floor((msrpUnitCents * pctToBasisPoints(pct) + 5000) / 10000);
}
```

- [ ] **Step 7: Run the money tests**

Run: `npx vitest run --maxWorkers=2 tests/dc/money.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the failing parser tests** (`tests/dc/parse.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDealerCopy } from "@/lib/dc/parse";

const ONE = readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8");
const FOUR = readFileSync("tests/fixtures/dc/dealer-copy-4-lines.html", "utf8");

const ok = (html: string) => {
  const result = parseDealerCopy(html);
  if (!result.ok) throw new Error(`refused: ${result.refusal.outcome} ${result.refusal.detail}`);
  return result.quote;
};

describe("parseDealerCopy — real 1-line copy", () => {
  const quote = ok(ONE);
  it("reads the header by label", () => {
    expect(quote.quoteNo).toBe("22250749");
    expect(quote.poReference).toBe("PSS-1042");
    expect(quote.projectNo).toBe(1042);
    expect(quote.clientName).toBe("Test");
  });
  it("reads every money field of the line in exact cents", () => {
    expect(quote.lines).toHaveLength(1);
    const [line] = quote.lines;
    expect(line).toMatchObject({
      position: 1, qty: 1, room: "Living Room", collection: "Duette",
      description: "Hunter Douglas Duette LiteRise Bottom-Up",
      baseCents: 65500, promotionCents: 0, optionsCents: 0, msrpUnitCents: 65500,
      costFactor: "0.4940", costUnitCents: 33667, costExtendedCents: 33667,
    });
  });
  it("keeps every option in order, entities decoded", () => {
    const [line] = quote.lines;
    expect(line.options[0]).toEqual(["Location", "Living Room"]);
    expect(line.options).toContainEqual(["Fabric Type", 'C22 - Architella Elan 3/4" Light Filtering']);
    expect(line.options.at(-1)).toEqual(["Mount Type", "Inside Mount"]);
  });
  it("reads the totals", () => {
    expect(quote).toMatchObject({
      subtotalCents: 33667, handlingFeeCents: 3300, oversizedFeeCents: 0, dealerTotalCents: 36967,
    });
  });
});

describe("parseDealerCopy — real 4-line copy", () => {
  const quote = ok(FOUR);
  it("adds options into MSRP (the motor is in Options)", () => {
    const silhouette = quote.lines[1];
    expect(silhouette).toMatchObject({ baseCents: 161900, optionsCents: 69000, msrpUnitCents: 230900 });
    // Cost is taken as printed, NOT 230900 × 0.494.
    expect(silhouette.costUnitCents).toBe(118683);
  });
  it("keeps fractional sizes as printed", () => {
    expect(quote.lines[1].options).toContainEqual(["Order Width", "48 1/2"]);
    expect(quote.lines[1].options).toContainEqual(["Order Height", "72 3/8"]);
  });
  it("reads qty 2 as per-unit money with extended = qty × unit", () => {
    const shutter = quote.lines[2];
    expect(shutter).toMatchObject({ qty: 2, msrpUnitCents: 48200, costUnitCents: 16533, costExtendedCents: 33066 });
    expect(shutter.collection).toBe("Palm Beach Shutters");
  });
  it("reads an accessory with no room", () => {
    const gateway = quote.lines[3];
    expect(gateway).toMatchObject({ room: "", collection: "Motorization", msrpUnitCents: 20501 });
  });
  it("drops *** notes and the square-foot summary", () => {
    for (const line of quote.lines) {
      expect(line.options.every(([label]) => !label.startsWith("***"))).toBe(true);
    }
    expect(quote.lines).toHaveLength(4);
  });
  it("reconciles: Σ extended = sub-total", () => {
    expect(quote.lines.reduce((sum, l) => sum + l.costExtendedCents, 0)).toBe(quote.subtotalCents);
  });
});

describe("parseDealerCopy — refusals", () => {
  it("no DEALER COSTS column → no-costs", () => {
    const html = ONE.replace("DEALER COSTS", "");
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "no-costs" } });
  });
  it("an *** Error line → incomplete, naming the item and the message", () => {
    // Synthetic: DC's real error row prints inside the options table, like its *** Information rows.
    const html = ONE.replace(
      "<tr><td>Mount Type:</td><td>Inside Mount</td></tr>",
      "<tr><td>Mount Type:</td><td>Inside Mount</td></tr><tr><td colspan=2>*** Error: L-Frame Cover Strip - is required ***</td></tr>",
    );
    const result = parseDealerCopy(html);
    expect(result).toMatchObject({ ok: false, refusal: { outcome: "incomplete" } });
    if (!result.ok) expect(result.refusal.detail).toBe("Line 1: L-Frame Cover Strip - is required");
  });
  it("totals that do not reconcile → unreadable (never import a figure that may be wrong)", () => {
    const html = ONE.replace(">369.67<", ">369.68<");
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "unreadable" } });
  });
  it("a PO that is not PSS-#### → no-po", () => {
    const html = ONE.replace("<td>PSS-1042</td>", "<td>852</td>");
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "no-po" } });
  });
  it("a page that is not a Dealer Copy → unreadable", () => {
    expect(parseDealerCopy("<html><body>hello</body></html>")).toMatchObject({ ok: false, refusal: { outcome: "unreadable" } });
  });
  it("trims the collection so 'Duette ' keys the same rule as 'Duette'", () => {
    const html = ONE.replace("<td>Collection:</td><td>Duette</td>", "<td>Collection:</td><td> Duette&nbsp;</td>");
    expect(ok(html).lines[0].collection).toBe("Duette");
  });
  it("a line with no Collection option → unreadable, naming the line", () => {
    const html = ONE.replace("<tr><td>Collection:</td><td>Duette</td></tr>", "");
    const result = parseDealerCopy(html);
    expect(result).toMatchObject({ ok: false, refusal: { outcome: "unreadable" } });
    if (!result.ok) expect(result.refusal.detail).toContain("Line 1");
  });
});
```

Before running, open the 1-line fixture and confirm the replaced substrings (`<tr><td>Mount Type:</td><td>Inside Mount</td></tr>`, `<td>Collection:</td><td>Duette</td>`, `<td>PSS-1042</td>`, `>369.67<`) occur exactly once each: `grep -o '<td>PSS-1042</td>' tests/fixtures/dc/dealer-copy-1-line.html | wc -l`. A replacement that matches nothing makes its test prove nothing. Add `expect(html).not.toBe(ONE)` in each refusal test.

- [ ] **Step 9: Run it and watch it fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/parse.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 10: Implement `lib/dc/parse.ts`**

```ts
import { parse, type HTMLElement } from "node-html-parser";
import { parseMoney } from "./money";
import type { DcLine, ParseResult } from "./types";

const clean = (text: string): string => text.replace(/[\s\u00a0]+/g, " ").trim();
const cells = (row: HTMLElement): HTMLElement[] =>
  row.childNodes.filter((n): n is HTMLElement => (n as HTMLElement).tagName === "TD");
const refuse = (outcome: "no-costs" | "incomplete" | "unreadable" | "no-po", detail: string): ParseResult =>
  ({ ok: false, refusal: { outcome, detail } });

const PO = /^PSS-(\d{4,})$/;
const ERROR = /\*\*\* Error: (.+?) \*\*\*/;

/**
 * Reads a Direct Connect Dealer Copy. Pure: no I/O. Scripts are never run and images never
 * fetched (node-html-parser only builds a tree). Everything is found by its printed label or
 * header text, never by position, because DC changes the columns with the report options.
 * The parser checks its own arithmetic against DC's printed totals and refuses on any
 * mismatch: a wrong price imported silently is worse than a refusal the owner can see.
 */
export function parseDealerCopy(html: string): ParseResult {
  const root = parse(html);
  const tds = root.querySelectorAll("td");
  const valueAfter = (label: string): string | null => {
    const cell = tds.find((td) => clean(td.text) === label);
    const next = cell?.nextElementSibling;
    return next ? clean(next.text) : null;
  };

  const quoteNo = valueAfter("Quote #:");
  const poReference = valueAfter("PO Reference:");
  if (!quoteNo || !/^\d+$/.test(quoteNo) || poReference === null) return refuse("unreadable", "No quote number or PO line");
  if (!tds.some((td) => clean(td.text) === "DEALER COSTS")) return refuse("no-costs", `Quote ${quoteNo}`);
  const po = PO.exec(poReference);
  if (!po) return refuse("no-po", `Quote ${quoteNo} has PO Reference "${poReference}"`);

  const rows = root.querySelectorAll("tr");
  const header = rows.find((row) => {
    const texts = cells(row).map((c) => clean(c.text));
    return texts.includes("Item") && texts.includes("Description");
  });
  if (!header) return refuse("unreadable", "No column header row");
  const heads = cells(header).map((c) => clean(c.text));
  const factorAt = heads.indexOf("Factor");
  const col = {
    item: heads.indexOf("Item"), qty: heads.indexOf("Qty"), description: heads.indexOf("Description"),
    base: heads.indexOf("Amt"), promotion: heads.indexOf("Promotion"), options: heads.indexOf("Options"),
    factor: factorAt, unit: heads.indexOf("Unit", factorAt), extended: heads.indexOf("Extended", factorAt),
  };
  if (Object.values(col).some((i) => i < 0)) return refuse("unreadable", `Missing a column in: ${heads.join(", ")}`);

  const lines: DcLine[] = [];
  for (const row of rows) {
    const c = cells(row);
    if (c.length <= col.extended) continue;
    const item = clean(c[col.item].text);
    const qtyText = clean(c[col.qty].text);
    if (!/^\d+$/.test(item) || !/^\d+$/.test(qtyText)) continue;
    const position = Number(item);

    const optionsRow = row.nextElementSibling;
    const optionsText = optionsRow ? clean(optionsRow.text) : "";
    const error = ERROR.exec(optionsText);
    if (error) return refuse("incomplete", `Line ${position}: ${error[1]}`);

    const options: [string, string][] = [];
    for (const optionRow of optionsRow?.querySelectorAll("tr") ?? []) {
      const pair = cells(optionRow);
      if (pair.length !== 2) continue;
      const label = clean(pair[0].text);
      if (!label.endsWith(":") || label.startsWith("***")) continue;
      options.push([label.slice(0, -1), clean(pair[1].text)]);
    }
    const option = (name: string) => options.find(([label]) => label === name)?.[1];
    const collection = option("Collection");
    if (!collection) return refuse("unreadable", `Line ${position} has no Collection`);

    const money = [col.base, col.promotion, col.options, col.unit, col.extended].map((i) => parseMoney(c[i].text));
    if (money.some((m) => m === null)) return refuse("unreadable", `Line ${position} has an unreadable amount`);
    const [baseCents, promotionCents, optionsCents, costUnitCents, costExtendedCents] = money as number[];
    const factor = clean(c[col.factor].text);

    lines.push({
      position, qty: Number(qtyText), room: option("Location") ?? "", description: clean(c[col.description].text),
      collection, baseCents, promotionCents, optionsCents,
      msrpUnitCents: baseCents + promotionCents + optionsCents,
      costFactor: /^\d+(\.\d+)?$/.test(factor) ? factor : null,
      costUnitCents, costExtendedCents, options,
    });
  }
  if (ERROR.test(clean(root.text))) return refuse("incomplete", "An error line that belongs to no product line");
  if (lines.length === 0) return refuse("unreadable", `Quote ${quoteNo} has no product lines`);

  const total = (label: string) => {
    const text = valueAfter(label);
    return text === null ? null : parseMoney(text);
  };
  const subtotalCents = total("Product Sub-Total");
  const handlingFeeCents = total("Handling Fees");
  const oversizedFeeCents = total("Oversized Fees") ?? 0;
  const dealerTotalCents = total("Dealer Total");
  if (subtotalCents === null || handlingFeeCents === null || dealerTotalCents === null) {
    return refuse("unreadable", `Quote ${quoteNo} totals are missing`);
  }
  const sumExtended = lines.reduce((sum, line) => sum + line.costExtendedCents, 0);
  if (sumExtended !== subtotalCents || subtotalCents + handlingFeeCents + oversizedFeeCents !== dealerTotalCents) {
    return refuse("unreadable", `Quote ${quoteNo} totals do not add up`);
  }

  return {
    ok: true,
    quote: {
      quoteNo, poReference, projectNo: Number(po[1]), clientName: valueAfter("Client:") ?? "",
      lines, subtotalCents, handlingFeeCents, oversizedFeeCents, dealerTotalCents,
    },
  };
}
```

- [ ] **Step 11: Run the parser tests**

Run: `npx vitest run --maxWorkers=2 tests/dc/parse.test.ts tests/dc/money.test.ts`
Expected: PASS.

If the 4-line fixture's Gateway line prints a blank Factor, `costFactor` is null; that's expected. If a 4-line assertion fails because DC prints differently from the printable view, **fix the parser against the real file, never the test's expected cents**. The cents in the test come from DC's own screen (Edit Products list, 2026-09-27).

- [ ] **Step 12: Prove the reconciliation guard has power**

Temporarily change `sumExtended !== subtotalCents ||` to `false ||`. Run the tests. The "do not reconcile" test must go red. Revert and run again: green.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json lib/dc tests/dc tests/fixtures/dc
git commit -m "feat: read a Direct Connect Dealer Copy into exact cents, refusing anything that doesn't add up"
```
(add the two trailer lines from Global Constraints)

---

### Task 2: Pricing, install choice, blockers and fingerprint (pure)

**Files:**
- Create: `lib/dc/pricing.ts`, `tests/dc/pricing.test.ts`

**Interfaces:**
- Consumes: `sellUnitCents` (Task 1), `SavedInstallQuote` from `lib/admin/install-quotes.ts` (fields `id`, `kind`, `totalCents`, `createdAt`)
- Produces:

```ts
export type PricingLine = { position: number; qty: number; collection: string; msrpUnitCents: number; costExtendedCents: number; pctOverride: number | null };
export type InstallChoice = { id: string; kind: "estimate" | "final"; totalCents: number; createdAt: Date };
export type PricingInput = {
  lines: PricingLine[]; rules: Record<string, number>;
  handlingFeeCents: number; oversizedFeeCents: number; dealerTotalCents: number;
  waiveHandling: boolean; install: InstallChoice | null; noInstall: boolean;
};
export type PricedLine = { position: number; pct: number | null; source: "rule" | "override" | "missing"; sellUnitCents: number | null; sellExtendedCents: number | null; marginCents: number | null };
export type PricedVersion = {
  lines: PricedLine[]; productsCents: number | null; handlingChargedCents: number; oversizedCents: number;
  installCents: number; installQuoteId: string | null; clientTotalCents: number | null;
  costCents: number; marginCents: number | null; waiveHandling: boolean; blockers: string[];
};
export function ruleFor(rules: Record<string, number>, collection: string): number | null;
export function priceVersion(input: PricingInput): PricedVersion;
export function pickInstallQuote(quotes: InstallChoice[]): InstallChoice | null;
export type SendContext = { hasTerms: boolean; isLatest: boolean; versionStatus: string; jobStatus: string; customerEmail: string | null };
export function sendBlockers(priced: PricedVersion, context: SendContext): string[];
export function pricingFingerprint(priced: PricedVersion): string;
```

- [ ] **Step 1: Write the failing tests** (`tests/dc/pricing.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { pickInstallQuote, priceVersion, pricingFingerprint, ruleFor, sendBlockers, type PricingInput } from "@/lib/dc/pricing";

const base: PricingInput = {
  lines: [
    { position: 1, qty: 1, collection: "Duette", msrpUnitCents: 65500, costExtendedCents: 33667, pctOverride: null },
    { position: 3, qty: 2, collection: "Palm Beach Shutters", msrpUnitCents: 48200, costExtendedCents: 33066, pctOverride: null },
  ],
  rules: { Duette: 60, "Palm Beach Shutters": 70 },
  handlingFeeCents: 6600, oversizedFeeCents: 0, dealerTotalCents: 73333,
  waiveHandling: false,
  install: { id: "i1", kind: "final", totalCents: 25000, createdAt: new Date("2026-09-26") },
  noInstall: false,
};
const OK_CONTEXT = { hasTerms: true, isLatest: true, versionStatus: "draft", jobStatus: "visit_booked", customerEmail: "a@b.com" };

describe("priceVersion", () => {
  it("prices each line at % of MSRP and totals products + handling + install", () => {
    const p = priceVersion(base);
    expect(p.lines.map((l) => [l.position, l.sellUnitCents, l.sellExtendedCents])).toEqual([[1, 39300, 39300], [3, 33740, 67480]]);
    expect(p.productsCents).toBe(106780);
    expect(p.clientTotalCents).toBe(106780 + 6600 + 25000);
    expect(p.costCents).toBe(73333);
    // Product margin excludes installation.
    expect(p.marginCents).toBe(106780 + 6600 - 73333);
    expect(p.blockers).toEqual([]);
  });
  it("waiving handling drops it from the client total only", () => {
    const p = priceVersion({ ...base, waiveHandling: true });
    expect(p.handlingChargedCents).toBe(0);
    expect(p.clientTotalCents).toBe(106780 + 25000);
    expect(p.costCents).toBe(73333);
  });
  it("an override beats the rule and is marked", () => {
    const p = priceVersion({ ...base, lines: [{ ...base.lines[0], pctOverride: 50 }] });
    expect(p.lines[0]).toMatchObject({ pct: 50, source: "override", sellUnitCents: 32750 });
  });
  it("a collection with no rule blocks, naming it once, and leaves totals unknown", () => {
    const p = priceVersion({ ...base, rules: { Duette: 60 } });
    expect(p.lines[1]).toMatchObject({ source: "missing", sellUnitCents: null });
    expect(p.productsCents).toBeNull();
    expect(p.clientTotalCents).toBeNull();
    expect(p.blockers).toEqual(["Set a markup for Palm Beach Shutters first."]);
  });
  it("finds a rule regardless of case and surrounding space", () => {
    expect(ruleFor({ Duette: 60 }, " duette ")).toBe(60);
    const p = priceVersion({ ...base, lines: [{ ...base.lines[0], collection: "DUETTE" }] });
    expect(p.lines[0].sellUnitCents).toBe(39300);
  });
  it("no install quote blocks unless 'No installation' is ticked", () => {
    expect(priceVersion({ ...base, install: null }).blockers).toEqual(["Save an installation price, or tick No installation."]);
    const p = priceVersion({ ...base, install: null, noInstall: true });
    expect(p.blockers).toEqual([]);
    expect(p.installCents).toBe(0);
  });
  it("oversized fees pass through to the client", () => {
    expect(priceVersion({ ...base, oversizedFeeCents: 1500 }).clientTotalCents).toBe(106780 + 6600 + 1500 + 25000);
  });
});

describe("pickInstallQuote", () => {
  const e = (id: string, kind: "estimate" | "final", day: string) => ({ id, kind, totalCents: 1, createdAt: new Date(day) });
  it("prefers the newest final over any estimate", () => {
    expect(pickInstallQuote([e("a", "estimate", "2026-09-27"), e("b", "final", "2026-09-20"), e("c", "final", "2026-09-25")])?.id).toBe("c");
  });
  it("falls back to the newest estimate, then null", () => {
    expect(pickInstallQuote([e("a", "estimate", "2026-09-20"), e("b", "estimate", "2026-09-25")])?.id).toBe("b");
    expect(pickInstallQuote([])).toBeNull();
  });
});

describe("sendBlockers", () => {
  const priced = priceVersion(base);
  it("is empty when everything is in place", () => expect(sendBlockers(priced, OK_CONTEXT)).toEqual([]));
  it.each([
    [{ hasTerms: false }, "Upload your contract terms in Settings first."],
    [{ isLatest: false }, "A newer version of this quote has arrived. Review that one."],
    [{ versionStatus: "sent" }, "This version has already been sent."],
    [{ jobStatus: "lost" }, "This job is marked Lost."],
    [{ customerEmail: null }, "Add the client's email address to the job first."],
    [{ customerEmail: "  " }, "Add the client's email address to the job first."],
  ])("%j blocks with a plain reason", (patch, reason) => {
    expect(sendBlockers(priced, { ...OK_CONTEXT, ...patch })).toContain(reason);
  });
});

describe("pricingFingerprint", () => {
  it("changes when any line price, the fee choice or the install changes", () => {
    const a = pricingFingerprint(priceVersion(base));
    expect(pricingFingerprint(priceVersion({ ...base, rules: { ...base.rules, Duette: 61 } }))).not.toBe(a);
    expect(pricingFingerprint(priceVersion({ ...base, waiveHandling: true }))).not.toBe(a);
    expect(pricingFingerprint(priceVersion({ ...base, install: { ...base.install!, id: "i2" } }))).not.toBe(a);
    expect(pricingFingerprint(priceVersion(base))).toBe(a);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/pricing.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/dc/pricing.ts`**

```ts
import { sellUnitCents } from "./money";

// (paste the exported types from this task's Interfaces block here, verbatim)

const key = (collection: string) => collection.trim().toLowerCase();

export function ruleFor(rules: Record<string, number>, collection: string): number | null {
  const wanted = key(collection);
  for (const [name, pct] of Object.entries(rules)) if (key(name) === wanted) return pct;
  return null;
}

/**
 * The whole price of one quote version. Pure, and the only place a sell price is computed:
 * the review screen, the Send action's recomputation and the contract all call this.
 */
export function priceVersion(input: PricingInput): PricedVersion {
  const missing = new Set<string>();
  const lines: PricedLine[] = input.lines.map((line) => {
    const rule = ruleFor(input.rules, line.collection);
    const pct = line.pctOverride ?? rule;
    if (pct === null) {
      missing.add(line.collection.trim());
      return { position: line.position, pct: null, source: "missing", sellUnitCents: null, sellExtendedCents: null, marginCents: null };
    }
    const unit = sellUnitCents(line.msrpUnitCents, pct);
    const extended = unit * line.qty;
    return {
      position: line.position, pct, source: line.pctOverride === null ? "rule" : "override",
      sellUnitCents: unit, sellExtendedCents: extended, marginCents: extended - line.costExtendedCents,
    };
  });

  const blockers = [...missing].map((name) => `Set a markup for ${name} first.`);
  if (!input.install && !input.noInstall) blockers.push("Save an installation price, or tick No installation.");

  const handlingChargedCents = input.waiveHandling ? 0 : input.handlingFeeCents;
  const install = input.noInstall ? null : input.install;
  const installCents = install?.totalCents ?? 0;
  const productsCents = missing.size > 0 ? null : lines.reduce((sum, l) => sum + (l.sellExtendedCents ?? 0), 0);
  const clientTotalCents = productsCents === null ? null : productsCents + handlingChargedCents + input.oversizedFeeCents + installCents;
  return {
    lines, productsCents, handlingChargedCents, oversizedCents: input.oversizedFeeCents,
    installCents, installQuoteId: install?.id ?? null, clientTotalCents,
    costCents: input.dealerTotalCents,
    marginCents: clientTotalCents === null ? null : clientTotalCents - installCents - input.dealerTotalCents,
    waiveHandling: input.waiveHandling, blockers,
  };
}

/** The newest final install price, else the newest estimate. */
export function pickInstallQuote(quotes: InstallChoice[]): InstallChoice | null {
  const newest = (kind: InstallChoice["kind"]) =>
    quotes.filter((q) => q.kind === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  return newest("final") ?? newest("estimate");
}

export function sendBlockers(priced: PricedVersion, context: SendContext): string[] {
  const reasons = [...priced.blockers];
  if (!context.hasTerms) reasons.push("Upload your contract terms in Settings first.");
  if (!context.isLatest) reasons.push("A newer version of this quote has arrived. Review that one.");
  if (context.versionStatus !== "draft") reasons.push("This version has already been sent.");
  if (context.jobStatus === "lost") reasons.push("This job is marked Lost.");
  if (!context.customerEmail?.trim()) reasons.push("Add the client's email address to the job first.");
  return reasons;
}

/** Every figure the client will be charged, so a change to any of them changes the fingerprint. */
export function pricingFingerprint(p: PricedVersion): string {
  return JSON.stringify({
    lines: p.lines.map((l) => [l.position, l.pct, l.sellUnitCents, l.sellExtendedCents]),
    handling: p.handlingChargedCents, waive: p.waiveHandling, oversized: p.oversizedCents,
    install: [p.installQuoteId, p.installCents], total: p.clientTotalCents,
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/dc/pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dc/pricing.ts tests/dc/pricing.test.ts
git commit -m "feat: price a DC quote at % of MSRP with fee, install and plain send blockers"
```

---

### Task 3: Migration 024, identical checks, doc types, event kind

**Files:**
- Create: `db/migrations/024_dc_quote_import.sql`, `tests/db/migration-024.test.ts`
- Modify: `db/migrations/003_measure_and_files.sql`, `004_referrals_reviews.sql`, `011_stages_contact_log.sql`, `019_service_requests.sql`, `021_contract_signing.sql` (kind check), `016_project_page.sql`, `021_contract_signing.sql` (doc_type check), `tests/db/migration-021.test.ts`, `lib/admin/doc-types.ts`, `lib/admin/jobs.ts` (`JobEvent.kind`)

**Interfaces:**
- Produces:
  - the tables `ingested_messages`, `dc_quote_versions`, `dc_quote_lines`, `markup_rules`, `dc_settings`
  - `DEALER_COPY` and `StoredDocType` from `lib/admin/doc-types.ts`
  - `JobEvent.kind` gains `"quote"`

- [ ] **Step 1: Write the failing migration test** (`tests/db/migration-024.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/024_dc_quote_import.sql", "utf8");
const statements = source.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));

describe("migration 024", () => {
  it("never puts a semicolon inside a comment (migrate.mjs splits on ;)", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
  it("adds dealer_copy to the doc_type check, keeping every earlier type", () => {
    const check = find("add constraint job_files_doc_type_check");
    for (const t of ["quote", "po", "invoice", "other", "contract", "dealer_copy"]) expect(check).toContain(`'${t}'`);
  });
  it("adds quote to the kind check, keeping every earlier kind", () => {
    const check = find("add constraint job_events_kind_check");
    for (const k of ["stage", "note", "edit", "email", "reward", "measure", "file", "contact", "message", "service", "signature", "quote"]) {
      expect(check).toContain(`'${k}'`);
    }
  });
  it("makes the database refuse to share a Dealer Copy", () => {
    expect(find("add constraint job_files_dealer_copy_never_shared")).toContain("doc_type is distinct from 'dealer_copy' or shared_at is null");
  });
  it("drops every constraint before re-adding it", () => {
    for (const name of ["job_files_doc_type_check", "job_events_kind_check", "job_files_dealer_copy_never_shared"]) {
      const drop = statements.findIndex((s) => s.includes(`drop constraint if exists ${name}`));
      const add = statements.findIndex((s) => s.includes(`add constraint ${name}`));
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(add).toBeGreaterThan(drop);
    }
  });
  it("keys the message log on the RFC Message-ID and limits outcomes", () => {
    const table = find("create table if not exists ingested_messages");
    expect(table).toContain("message_id text primary key");
    expect(table).toContain("'imported','unchanged','no-po','no-match','no-costs','incomplete','unreadable','failed'");
  });
  it("numbers versions per job, uniquely", () => {
    expect(find("create table if not exists dc_quote_versions")).toContain("unique (lead_id, version)");
  });
  it("stores money as integer cents", () => {
    const lines = find("create table if not exists dc_quote_lines")!;
    for (const c of ["msrp_unit_cents integer not null", "cost_unit_cents integer not null", "cost_extended_cents integer not null"]) {
      expect(lines).toContain(c);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-024.test.ts`
Expected: FAIL, ENOENT.

- [ ] **Step 3: Write `db/migrations/024_dc_quote_import.sql`**

```sql
-- Direct Connect quote import (spec docs/superpowers/specs/2026-09-27-dc-quote-import-design.md)
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments.

create table if not exists ingested_messages (
  message_id   text primary key,
  received_at  timestamptz not null,
  processed_at timestamptz not null default now(),
  outcome      text not null check (outcome in ('imported','unchanged','no-po','no-match','no-costs','incomplete','unreadable','failed')),
  lead_id      uuid references leads(id) on delete set null,
  dc_quote_no  text,
  detail       text
);

create table if not exists dc_quote_versions (
  id                    uuid primary key,
  lead_id               uuid not null references leads(id) on delete cascade,
  version               integer not null check (version > 0),
  dc_quote_no           text not null,
  po_reference          text not null,
  source_file_id        uuid not null references job_files(id),
  source_sha256         text not null,
  message_id            text references ingested_messages(message_id),
  status                text not null check (status in ('draft','sent','signed','superseded')),
  dealer_subtotal_cents integer not null,
  handling_fee_cents    integer not null,
  oversized_fee_cents   integer not null,
  dealer_total_cents    integer not null,
  waive_handling        boolean not null default false,
  no_install            boolean not null default false,
  install_quote_id      uuid references install_quotes(id),
  install_cents         integer,
  products_cents        integer,
  client_total_cents    integer,
  contract_file_id      uuid references job_files(id),
  sent_at               timestamptz,
  sent_by               text,
  signed_at             timestamptz,
  created_at            timestamptz not null default now(),
  unique (lead_id, version)
);

create index if not exists dc_quote_versions_contract_idx on dc_quote_versions (contract_file_id);

create table if not exists dc_quote_lines (
  version_id          uuid not null references dc_quote_versions(id) on delete cascade,
  position            integer not null,
  qty                 integer not null check (qty > 0),
  room                text not null default '',
  description         text not null,
  collection          text not null,
  base_cents          integer not null,
  promotion_cents     integer not null,
  options_cents       integer not null,
  msrp_unit_cents     integer not null,
  cost_factor         numeric(6,4),
  cost_unit_cents     integer not null,
  cost_extended_cents integer not null,
  options             jsonb not null,
  pct_override        numeric(6,2) check (pct_override is null or pct_override > 0),
  markup_pct          numeric(6,2),
  sell_unit_cents     integer,
  markup_overridden   boolean not null default false,
  primary key (version_id, position)
);

create table if not exists markup_rules (
  collection  text primary key,
  pct_of_msrp numeric(6,2) not null check (pct_of_msrp > 0 and pct_of_msrp <= 1000),
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table if not exists dc_settings (
  id                  boolean primary key default true check (id),
  terms_file_pathname text,
  terms_updated_by    text,
  terms_updated_at    timestamptz,
  last_polled_at      timestamptz
);

insert into dc_settings (id) values (true) on conflict (id) do nothing;

-- Every migration that defines job_files_doc_type_check lists the CURRENT FULL set of types
alter table job_files drop constraint if exists job_files_doc_type_check;

alter table job_files add constraint job_files_doc_type_check check (
  doc_type is null or doc_type in ('quote','po','invoice','other','contract','dealer_copy')
);

-- A Dealer Copy shows dealer cost, so the database itself refuses to share one
alter table job_files drop constraint if exists job_files_dealer_copy_never_shared;

alter table job_files add constraint job_files_dealer_copy_never_shared check (
  doc_type is distinct from 'dealer_copy' or shared_at is null
);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote')
);
```

The spec's draft-time choices `waive_handling`, `no_install` and `pct_override` are stored columns, so a draft remembers them between visits. Frozen values are written at send (Task 8).

- [ ] **Step 4: Make every earlier definition identical**

In `003_measure_and_files.sql`, `004_referrals_reviews.sql`, `011_stages_contact_log.sql`, `019_service_requests.sql` and `021_contract_signing.sql`, replace the kind list line with:

```sql
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote')
```

In `016_project_page.sql` and `021_contract_signing.sql`, replace the doc_type line with:

```sql
  doc_type is null or doc_type in ('quote','po','invoice','other','contract','dealer_copy')
```

`job_files_dealer_copy_never_shared` is defined only in 024. **Why the old files change:** migrate.mjs re-runs 016 and 021 after 024 exists, and a narrower list would then fail on any row holding `dealer_copy` (the precedent is commit 495591b).

In `tests/db/migration-021.test.ts`, add `"dealer_copy"` to the doc-type array and `"quote"` to the kind array of its two list tests. They assert a floor, so adding keeps their meaning.

- [ ] **Step 5: Doc types and event kind**

`lib/admin/doc-types.ts`: append (do **not** add to `DOC_TYPES`, which is the owner's menu):

```ts
/**
 * Set only by the Direct Connect import, never by an owner: the menu (DOC_TYPES) never offers it,
 * setDocType refuses it, and the database refuses to share it (job_files_dealer_copy_never_shared).
 */
export const DEALER_COPY = "dealer_copy" as const;
export type StoredDocType = DocType | typeof DEALER_COPY;

export const storedDocTypeLabel = (type: StoredDocType): string =>
  type === DEALER_COPY ? "Dealer copy (internal)" : docTypeLabel(type);
```

`lib/admin/files.ts`: change `JobFile.docType?: DocType | null` to `StoredDocType | null` and `toFile`'s cast to `StoredDocType | null`.

`lib/admin/jobs.ts`: add `| "quote"` to `JobEvent.kind`.

Run `npm run typecheck`. Fix every error it reports. Expect callers passing `file.docType` to `docTypeLabel` to switch to `storedDocTypeLabel`, and `DocTypeSelect` to need only its prop type widened.

- [ ] **Step 6: Run the migration and consistency tests**

Run: `npx vitest run --maxWorkers=2 tests/db`
Expected: PASS, including `migration-checks-consistent`.

Power check: change one old file's list back, see `migration-checks-consistent` go red, then revert.

- [ ] **Step 7: Apply to a Neon test branch twice**

Follow memory `pss-production-migrations`: a test branch only, never production, and never print the URL.

```bash
MIGRATE_DATABASE_URL="$E2E_POSTGRES_URL" node scripts/migrate.mjs
MIGRATE_DATABASE_URL="$E2E_POSTGRES_URL" node scripts/migrate.mjs
```

Expected: both runs succeed (idempotence). If `E2E_POSTGRES_URL` isn't set, stop and ask the controller for a Neon test branch. Don't skip this step.

- [ ] **Step 8: Commit**

```bash
git add db/migrations lib/admin/doc-types.ts lib/admin/files.ts lib/admin/jobs.ts tests/db app lib
git commit -m "feat: migration 024 for DC quote versions, lines, markup rules and an unshareable Dealer Copy"
```

---

### Task 4: Files — store a Dealer Copy, never share it, serve it sandboxed

**Files:**
- Modify: `lib/admin/files.ts` (`createFile`, `setShared`, `setDocType`), `app/admin/files/[fileId]/route.ts`, `app/admin/jobs/[id]/JobFiles.tsx`
- Test: `tests/admin/files-dealer-copy.test.ts`
- Modify: `scripts/verify-share-guard.ts` (add the DB-level case)

**Interfaces:**
- Produces: `createFile({ ..., docType?: StoredDocType })`. Existing callers are unchanged; `docType` defaults to null.

- [ ] **Step 1: Write the failing tests** (`tests/admin/files-dealer-copy.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn().mockResolvedValue(undefined), get: vi.fn() }));
const files = await import("@/lib/admin/files");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
beforeEach(() => sql.mockReset());

describe("createFile with a doc type", () => {
  it("writes the doc type in the same insert", async () => {
    sql.mockResolvedValueOnce([{ id: JOB }]).mockResolvedValueOnce([{ id: FILE, lead_id: JOB, created_at: new Date(), size_bytes: 1, doc_type: "dealer_copy" }]);
    await files.createFile({ leadId: JOB, kind: "document", name: "DEALER COPY 1.html", contentType: "text/html",
      body: new Blob(["x"]), actor: "Direct Connect", docType: "dealer_copy" });
    const insert = sql.mock.calls[1];
    expect(text(insert)).toContain("doc_type");
    expect(insert).toContain("dealer_copy");
  });
});

describe("setShared", () => {
  it("never matches a Dealer Copy, even before the database check", async () => {
    sql.mockResolvedValue([]);
    await files.setShared(JOB, FILE, true, "o@x.com");
    expect(text(sql.mock.calls[0])).toContain("doc_type is distinct from 'dealer_copy'");
  });
});

describe("setDocType", () => {
  it("never relabels a Dealer Copy", async () => {
    sql.mockResolvedValue([]);
    await files.setDocType(JOB, FILE, "quote", "o@x.com");
    expect(text(sql.mock.calls[0])).toContain("doc_type is distinct from 'dealer_copy'");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/files-dealer-copy.test.ts`
Expected: 3 FAIL.

- [ ] **Step 3: Implement**

In `createFile`, add `docType?: StoredDocType` to the input type. Change the insert to:

```ts
        insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
        values (${id}, ${input.leadId}, ${input.actor}, ${input.kind}, ${input.name},
                ${input.contentType}, ${input.body.size}, ${pathname}, ${input.docType ?? null})
```

In `setShared`'s `where`, after `and kind in ('photo','document')`, add:

```sql
        and doc_type is distinct from 'dealer_copy'
```

In `setDocType`'s `where`, after `and kind = 'document'`, add the same line.

Existing tests that pin `createFile`'s bind order (`grep -rn "createFile" tests`) gain one trailing `null`. Update them.

- [ ] **Step 4: Serve a Dealer Copy sandboxed**

In `app/admin/files/[fileId]/route.ts`, build headers so that a `dealer_copy` gets `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`. That blocks scripts and the tracking image, while styles still render.

```ts
  const headers: Record<string, string> = {
    "Content-Type": content.contentType,
    "Cache-Control": "private, no-store",
    "Content-Disposition": contentDisposition(file.name),
    "X-Content-Type-Options": "nosniff",
  };
  // A Dealer Copy is HTML written by a third party: render it inert on our origin.
  if (file.docType === "dealer_copy") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  return new Response(content.stream, { headers });
```

Add a test to the route's existing test file if one exists (`grep -rln "admin/files/\[fileId\]" tests`). Otherwise create `tests/admin/file-route-dealer-copy.test.ts`, mocking `requireAdmin`, `getFile` and `readFile`, and asserting the CSP header for `dealer_copy` and its absence for `contract`.

- [ ] **Step 5: JobFiles shows a Dealer Copy as internal, with no share or type controls**

In `JobFiles.tsx`, where a document row renders `{file.signed ? <SignedLabel /> : (...DocTypeSelect...ShareSwitch...)}`, render first:

```tsx
{file.docType === "dealer_copy" ? (
  <span className="text-sm text-ink-soft">Dealer copy · internal, never shared</span>
) : file.signed ? <SignedLabel /> : ( /* existing controls unchanged */ )}
```

- [ ] **Step 6: Extend the real-DB share guard**

In `scripts/verify-share-guard.ts`, add a case: insert a `job_files` row with `doc_type='dealer_copy'`. Assert that `setShared(job, file, true)` returns false and `shared_at` stays null. Then assert that a raw `update job_files set shared_at = now() where id = …` **throws** a check violation. That proves the database, not our code, is the guard. Run it against the Neon test branch as its header documents. If there's no branch, report this step **unverified**.

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/admin && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/admin/files.ts app/admin/files app/admin/jobs/[id]/JobFiles.tsx scripts/verify-share-guard.ts tests/admin
git commit -m "feat: a Dealer Copy is stored internal-only, can never be shared, and renders inert"
```

---

### Task 5: Store — the SQL for versions, lines, rules, settings

**Files:**
- Create: `lib/dc/store.ts`, `tests/dc/store.test.ts`

**Interfaces:**
- Consumes: `DcQuote`, `ImportOutcome` (Task 1), the tables (Task 3)
- Produces:

```ts
export type StoredLine = DcLine & { pctOverride: number | null; markupPct: number | null; sellUnitCents: number | null; markupOverridden: boolean };
export type StoredVersion = {
  id: string; leadId: string; version: number; dcQuoteNo: string; poReference: string;
  sourceFileId: string; sourceSha256: string; status: "draft" | "sent" | "signed" | "superseded";
  subtotalCents: number; handlingFeeCents: number; oversizedFeeCents: number; dealerTotalCents: number;
  waiveHandling: boolean; noInstall: boolean;
  installQuoteId: string | null; installCents: number | null; productsCents: number | null; clientTotalCents: number | null;
  contractFileId: string | null; sentAt: Date | null; signedAt: Date | null; createdAt: Date; lines: StoredLine[];
};
export function isProcessed(messageId: string): Promise<boolean>;
export function recordOutcome(input: { messageId: string; receivedAt: Date; outcome: ImportOutcome; leadId: string | null; dcQuoteNo: string | null; detail: string | null }): Promise<void>;
export function findJobByProjectNo(projectNo: number): Promise<{ id: string; name: string; projectNo: number } | null>;
export function latestSha(leadId: string): Promise<string | null>;
export function importVersion(input: { messageId: string; receivedAt: Date; leadId: string; quote: DcQuote; sourceFileId: string; sha256: string; actor: string }): Promise<{ versionId: string; version: number } | null>;
export function listVersions(leadId: string): Promise<StoredVersion[]>; // newest first, with lines
export function setLineOverride(leadId: string, versionId: string, position: number, pct: number | null, actor: string): Promise<boolean>;
export function setVersionChoices(leadId: string, versionId: string, choices: { waiveHandling?: boolean; noInstall?: boolean }): Promise<boolean>;
export function listMarkupRules(): Promise<Record<string, number>>;
export function listSeenCollections(): Promise<string[]>;
export function saveMarkupRule(collection: string, pct: number | null, actor: string): Promise<void>;
export type DcSettings = { termsPathname: string | null; termsUpdatedAt: Date | null; lastPolledAt: Date | null };
export function getDcSettings(): Promise<DcSettings>;
export function saveTermsPathname(pathname: string, actor: string): Promise<string | null>; // returns the previous pathname
export function setLastPolledAt(at: Date): Promise<void>;
```

- [ ] **Step 1: Write the failing tests** (`tests/dc/store.test.ts`), following the db-mock pattern of `tests/admin/install-quotes.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseDealerCopy } from "@/lib/dc/parse";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/dc/store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const parsed = parseDealerCopy(readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8"));
if (!parsed.ok) throw new Error("fixture must parse");

beforeEach(() => sql.mockReset());

describe("importVersion", () => {
  it("writes the message, version, lines and event in ONE statement", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    const result = await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB,
      quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    expect(result).toEqual({ versionId: "v1", version: 1 });
    expect(sql).toHaveBeenCalledTimes(1);
    const statement = text(sql.mock.calls[0]);
    for (const part of ["insert into ingested_messages", "on conflict (message_id) do nothing",
      "insert into dc_quote_versions", "insert into dc_quote_lines", "jsonb_to_recordset", "insert into job_events", "'quote'"]) {
      expect(statement).toContain(part);
    }
  });
  it("sends the lines as one JSON document with exact cents and options", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    const json = sql.mock.calls[0].slice(1).find((v) => typeof v === "string" && v.startsWith("[{"));
    const [line] = JSON.parse(json as string);
    expect(line).toMatchObject({ position: 1, qty: 1, msrp_unit_cents: 65500, cost_extended_cents: 33667, collection: "Duette" });
    expect(line.options[0]).toEqual(["Location", "Living Room"]);
  });
  it("answers null when the message was already imported (the statement inserted nothing)", async () => {
    sql.mockResolvedValue([]);
    expect(await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" })).toBeNull();
  });
});

describe("setLineOverride / setVersionChoices", () => {
  it("only touches a draft of this job", async () => {
    sql.mockResolvedValue([{ position: 1 }]);
    await store.setLineOverride(JOB, "v1", 1, 55, "o@x.com");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("status = 'draft'");
    expect(s).toContain("lead_id =");
    sql.mockClear();
    await store.setVersionChoices(JOB, "v1", { waiveHandling: true });
    expect(text(sql.mock.calls[0])).toContain("status = 'draft'");
  });
  it("refuses a percentage outside 0–1000 without touching the database", async () => {
    await expect(store.setLineOverride(JOB, "v1", 1, 0, "o@x.com")).resolves.toBe(false);
    await expect(store.setLineOverride(JOB, "v1", 1, 1000.01, "o@x.com")).resolves.toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("saveMarkupRule", () => {
  it("trims the collection and upserts, or deletes for null", async () => {
    sql.mockResolvedValue([]);
    await store.saveMarkupRule("  Duette ", 60, "o@x.com");
    expect(text(sql.mock.calls[0])).toContain("on conflict (collection) do update");
    expect(sql.mock.calls[0]).toContain("Duette");
    await store.saveMarkupRule("Duette", null, "o@x.com");
    expect(text(sql.mock.calls[1])).toContain("delete from markup_rules");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/dc/store.ts`**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { DcLine, DcQuote, ImportOutcome } from "./types";

// (the exported types from this task's Interfaces block, verbatim)

const validPct = (pct: number) => Number.isFinite(pct) && pct > 0 && pct <= 1000 && Math.round(pct * 100) === pct * 100;

export async function isProcessed(messageId: string): Promise<boolean> {
  const rows = await db()`select 1 from ingested_messages where message_id = ${messageId}`;
  return rows.length > 0;
}

/** Records a non-imported outcome. A second record for the same message is a no-op. */
export async function recordOutcome(input: { messageId: string; receivedAt: Date; outcome: ImportOutcome; leadId: string | null; dcQuoteNo: string | null; detail: string | null }): Promise<void> {
  await db()`
    insert into ingested_messages (message_id, received_at, outcome, lead_id, dc_quote_no, detail)
    values (${input.messageId}, ${input.receivedAt}, ${input.outcome}, ${input.leadId}, ${input.dcQuoteNo}, ${input.detail})
    on conflict (message_id) do nothing`;
}

export async function findJobByProjectNo(projectNo: number) {
  const rows = await db()`select id, name, project_no from leads where project_no = ${projectNo}`;
  return rows[0] ? { id: rows[0].id as string, name: rows[0].name as string, projectNo: Number(rows[0].project_no) } : null;
}

export async function latestSha(leadId: string): Promise<string | null> {
  const rows = await db()`select source_sha256 from dc_quote_versions where lead_id = ${leadId} order by version desc limit 1`;
  return (rows[0]?.source_sha256 as string | undefined) ?? null;
}

/**
 * One statement: the message record, the version (numbered max+1 for the job), every line and
 * the timeline event. If the message was already recorded, `on conflict do nothing` returns no
 * row from `msg`, so nothing else is written and this answers null.
 */
export async function importVersion(input: { messageId: string; receivedAt: Date; leadId: string; quote: DcQuote; sourceFileId: string; sha256: string; actor: string }) {
  const q = input.quote;
  const lines = JSON.stringify(q.lines.map((l) => ({
    position: l.position, qty: l.qty, room: l.room, description: l.description, collection: l.collection,
    base_cents: l.baseCents, promotion_cents: l.promotionCents, options_cents: l.optionsCents,
    msrp_unit_cents: l.msrpUnitCents, cost_factor: l.costFactor, cost_unit_cents: l.costUnitCents,
    cost_extended_cents: l.costExtendedCents, options: l.options,
  })));
  const rows = await db()`
    with msg as (
      insert into ingested_messages (message_id, received_at, outcome, lead_id, dc_quote_no)
      values (${input.messageId}, ${input.receivedAt}, 'imported', ${input.leadId}, ${q.quoteNo})
      on conflict (message_id) do nothing
      returning message_id
    ),
    version as (
      insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256,
        message_id, status, dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, ${input.leadId},
        coalesce((select max(version) from dc_quote_versions where lead_id = ${input.leadId}), 0) + 1,
        ${q.quoteNo}, ${q.poReference}, ${input.sourceFileId}, ${input.sha256}, msg.message_id, 'draft',
        ${q.subtotalCents}, ${q.handlingFeeCents}, ${q.oversizedFeeCents}, ${q.dealerTotalCents}
      from msg
      returning id, lead_id, version
    ),
    inserted as (
      insert into dc_quote_lines (version_id, position, qty, room, description, collection, base_cents, promotion_cents,
        options_cents, msrp_unit_cents, cost_factor, cost_unit_cents, cost_extended_cents, options)
      select version.id, l.position, l.qty, l.room, l.description, l.collection, l.base_cents, l.promotion_cents,
        l.options_cents, l.msrp_unit_cents, l.cost_factor, l.cost_unit_cents, l.cost_extended_cents, l.options
      from version, jsonb_to_recordset(${lines}::jsonb) as l(position int, qty int, room text, description text,
        collection text, base_cents int, promotion_cents int, options_cents int, msrp_unit_cents int,
        cost_factor numeric, cost_unit_cents int, cost_extended_cents int, options jsonb)
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'quote', ${`Direct Connect quote ${q.quoteNo} arrived as version `} || version from version
    )
    select id, version from version`;
  return rows[0] ? { versionId: rows[0].id as string, version: Number(rows[0].version) } : null;
}

const toLine = (r: Record<string, unknown>): StoredLine => ({
  position: Number(r.position), qty: Number(r.qty), room: r.room as string, description: r.description as string,
  collection: r.collection as string, baseCents: Number(r.base_cents), promotionCents: Number(r.promotion_cents),
  optionsCents: Number(r.options_cents), msrpUnitCents: Number(r.msrp_unit_cents),
  costFactor: r.cost_factor === null ? null : String(r.cost_factor), costUnitCents: Number(r.cost_unit_cents),
  costExtendedCents: Number(r.cost_extended_cents), options: r.options as [string, string][],
  pctOverride: r.pct_override === null ? null : Number(r.pct_override),
  markupPct: r.markup_pct === null ? null : Number(r.markup_pct),
  sellUnitCents: r.sell_unit_cents === null ? null : Number(r.sell_unit_cents),
  markupOverridden: r.markup_overridden === true,
});

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const date = (v: unknown) => (v ? new Date(v as string) : null);

export async function listVersions(leadId: string): Promise<StoredVersion[]> {
  if (!isUuid(leadId)) return [];
  const versions = await db()`select * from dc_quote_versions where lead_id = ${leadId} order by version desc`;
  if (versions.length === 0) return [];
  const ids = versions.map((v) => v.id as string);
  const lines = await db()`select * from dc_quote_lines where version_id = any(${ids}) order by position`;
  return versions.map((v) => ({
    id: v.id as string, leadId: v.lead_id as string, version: Number(v.version), dcQuoteNo: v.dc_quote_no as string,
    poReference: v.po_reference as string, sourceFileId: v.source_file_id as string, sourceSha256: v.source_sha256 as string,
    status: v.status as StoredVersion["status"], subtotalCents: Number(v.dealer_subtotal_cents),
    handlingFeeCents: Number(v.handling_fee_cents), oversizedFeeCents: Number(v.oversized_fee_cents),
    dealerTotalCents: Number(v.dealer_total_cents), waiveHandling: v.waive_handling === true, noInstall: v.no_install === true,
    installQuoteId: (v.install_quote_id as string | null) ?? null, installCents: num(v.install_cents),
    productsCents: num(v.products_cents), clientTotalCents: num(v.client_total_cents),
    contractFileId: (v.contract_file_id as string | null) ?? null, sentAt: date(v.sent_at), signedAt: date(v.signed_at),
    createdAt: new Date(v.created_at as string),
    lines: lines.filter((l) => l.version_id === v.id).map(toLine),
  }));
}

export async function setLineOverride(leadId: string, versionId: string, position: number, pct: number | null, actor: string): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(versionId) || !Number.isInteger(position)) return false;
  if (pct !== null && !validPct(pct)) return false;
  const rows = await db()`
    with changed as (
      update dc_quote_lines set pct_override = ${pct}
      where version_id = ${versionId} and position = ${position}
        and version_id in (select id from dc_quote_versions where id = ${versionId} and lead_id = ${leadId} and status = 'draft')
      returning position
    )
    insert into job_events (lead_id, actor, kind, body)
    select ${leadId}, ${actor}, 'quote', ${pct === null ? `Line ${position}: back to the Settings markup` : `Line ${position}: ${pct}% of MSRP`} from changed
    returning id`;
  return rows.length > 0;
}

export async function setVersionChoices(leadId: string, versionId: string, choices: { waiveHandling?: boolean; noInstall?: boolean }): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(versionId)) return false;
  const rows = await db()`
    update dc_quote_versions set
      waive_handling = coalesce(${choices.waiveHandling ?? null}::boolean, waive_handling),
      no_install = coalesce(${choices.noInstall ?? null}::boolean, no_install)
    where id = ${versionId} and lead_id = ${leadId} and status = 'draft'
    returning id`;
  return rows.length > 0;
}

export async function listMarkupRules(): Promise<Record<string, number>> {
  const rows = await db()`select collection, pct_of_msrp from markup_rules`;
  return Object.fromEntries(rows.map((r) => [r.collection as string, Number(r.pct_of_msrp)]));
}

/** Every collection any imported quote has used, plus every ruled one, sorted. */
export async function listSeenCollections(): Promise<string[]> {
  const rows = await db()`
    select collection from markup_rules
    union select distinct trim(collection) from dc_quote_lines
    order by 1`;
  return rows.map((r) => r.collection as string);
}

export async function saveMarkupRule(collection: string, pct: number | null, actor: string): Promise<void> {
  const name = collection.trim();
  if (!name) throw new Error("A product line needs a name");
  if (pct === null) {
    await db()`delete from markup_rules where lower(collection) = lower(${name})`;
    return;
  }
  if (!validPct(pct)) throw new Error("Enter a percentage between 0.01 and 1000");
  await db()`
    insert into markup_rules (collection, pct_of_msrp, updated_by, updated_at)
    values (${name}, ${pct}, ${actor}, now())
    on conflict (collection) do update set pct_of_msrp = excluded.pct_of_msrp, updated_by = excluded.updated_by, updated_at = now()`;
}

export async function getDcSettings(): Promise<DcSettings> {
  const [row] = await db()`select terms_file_pathname, terms_updated_at, last_polled_at from dc_settings where id`;
  return {
    termsPathname: (row?.terms_file_pathname as string | null) ?? null,
    termsUpdatedAt: date(row?.terms_updated_at), lastPolledAt: date(row?.last_polled_at),
  };
}

export async function saveTermsPathname(pathname: string, actor: string): Promise<string | null> {
  const rows = await db()`
    with prev as (select terms_file_pathname from dc_settings where id)
    update dc_settings set terms_file_pathname = ${pathname}, terms_updated_by = ${actor}, terms_updated_at = now()
    where id returning (select terms_file_pathname from prev) as previous`;
  return (rows[0]?.previous as string | null) ?? null;
}

export async function setLastPolledAt(at: Date): Promise<void> {
  await db()`update dc_settings set last_polled_at = ${at} where id`;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/dc/store.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dc/store.ts tests/dc/store.test.ts
git commit -m "feat: DC quote store: one-statement import, draft-only edits, markup rules, settings"
```

---

### Task 6: Mailbox reader, import pipeline, owner emails, cron

**Files:**
- Create: `lib/dc/config.ts`, `lib/dc/mailbox.ts`, `lib/dc/notify.ts`, `lib/dc/import.ts`, `app/api/cron/dc-quotes/route.ts`
- Test: `tests/dc/import.test.ts`, `tests/dc/mailbox.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `graphJson`, `GraphError` (`lib/calendar/graph.ts`); `calendarConfig` (`lib/calendar/config.ts`); `parseDealerCopy`; the store (Task 5); `createFile`, `deleteFile` (`lib/admin/files.ts`); `ownerRecipients` (`lib/leads/email.ts`); `adminOrigin` (`lib/admin/origin.ts`); `formatProjectNo`
- Produces:
  - `DC_SENDER`, `DC_NEW_QUOTE_URL`, `dcQuoteUrl(quoteNo: string)`, `dcMailbox(): string | null`
  - `type MailMessage = { id: string; internetMessageId: string; subject: string; from: string; receivedAt: Date }`
  - `listCandidateMessages(since: Date): Promise<MailMessage[]>`
  - `htmlAttachments(messageId: string): Promise<{ name: string; bytes: Buffer }[]>`
  - `importDealerCopy(input: { internetMessageId: string; receivedAt: Date; html: string }): Promise<{ outcome: ImportOutcome; leadId: string | null; detail: string | null; version?: number }>`
  - `pollMailbox(now?: Date): Promise<{ seen: number; results: { messageId: string; outcome: ImportOutcome }[] }>`

- [ ] **Step 1: Write `lib/dc/config.ts`**

```ts
import { calendarConfig } from "@/lib/calendar/config";

/** Verified 2026-09-27: DC sends through HD's address, whatever the display name says. */
export const DC_SENDER = "retailer@hunterdouglas.com";
export const DC_SUBJECT = /^DEALER COPY #(\d+), PO (.+)$/;
export const DC_NEW_QUOTE_URL = "https://dc.picbusiness.com/Orders/Orders/clientForm.pic?ORDa=a&a=a";
export const dcQuoteUrl = (quoteNo: string) =>
  `https://dc.picbusiness.com/Orders/Orders/Items/?Wo=${encodeURIComponent(quoteNo)}&ORDa=c&view=C`;
export const IMPORT_ACTOR = "Direct Connect";
/** The support@ mailbox the calendar app already reads. Null when Outlook is not configured. */
export const dcMailbox = (): string | null => calendarConfig()?.mailbox ?? null;
```

- [ ] **Step 2: Write the failing mailbox test** (`tests/dc/mailbox.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const graphJson = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphJson, GraphError: class extends Error {} }));
vi.mock("@/lib/calendar/config", () => ({ calendarConfig: () => ({ mailbox: "support@premiershadesolutions.com" }) }));
const mailbox = await import("@/lib/dc/mailbox");
beforeEach(() => graphJson.mockReset());

describe("listCandidateMessages", () => {
  it("only GETs, filters by time, and keeps DC-shaped mail from the DC sender", async () => {
    graphJson.mockResolvedValueOnce({ value: [
      { id: "a", internetMessageId: "<a@x>", subject: "DEALER COPY #22250749, PO PSS-1042", receivedDateTime: "2026-09-27T19:30:00Z", from: { emailAddress: { address: "Retailer@HunterDouglas.com" } } },
      { id: "b", internetMessageId: "<b@x>", subject: "DEALER COPY #1, PO PSS-1", receivedDateTime: "2026-09-27T19:31:00Z", from: { emailAddress: { address: "someone@evil.com" } } },
      { id: "c", internetMessageId: "<c@x>", subject: "Lunch?", receivedDateTime: "2026-09-27T19:32:00Z", from: { emailAddress: { address: "retailer@hunterdouglas.com" } } },
    ] });
    const found = await mailbox.listCandidateMessages(new Date("2026-09-27T18:00:00Z"));
    expect(found.map((m) => m.id)).toEqual(["a"]);
    const [path, init] = graphJson.mock.calls[0];
    expect(init?.method ?? "GET").toBe("GET");
    expect(decodeURIComponent(path)).toContain("receivedDateTime ge 2026-09-27T18:00:00.000Z");
    expect(path).toContain("internetMessageId");
  });
  it("follows @odata.nextLink", async () => {
    graphJson.mockResolvedValueOnce({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next" }).mockResolvedValueOnce({ value: [] });
    await mailbox.listCandidateMessages(new Date());
    expect(graphJson.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/next");
  });
});

describe("htmlAttachments", () => {
  it("returns decoded .html file attachments only, and refuses anything over 1 MB", async () => {
    graphJson.mockResolvedValueOnce({ value: [
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "DEALER COPY 1.html", size: 10, contentBytes: Buffer.from("<html>").toString("base64") },
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "logo.png", size: 10, contentBytes: "" },
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "big.html", size: 2_000_000, contentBytes: "" },
    ] });
    const found = await mailbox.htmlAttachments("a");
    expect(found).toEqual([{ name: "DEALER COPY 1.html", bytes: Buffer.from("<html>") }]);
  });
});
```

- [ ] **Step 3: Implement `lib/dc/mailbox.ts`**

```ts
import "server-only";
import { graphJson } from "@/lib/calendar/graph";
import { DC_SENDER, DC_SUBJECT, dcMailbox } from "./config";

export type MailMessage = { id: string; internetMessageId: string; subject: string; from: string; receivedAt: Date };
type GraphMessage = { id: string; internetMessageId: string; subject: string | null; receivedDateTime: string; from?: { emailAddress?: { address?: string } } };
const MAX_BYTES = 1_000_000;

/**
 * DC-shaped messages received since `since`. READ ONLY: this module only ever GETs. The mailbox
 * is a working inbox, so nothing here moves, flags, marks read or deletes anything.
 * Keyed later on internetMessageId, which survives the owner moving the email to a folder
 * (Graph's own id does not).
 */
export async function listCandidateMessages(since: Date): Promise<MailMessage[]> {
  const mailbox = dcMailbox();
  if (!mailbox) return [];
  const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
  let next: string | null =
    `users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$orderby=receivedDateTime asc&$top=50` +
    `&$select=id,internetMessageId,subject,from,receivedDateTime`;
  const found: MailMessage[] = [];
  while (next) {
    const page: { value: GraphMessage[]; "@odata.nextLink"?: string } = await graphJson(next);
    for (const m of page.value) {
      const from = (m.from?.emailAddress?.address ?? "").trim().toLowerCase();
      const subject = (m.subject ?? "").trim();
      if (from !== DC_SENDER || !DC_SUBJECT.test(subject)) continue;
      found.push({ id: m.id, internetMessageId: m.internetMessageId, subject, from, receivedAt: new Date(m.receivedDateTime) });
    }
    next = page["@odata.nextLink"] ?? null;
  }
  return found;
}

export async function htmlAttachments(messageId: string): Promise<{ name: string; bytes: Buffer }[]> {
  const mailbox = dcMailbox();
  if (!mailbox) return [];
  const page: { value: { "@odata.type": string; name: string; size: number; contentBytes?: string }[] } =
    await graphJson(`users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`);
  return page.value
    .filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && /\.html?$/i.test(a.name) && a.size <= MAX_BYTES && a.contentBytes)
    .map((a) => ({ name: a.name, bytes: Buffer.from(a.contentBytes!, "base64") }));
}
```

Run: `npx vitest run --maxWorkers=2 tests/dc/mailbox.test.ts`. Expected: PASS.

- [ ] **Step 4: Write `lib/dc/notify.ts`**

This follows `lib/portal/send-approval-email.ts`: plain text, Resend, `ownerRecipients()`, and it throws when misconfigured.

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { ownerRecipients } from "@/lib/leads/email";
import type { ImportOutcome } from "./types";

const HOW_TO_SEND = "In Direct Connect: Reports → Dealer Copy → Email → tick Owner and Include dealer costs → Generate.";

export function importEmail(input: { outcome: ImportOutcome; dcQuoteNo: string | null; projectNo: string | null; jobId: string | null; version?: number; detail: string | null }): { subject: string; text: string } | null {
  const quote = input.dcQuoteNo ? `DC quote ${input.dcQuoteNo}` : "A Direct Connect Dealer Copy";
  const link = input.jobId ? `Open the job: ${adminOrigin()}/admin/jobs/${input.jobId}?tab=quote` : null;
  const lines = (...parts: (string | null)[]) => parts.filter((p): p is string => p !== null).join("\n");
  switch (input.outcome) {
    case "imported":
      return { subject: `${input.projectNo}: quote v${input.version} ready to review`,
        text: lines(`${quote} arrived for ${input.projectNo} as version ${input.version}.`, "", "Review the prices and send the contract from the job's Quote tab.", link) };
    case "no-po":
    case "no-match":
      return { subject: `${quote} could not be matched to a job`,
        text: lines(`${quote} has no valid PSS number in PO Reference (${input.detail ?? "blank"}).`, "",
          "Open the quote in Direct Connect, put the job's number (e.g. PSS-1042) in PO Reference, save, and send the Dealer Copy again.", HOW_TO_SEND) };
    case "no-costs":
      return { subject: `${quote} arrived without dealer costs`, text: lines(`${quote} was sent without costs, so it can't be priced.`, "", `Send it again with Include dealer costs ticked. ${HOW_TO_SEND}`) };
    case "incomplete":
      return { subject: `${quote} has an unfinished line`, text: lines(`${quote}: ${input.detail}.`, "", "Finish that line in Direct Connect, then send the Dealer Copy again.") };
    case "unreadable":
      return { subject: `${quote} could not be read`, text: lines(`${quote} wasn't in the expected format (${input.detail}).`, "", "The email was left in support@. A developer needs to look at it before it can be imported.") };
    default:
      return null; // unchanged: nothing to say. failed: reported by the cron response and logs.
  }
}

export async function notifyOwners(email: { subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey || to.length === 0) throw new Error("DC import notification email is not configured");
  const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text });
  if (error) throw new Error(`Resend rejected the DC import notification: ${error.message}`);
}
```

- [ ] **Step 5: Write the failing pipeline test** (`tests/dc/import.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const store = {
  isProcessed: vi.fn(), recordOutcome: vi.fn(), findJobByProjectNo: vi.fn(), latestSha: vi.fn(),
  importVersion: vi.fn(), getDcSettings: vi.fn(), setLastPolledAt: vi.fn(),
};
vi.mock("@/lib/dc/store", () => store);
const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const notify = { notifyOwners: vi.fn().mockResolvedValue(undefined), importEmail: vi.fn(() => ({ subject: "s", text: "t" })) };
vi.mock("@/lib/dc/notify", () => notify);
const mailbox = { listCandidateMessages: vi.fn(), htmlAttachments: vi.fn() };
vi.mock("@/lib/dc/mailbox", () => mailbox);
const { importDealerCopy, pollMailbox } = await import("@/lib/dc/import");

const ONE = readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8");
const JOB_A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "A", projectNo: 1042 };
const input = { internetMessageId: "<m1@x>", receivedAt: new Date("2026-09-27T19:30:00Z"), html: ONE };

beforeEach(() => {
  for (const f of [...Object.values(store), ...Object.values(files), ...Object.values(mailbox)]) f.mockReset();
  store.isProcessed.mockResolvedValue(false);
  store.latestSha.mockResolvedValue(null);
  files.createFile.mockResolvedValue({ id: "f1" });
  store.importVersion.mockResolvedValue({ versionId: "v1", version: 1 });
});

describe("importDealerCopy", () => {
  it("files the copy as an internal dealer_copy and imports against the PSS number's job ONLY", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    const result = await importDealerCopy(input);
    expect(result).toMatchObject({ outcome: "imported", leadId: JOB_A.id, version: 1 });
    expect(store.findJobByProjectNo).toHaveBeenCalledWith(1042);
    expect(files.createFile).toHaveBeenCalledWith(expect.objectContaining({ leadId: JOB_A.id, docType: "dealer_copy", contentType: "text/html" }));
    expect(store.importVersion).toHaveBeenCalledWith(expect.objectContaining({ leadId: JOB_A.id, messageId: "<m1@x>" }));
  });
  it("RELEASE GATE: a number that matches no job imports nothing anywhere", async () => {
    store.findJobByProjectNo.mockResolvedValue(null);
    const result = await importDealerCopy(input);
    expect(result.outcome).toBe("no-match");
    expect(files.createFile).not.toHaveBeenCalled();
    expect(store.importVersion).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-match", leadId: null }));
  });
  it("an identical re-send (e.g. after the email moved folders) is 'unchanged', not v2", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    const { createHash } = await import("node:crypto");
    store.latestSha.mockResolvedValue(createHash("sha256").update(ONE).digest("hex"));
    const result = await importDealerCopy({ ...input, internetMessageId: "<m1-moved@x>" });
    expect(result.outcome).toBe("unchanged");
    expect(files.createFile).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unchanged" }));
  });
  it("an already-processed message does nothing at all", async () => {
    store.isProcessed.mockResolvedValue(true);
    await importDealerCopy(input);
    expect(store.findJobByProjectNo).not.toHaveBeenCalled();
    expect(store.recordOutcome).not.toHaveBeenCalled();
  });
  it("a parse refusal is recorded with its outcome and nothing is filed", async () => {
    const result = await importDealerCopy({ ...input, html: ONE.replace("DEALER COSTS", "") });
    expect(result.outcome).toBe("no-costs");
    expect(files.createFile).not.toHaveBeenCalled();
  });
  it("if the import statement inserts nothing (a race), the stored copy is removed", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    store.importVersion.mockResolvedValue(null);
    await importDealerCopy(input);
    expect(files.deleteFile).toHaveBeenCalledWith("f1", "Direct Connect");
  });
});

describe("pollMailbox", () => {
  it("reads from an hour before the last poll, and advances the mark only after a clean run", async () => {
    const last = new Date("2026-09-27T19:00:00Z");
    store.getDcSettings.mockResolvedValue({ lastPolledAt: last });
    mailbox.listCandidateMessages.mockResolvedValue([]);
    const now = new Date("2026-09-27T19:15:00Z");
    await pollMailbox(now);
    expect(mailbox.listCandidateMessages).toHaveBeenCalledWith(new Date("2026-09-27T18:00:00Z"));
    expect(store.setLastPolledAt).toHaveBeenCalledWith(now);
  });
  it("a message with no single .html attachment is recorded unreadable", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([{ id: "g1", internetMessageId: "<z@x>", subject: "DEALER COPY #1, PO PSS-1042", from: "retailer@hunterdouglas.com", receivedAt: new Date() }]);
    mailbox.htmlAttachments.mockResolvedValue([]);
    const { results } = await pollMailbox(new Date());
    expect(results).toEqual([{ messageId: "<z@x>", outcome: "unreadable" }]);
  });
});
```

Also prove the gate has power: after it passes, temporarily change `findJobByProjectNo(parsed.quote.projectNo)` to `findJobByProjectNo(1043)` and watch the first test go red. Then revert.

- [ ] **Step 6: Implement `lib/dc/import.ts`**

```ts
import "server-only";
import { createHash } from "node:crypto";
import { createFile, deleteFile } from "@/lib/admin/files";
import { formatProjectNo } from "@/lib/portal/project-no";
import { IMPORT_ACTOR } from "./config";
import { htmlAttachments, listCandidateMessages } from "./mailbox";
import { importEmail, notifyOwners } from "./notify";
import { parseDealerCopy } from "./parse";
import { findJobByProjectNo, getDcSettings, importVersion, isProcessed, latestSha, recordOutcome, setLastPolledAt } from "./store";
import type { ImportOutcome } from "./types";

type Result = { outcome: ImportOutcome; leadId: string | null; detail: string | null; version?: number };
const OVERLAP_MS = 60 * 60 * 1000;
const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

async function tell(result: Result, dcQuoteNo: string | null, projectNo: number | null) {
  const email = importEmail({ ...result, dcQuoteNo, projectNo: formatProjectNo(projectNo), jobId: result.leadId });
  if (email) await notifyOwners(email).catch((error) => console.error("DC import email failed", error));
}

/** One Dealer Copy, already known to come from DC. Never throws for a bad document, only for I/O. */
export async function importDealerCopy(input: { internetMessageId: string; receivedAt: Date; html: string }): Promise<Result> {
  if (await isProcessed(input.internetMessageId)) return { outcome: "unchanged", leadId: null, detail: "already processed" };
  const base = { messageId: input.internetMessageId, receivedAt: input.receivedAt };

  const parsed = parseDealerCopy(input.html);
  if (!parsed.ok) {
    const result: Result = { outcome: parsed.refusal.outcome, leadId: null, detail: parsed.refusal.detail };
    await recordOutcome({ ...base, outcome: result.outcome, leadId: null, dcQuoteNo: null, detail: result.detail });
    await tell(result, null, null);
    return result;
  }
  const quote = parsed.quote;
  const job = await findJobByProjectNo(quote.projectNo);
  if (!job) {
    const result: Result = { outcome: "no-match", leadId: null, detail: quote.poReference };
    await recordOutcome({ ...base, outcome: "no-match", leadId: null, dcQuoteNo: quote.quoteNo, detail: quote.poReference });
    await tell(result, quote.quoteNo, null);
    return result;
  }

  const sha256 = createHash("sha256").update(input.html).digest("hex");
  if ((await latestSha(job.id)) === sha256) {
    await recordOutcome({ ...base, outcome: "unchanged", leadId: job.id, dcQuoteNo: quote.quoteNo, detail: null });
    return { outcome: "unchanged", leadId: job.id, detail: null };
  }

  const file = await createFile({
    leadId: job.id, kind: "document", name: `DEALER COPY ${quote.quoteNo}.html`, contentType: "text/html",
    body: new Blob([input.html], { type: "text/html" }), actor: IMPORT_ACTOR, docType: "dealer_copy",
  });
  if (!file) return { outcome: "no-match", leadId: null, detail: "job disappeared" };

  const imported = await importVersion({ ...base, leadId: job.id, quote, sourceFileId: file.id, sha256, actor: IMPORT_ACTOR });
  if (!imported) {
    await deleteFile(file.id, IMPORT_ACTOR);
    return { outcome: "unchanged", leadId: job.id, detail: "already processed" };
  }
  const result: Result = { outcome: "imported", leadId: job.id, detail: null, version: imported.version };
  await tell(result, quote.quoteNo, job.projectNo);
  return result;
}

/** One run over support@. The mark advances only when every message was handled. */
export async function pollMailbox(now = new Date()) {
  const { lastPolledAt } = await getDcSettings();
  const since = new Date((lastPolledAt?.getTime() ?? now.getTime() - FIRST_RUN_LOOKBACK_MS) - OVERLAP_MS);
  const messages = await listCandidateMessages(since);
  const results: { messageId: string; outcome: ImportOutcome }[] = [];
  let failed = false;
  for (const message of messages) {
    try {
      if (await isProcessed(message.internetMessageId)) continue;
      const attachments = await htmlAttachments(message.id);
      if (attachments.length !== 1) {
        await recordOutcome({ messageId: message.internetMessageId, receivedAt: message.receivedAt, outcome: "unreadable", leadId: null, dcQuoteNo: null, detail: `${attachments.length} HTML attachments` });
        results.push({ messageId: message.internetMessageId, outcome: "unreadable" });
        continue;
      }
      const { outcome } = await importDealerCopy({ internetMessageId: message.internetMessageId, receivedAt: message.receivedAt, html: attachments[0].bytes.toString("utf8") });
      results.push({ messageId: message.internetMessageId, outcome });
    } catch (error) {
      // Not recorded: the next run retries it. The mark does not advance past it.
      console.error(`DC import failed for ${message.internetMessageId}`, error);
      results.push({ messageId: message.internetMessageId, outcome: "failed" });
      failed = true;
    }
  }
  if (!failed) await setLastPolledAt(now);
  return { seen: messages.length, results };
}
```

Run: `npx vitest run --maxWorkers=2 tests/dc`. Expected: PASS.

The spec's "email the owners about `failed` only after the second failure" is met by the cron's non-200 status and the log. Nothing is recorded, so no email loop can happen. Note this in the commit message as a deliberate simplification.

- [ ] **Step 7: Cron route and schedule**

`app/api/cron/dc-quotes/route.ts`:

```ts
import { calendarEnabled } from "@/lib/calendar/config";
import { pollMailbox } from "@/lib/dc/import";

/** Reads new Direct Connect Dealer Copies from support@ (vercel.json). Same Bearer CRON_SECRET check as the other crons. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!calendarEnabled()) return Response.json({ skipped: "Outlook is not configured" });
  const { seen, results } = await pollMailbox();
  const failed = results.filter((r) => r.outcome === "failed").length;
  return Response.json({ seen, results }, { status: failed > 0 ? 500 : 200 });
}
```

Add a test `tests/dc/cron-route.test.ts` asserting a 401 without the bearer and a 401 with a wrong one (copy the pattern from the existing review-requests cron test: `grep -rln "api/cron" tests`).

`vercel.json`: add `{ "path": "/api/cron/dc-quotes", "schedule": "*/15 * * * *" }`.

**Check the plan tier first.** Run `vercel project ls` or ask the controller. Hobby plans only allow daily crons, and a sub-daily schedule fails the deploy. If the team is on Hobby, use `"0 15 * * *"` and rely on the job page's **Check for new quotes** button (Task 11). Tell the owner in the handoff.

- [ ] **Step 8: Run everything and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/dc && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/dc app/api/cron/dc-quotes vercel.json tests/dc
git commit -m "feat: read DC Dealer Copies from support@, import by exact PSS number, tell the owners"
```

---

### Task 7: The contract PDF

**Files:**
- Create: `lib/dc/contract-layout.ts`, `lib/dc/contract-pdf.ts`, `tests/dc/contract.test.ts`

**Interfaces:**
- Consumes: `StoredVersion` (Task 5), `PricedVersion` (Task 2), `business` (`content/business.ts`), `formatCents`
- Produces:

```ts
export type ContractInput = {
  projectNo: string; version: number; date: Date;
  client: { name: string; address: string | null; city: string; email: string | null };
  lines: { room: string; description: string; options: [string, string][]; qty: number; sellUnitCents: number; sellExtendedCents: number }[];
  installCents: number; handlingChargedCents: number; oversizedCents: number; clientTotalCents: number;
};
export type ContractRow = { room: string; product: string; details: string; qty: string; unit: string; total: string };
export function winAnsiSafe(text: string): string;
export function keyDetails(options: [string, string][]): string;
export function contractRows(input: ContractInput): { rows: ContractRow[]; totals: [string, string][] };
export function buildContractPdf(input: ContractInput, termsPdf: Uint8Array): Promise<Uint8Array>;
```

- [ ] **Step 1: Write the failing tests** (`tests/dc/contract.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { contractRows, keyDetails, winAnsiSafe, type ContractInput } from "@/lib/dc/contract-layout";
import { buildContractPdf } from "@/lib/dc/contract-pdf";

const input: ContractInput = {
  projectNo: "PSS-1042", version: 1, date: new Date("2026-09-28T12:00:00Z"),
  client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
  lines: [
    { room: "Primary Bedroom", description: "Hunter Douglas Silhouette PowerView Gen 3 Automation Bottom-Up",
      options: [["Location", "Primary Bedroom"], ["Collection", "Silhouette"], ["Control System", "PowerView"], ["Fabric Type", "A2 - Originale 3in"], ["Color", "104 - Cloud"], ["Order Width", "48 1/2"], ["Order Height", "72 3/8"], ["Mount Type", "Inside Mount"], ["Receiver Option", "Right RF Receiver"]],
      qty: 1, sellUnitCents: 128150, sellExtendedCents: 128150 },
    { room: "", description: "Hunter Douglas PowerView Gateway", options: [["Collection", "Motorization"]], qty: 1, sellUnitCents: 20501, sellExtendedCents: 20501 },
  ],
  installCents: 25000, handlingChargedCents: 6600, oversizedCents: 0, clientTotalCents: 128150 + 20501 + 25000 + 6600,
};

describe("contractRows", () => {
  it("shows room, product, key details, qty and client prices only", () => {
    const { rows, totals } = contractRows(input);
    expect(rows[0]).toEqual({ room: "Primary Bedroom", product: "Silhouette PowerView Gen 3 Automation Bottom-Up",
      details: '48 1/2" W x 72 3/8" H · Inside Mount · A2 - Originale 3in, 104 - Cloud · PowerView', qty: "1", unit: "$1,281.50", total: "$1,281.50" });
    expect(rows[1].room).toBe("Accessory");
    expect(totals).toEqual([["Installation", "$250"], ["Hunter Douglas handling", "$66"], ["Total", "$1,799.51"]]);
  });
  it("omits handling when waived and oversized when zero", () => {
    const { totals } = contractRows({ ...input, handlingChargedCents: 0, clientTotalCents: 173651 });
    expect(totals.map(([label]) => label)).toEqual(["Installation", "Total"]);
  });
  it("never contains cost, MSRP, a percentage or the DC quote number", () => {
    const flat = JSON.stringify(contractRows(input));
    for (const forbidden of ["MSRP", "cost", "Cost", "%", "22250749", "Factor"]) expect(flat).not.toContain(forbidden);
  });
});

describe("keyDetails", () => {
  it("is empty-safe", () => expect(keyDetails([])).toBe(""));
});

describe("winAnsiSafe", () => {
  it("keeps Latin-1, maps typographic marks, replaces the rest", () => {
    expect(winAnsiSafe("48½″ — Café “Den” 🚪")).toBe('48½" - Café "Den" ?');
  });
});

describe("buildContractPdf", () => {
  it("renders, then appends every terms page, even with characters the font cannot encode", async () => {
    const terms = await PDFDocument.create();
    terms.addPage(); terms.addPage();
    const bytes = await buildContractPdf({ ...input, client: { ...input.client, name: "Zoë 🙂 O’Neil" } }, await terms.save());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });
  it("spills a long quote onto more pages instead of drawing off the page", async () => {
    const terms = await (await PDFDocument.create()).save();
    const many = { ...input, lines: Array.from({ length: 60 }, () => input.lines[0]) };
    const doc = await PDFDocument.load(await buildContractPdf(many, terms));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/contract.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/dc/contract-layout.ts`**

```ts
import { formatCents } from "@/lib/admin/money";

// (ContractInput and ContractRow types from this task's Interfaces block, verbatim)

const TYPOGRAPHIC: Record<string, string> = { "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2033": '"', "\u2032": "'", "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " " };

/** Text pdf-lib's standard (WinAnsi) fonts can draw: Latin-1 kept, typographic marks mapped, the rest "?". */
export function winAnsiSafe(text: string): string {
  return [...text].map((ch) => TYPOGRAPHIC[ch] ?? (/[\x20-\x7e\xa1-\xff]/.test(ch) ? ch : "?")).join("");
}

/** The details a client recognises: size, mount, fabric and color, control. Everything else stays in DC. */
export function keyDetails(options: [string, string][]): string {
  const get = (label: string) => options.find(([l]) => l === label)?.[1] ?? "";
  const width = get("Order Width");
  const height = get("Order Height");
  const size = width && height ? `${width}" W x ${height}" H` : "";
  const fabric = [get("Fabric Type"), get("Color")].filter(Boolean).join(", ");
  return [size, get("Mount Type"), fabric, get("Control System")].filter(Boolean).join(" · ");
}

export function contractRows(input: ContractInput) {
  const rows: ContractRow[] = input.lines.map((line) => ({
    room: line.room || "Accessory",
    product: line.description.replace(/^Hunter Douglas\s+/, ""),
    details: keyDetails(line.options),
    qty: String(line.qty),
    unit: formatCents(line.sellUnitCents),
    total: formatCents(line.sellExtendedCents),
  }));
  const totals: [string, string][] = [];
  if (input.installCents > 0) totals.push(["Installation", formatCents(input.installCents)]);
  if (input.handlingChargedCents > 0) totals.push(["Hunter Douglas handling", formatCents(input.handlingChargedCents)]);
  if (input.oversizedCents > 0) totals.push(["Oversize charge", formatCents(input.oversizedCents)]);
  totals.push(["Total", formatCents(input.clientTotalCents)]);
  return { rows, totals };
}
```

Check `formatCents(25000)`. It prints `$250`, because whole dollars drop the cents. The test above expects that. If `formatCents` differs, update the test's expected strings to `formatCents`' real output, never the other way round.

- [ ] **Step 4: Implement `lib/dc/contract-pdf.ts`**

```ts
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { business } from "@/content/business";
import { formatShortDate } from "@/lib/admin/time";
import { contractRows, winAnsiSafe, type ContractInput } from "./contract-layout";

const LETTER: [number, number] = [612, 792];
const MARGIN = 54;
const COLS = { room: MARGIN, product: MARGIN + 95, qty: 430, unit: 470, total: 540 };

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = winAnsiSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Page 1+: the priced contract. Then the owner's terms PDF, page for page. Signing stamps it later. */
export async function buildContractPdf(input: ContractInput, termsPdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { rows, totals } = contractRows(input);

  let page: PDFPage = doc.addPage(LETTER);
  let y = LETTER[1] - MARGIN;
  const text = (s: string, x: number, size = 9, font = regular) => page.drawText(winAnsiSafe(s), { x, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  const right = (s: string, xRight: number, size = 9, font = regular) => text(s, xRight - font.widthOfTextAtSize(winAnsiSafe(s), size), size, font);
  const need = (height: number) => { if (y - height < MARGIN) { page = doc.addPage(LETTER); y = LETTER[1] - MARGIN; } };

  text(business.legalName, MARGIN, 14, bold); y -= 16;
  text(`${business.phone.display} · ${business.email}`, MARGIN, 9); y -= 26;
  text(`Contract ${input.projectNo}`, MARGIN, 16, bold);
  right(formatShortDate(input.date), LETTER[0] - MARGIN, 10); y -= 20;
  text(input.client.name, MARGIN, 11, bold); y -= 13;
  for (const line of [input.client.address, input.client.city, input.client.email]) if (line) { text(line, MARGIN, 10); y -= 12; }
  y -= 14;

  const header = () => {
    text("Room", COLS.room, 9, bold); text("Product", COLS.product, 9, bold);
    right("Qty", COLS.qty, 9, bold); right("Each", COLS.unit + 20, 9, bold); right("Total", LETTER[0] - MARGIN, 9, bold);
    y -= 6; page.drawLine({ start: { x: MARGIN, y }, end: { x: LETTER[0] - MARGIN, y }, thickness: 0.5 }); y -= 12;
  };
  header();
  for (const row of rows) {
    const product = wrap(row.product, bold, 9, COLS.qty - COLS.product - 40);
    const details = wrap(row.details, regular, 8, COLS.qty - COLS.product - 40);
    const roomLines = wrap(row.room, regular, 9, COLS.product - COLS.room - 8);
    const height = Math.max(product.length * 11 + details.length * 10, roomLines.length * 11) + 8;
    if (y - height < MARGIN) { page = doc.addPage(LETTER); y = LETTER[1] - MARGIN; header(); }
    const top = y;
    roomLines.forEach((l, i) => { y = top - i * 11; text(l, COLS.room); });
    y = top; right(row.qty, COLS.qty); right(row.unit, COLS.unit + 20); right(row.total, LETTER[0] - MARGIN);
    product.forEach((l, i) => { y = top - i * 11; text(l, COLS.product, 9, bold); });
    details.forEach((l, i) => { y = top - product.length * 11 - i * 10; text(l, COLS.product, 8); });
    y = top - height;
  }
  need(totals.length * 14 + 20);
  y -= 6; page.drawLine({ start: { x: 330, y }, end: { x: LETTER[0] - MARGIN, y }, thickness: 0.5 }); y -= 14;
  for (const [label, value] of totals) {
    const strong = label === "Total";
    right(label, 470, strong ? 11 : 9, strong ? bold : regular);
    right(value, LETTER[0] - MARGIN, strong ? 11 : 9, strong ? bold : regular);
    y -= strong ? 16 : 13;
  }
  need(40);
  y -= 16;
  text("The terms and conditions on the following pages are part of this contract.", MARGIN, 9);

  const terms = await PDFDocument.load(termsPdf);
  const copied = await doc.copyPages(terms, terms.getPageIndices());
  for (const p of copied) doc.addPage(p);
  return doc.save();
}
```

Confirm that `business.legalName` and `formatShortDate(date)` exist with those names (`grep -n "legalName" content/business.ts`; `grep -n "export function formatShortDate" lib/admin/time.ts`). If `formatShortDate` takes another type, adapt the call, not the test.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/dc/contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Look at it**

Write a throwaway script in the scratchpad that calls `buildContractPdf` with the test input and a 1-page terms PDF, and saves `contract-sample.pdf`. Open it and check the columns don't overlap. Don't commit the sample. Fix `COLS` if they do.

- [ ] **Step 7: Commit**

```bash
git add lib/dc/contract-layout.ts lib/dc/contract-pdf.ts tests/dc/contract.test.ts
git commit -m "feat: generate the client contract PDF from marked-up lines, with the owner's terms appended"
```

---

### Task 8: Send the contract (freeze, share, email)

**Files:**
- Create: `lib/dc/send.ts`, `lib/dc/send-contract-email.ts`, `tests/dc/send.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 5 and 7; `getJob` (`lib/admin/jobs.ts`), `listInstallQuotes`, `createFile`, `deleteFile`, `formatProjectNo`, `issueCustomerLink` / `INVITE_MINUTES` (`lib/portal/login.ts`), `get` from `@vercel/blob`
- Produces:
  - `loadReview(jobId: string): Promise<Review | null>`, where `type Review = { version: StoredVersion; priced: PricedVersion; blockers: string[]; fingerprint: string; install: InstallChoice | null; rules: Record<string, number>; olderVersions: StoredVersion[] }`
  - `sendContract(input: { jobId: string; versionId: string; fingerprint: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }>`
  - `sendContractEmail(job: Job, fileName: string): Promise<void>`

- [ ] **Step 1: Write the failing tests** (`tests/dc/send.test.ts`)

This mocks the store, files, blob, jobs, install quotes and the email. It checks:

```ts
// (mocks as in tests/dc/import.test.ts, for: @/lib/dc/store (listVersions, listMarkupRules, getDcSettings),
//  @/lib/admin/install-quotes (listInstallQuotes), @/lib/admin/jobs (getJob), @/lib/admin/files (createFile, deleteFile),
//  @vercel/blob (get → { statusCode: 200, stream: new Response(termsBytes).body }), @/lib/dc/contract-pdf (buildContractPdf → new Uint8Array([1])),
//  @/lib/dc/send-contract-email (sendContractEmail), and @/lib/db with a `sql` vi.fn())

it("refuses when the screen's fingerprint differs from the server's (Settings changed meanwhile)", async () => {
  // loadReview computes a fingerprint from rules {Duette: 60}; the owner's page submitted one made with 55.
  const result = await sendContract({ jobId: JOB, versionId: V1, fingerprint: "stale", actor: OWNER });
  expect(result).toEqual({ error: "Prices changed since you opened this page. Review them and send again." });
  expect(createFile).not.toHaveBeenCalled();
});
it("refuses with the first blocker and writes nothing", async () => { /* rules {} → "Set a markup for Duette first." */ });
it("freezes, shares and logs in ONE statement, then emails the client", async () => {
  const review = await loadReview(JOB);
  const result = await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
  expect(result).toEqual({ ok: true, emailed: true });
  expect(createFile).toHaveBeenCalledWith(expect.objectContaining({ docType: "contract", name: "Contract PSS-1042 v1.pdf", contentType: "application/pdf" }));
  expect(sql).toHaveBeenCalledTimes(1);
  const s = text(sql.mock.calls[0]);
  for (const part of ["update dc_quote_versions set status = 'sent'", "status = 'draft'", "select max(version)",
    "update dc_quote_lines", "status = 'superseded'", "update job_files set shared_at = null", "update job_files set shared_at = now()",
    "quote_cents", "'quoted'", "'quote'"]) expect(s).toContain(part);
});
it("removes the generated file when the freeze statement matched nothing (a race)", async () => {
  sql.mockResolvedValue([]);
  const review = await loadReview(JOB);
  expect(await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER })).toEqual({ error: "This quote changed while you were sending. Reload and try again." });
  expect(deleteFile).toHaveBeenCalled();
});
it("a failed client email still leaves the contract sent, and says so", async () => {
  vi.mocked(sendContractEmail).mockRejectedValue(new Error("resend down"));
  const review = await loadReview(JOB);
  expect(await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER })).toEqual({ ok: true, emailed: false });
});
```

Write the fixtures concretely: a `StoredVersion` built from the parsed 1-line fixture (`status: "draft"`, `version: 1`); `getJob` returning `{ id: JOB, name: "Test Testt", email: "t@example.com", status: "visit_booked", projectNo: 1042, address: "1 Main St", city: "Las Vegas" }`; `listInstallQuotes` returning one `final` of 25000; and `getDcSettings` returning `{ termsPathname: "settings/terms.pdf" }`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --maxWorkers=2 tests/dc/send.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/dc/send-contract-email.ts`**

This is modelled on `sendPortalInvite`: a sign-in link, plain text, and it throws on failure.

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { normalizeEmail } from "@/lib/portal/access";
import { INVITE_MINUTES, issueCustomerLink } from "@/lib/portal/login";

export async function sendContractEmail(job: Job, fileName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  const email = normalizeEmail(job.email);
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!email) throw new Error("This job has no email address");
  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0] || "";
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`, to: email, replyTo: business.email,
    subject: `Your ${business.name} proposal is ready to sign`,
    text: [
      firstName ? `Hi ${firstName},` : "Hi there,", "",
      `Your proposal (${fileName}) is ready. You can review it and sign it on your project page:`, "",
      link, "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n"),
  });
  if (error) throw new Error(`Resend rejected the contract email: ${error.message}`);
}
```

- [ ] **Step 4: Implement `lib/dc/send.ts`**

```ts
import "server-only";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { createFile, deleteFile } from "@/lib/admin/files";
import { getJob } from "@/lib/admin/jobs";
import { listInstallQuotes } from "@/lib/admin/install-quotes";
import { formatCents } from "@/lib/admin/money";
import { formatProjectNo } from "@/lib/portal/project-no";
import { buildContractPdf } from "./contract-pdf";
import { pickInstallQuote, priceVersion, pricingFingerprint, sendBlockers, type InstallChoice, type PricedVersion } from "./pricing";
import { sendContractEmail } from "./send-contract-email";
import { getDcSettings, listMarkupRules, listVersions, type StoredVersion } from "./store";

export type Review = { version: StoredVersion; priced: PricedVersion; blockers: string[]; fingerprint: string; install: InstallChoice | null; rules: Record<string, number>; olderVersions: StoredVersion[] };

/** The latest version of a job's DC quote, priced exactly as Send would price it. */
export async function loadReview(jobId: string): Promise<Review | null> {
  const [job, versions, rules, installs, settings] = await Promise.all([
    getJob(jobId), listVersions(jobId), listMarkupRules(), listInstallQuotes(jobId), getDcSettings(),
  ]);
  if (!job || versions.length === 0) return null;
  const [version, ...olderVersions] = versions;
  const install = pickInstallQuote(installs.map((q) => ({ id: q.id, kind: q.kind, totalCents: q.totalCents, createdAt: q.createdAt })));
  const priced = priceVersion({
    lines: version.lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection, msrpUnitCents: l.msrpUnitCents, costExtendedCents: l.costExtendedCents, pctOverride: l.pctOverride })),
    rules, handlingFeeCents: version.handlingFeeCents, oversizedFeeCents: version.oversizedFeeCents,
    dealerTotalCents: version.dealerTotalCents, waiveHandling: version.waiveHandling, install, noInstall: version.noInstall,
  });
  const blockers = sendBlockers(priced, {
    hasTerms: settings.termsPathname !== null, isLatest: true, versionStatus: version.status,
    jobStatus: job.status, customerEmail: job.email,
  });
  return { version, priced, blockers, fingerprint: pricingFingerprint(priced), install, rules, olderVersions };
}

export async function sendContract(input: { jobId: string; versionId: string; fingerprint: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const review = await loadReview(input.jobId);
  const job = await getJob(input.jobId);
  if (!review || !job) return { error: "This job has no Direct Connect quote." };
  if (review.version.id !== input.versionId) return { error: "A newer version of this quote has arrived. Review that one." };
  if (review.blockers.length > 0) return { error: review.blockers[0] };
  if (review.fingerprint !== input.fingerprint) return { error: "Prices changed since you opened this page. Review them and send again." };

  const { priced, version } = review;
  const settings = await getDcSettings();
  const terms = await get(settings.termsPathname!, { access: "private" });
  if (!terms || terms.statusCode !== 200) return { error: "Your contract terms file could not be read. Upload it again in Settings." };
  const termsBytes = new Uint8Array(await new Response(terms.stream).arrayBuffer());

  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const name = `Contract ${projectNo} v${version.version}.pdf`;
  const pdf = await buildContractPdf({
    projectNo, version: version.version, date: new Date(),
    client: { name: job.name, address: job.address, city: job.city, email: job.email },
    lines: version.lines.map((l) => {
      const p = priced.lines.find((x) => x.position === l.position)!;
      return { room: l.room, description: l.description, options: l.options, qty: l.qty, sellUnitCents: p.sellUnitCents!, sellExtendedCents: p.sellExtendedCents! };
    }),
    installCents: priced.installCents, handlingChargedCents: priced.handlingChargedCents,
    oversizedCents: priced.oversizedCents, clientTotalCents: priced.clientTotalCents!,
  }, termsBytes);

  const file = await createFile({ leadId: job.id, kind: "document", name, contentType: "application/pdf",
    body: new Blob([pdf], { type: "application/pdf" }), actor: input.actor, docType: "contract" });
  if (!file) return { error: "This job no longer exists." };

  const lineRows = JSON.stringify(version.lines.map((l) => {
    const p = priced.lines.find((x) => x.position === l.position)!;
    return { position: l.position, pct: p.pct, sell_unit_cents: p.sellUnitCents, overridden: p.source === "override" };
  }));
  // One statement: freeze this version (only if it is still the latest draft), price its lines,
  // supersede and unshare any earlier unsigned contract, share this one, record the quoted
  // amount, move New / Appointment booked to Quoted, and log both. All or nothing.
  const rows = await db()`
    with prev as (select status from leads where id = ${job.id}),
    frozen as (
      update dc_quote_versions set status = 'sent', install_quote_id = ${priced.installQuoteId}, install_cents = ${priced.installCents},
        products_cents = ${priced.productsCents}, client_total_cents = ${priced.clientTotalCents},
        contract_file_id = ${file.id}, sent_at = now(), sent_by = ${input.actor}
      where id = ${version.id} and lead_id = ${job.id} and status = 'draft'
        and version = (select max(version) from dc_quote_versions where lead_id = ${job.id})
      returning id
    ),
    priced_lines as (
      update dc_quote_lines set markup_pct = l.pct, sell_unit_cents = l.sell_unit_cents, markup_overridden = l.overridden
      from frozen, jsonb_to_recordset(${lineRows}::jsonb) as l(position int, pct numeric, sell_unit_cents int, overridden boolean)
      where dc_quote_lines.version_id = frozen.id and dc_quote_lines.position = l.position
      returning 1
    ),
    superseded as (
      update dc_quote_versions set status = 'superseded'
      where lead_id = ${job.id} and status in ('sent','draft') and id <> ${version.id} and exists (select 1 from frozen)
      returning contract_file_id
    ),
    unshared as (
      update job_files set shared_at = null
      where id in (select contract_file_id from superseded) and lead_id = ${job.id}
        and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)
      returning id
    ),
    shared as (
      update job_files set shared_at = now()
      where id = ${file.id} and lead_id = ${job.id} and exists (select 1 from frozen)
      returning id
    ),
    moved as (
      update leads set quote_cents = ${priced.clientTotalCents},
        status = case when status in ('new','visit_booked') then 'quoted' else status end,
        stage_changed_at = case when status in ('new','visit_booked') then now() else stage_changed_at end,
        updated_at = now()
      where id = ${job.id} and exists (select 1 from frozen)
      returning id
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select ${job.id}, ${input.actor}, 'stage', prev.status, 'quoted', 'Contract sent' from prev, moved
      where prev.status in ('new','visit_booked')
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select ${job.id}, ${input.actor}, 'quote', ${`Sent ${name} for ${formatCents(priced.clientTotalCents)}`} from frozen
    )
    select id from frozen`;
  if (rows.length === 0) {
    await deleteFile(file.id, input.actor);
    return { error: "This quote changed while you were sending. Reload and try again." };
  }
  try {
    await sendContractEmail(job, name);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Contract ${name} sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}
```

Two things to check in the database step (Task 12):
- Every CTE in one statement sees the same snapshot. `moved`'s `case when status …` reads the pre-update status, which is intended.
- `superseded`, `unshared` and `shared` touch disjoint rows, which is safe.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/dc && npm run typecheck`
Expected: PASS.

Power check: remove `if (review.fingerprint !== input.fingerprint)`. The stale-fingerprint test must go red. Revert.

- [ ] **Step 6: Commit**

```bash
git add lib/dc/send.ts lib/dc/send-contract-email.ts tests/dc/send.test.ts
git commit -m "feat: send the contract — recompute, refuse stale prices, freeze and share in one statement"
```

---

### Task 9: Signing a generated contract marks the version signed and the job Sold

**Files:**
- Modify: `lib/portal/sign.ts` (`recordSignature`), `tests/portal/sign.test.ts`, `scripts/verify-contract-signing.ts`

**Interfaces:**
- Consumes: the `dc_quote_versions.contract_file_id` link (Tasks 3 and 8)
- Produces: the unchanged `recordSignature` signature and results. Its single statement now also updates a matching version and the job.

- [ ] **Step 1: Write the failing test** (append to `tests/portal/sign.test.ts`, in the `recordSignature` describe)

```ts
it("in the SAME statement, marks a generated contract's version signed and moves the job to Sold", async () => {
  vi.mocked(readFile).mockResolvedValue({ stream: new Response("pdf bytes").body!, contentType: "application/pdf" });
  query.mockResolvedValue([{ id: "s1", lead_id: JOB, file_id: FILE, signed_name: "A", signed_email: "a@x", signed_at: new Date(), doc_sha256: "x", signed_file_id: null }]);
  await recordSignature({ jobId: JOB, file: doc(FILE, "Contract PSS-1042 v1.pdf", "contract"), name: "A", email: "a@x", ip: null, userAgent: null });
  expect(query).toHaveBeenCalledTimes(1);
  const s = (query.mock.calls[0][0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
  expect(s).toContain("update dc_quote_versions set status = 'signed'");
  expect(s).toContain("contract_file_id = (select file_id from signed)");
  expect(s).toContain("sold_cents");
  expect(s).toContain("status in ('new','visit_booked','quoted')");
});
```

Any existing test pinning `recordSignature`'s exact bind list must be extended with the new binds, in order. Update it to the new list; keep its intent.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/sign.test.ts`
Expected: the new test fails.

- [ ] **Step 3: Extend the statement in `recordSignature`**

Between the `signed` CTE and `logged`, add:

```sql
    version as (
      update dc_quote_versions set status = 'signed', signed_at = now()
      where contract_file_id = (select file_id from signed) and lead_id = (select lead_id from signed) and status = 'sent'
      returning lead_id, version, client_total_cents
    ),
    prev as (select l.status from leads l join version v on l.id = v.lead_id),
    sold as (
      update leads set sold_cents = (select client_total_cents from version),
        status = case when status in ('new','visit_booked','quoted') then 'sold' else status end,
        stage_changed_at = case when status in ('new','visit_booked','quoted') then now() else stage_changed_at end,
        updated_at = now()
      where id = (select lead_id from version)
      returning id
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select sold.id, ${input.email}, 'stage', prev.status, 'sold', 'Signed contract version ' || version.version
      from sold, prev, version
      where prev.status in ('new','visit_booked','quoted')
    ),
```

A hand-uploaded contract matches no version, so `version` is empty and nothing else changes. That's the existing behaviour, and it's pinned by the existing tests still passing.

Update the doc comment above `recordSignature` to say so.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: PASS.

- [ ] **Step 5: Extend the real-DB proof**

In `scripts/verify-contract-signing.ts`, add a case. Insert a `dc_quote_versions` row (`status 'sent'`, `contract_file_id` = the shared contract, `client_total_cents` 123456) on a lead at `quoted`, then call `recordSignature`. Assert:
- the version is `signed` with `signed_at` set
- the lead is `sold` with `sold_cents = 123456`
- exactly one `stage` event quoted→sold

A second case: a hand-uploaded contract on a `quoted` lead stays `quoted`.

Run it against the Neon test branch as its header documents. If there's no branch, report it **unverified**.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: signing a generated contract marks its version signed and the job Sold, in the signature's statement"
```

---

### Task 10: Settings — markup per product line, contract terms

**Files:**
- Create: `app/admin/settings/MarkupSection.tsx`, `app/admin/settings/TermsSection.tsx`, `app/admin/settings/terms/route.ts`, `tests/dc/settings-actions.test.ts`
- Modify: `app/admin/settings/actions.ts`, `app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: `listMarkupRules`, `listSeenCollections`, `saveMarkupRule`, `getDcSettings`, `saveTermsPathname` (Task 5); `requireAdmin`
- Produces:
  - `saveMarkupAction(prev: MarkupState, formData: FormData): Promise<MarkupState>`, where `type MarkupState = { error?: string; ok?: boolean }`
  - `POST /admin/settings/terms` (multipart `file`) → `{ ok: true } | { error }`

- [ ] **Step 1: Write the failing action tests** (`tests/dc/settings-actions.test.ts`)

Mock `@/lib/admin/session` (`requireAdmin` → `{ email: "o@x.com" }`), `next/cache` and `@/lib/dc/store`. Assert:
- `collection=Duette, pct=60` calls `saveMarkupRule("Duette", 60, "o@x.com")`
- `pct=""` calls it with `null` (clears the rule)
- `pct="abc"` and `pct="0"` answer `{ error: "Enter a percentage like 60 or 57.5" }` without calling the store
- `requireAdmin` is awaited before the form is read (make `requireAdmin` reject and assert the store is never called)

- [ ] **Step 2: Implement the action** (append to `app/admin/settings/actions.ts`)

```ts
import { saveMarkupRule } from "@/lib/dc/store";

export type MarkupState = { error?: string; ok?: boolean };

/** One product line's markup, as % of MSRP. Blank clears it, which blocks sending quotes that use it. */
export async function saveMarkupAction(_prev: MarkupState, formData: FormData): Promise<MarkupState> {
  const admin = await requireAdmin();
  const collection = String(formData.get("collection") ?? "").trim();
  const raw = String(formData.get("pct") ?? "").trim();
  if (!collection) return { error: "Pick a product line" };
  let pct: number | null = null;
  if (raw !== "") {
    pct = Number(raw);
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(raw) || pct <= 0 || pct > 1000) return { error: "Enter a percentage like 60 or 57.5" };
  }
  await saveMarkupRule(collection, pct, admin.email);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/jobs/[id]", "page");
  return { ok: true };
}
```

- [ ] **Step 3: `MarkupSection.tsx`**

A client component, one small form per collection, following `LeadDefaultsSection`'s markup and classes:

```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { formatCents } from "@/lib/admin/money";
import { saveMarkupAction, type MarkupState } from "./actions";

const CONTROL = "min-h-11 w-24 border border-rule bg-ivory px-3 py-2";

function Row({ collection, pct }: { collection: string; pct: number | null }) {
  const [state, action, saving] = useActionState<MarkupState, FormData>(saveMarkupAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 border-b border-rule py-2">
      <input type="hidden" name="collection" value={collection} />
      <span className="min-w-48 flex-1">{collection}</span>
      <label className="flex items-center gap-2">
        <input name="pct" defaultValue={pct ?? ""} inputMode="decimal" aria-label={`${collection} % of MSRP`} className={CONTROL} />
        <span>% of MSRP</span>
      </label>
      <Button type="submit" disabled={saving}>Save</Button>
      <span className="w-full text-sm text-ink-soft">
        {pct === null ? "Not set. Quotes with this product can't be sent yet." : `A $655 MSRP sells for ${formatCents(Math.floor((65500 * Math.round(pct * 100) + 5000) / 10000))}.`}
      </span>
      {state.error ? <p role="alert" className="text-sm text-overdue">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm text-ink-soft">Saved.</p> : null}
    </form>
  );
}

export function MarkupSection({ collections, rules }: { collections: string[]; rules: Record<string, number> }) {
  return (
    <section aria-labelledby="markup-heading" className="flex flex-col gap-2">
      <h2 id="markup-heading" className="text-lg font-semibold">Markup by product line</h2>
      <p className="text-sm text-ink-soft">What the client pays, as a percentage of Hunter Douglas MSRP. Product lines appear here once a Direct Connect quote uses them.</p>
      {collections.length === 0 ? <p className="text-ink-soft">No Direct Connect quotes have arrived yet.</p> : null}
      {collections.map((c) => <Row key={c} collection={c} pct={rules[c] ?? null} />)}
    </section>
  );
}
```

Import `sellUnitCents` from `@/lib/dc/money` for the example instead of repeating the arithmetic. It's pure, with no server-only import, so it's safe in a client component.

- [ ] **Step 4: Terms upload route** (`app/admin/settings/terms/route.ts`)

It's a Route Handler because Server Actions cap bodies at 1 MB (precedent: `app/admin/jobs/[id]/files/route.ts`).

```ts
import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import { requireAdmin } from "@/lib/admin/session";
import { saveTermsPathname } from "@/lib/dc/store";

const MAX = 10 * 1024 * 1024;

/** Replaces the contract terms appended to every contract sent from now on. Sent contracts keep theirs. */
export async function POST(request: Request) {
  const { email } = await requireAdmin();
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return Response.json({ error: "Upload a PDF." }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return Response.json({ error: "The PDF must be under 10 MB." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const doc = await PDFDocument.load(bytes);
    if (doc.getPageCount() === 0) throw new Error("no pages");
  } catch {
    return Response.json({ error: "That PDF can't be read (is it password protected?)." }, { status: 400 });
  }
  const pathname = `settings/contract-terms/${randomUUID()}.pdf`;
  await put(pathname, file, { access: "private", contentType: "application/pdf", addRandomSuffix: false });
  const previous = await saveTermsPathname(pathname, email);
  // The old file is kept: sent contracts already embed their own copy, so nothing references it.
  // It is removed only to save space, and a failure here is harmless.
  if (previous) await del(previous).catch((error) => console.error("Could not remove old terms", error));
  return Response.json({ ok: true });
}
```

Test it in `tests/dc/terms-route.test.ts`, mocking blob, session and store:
- a non-PDF → 400
- an encrypted or garbage PDF → 400 with the message
- a valid 1-page PDF (`await (await PDFDocument.create()).addPage()` → save) → 200, and `saveTermsPathname` called

- [ ] **Step 5: `TermsSection.tsx`**

A client component with a file input (`accept="application/pdf"`) posting `FormData` to `/admin/settings/terms` with `fetch`. It shows "Terms last updated {date}" or "No terms uploaded. Contracts can't be sent until you add them." and the error text from the response. Copy the upload handling from `app/admin/jobs/[id]/UploadButton.tsx`.

- [ ] **Step 6: Wire into `page.tsx`**

Add `listMarkupRules()`, `listSeenCollections()` and `getDcSettings()` to the page's `Promise.all`. Render `<MarkupSection collections={collections} rules={rules} />` and `<TermsSection updatedAt={dcSettings.termsUpdatedAt} />` after `InstallRatesSection`.

- [ ] **Step 7: Run tests and typecheck, then commit**

Run: `npx vitest run --maxWorkers=2 tests/dc && npm run typecheck`
Expected: PASS.

```bash
git add app/admin/settings tests/dc
git commit -m "feat: Settings for markup per product line and the contract terms PDF"
```

---

### Task 11: Job page — the Quote tab and Direct Connect buttons

**Files:**
- Create: `app/admin/jobs/[id]/QuoteTab.tsx`, `QuoteReview.tsx`, `DcButtons.tsx`, `quote-actions.ts`, `tests/dc/quote-actions.test.ts`
- Modify: `app/admin/jobs/[id]/tabs.ts`, `app/admin/jobs/[id]/page.tsx`

**Interfaces:**
- Consumes: `loadReview`, `sendContract` (Task 8), `setLineOverride`, `setVersionChoices` (Task 5), `pollMailbox` (Task 6), `DC_NEW_QUOTE_URL`, `dcQuoteUrl` (Task 6), `formatProjectNo`
- Produces:
  - `setLinePctAction(jobId: string, versionId: string, position: number, raw: string): Promise<{ error?: string }>`
  - `setChoicesAction(jobId: string, versionId: string, choices: { waiveHandling?: boolean; noInstall?: boolean }): Promise<{ error?: string }>`
  - `sendContractAction(jobId: string, versionId: string, fingerprint: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }>`
  - `checkNowAction(jobId: string): Promise<{ message: string }>`

- [ ] **Step 1: Write the failing action tests** (`tests/dc/quote-actions.test.ts`)

Mock `requireAdmin`, `next/cache`, `@/lib/dc/store`, `@/lib/dc/send` and `@/lib/dc/import`. Assert:
- `requireAdmin` runs first in every action
- `setLinePctAction(J, V, 1, "")` calls `setLineOverride(J, V, 1, null, email)`
- `"abc"`, `"0"` and `"1001"` answer `{ error: "Enter a percentage like 60 or 57.5" }` without calling the store
- a store `false` answers `{ error: "This version can no longer be changed." }`
- `sendContractAction` passes the fingerprint through untouched and returns `sendContract`'s error verbatim
- `checkNowAction` calls `pollMailbox()` and answers `"No new Dealer Copies."` when `seen` is 0, or `"Imported 1."` when one result is `imported`

- [ ] **Step 2: Implement `quote-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { pollMailbox } from "@/lib/dc/import";
import { sendContract } from "@/lib/dc/send";
import { setLineOverride, setVersionChoices } from "@/lib/dc/store";

const PCT = /^\d{1,4}(\.\d{1,2})?$/;
const refresh = (jobId: string) => revalidatePath(`/admin/jobs/${jobId}`);

export async function setLinePctAction(jobId: string, versionId: string, position: number, raw: string) {
  const admin = await requireAdmin();
  const text = raw.trim();
  const pct = text === "" ? null : Number(text);
  if (pct !== null && (!PCT.test(text) || pct <= 0 || pct > 1000)) return { error: "Enter a percentage like 60 or 57.5" };
  const ok = await setLineOverride(jobId, versionId, position, pct, admin.email);
  if (!ok) return { error: "This version can no longer be changed." };
  refresh(jobId);
  return {};
}

export async function setChoicesAction(jobId: string, versionId: string, choices: { waiveHandling?: boolean; noInstall?: boolean }) {
  await requireAdmin();
  const clean = {
    waiveHandling: typeof choices.waiveHandling === "boolean" ? choices.waiveHandling : undefined,
    noInstall: typeof choices.noInstall === "boolean" ? choices.noInstall : undefined,
  };
  if (!(await setVersionChoices(jobId, versionId, clean))) return { error: "This version can no longer be changed." };
  refresh(jobId);
  return {};
}

export async function sendContractAction(jobId: string, versionId: string, fingerprint: string) {
  const admin = await requireAdmin();
  if (typeof fingerprint !== "string" || fingerprint.length > 50_000) return { error: "Reload the page and try again." };
  const result = await sendContract({ jobId, versionId, fingerprint, actor: admin.email });
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { ok: true, emailed: result.emailed };
}

export async function checkNowAction(jobId: string) {
  await requireAdmin();
  const { seen, results } = await pollMailbox();
  refresh(jobId);
  const imported = results.filter((r) => r.outcome === "imported").length;
  if (seen === 0 || results.length === 0) return { message: "No new Dealer Copies." };
  return { message: imported > 0 ? `Imported ${imported}.` : "Checked. Nothing new to import (the owners were emailed about anything that needs fixing)." };
}
```

- [ ] **Step 3: `DcButtons.tsx`** (client)

```tsx
"use client";
import { useState } from "react";
import { DC_NEW_QUOTE_URL, dcQuoteUrl } from "@/lib/dc/config";

/** Opens Direct Connect in a new tab. Before any quote exists, it copies the PSS number for the PO Reference field. */
export function DcButtons({ projectNo, dcQuoteNo }: { projectNo: string | null; dcQuoteNo: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  if (dcQuoteNo) {
    return <a className="underline" href={dcQuoteUrl(dcQuoteNo)} target="_blank" rel="noopener noreferrer">Open quote {dcQuoteNo} in Direct Connect</a>;
  }
  return (
    <div className="flex flex-col gap-1">
      <a className="underline" href={DC_NEW_QUOTE_URL} target="_blank" rel="noopener noreferrer"
        onClick={() => {
          if (!projectNo) return;
          navigator.clipboard?.writeText(projectNo).then(
            () => setNote(`${projectNo} copied. Paste it into PO Reference.`),
            () => setNote(`Type ${projectNo} into PO Reference.`),
          );
        }}>
        Create quote in Direct Connect
      </a>
      {note ? <p role="status" className="text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}
```

`lib/dc/config.ts` imports `calendarConfig`, which reads `process.env`. It's safe in a client bundle only if nothing server-only is imported. Check this: if `lib/calendar/config.ts` has `import "server-only"`, split the two URL constants and `dcQuoteUrl` into `lib/dc/links.ts` (no imports) and import that here and in `config.ts`.

- [ ] **Step 4: `QuoteTab.tsx` (server) and `QuoteReview.tsx` (client)**

`QuoteTab({ job })`:
- calls `loadReview(job.id)`
- renders `<DcButtons projectNo={formatProjectNo(job.projectNo)} dcQuoteNo={review?.version.dcQuoteNo ?? null} />`
- renders a **Check for new quotes** button (a small client form calling `checkNowAction`)
- then either:
  - no review: "No Direct Connect quote yet. Put {PSS-####} in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked."
  - a review: `<QuoteReview jobId={job.id} review={review} />`

`QuoteReview`, from the props only (no fetching):
- **Header:** `DC quote {dcQuoteNo} · version {n}` (and `of {n + olderVersions.length}` when older ones exist), `status`, and a link "Dealer copy" to `/admin/files/{sourceFileId}`.
- **Table, one row per line:** Room (or "Accessory"), Product, `keyDetails(options)` (import from `@/lib/dc/contract-layout`), Qty, MSRP, **% of MSRP** input (defaultValue = override ?? rule ?? ""; `onBlur` → `setLinePctAction`; placeholder = rule; marked "adjusted" when override), Sell, Cost, Margin. A `missing` line shows "Set a markup in Settings" linking `/admin/settings#markup-heading`.
- **Totals:**
  - Products
  - HD handling fee, with a **Waive** checkbox → `setChoicesAction({ waiveHandling })`
  - Oversized, only if > 0
  - Installation, showing "Final install price, {date}" or "Estimate, {date}", with a **No installation on this job** checkbox → `setChoicesAction({ noInstall })`
  - **Client total**
  - owner-only lines, in muted text: Your cost (HD), Margin
- **Send contract** button: disabled while `review.blockers.length > 0`, and each blocker is listed above it. On click it calls `sendContractAction(jobId, version.id, review.fingerprint)` and shows its error, or "Contract sent." plus "(the email to the client failed; send them the project page link)" when `emailed === false`.
- When `status !== 'draft'`: inputs are read-only, and it shows "Sent {date} for {client total}" / "Signed {date}", plus **"Signed — ready to order: Open quote {dcQuoteNo} in Direct Connect"** when signed.
- `olderVersions`: a `<details>` list, "Version {n} · {status} · {client total or 'not sent'}".

All money is shown with `formatCents`. **Every figure comes from `review.priced`, the same object whose fingerprint Send compares**, so the screen can't show a number Send wouldn't charge.

- [ ] **Step 4b: What changed between versions, and the signed warning (spec §8)**

Create `lib/dc/diff.ts`. It's pure.

```ts
import type { StoredLine } from "./store";

export type LineChange =
  | { kind: "added"; position: number; description: string }
  | { kind: "removed"; position: number; description: string }
  | { kind: "changed"; position: number; description: string; fromMsrpCents: number; toMsrpCents: number; fromQty: number; toQty: number };

/** Lines are matched by position, the item number DC prints. Price and qty changes are reported; option-only edits show as unchanged. */
export function diffLines(older: StoredLine[], newer: StoredLine[]): LineChange[] {
  const before = new Map(older.map((l) => [l.position, l]));
  const after = new Map(newer.map((l) => [l.position, l]));
  const changes: LineChange[] = [];
  for (const [position, l] of after) {
    const o = before.get(position);
    if (!o) changes.push({ kind: "added", position, description: l.description });
    else if (o.msrpUnitCents !== l.msrpUnitCents || o.qty !== l.qty || o.description !== l.description) {
      changes.push({ kind: "changed", position, description: l.description, fromMsrpCents: o.msrpUnitCents, toMsrpCents: l.msrpUnitCents, fromQty: o.qty, toQty: l.qty });
    }
  }
  for (const [position, o] of before) if (!after.has(position)) changes.push({ kind: "removed", position, description: o.description });
  return changes.sort((a, b) => a.position - b.position);
}
```

Test it in `tests/dc/diff.test.ts`: added, removed, a price change, a qty change, and identical lines → `[]`.

In `QuoteReview`, when `olderVersions[0]` exists, show "Changes from version {n}:" with one line per `diffLines(olderVersions[0].lines, version.lines)` entry.

When any older version has `status === 'signed'`, show above the Send button: **"The client signed version {n} for {formatCents(clientTotalCents)}. Sending this one asks them to sign a change for {formatCents(priced.clientTotalCents)}."**

- [ ] **Step 5: Add the tab**

In `tabs.ts`, add `{ value: "quote", label: "Quote" }` between `files` and `install`. In `page.tsx`, add `{tab === "quote" ? <QuoteTab job={job} /> : null}` and the import.

- [ ] **Step 6: Tests and typecheck, then look at it**

Run: `npx vitest run --maxWorkers=2 tests/dc tests/admin && npm run typecheck`
Expected: PASS.

Then check it in a browser against `next start` on 127.0.0.1 with the Neon test branch (memory `pss-local-verification-quirks`). Seed a version by running `importDealerCopy` with the 4-line fixture from a scratch script against the test branch, for a job whose `project_no` is changed to 1042. Open the Quote tab and confirm:
- the numbers match the fixture
- an override updates Sell and Total
- Waive removes the fee
- the Send button's blockers read plainly

Take one screenshot for the handoff.

- [ ] **Step 7: Commit**

```bash
git add app/admin/jobs lib/dc tests/dc
git commit -m "feat: the job's Quote tab: review DC lines at % of MSRP, waive the fee, send the contract"
```

---

### Task 12: Real-database proof of the new SQL

**Files:**
- Create: `scripts/verify-dc-quote-import.ts`, `scripts/verify-dc-quote-import.config.mts`

Copy the structure, header and refusal guard of `scripts/verify-contract-signing.ts`, including its config file, but with `include: ["scripts/verify-dc-quote-import.ts"]`. It must:
- use `E2E_POSTGRES_URL` only
- refuse a production-looking URL
- mock only `@vercel/blob`
- clean up everything it wrote

- [ ] **Step 1: Write the script's cases**

1. **Import:** insert two leads A (project_no from the sequence) and B. Call `importVersion` for A with the parsed 4-line fixture. Assert:
   - one version, `version = 1`, `status = 'draft'`
   - 4 lines with exact cents and `options` JSON equal to the fixture's
   - one `quote` event
   - **B has no rows**
2. **Idempotence:** call `importVersion` again with the same messageId → null, and there's still one version.
3. **Numbering:** a second messageId creates version 2.
4. **Draft-only edits:** `setLineOverride` on v2 → true. Mark v2 `sent` by hand. `setLineOverride` → false and the row is unchanged.
5. **Send's freeze statement:** reset v2 to `draft`. Run `sendContract`'s statement through `sendContract` itself, with `@/lib/dc/contract-pdf` and `@/lib/dc/send-contract-email` mocked and a terms blob returned by the blob mock. Assert:
   - v2 `sent` with frozen totals equal to `priceVersion`'s
   - v1 `superseded`
   - the contract file `shared_at` set and `doc_type='contract'`
   - A `quote_cents` equal to the client total
   - A moved to `quoted` with a `stage` event
6. **Race:** call `sendContract` again for v2 → the error "changed while you were sending", and no second contract file remains.
7. **Sign:** `recordSignature` on the contract → v2 `signed`, A `sold`, `sold_cents` = total.
8. **Dealer copy guard:** a raw `update job_files set shared_at = now()` on A's dealer copy throws a check violation.

- [ ] **Step 2: Run it against the Neon test branch**

```bash
E2E_POSTGRES_URL="$E2E_POSTGRES_URL" npx vitest run --config scripts/verify-dc-quote-import.config.mts
```

Expected: every case passes.

Power check: temporarily remove `and status = 'draft'` from `sendContract`'s freeze and watch case 6 fail. Then revert.

If no branch is available, **stop and ask the controller**. The unit tests only prove SQL text (memory `mocked-db-tests-cannot-verify-sql`), and this feature moves money.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-dc-quote-import.ts scripts/verify-dc-quote-import.config.mts
git commit -m "test: a hand-run proof of the DC import, send and sign SQL against a real database"
```

---

### Task 13: End to end

**Files:**
- Create: `e2e/dc-quote.spec.ts`
- Modify: `playwright.config.ts`: add `dc-quote` to the mobile project's `testIgnore` list

Follow `e2e/portal.spec.ts`'s setup verbatim:
- `test.skip(!url, ...)` and serial mode
- `signInOwner`, `customerPage` token helpers
- names prefixed `E2E DC ${STAMP}`
- cleanup in `afterAll`: signatures → dc versions (cascade lines) → ingested_messages by prefix → files → leads

- [ ] **Step 1: Write the spec**

```ts
// Seed: a lead with email e2e-dc-${STAMP}@example.com at 'visit_booked'; read its project_no.
// Import: rewrite the 4-line fixture's PO to that job's PSS number, and insert via importDealerCopy is not possible from Playwright,
//         so seed with SQL that mirrors importVersion: one dc_quote_versions row (draft) + its 4 dc_quote_lines, with a job_files
//         dealer_copy row pointing at a blob path that is never read by this test.
// Settings: owner sets Duette 60, Silhouette 55.5, Palm Beach Shutters 70, Motorization 100 on /admin/settings,
//           and uploads e2e/fixtures/terms.pdf (a 1-page PDF committed with this task).
// Install: owner saves a final install price on the Install tab (reuse install.spec.ts's steps).
// Review: /admin/jobs/{id}?tab=quote shows the four lines; the Client total equals the expected figure computed in the test
//         from the fixture cents with sellUnitCents (import it from lib/dc/money).
// Waive: ticking Waive lowers the total by the fixture's handling fee.
// Send: click Send contract → "Contract sent."; the job header shows Quoted.
// Customer: customerPage(browser, email) → the contract is listed with Sign; sign with a name → confirmation.
// Owner: the job shows Sold and "Signed — ready to order"; the Quote tab shows version 1 · signed.
// Gate: a second lead (B) at 'quoted' with its own customer email sees no contract and does not move.
```

Implement each comment as real Playwright steps, using the role-based locators used elsewhere in `e2e/`. Commit `e2e/fixtures/terms.pdf`, generated once with pdf-lib: one page reading "Terms and conditions (test)".

- [ ] **Step 2: Run it**

Following memory `pss-local-verification-quirks`: against `next start` on 127.0.0.1 and a Neon test branch.

```bash
E2E_POSTGRES_URL="$E2E_POSTGRES_URL" npx playwright test e2e/dc-quote.spec.ts --project=desktop
```

Expected: PASS. Then run the full unit suite: `npx vitest run --maxWorkers=2`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/dc-quote.spec.ts e2e/fixtures/terms.pdf playwright.config.ts
git commit -m "test: e2e from imported DC quote to a signed contract and a Sold job"
```

---

## After the tasks (controller)

1. Run the whole-branch review (superpowers:requesting-code-review) on the most capable model, with the spec attached. Ask the reviewer to **re-derive** the money rules from the spec rather than trusting this plan (memory `controller-rulings-need-re-derivation`).
2. **Production migration:** follow memory `pss-production-migrations`:
   - claim 024 (already done)
   - prove it on a branch twice (Task 3)
   - verify the target endpoint is `ep-cold-term` without printing it
   - run the migration, verify read-only
   - **then** push, because a push to main deploys production (memories `pss-deploy-traps`, `pss-deploys-via-vercel-cli`)
3. **Owner prerequisites** (spec §14), listed in the handoff:
   - Mail.Read (Application) + admin consent on the existing Azure app
   - markup percentages
   - the terms PDF
   - the DC habit (PO Reference = PSS-####, send with Owner + Include dealer costs)
   - the cron cadence decision if the team is on Vercel Hobby
