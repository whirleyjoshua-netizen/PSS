# Consultation Questionnaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the website consultation form, the thank-you page offers an optional questionnaire (exact windows, treatment types + Motorized, address, gate code, finish). Answers attach to the lead, and the owners see and edit them on the job, the call screen and Job details.

**Architecture:** The consultation route issues a one-day key, stores only its SHA-256 hash on the lead, and sends the key in an httpOnly cookie scoped to `/thank-you`. The thank-you page (now dynamic) reads the cookie server-side to show and prefill the questionnaire. A server action reads only the cookie and updates only the questionnaire fields, in one statement with a note event. Owner-side forms share the field schemas from `lib/leads/questionnaire-schema.ts`.

**Tech Stack:** Next.js 16 App Router (async `cookies()`, Server Actions, `useActionState`), Neon Postgres tagged templates / `.query`, zod 4, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-consult-questionnaire-design.md`

## Global Constraints

- Cookie: name `pss_q`, `HttpOnly`, `Secure` only when `NODE_ENV === "production"`, `SameSite=Lax`, `Path=/thank-you`, `Max-Age=86400`. The key is `newToken()` (32 random bytes, base64url); only `hashToken(key)` is stored (`lib/admin/tokens.ts`).
- The key is issued only when the lead insert succeeded; never on a honeypot or a failed insert. The key never appears in a URL or form field.
- The lookup is one query: `questionnaire_token_hash = <hash> and questionnaire_expires_at > now()`.
- The questionnaire exposes nothing about the lead except its own questionnaire answers, the address and the first form's window range.
- Migration number is **010** (`db/migrations/010_questionnaire.sql`), idempotent, with no `;` inside comments (migrate.mjs strips `--` lines and splits on `;`).
- Treatment type keys, in this order, with these labels: `horizontal_blinds` Horizontal blinds, `vertical_blinds` Vertical blinds, `shutters` Shutters, `cellular_shades` Cellular shades, `roller_shades` Roller shades, `roman_shades` Roman shades, `sheer_shadings` Sheer horizontal shadings, `not_sure` Not sure — show me all the samples.
- Exact windows: 1–30 plus 31 meaning "30+".
- Finish → tier: essential → value, designer → mid, luxury → premium, not_sure → no change.
- Copy (verbatim): card title "Help us come prepared"; subtitle "Optional · about 2 minutes"; saved "Thanks — we'll come prepared."; expired "This form has expired — call us and we'll take it from here."; finish question "What kind of finish are you picturing?" with "Essential — clean, durable, great value", "Designer — more fabrics and colors, upgraded features", "Luxury — top-tier fabrics and premium brands", "Not sure yet".
- Event line: `Customer added details: 12 windows · Shutters, Cellular shades · Motorized · Luxury`. Parts are left out when empty. Treatment labels are in list order. The gate code and address are never in it. A save never changes the stage.
- The gate code is never in any email and never on `/project` pages (`lib/portal/access.ts` is untouched).
- The first consultation form (`ConsultationForm.tsx`, `useConsultationForm.ts`, `consultationSchema`) is not changed. The existing `treatments` and `window_count` columns stay and are still shown.
- Keep leftovers' hidden `visitAtLoaded` / `installOnLoaded` inputs and the edit-only date logic in `updateDetails`.
- Verification: `npx vitest run --maxWorkers=2 <files>`; `npx tsc --noEmit -p .` filtered to touched files; `npx eslint <files>`. Don't run `next build` locally except in the Task 7 e2e step.

## Rulings made while planning (deviations from the spec's letter)

1. **Extra column `leads.finish`** (`essential|designer|luxury|not_sure`, nullable). §8 shows "Luxury → Premium" only "when set by a customer", and §5 prefills saved answers, including "Not sure yet". Neither is possible without storing the customer's pick. The card shows "Luxury → Premium" only while `tierForFinish(finish) === budget_tier`. If an owner later changes the tier, it shows just the tier.
2. **Event line order:** treatment labels follow the list order (`Shutters, Cellular shades`), not the spec's illustrative order. Checkbox FormData arrives in DOM order anyway.
3. **Gate code prefill:** reopening the thank-you page within 24 h prefills the gate code the customer typed. §5 says saved answers are shown, and this is the customer's own entry in their own browser. §8's "customer pages" rule applies to `/project`.
4. **A resubmitted form keeps its answers on screen:** the action returns the submitted values on success too, and the form remounts on them. React's post-action reset would otherwise revert to stale server defaults.

## File map

| File | Change | Task |
|---|---|---|
| `db/migrations/010_questionnaire.sql` | create | 1 |
| `lib/leads/treatment-types.ts`, `lib/leads/window-count.ts`, `lib/leads/finish.ts` | create | 1 |
| `lib/admin/jobs.ts` | Job fields, JOB_COLUMNS, toJob (T1); updateDetails (T6) | 1, 6 |
| `lib/leads/questionnaire-cookie.ts` | create | 2 |
| `lib/leads/db.ts`, `app/api/consultation/route.ts` | issue key + cookie | 2 |
| `lib/leads/questionnaire-schema.ts`, `lib/leads/questionnaire-summary.ts`, `lib/leads/questionnaire.ts` | create | 3 |
| `app/(site)/thank-you/actions.ts`, `app/(site)/thank-you/Questionnaire.tsx` | create | 3 |
| `app/(site)/thank-you/page.tsx` | async, shows the card | 3 |
| `app/admin/jobs/[id]/OverviewCards.tsx` | ProjectCard fields | 4 |
| `lib/admin/call.ts`, `lib/admin/calls.ts`, `lib/admin/schema.ts` (callSchema), `app/admin/jobs/call-actions.ts`, `app/admin/jobs/[id]/call/CallForm.tsx` | new call fields | 5 |
| `lib/admin/schema.ts` (detailsSchema), `app/admin/jobs/actions.ts` (saveDetails), `app/admin/jobs/[id]/DetailsForm.tsx` | new detail fields | 6 |
| `e2e/questionnaire.spec.ts`, `e2e/call.spec.ts` | e2e | 5, 7 |

---

### Task 1: Migration, option modules and Job fields

**Files:**
- Create: `db/migrations/010_questionnaire.sql`, `lib/leads/treatment-types.ts`, `lib/leads/window-count.ts`, `lib/leads/finish.ts`
- Modify: `lib/admin/jobs.ts` (Job type, JOB_COLUMNS, toJob)
- Test: `tests/leads/questionnaire-options.test.ts`, `tests/db/migration-010.test.ts`, `tests/admin/jobs.test.ts` (append)

**Interfaces:**
- Produces:
  - `TREATMENT_TYPES` (readonly `{key,label}[]`), `TreatmentType`, `TREATMENT_TYPE_KEYS: [TreatmentType, ...TreatmentType[]]`, `isTreatmentType(v): v is TreatmentType`, `treatmentTypeLabels(keys: readonly string[]): string[]`;
  - `WINDOW_EXACT_MAX = 31`, `WINDOW_EXACT_OPTIONS: {value: string; label: string}[]`, `windowCountLabel(n): string`, `windowsPhrase(n): string`;
  - `FINISHES`, `Finish`, `FINISH_OPTIONS: {value: Finish; label: string; description: string}[]`, `isFinish`, `finishLabel(f)`, `tierForFinish(f: Finish | null): BudgetTier | null`, `finishBudgetLabel(finish, tier): string`;
  - Job gains optional `windowCountExact?: number | null; treatmentTypes?: TreatmentType[]; motorized?: boolean; gateCode?: string | null; finish?: Finish | null`.

- [ ] **Step 1: Write the failing tests**

`tests/leads/questionnaire-options.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { TREATMENT_TYPE_KEYS, isTreatmentType, treatmentTypeLabels } from "@/lib/leads/treatment-types";
import { WINDOW_EXACT_OPTIONS, windowCountLabel, windowsPhrase } from "@/lib/leads/window-count";
import { FINISH_OPTIONS, finishBudgetLabel, tierForFinish } from "@/lib/leads/finish";

describe("treatment types", () => {
  it("are the eight keys in order", () => {
    expect(TREATMENT_TYPE_KEYS).toEqual(["horizontal_blinds", "vertical_blinds", "shutters", "cellular_shades",
      "roller_shades", "roman_shades", "sheer_shadings", "not_sure"]);
  });
  it("label keys in list order and skip unknown ones", () => {
    expect(treatmentTypeLabels(["cellular_shades", "shutters", "curtains"])).toEqual(["Shutters", "Cellular shades"]);
    expect(treatmentTypeLabels(["not_sure", "sheer_shadings"])).toEqual(["Sheer horizontal shadings", "Not sure — show me all the samples"]);
  });
  it("recognise only the keys", () => {
    expect(isTreatmentType("roman_shades")).toBe(true);
    expect(isTreatmentType("Roman shades")).toBe(false);
  });
});

describe("exact window count", () => {
  it("offers 1 to 30 and 30+", () => {
    expect(WINDOW_EXACT_OPTIONS).toHaveLength(31);
    expect(WINDOW_EXACT_OPTIONS[0]).toEqual({ value: "1", label: "1" });
    expect(WINDOW_EXACT_OPTIONS[30]).toEqual({ value: "31", label: "30+" });
  });
  it("labels counts", () => {
    expect(windowCountLabel(12)).toBe("12");
    expect(windowCountLabel(31)).toBe("30+");
    expect(windowsPhrase(1)).toBe("1 window");
    expect(windowsPhrase(12)).toBe("12 windows");
    expect(windowsPhrase(31)).toBe("30+ windows");
  });
});

describe("finish", () => {
  it("maps to budget tiers, with not sure leaving the tier alone", () => {
    expect(tierForFinish("essential")).toBe("value");
    expect(tierForFinish("designer")).toBe("mid");
    expect(tierForFinish("luxury")).toBe("premium");
    expect(tierForFinish("not_sure")).toBeNull();
    expect(tierForFinish(null)).toBeNull();
  });
  it("has the customer-facing copy", () => {
    expect(FINISH_OPTIONS.map((o) => `${o.label}${o.description ? ` — ${o.description}` : ""}`)).toEqual([
      "Essential — clean, durable, great value",
      "Designer — more fabrics and colors, upgraded features",
      "Luxury — top-tier fabrics and premium brands",
      "Not sure yet",
    ]);
  });
  it("shows the customer's finish beside the tier only while they still match", () => {
    expect(finishBudgetLabel("luxury", "premium")).toBe("Luxury → Premium");
    expect(finishBudgetLabel("luxury", "mid")).toBe("Mid-range");
    expect(finishBudgetLabel("not_sure", "mid")).toBe("Mid-range");
    expect(finishBudgetLabel(null, null)).toBe("—");
  });
});
```

`tests/db/migration-010.test.ts` (mirrors `scripts/migrate.mjs`: drop `--` lines, split on `;`):
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = readFileSync("db/migrations/010_questionnaire.sql", "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

describe("migration 010", () => {
  it("is only re-runnable alter/create statements", () => {
    for (const s of statements) expect(s).toMatch(/^(alter table leads (add column if not exists|drop constraint if exists|add constraint)|create unique index if not exists)/);
  });
  it("adds every questionnaire column and the hash index", () => {
    const all = statements.join("\n");
    for (const column of ["window_count_exact smallint", "treatment_types text[] not null default '{}'", "motorized boolean not null default false",
      "gate_code text", "finish text", "questionnaire_token_hash text", "questionnaire_expires_at timestamptz"]) {
      expect(all).toContain(column);
    }
    expect(all).toContain("between 1 and 31");
    expect(all).toContain("char_length(gate_code) <= 40");
    expect(all).toMatch(/on leads \(questionnaire_token_hash\) where questionnaire_token_hash is not null/);
  });
});
```

Append to the top-level describe in `tests/admin/jobs.test.ts` (it has a `row` fixture; place beside the existing `toJob maps budget_tier` test):
```ts
  it("toJob maps the questionnaire fields and drops unknown values", () => {
    const job = jobs.toJob({ ...row, window_count_exact: 12, treatment_types: ["shutters", "curtains"], motorized: true, gate_code: "#4321", finish: "luxury" });
    expect(job).toMatchObject({ windowCountExact: 12, treatmentTypes: ["shutters"], motorized: true, gateCode: "#4321", finish: "luxury" });
    expect(jobs.toJob({ ...row })).toMatchObject({ windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null, finish: null });
    expect(jobs.toJob({ ...row, finish: "cheap" }).finish).toBeNull();
  });

  it("never selects the questionnaire key into a Job", () => {
    expect(jobs.JOB_COLUMNS).toContain("gate_code");
    expect(jobs.JOB_COLUMNS).not.toContain("questionnaire_");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/leads/questionnaire-options.test.ts tests/db/migration-010.test.ts tests/admin/jobs.test.ts`
Expected: FAIL (modules and file not found; toJob fields undefined).

- [ ] **Step 3: Implement**

`db/migrations/010_questionnaire.sql`:
```sql
-- Consultation questionnaire: what the customer tells us after the form, and the one-day key that lets them.
-- Every statement is safe to re-run.

alter table leads add column if not exists window_count_exact smallint;

alter table leads drop constraint if exists leads_window_count_exact_check;

alter table leads add constraint leads_window_count_exact_check check (window_count_exact is null or window_count_exact between 1 and 31);

alter table leads add column if not exists treatment_types text[] not null default '{}';

alter table leads drop constraint if exists leads_treatment_types_check;

alter table leads add constraint leads_treatment_types_check check (treatment_types <@ array['horizontal_blinds', 'vertical_blinds', 'shutters', 'cellular_shades', 'roller_shades', 'roman_shades', 'sheer_shadings', 'not_sure']::text[]);

alter table leads add column if not exists motorized boolean not null default false;

alter table leads add column if not exists gate_code text;

alter table leads drop constraint if exists leads_gate_code_check;

alter table leads add constraint leads_gate_code_check check (gate_code is null or char_length(gate_code) <= 40);

alter table leads add column if not exists finish text;

alter table leads drop constraint if exists leads_finish_check;

alter table leads add constraint leads_finish_check check (finish is null or finish in ('essential', 'designer', 'luxury', 'not_sure'));

alter table leads add column if not exists questionnaire_token_hash text;

alter table leads add column if not exists questionnaire_expires_at timestamptz;

create unique index if not exists leads_questionnaire_token_hash_idx on leads (questionnaire_token_hash) where questionnaire_token_hash is not null;
```

`lib/leads/treatment-types.ts`:
```ts
/**
 * What the customer (questionnaire) or the owners (call screen, Job details) say the
 * customer wants. Keys are stored; labels are shown. Separate from the website form's
 * broad categories in `treatments`.
 */
export const TREATMENT_TYPES = [
  { key: "horizontal_blinds", label: "Horizontal blinds" },
  { key: "vertical_blinds", label: "Vertical blinds" },
  { key: "shutters", label: "Shutters" },
  { key: "cellular_shades", label: "Cellular shades" },
  { key: "roller_shades", label: "Roller shades" },
  { key: "roman_shades", label: "Roman shades" },
  { key: "sheer_shadings", label: "Sheer horizontal shadings" },
  { key: "not_sure", label: "Not sure — show me all the samples" },
] as const;

export type TreatmentType = (typeof TREATMENT_TYPES)[number]["key"];

export const TREATMENT_TYPE_KEYS = TREATMENT_TYPES.map((type) => type.key) as [TreatmentType, ...TreatmentType[]];

export const isTreatmentType = (value: unknown): value is TreatmentType =>
  typeof value === "string" && (TREATMENT_TYPE_KEYS as readonly string[]).includes(value);

/** Labels in the list's order, whatever order the keys came in. Unknown keys are skipped. */
export const treatmentTypeLabels = (keys: readonly string[]): string[] =>
  TREATMENT_TYPES.filter((type) => keys.includes(type.key)).map((type) => type.label);
```

`lib/leads/window-count.ts`:
```ts
/** The exact window count: 1 to 30, with 31 standing for "30+". */
export const WINDOW_EXACT_MAX = 31;

export const windowCountLabel = (count: number): string => (count >= WINDOW_EXACT_MAX ? "30+" : String(count));

export const WINDOW_EXACT_OPTIONS = Array.from({ length: WINDOW_EXACT_MAX }, (_, index) => ({
  value: String(index + 1),
  label: windowCountLabel(index + 1),
}));

export const windowsPhrase = (count: number): string => (count === 1 ? "1 window" : `${windowCountLabel(count)} windows`);
```

`lib/leads/finish.ts`:
```ts
import { budgetLabel, type BudgetTier } from "@/lib/admin/budget";

/** The customer's words for the budget tiers. Never money, never brands. */
export const FINISHES = ["essential", "designer", "luxury", "not_sure"] as const;
export type Finish = (typeof FINISHES)[number];

export const FINISH_OPTIONS: { value: Finish; label: string; description: string }[] = [
  { value: "essential", label: "Essential", description: "clean, durable, great value" },
  { value: "designer", label: "Designer", description: "more fabrics and colors, upgraded features" },
  { value: "luxury", label: "Luxury", description: "top-tier fabrics and premium brands" },
  { value: "not_sure", label: "Not sure yet", description: "" },
];

const TIERS: Record<Exclude<Finish, "not_sure">, BudgetTier> = { essential: "value", designer: "mid", luxury: "premium" };

export const isFinish = (value: unknown): value is Finish =>
  typeof value === "string" && (FINISHES as readonly string[]).includes(value);

export const finishLabel = (finish: Finish): string => FINISH_OPTIONS.find((option) => option.value === finish)!.label;

/** The budget tier a finish stands for. "Not sure" leaves the tier as it is. */
export const tierForFinish = (finish: Finish | null | undefined): BudgetTier | null =>
  finish && finish !== "not_sure" ? TIERS[finish] : null;

/** "Luxury → Premium" while the tier is still the customer's pick; otherwise just the tier. */
export function finishBudgetLabel(finish: Finish | null | undefined, tier: BudgetTier | null | undefined): string {
  if (tier && tierForFinish(finish) === tier) return `${finishLabel(finish!)} → ${budgetLabel(tier)}`;
  return budgetLabel(tier);
}
```

`lib/admin/jobs.ts`:
- Add imports:
  ```ts
  import { isFinish, type Finish } from "@/lib/leads/finish";
  import { isTreatmentType, type TreatmentType } from "@/lib/leads/treatment-types";
  ```
- Add to `Job`, after `followUpNote?`:
  ```ts
  /** Questionnaire / call-screen detail. Optional so older fixtures still type-check. The gate code is owner-only. */
  windowCountExact?: number | null;
  treatmentTypes?: TreatmentType[];
  motorized?: boolean;
  gateCode?: string | null;
  finish?: Finish | null;
  ```
- The JOB_COLUMNS tail becomes:
  ```
    follow_up_at, follow_up_note, window_count_exact, treatment_types, motorized, gate_code, finish`;
  ```
- Add to `toJob`, after `followUpNote`:
  ```ts
    windowCountExact: (row.window_count_exact as number | null) ?? null,
    treatmentTypes: ((row.treatment_types as unknown[]) ?? []).filter(isTreatmentType),
    motorized: row.motorized === true,
    gateCode: (row.gate_code as string | null) ?? null,
    finish: isFinish(row.finish) ? row.finish : null,
  ```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command. Expected: PASS. Then run `npx tsc --noEmit -p .` and confirm no errors in the touched files.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/010_questionnaire.sql lib/leads/treatment-types.ts lib/leads/window-count.ts lib/leads/finish.ts lib/admin/jobs.ts tests/leads/questionnaire-options.test.ts tests/db/migration-010.test.ts tests/admin/jobs.test.ts
git commit -m "feat: questionnaire columns, treatment types, finish tiers"
```

---

### Task 2: Issue the questionnaire key with the lead

**Files:**
- Create: `lib/leads/questionnaire-cookie.ts`
- Modify: `lib/leads/db.ts`, `app/api/consultation/route.ts`
- Test: `tests/leads/route.test.ts` (append), `tests/leads/db.test.ts` (append)

**Interfaces:**
- Consumes: `newToken`, `hashToken` from `lib/admin/tokens.ts`.
- Produces: `QUESTIONNAIRE_COOKIE = "pss_q"`, `QUESTIONNAIRE_SECONDS = 86400`, `questionnaireCookie(key: string): string` (a Set-Cookie value). `insertLead` accepts an optional `questionnaireTokenHash?: string | null`.

- [ ] **Step 1: Write the failing tests**

Add `import { createHash } from "node:crypto";` to the top of `tests/leads/route.test.ts`, then append after the existing describes:
```ts
describe("questionnaire key", () => {
  const cookieValue = (header: string | null) => header?.match(/^pss_q=([^;]+)/)?.[1];

  it("is set as an httpOnly cookie for /thank-you, and only its hash is stored", async () => {
    const response = await POST(request(body));
    const header = response.headers.get("set-cookie");
    expect(header).toMatch(/^pss_q=[A-Za-z0-9_-]{43}; Path=\/thank-you; Max-Age=86400; HttpOnly; SameSite=Lax$/);
    const key = cookieValue(header)!;
    const stored = insertLead.mock.calls[0][0];
    expect(stored.questionnaireTokenHash).toBe(createHash("sha256").update(key).digest("hex"));
    expect(JSON.stringify(insertLead.mock.calls[0])).not.toContain(key);
    expect(JSON.stringify(sendLeadNotification.mock.calls[0])).not.toContain(key);
  });

  it("is Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request(body));
    expect(response.headers.get("set-cookie")).toMatch(/; Secure$/);
    vi.unstubAllEnvs();
  });

  it("is not set when the lead insert failed", async () => {
    insertLead.mockRejectedValue(new Error("Neon down"));
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("is not set for a honeypot submission", async () => {
    const response = await POST(request({ ...body, company: "spam" }));
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
```
(A top-level `await` inside `describe` is not allowed. Import `createHash` at the top of the file instead: `import { createHash } from "node:crypto";`, and drop the in-describe import.)

Append to `tests/leads/db.test.ts`:
```ts
  it("stores the questionnaire key's hash with a one-day expiry", async () => {
    sql.mockClear().mockResolvedValue([{ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" }]);
    await insertLead({ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana", phone: "7025550134",
      email: "d@example.com", city: "Henderson", source: "hero", questionnaireTokenHash: "abc123" });
    const call = sql.mock.calls[0];
    const text = (call[0] as TemplateStringsArray).join("?");
    expect(text).toContain("questionnaire_token_hash, questionnaire_expires_at");
    expect(text).toContain("now() + interval '24 hours'");
    expect(call).toContain("abc123");
  });
```
(Put it inside the existing `describe("insertLead")`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/leads/route.test.ts tests/leads/db.test.ts`
Expected: FAIL (no set-cookie header; no questionnaire columns).

- [ ] **Step 3: Implement**

`lib/leads/questionnaire-cookie.ts`:
```ts
/** Holds the one-day questionnaire key. Only ever sent back to /thank-you, and never readable by page scripts. */
export const QUESTIONNAIRE_COOKIE = "pss_q";
export const QUESTIONNAIRE_SECONDS = 60 * 60 * 24;

/** The Set-Cookie value for a new key. base64url keys need no escaping. */
export function questionnaireCookie(key: string): string {
  return [
    `${QUESTIONNAIRE_COOKIE}=${key}`,
    "Path=/thank-you",
    `Max-Age=${QUESTIONNAIRE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}
```

`lib/leads/db.ts`: the signature becomes `input: ConsultationInput & { referredBy?: string | null; id: string; questionnaireTokenHash?: string | null }`, and the insert becomes:
```ts
  const hash = input.questionnaireTokenHash ?? null;
  const rows = await sql`
    insert into leads
      (id, name, phone, email, address, city, treatments, window_count, heard_via, notes, source, referred_by,
       questionnaire_token_hash, questionnaire_expires_at)
    values
      (${input.id}, ${input.name}, ${input.phone}, ${input.email}, ${input.address ?? null},
       ${input.city}, ${input.treatments ?? []}, ${input.windowCount ?? null},
       ${input.heardVia ?? null}, ${input.notes ?? null}, ${input.source}, ${input.referredBy ?? null},
       ${hash}, case when ${hash}::text is null then null else now() + interval '24 hours' end)
    returning id
  `;
```
Add to the doc comment: "With a questionnaire key hash, the thank-you questionnaire can add details for 24 hours."

`app/api/consultation/route.ts`:
- Add imports: `import { hashToken, newToken } from "@/lib/admin/tokens";` and `import { questionnaireCookie } from "@/lib/leads/questionnaire-cookie";`
- After `const id = randomUUID();`, add `const key = newToken();`, and add `questionnaireTokenHash: hashToken(key),` to `lead`.
- Replace the final return with:
  ```ts
  // The questionnaire key goes only to a visitor whose lead was actually stored.
  const headers = stored.status === "fulfilled" ? { "set-cookie": questionnaireCookie(key) } : undefined;
  return Response.json({ ok: true }, { status: 201, headers });
  ```
- `sendLeadNotification(lead, id)` still receives `lead`. The hash is harmless there, and the email code never reads it.

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command plus `tests/leads/referral-route.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/leads/questionnaire-cookie.ts lib/leads/db.ts app/api/consultation/route.ts tests/leads/route.test.ts tests/leads/db.test.ts
git commit -m "feat: issue a one-day questionnaire key with each stored lead"
```

---

### Task 3: The questionnaire on the thank-you page

**Files:**
- Create: `lib/leads/questionnaire-schema.ts`, `lib/leads/questionnaire-summary.ts`, `lib/leads/questionnaire.ts`, `app/(site)/thank-you/actions.ts`, `app/(site)/thank-you/Questionnaire.tsx`
- Modify: `app/(site)/thank-you/page.tsx`
- Test: `tests/leads/questionnaire-schema.test.ts`, `tests/leads/questionnaire.test.ts`, `tests/leads/questionnaire-action.test.ts`, `tests/routes/thank-you.test.tsx` (rewrite), `tests/routes/questionnaire-form.test.tsx`

**Interfaces:**
- Consumes: Task 1 modules; `QUESTIONNAIRE_COOKIE` (Task 2); `hashToken`.
- Produces (Tasks 5 and 6 reuse the first three):
  - `windowCountExactField` (form string → `number | null`);
  - `treatmentTypesField` (`string[]` → deduped `TreatmentType[]`, default `[]`);
  - `gateCodeField` (string → trimmed `string | null`, ≤ 40);
  - `questionnaireSchema`;
  - `QuestionnaireAnswers = { windowCountExact: number|null; treatmentTypes: TreatmentType[]; motorized: boolean; address: string|null; gateCode: string|null; finish: Finish|null }`;
  - `isEmptyAnswers(a)`, `QUESTIONNAIRE_EXPIRED`, `QuestionnaireState = { ok?: boolean; error?: string; values?: Record<string, string | string[]> }`;
  - `questionnaireSummary(a): string`;
  - `findQuestionnaire(key: string | undefined): Promise<{ windowRange: string | null; answers: QuestionnaireAnswers } | null>`;
  - `saveQuestionnaire(key: string, a: QuestionnaireAnswers): Promise<boolean>`;
  - the server action `submitQuestionnaire(prev, formData)`.

- [ ] **Step 1: Write the failing tests**

`tests/leads/questionnaire-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isEmptyAnswers, questionnaireSchema } from "@/lib/leads/questionnaire-schema";
import { questionnaireSummary } from "@/lib/leads/questionnaire-summary";

const empty = { windowCountExact: "", treatmentTypes: [], motorized: false, address: "", gateCode: "", finish: "" };

describe("questionnaireSchema", () => {
  it("parses a full answer set", () => {
    expect(questionnaireSchema.parse({
      windowCountExact: "12", treatmentTypes: ["shutters", "cellular_shades", "shutters"], motorized: true,
      address: " 12 Sample St ", gateCode: " #4321 ", finish: "luxury",
    })).toEqual({
      windowCountExact: 12, treatmentTypes: ["shutters", "cellular_shades"], motorized: true,
      address: "12 Sample St", gateCode: "#4321", finish: "luxury",
    });
  });
  it("turns an empty submit into empty answers", () => {
    const parsed = questionnaireSchema.parse(empty);
    expect(parsed).toEqual({ windowCountExact: null, treatmentTypes: [], motorized: false, address: null, gateCode: null, finish: null });
    expect(isEmptyAnswers(parsed)).toBe(true);
    expect(isEmptyAnswers({ ...parsed, motorized: true })).toBe(false);
  });
  it("accepts 1 to 31 windows only", () => {
    expect(questionnaireSchema.parse({ ...empty, windowCountExact: "31" }).windowCountExact).toBe(31);
    for (const bad of ["0", "32", "2.5", "lots"]) {
      expect(questionnaireSchema.safeParse({ ...empty, windowCountExact: bad }).error!.issues[0].message).toBe("Pick how many windows");
    }
  });
  it("rejects unknown treatment types and finishes", () => {
    expect(questionnaireSchema.safeParse({ ...empty, treatmentTypes: ["curtains"] }).error!.issues[0].message).toBe("Pick from the listed treatments");
    expect(questionnaireSchema.safeParse({ ...empty, finish: "premium" }).error!.issues[0].message).toBe("Pick a finish");
  });
  it("limits the gate code to 40 characters and the address to 200", () => {
    expect(questionnaireSchema.safeParse({ ...empty, gateCode: "x".repeat(41) }).error!.issues[0].message).toBe("Keep the gate code under 40 characters");
    expect(questionnaireSchema.safeParse({ ...empty, gateCode: "x".repeat(40) }).success).toBe(true);
    expect(questionnaireSchema.safeParse({ ...empty, address: "x".repeat(201) }).success).toBe(false);
  });
});

describe("questionnaireSummary", () => {
  const base = { windowCountExact: null, treatmentTypes: [], motorized: false, address: null, gateCode: null, finish: null } as const;
  it("lists what the customer told us, without the gate code or address", () => {
    expect(questionnaireSummary({ ...base, windowCountExact: 12, treatmentTypes: ["cellular_shades", "shutters"], motorized: true,
      finish: "luxury", gateCode: "#4321", address: "12 Sample St" }))
      .toBe("Customer added details: 12 windows · Shutters, Cellular shades · Motorized · Luxury");
  });
  it("leaves out empty parts", () => {
    expect(questionnaireSummary({ ...base, windowCountExact: 31 })).toBe("Customer added details: 30+ windows");
    expect(questionnaireSummary({ ...base, finish: "not_sure" })).toBe("Customer added details: Finish not sure yet");
    expect(questionnaireSummary({ ...base, gateCode: "#4321" })).toBe("Customer added details");
  });
});
```

`tests/leads/questionnaire.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { findQuestionnaire, saveQuestionnaire } = await import("@/lib/leads/questionnaire");

const KEY = "k".repeat(43);
const HASH = createHash("sha256").update(KEY).digest("hex");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const answers = { windowCountExact: 12, treatmentTypes: ["shutters" as const], motorized: true, address: "12 Sample St", gateCode: "#4321", finish: "luxury" as const };

beforeEach(() => { sql.mockReset(); });

describe("findQuestionnaire", () => {
  it("finds nothing without a key, and never queries", async () => {
    expect(await findQuestionnaire(undefined)).toBeNull();
    expect(await findQuestionnaire("")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
  it("looks the lead up by the key's hash and a future expiry", async () => {
    sql.mockResolvedValue([{ window_count: "6-10", window_count_exact: 12, treatment_types: ["shutters", "junk"], motorized: true,
      address: "12 Sample St", gate_code: "#4321", finish: "luxury" }]);
    expect(await findQuestionnaire(KEY)).toEqual({ windowRange: "6-10", answers });
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("where questionnaire_token_hash = ? and questionnaire_expires_at > now()");
    expect(text(call)).not.toMatch(/\b(name|phone|email|notes)\b/);
    expect(call).toContain(HASH);
    expect(call).not.toContain(KEY);
  });
  it("finds nothing for a wrong or expired key", async () => {
    sql.mockResolvedValue([]);
    expect(await findQuestionnaire(KEY)).toBeNull();
  });
});

describe("saveQuestionnaire", () => {
  it("updates only questionnaire fields and logs a note, in one statement", async () => {
    sql.mockResolvedValue([{ id: "e1" }]);
    expect(await saveQuestionnaire(KEY, answers)).toBe(true);
    expect(sql).toHaveBeenCalledOnce();
    const call = sql.mock.calls[0];
    const statement = text(call);
    expect(statement).toContain("where questionnaire_token_hash = ? and questionnaire_expires_at > now()");
    expect(statement).toContain("address = coalesce(?::text, address)");
    expect(statement).toContain("budget_tier = coalesce(?::text, budget_tier)");
    expect(statement).toContain("'note'");
    expect(statement).not.toContain("status");
    expect(call).toContain(HASH);
    expect(call).toContain("premium");
    expect(call).toContain("Customer added details: 12 windows · Shutters · Motorized · Luxury");
  });
  it("leaves the tier alone for not sure", async () => {
    sql.mockResolvedValue([{ id: "e1" }]);
    await saveQuestionnaire(KEY, { ...answers, finish: "not_sure" });
    expect(sql.mock.calls[0]).not.toContain("premium");
  });
  it("returns false when the key is wrong or expired", async () => {
    sql.mockResolvedValue([]);
    expect(await saveQuestionnaire(KEY, answers)).toBe(false);
  });
});
```

`tests/leads/questionnaire-action.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
const saveQuestionnaire = vi.fn();
vi.mock("@/lib/leads/questionnaire", () => ({ saveQuestionnaire }));
const { submitQuestionnaire } = await import("@/app/(site)/thank-you/actions");

const EXPIRED = "This form has expired — call us and we'll take it from here.";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  cookieGet.mockReset().mockImplementation((name: string) => (name === "pss_q" ? { value: "the-key" } : undefined));
  saveQuestionnaire.mockReset().mockResolvedValue(true);
});

describe("submitQuestionnaire", () => {
  it("saves the answers against the cookie's key", async () => {
    const state = await submitQuestionnaire({}, form([
      ["windowCountExact", "12"], ["treatmentTypes", "shutters"], ["treatmentTypes", "cellular_shades"], ["motorized", "on"],
      ["address", "12 Sample St"], ["gateCode", "#4321"], ["finish", "luxury"],
    ]));
    expect(state.ok).toBe(true);
    expect(saveQuestionnaire).toHaveBeenCalledWith("the-key", {
      windowCountExact: 12, treatmentTypes: ["shutters", "cellular_shades"], motorized: true,
      address: "12 Sample St", gateCode: "#4321", finish: "luxury",
    });
  });
  it("ignores any key sent in the form", async () => {
    await submitQuestionnaire({}, form([["key", "attacker"], ["pss_q", "attacker"], ["windowCountExact", "3"]]));
    expect(saveQuestionnaire.mock.calls[0][0]).toBe("the-key");
  });
  it("says the form expired without a cookie, and saves nothing", async () => {
    cookieGet.mockReturnValue(undefined);
    expect(await submitQuestionnaire({}, form([["windowCountExact", "3"]]))).toMatchObject({ error: EXPIRED });
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });
  it("says the form expired when the key no longer matches", async () => {
    saveQuestionnaire.mockResolvedValue(false);
    expect(await submitQuestionnaire({}, form([["windowCountExact", "3"]]))).toMatchObject({ error: EXPIRED });
  });
  it("thanks an empty submit without saving", async () => {
    expect(await submitQuestionnaire({}, form([]))).toMatchObject({ ok: true });
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });
  it("keeps what was typed when validation fails", async () => {
    const state = await submitQuestionnaire({}, form([["gateCode", "x".repeat(41)], ["treatmentTypes", "shutters"]]));
    expect(state.error).toBe("Keep the gate code under 40 characters");
    expect(state.values).toMatchObject({ gateCode: "x".repeat(41), treatmentTypes: "shutters" });
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });
  it("reports a failed save without losing the answers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveQuestionnaire.mockRejectedValue(new Error("Neon down"));
    const state = await submitQuestionnaire({}, form([["windowCountExact", "3"]]));
    expect(state.error).toMatch(/couldn't save/i);
    expect(state.values).toMatchObject({ windowCountExact: "3" });
  });
});
```

`tests/routes/thank-you.test.tsx` (full replacement):
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
const findQuestionnaire = vi.fn();
vi.mock("@/lib/leads/questionnaire", () => ({ findQuestionnaire }));
vi.mock("@/app/(site)/thank-you/actions", () => ({ submitQuestionnaire: vi.fn() }));

const { default: ThankYouPage, metadata } = await import("@/app/(site)/thank-you/page");
const { business } = await import("@/content/business");

const answers = { windowCountExact: 12, treatmentTypes: ["shutters"], motorized: false, address: "12 Sample St", gateCode: null, finish: "designer" };

beforeEach(() => {
  cookieGet.mockReset().mockReturnValue(undefined);
  findQuestionnaire.mockReset().mockResolvedValue(null);
});

describe("/thank-you", () => {
  it("thanks the visitor and lays out the next steps", async () => {
    render(await ThankYouPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/thank you/i);
    expect(screen.getByText(/within one business day/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  });

  it("offers the phone number for anyone who needs us sooner", async () => {
    render(await ThankYouPage());
    expect(screen.getByRole("link", { name: business.phone.display })).toHaveAttribute("href", business.phone.href);
  });

  it("is kept out of search results", () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("shows no questionnaire without a valid key", async () => {
    render(await ThankYouPage());
    expect(screen.queryByRole("region", { name: "Help us come prepared" })).toBeNull();
    cookieGet.mockReturnValue({ value: "stale" });
    render(await ThankYouPage());
    expect(findQuestionnaire).toHaveBeenCalledWith("stale");
    expect(screen.queryByRole("region", { name: "Help us come prepared" })).toBeNull();
  });

  it("shows the questionnaire, prefilled, for a valid key", async () => {
    cookieGet.mockImplementation((name: string) => (name === "pss_q" ? { value: "the-key" } : undefined));
    findQuestionnaire.mockResolvedValue({ windowRange: "6-10", answers });
    render(await ThankYouPage());
    const card = screen.getByRole("region", { name: "Help us come prepared" });
    expect(card).toHaveTextContent("Optional · about 2 minutes");
    expect(screen.getByLabelText("How many windows?")).toHaveValue("12");
    expect(screen.getByLabelText("Shutters")).toBeChecked();
    expect(screen.getByLabelText("Street address")).toHaveValue("12 Sample St");
  });

  it("stays a normal thank-you page when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    cookieGet.mockReturnValue({ value: "the-key" });
    findQuestionnaire.mockRejectedValue(new Error("Neon down"));
    render(await ThankYouPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/thank you/i);
    expect(screen.queryByRole("region", { name: "Help us come prepared" })).toBeNull();
  });
});
```

`tests/routes/questionnaire-form.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(site)/thank-you/actions", () => ({ submitQuestionnaire: vi.fn() }));
const { Questionnaire } = await import("@/app/(site)/thank-you/Questionnaire");

const blank = { windowCountExact: null, treatmentTypes: [], motorized: false, address: null, gateCode: null, finish: null };

describe("Questionnaire", () => {
  it("asks every question, with nothing required", () => {
    render(<Questionnaire initial={blank} windowRange={null} />);
    const windows = screen.getByLabelText("How many windows?");
    expect(windows.querySelectorAll("option")).toHaveLength(32);
    expect(windows.querySelector("option:last-child")).toHaveTextContent("30+");
    for (const label of ["Horizontal blinds", "Vertical blinds", "Shutters", "Cellular shades", "Roller shades", "Roman shades",
      "Sheer horizontal shadings", "Not sure — show me all the samples"]) {
      expect(screen.getByLabelText(label)).not.toBeChecked();
    }
    expect(screen.getByLabelText(/^Motorized/)).not.toBeChecked();
    expect(screen.getByLabelText(/^Gate or community code/)).toHaveAttribute("maxLength", "40");
    expect(screen.getByRole("group", { name: "What kind of finish are you picturing?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Luxury — top-tier fabrics and premium brands/ })).not.toBeChecked();
    expect(document.querySelectorAll("[required]")).toHaveLength(0);
    expect(screen.queryByText(/earlier/)).toBeNull();
  });

  it("prefills saved answers and reminds them of their first answer", () => {
    render(<Questionnaire initial={{ windowCountExact: 31, treatmentTypes: ["not_sure"], motorized: true, address: "12 Sample St",
      gateCode: "#4321", finish: "not_sure" }} windowRange="20+" />);
    expect(screen.getByText("You said 20+ earlier.")).toBeInTheDocument();
    expect(screen.getByLabelText("How many windows?")).toHaveValue("31");
    expect(screen.getByLabelText("Not sure — show me all the samples")).toBeChecked();
    expect(screen.getByLabelText(/^Motorized/)).toBeChecked();
    expect(screen.getByLabelText(/^Gate or community code/)).toHaveValue("#4321");
    expect(screen.getByRole("radio", { name: "Not sure yet" })).toBeChecked();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/leads/questionnaire-schema.test.ts tests/leads/questionnaire.test.ts tests/leads/questionnaire-action.test.ts tests/routes/thank-you.test.tsx tests/routes/questionnaire-form.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`lib/leads/questionnaire-schema.ts`:
```ts
import { z } from "zod";
import { FINISHES, type Finish } from "./finish";
import { TREATMENT_TYPE_KEYS, type TreatmentType } from "./treatment-types";
import { WINDOW_EXACT_MAX } from "./window-count";

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const WINDOWS = "Pick how many windows";

/** Shared with the call screen and Job details, so every place stores the same values. */
export const windowCountExactField = z
  .preprocess(blank, z.coerce.number({ error: WINDOWS }).int(WINDOWS).min(1, WINDOWS).max(WINDOW_EXACT_MAX, WINDOWS).optional())
  .transform((value) => value ?? null);

export const treatmentTypesField = z
  .array(z.enum(TREATMENT_TYPE_KEYS, { error: "Pick from the listed treatments" }))
  .default([])
  .transform((keys): TreatmentType[] => [...new Set(keys)]);

export const gateCodeField = z
  .preprocess(blank, z.string().trim().max(40, "Keep the gate code under 40 characters").optional())
  .transform((value) => value ?? null);

export const questionnaireSchema = z.object({
  windowCountExact: windowCountExactField,
  treatmentTypes: treatmentTypesField,
  motorized: z.boolean().default(false),
  address: z
    .preprocess(blank, z.string().trim().max(200, "Keep the address under 200 characters").optional())
    .transform((value) => value ?? null),
  gateCode: gateCodeField,
  finish: z
    .preprocess(blank, z.enum(FINISHES, { error: "Pick a finish" }).optional())
    .transform((value): Finish | null => value ?? null),
});

export type QuestionnaireAnswers = z.output<typeof questionnaireSchema>;

export const isEmptyAnswers = (a: QuestionnaireAnswers): boolean =>
  a.windowCountExact === null && a.treatmentTypes.length === 0 && !a.motorized &&
  a.address === null && a.gateCode === null && a.finish === null;

export const QUESTIONNAIRE_EXPIRED = "This form has expired — call us and we'll take it from here.";

export type QuestionnaireState = { ok?: boolean; error?: string; values?: Record<string, string | string[]> };
```

`lib/leads/questionnaire-summary.ts`:
```ts
import { finishLabel } from "./finish";
import type { QuestionnaireAnswers } from "./questionnaire-schema";
import { treatmentTypeLabels } from "./treatment-types";
import { windowsPhrase } from "./window-count";

/** The activity line for a questionnaire save. Never includes the gate code or address. */
export function questionnaireSummary(a: QuestionnaireAnswers): string {
  const parts = [
    a.windowCountExact !== null ? windowsPhrase(a.windowCountExact) : "",
    treatmentTypeLabels(a.treatmentTypes).join(", "),
    a.motorized ? "Motorized" : "",
    a.finish === "not_sure" ? "Finish not sure yet" : a.finish ? finishLabel(a.finish) : "",
  ].filter(Boolean);
  return parts.length ? `Customer added details: ${parts.join(" · ")}` : "Customer added details";
}
```

`lib/leads/questionnaire.ts`:
```ts
import "server-only";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/admin/tokens";
import { isFinish, tierForFinish } from "./finish";
import type { QuestionnaireAnswers } from "./questionnaire-schema";
import { questionnaireSummary } from "./questionnaire-summary";
import { isTreatmentType } from "./treatment-types";

/**
 * The questionnaire behind a key: only its own answers, the address and the first form's
 * window range. Nothing else about the lead. A wrong or expired key finds nothing.
 */
export async function findQuestionnaire(
  key: string | undefined,
): Promise<{ windowRange: string | null; answers: QuestionnaireAnswers } | null> {
  if (!key) return null;
  const rows = await db()`
    select window_count, window_count_exact, treatment_types, motorized, address, gate_code, finish
    from leads
    where questionnaire_token_hash = ${hashToken(key)} and questionnaire_expires_at > now()`;
  const row = rows[0];
  if (!row) return null;
  return {
    windowRange: (row.window_count as string | null) ?? null,
    answers: {
      windowCountExact: (row.window_count_exact as number | null) ?? null,
      treatmentTypes: ((row.treatment_types as unknown[]) ?? []).filter(isTreatmentType),
      motorized: row.motorized === true,
      address: (row.address as string | null) ?? null,
      gateCode: (row.gate_code as string | null) ?? null,
      finish: isFinish(row.finish) ? row.finish : null,
    },
  };
}

/**
 * Saves the answers and logs one note, in one statement. Only questionnaire fields change:
 * the address only when given, the budget tier only for a real finish, and never the stage.
 * Returns false when the key is wrong or expired.
 */
export async function saveQuestionnaire(key: string, a: QuestionnaireAnswers): Promise<boolean> {
  const rows = await db()`
    with updated as (
      update leads set
        window_count_exact = ${a.windowCountExact}, treatment_types = ${a.treatmentTypes}::text[],
        motorized = ${a.motorized}, gate_code = ${a.gateCode}, finish = ${a.finish},
        address = coalesce(${a.address}::text, address),
        budget_tier = coalesce(${tierForFinish(a.finish)}::text, budget_tier),
        updated_at = now()
      where questionnaire_token_hash = ${hashToken(key)} and questionnaire_expires_at > now()
      returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, 'customer', 'note', ${questionnaireSummary(a)} from updated
    returning id`;
  return rows.length > 0;
}
```

`app/(site)/thank-you/actions.ts`:
```ts
"use server";

import { cookies } from "next/headers";
import { saveQuestionnaire } from "@/lib/leads/questionnaire";
import { QUESTIONNAIRE_COOKIE } from "@/lib/leads/questionnaire-cookie";
import {
  isEmptyAnswers, QUESTIONNAIRE_EXPIRED, questionnaireSchema, type QuestionnaireState,
} from "@/lib/leads/questionnaire-schema";

const FIELDS = ["windowCountExact", "treatmentTypes", "motorized", "address", "gateCode", "finish"];

function captureValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of FIELDS) {
    const all = formData.getAll(key);
    if (all.length === 0) continue;
    values[key] = all.length > 1 ? all.map(String) : String(all[0]);
  }
  return values;
}

// The lead is identified only by the pss_q cookie, never by anything in the form.
// Submitted values come back on success too, so the form keeps showing them.
export async function submitQuestionnaire(_prev: QuestionnaireState, formData: FormData): Promise<QuestionnaireState> {
  const key = (await cookies()).get(QUESTIONNAIRE_COOKIE)?.value;
  if (!key) return { error: QUESTIONNAIRE_EXPIRED };
  const values = captureValues(formData);
  const parsed = questionnaireSchema.safeParse({
    windowCountExact: formData.get("windowCountExact") ?? "",
    treatmentTypes: formData.getAll("treatmentTypes").map(String),
    motorized: formData.get("motorized") === "on",
    address: formData.get("address") ?? "",
    gateCode: formData.get("gateCode") ?? "",
    finish: formData.get("finish") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (isEmptyAnswers(parsed.data)) return { ok: true, values };
  try {
    const saved = await saveQuestionnaire(key, parsed.data);
    if (!saved) return { error: QUESTIONNAIRE_EXPIRED, values };
  } catch (error) {
    console.error("Questionnaire save failed", error);
    return { error: "We couldn't save that. Please try again, or call us.", values };
  }
  return { ok: true, values };
}
```

`app/(site)/thank-you/Questionnaire.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { FINISH_OPTIONS } from "@/lib/leads/finish";
import type { QuestionnaireAnswers, QuestionnaireState } from "@/lib/leads/questionnaire-schema";
import { TREATMENT_TYPES } from "@/lib/leads/treatment-types";
import { WINDOW_EXACT_OPTIONS } from "@/lib/leads/window-count";
import { submitQuestionnaire } from "./actions";

const LEGEND = "font-display text-xs font-medium uppercase tracking-[0.16em] text-ink-soft";
const CHOICE = "flex min-h-11 cursor-pointer items-center gap-3 border border-rule px-4 py-2 text-sm text-charcoal transition-colors hover:border-champagne-ink";
const BOX = "size-4 shrink-0 accent-[var(--color-champagne-ink)]";

export function Questionnaire({ initial, windowRange }: { initial: QuestionnaireAnswers; windowRange: string | null }) {
  const [state, action, pending] = useActionState<QuestionnaireState, FormData>(submitQuestionnaire, {});
  const values = state.values;
  // After any submit, the submitted values are the defaults; before, the saved answers are.
  const text = (name: string, fallback: string) => {
    if (!values) return fallback;
    const value = values[name];
    return typeof value === "string" ? value : "";
  };
  const picked = (name: string, fallback: readonly string[]) => {
    if (!values) return fallback;
    const value = values[name];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  };
  const types = picked("treatmentTypes", initial.treatmentTypes);
  const motorized = values ? values.motorized === "on" : initial.motorized;
  const finish = text("finish", initial.finish ?? "");

  return (
    <section aria-labelledby="questionnaire-heading" className="border border-rule bg-sand/40 p-6 sm:p-8">
      <h2 id="questionnaire-heading" className="font-display text-2xl font-light text-charcoal">Help us come prepared</h2>
      <p className="mt-1 text-sm text-ink-soft">Optional · about 2 minutes</p>

      <form key={values ? JSON.stringify(values) : "initial"} action={action} className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="q-windows">How many windows?</Label>
          <select id="q-windows" name="windowCountExact" className={CONTROL}
            defaultValue={text("windowCountExact", initial.windowCountExact ? String(initial.windowCountExact) : "")}>
            <option value="">—</option>
            {WINDOW_EXACT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {windowRange ? <p className="text-sm text-ink-soft">You said {windowRange} earlier.</p> : null}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className={LEGEND}>What are you interested in?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TREATMENT_TYPES.map((type) => (
              <label key={type.key} htmlFor={`q-type-${type.key}`} className={CHOICE}>
                <input id={`q-type-${type.key}`} type="checkbox" name="treatmentTypes" value={type.key}
                  defaultChecked={types.includes(type.key)} className={BOX} />
                {type.label}
              </label>
            ))}
          </div>
          <label htmlFor="q-motorized" className={CHOICE}>
            <input id="q-motorized" type="checkbox" name="motorized" defaultChecked={motorized} className={BOX} />
            <span>Motorized <span className="text-ink-soft">(control with a remote or app)</span></span>
          </label>
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="q-address">Street address</Label>
            <input id="q-address" name="address" autoComplete="street-address" maxLength={200} className={CONTROL}
              defaultValue={text("address", initial.address ?? "")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="q-gate">Gate or community code (optional)</Label>
            <input id="q-gate" name="gateCode" autoComplete="off" maxLength={40} className={CONTROL}
              defaultValue={text("gateCode", initial.gateCode ?? "")} />
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className={LEGEND}>What kind of finish are you picturing?</legend>
          <div className="grid gap-2">
            {FINISH_OPTIONS.map((option) => (
              <label key={option.value} htmlFor={`q-finish-${option.value}`} className={CHOICE}>
                <input id={`q-finish-${option.value}`} type="radio" name="finish" value={option.value}
                  defaultChecked={finish === option.value} className={BOX} />
                <span>
                  {option.label}
                  {option.description ? <span className="text-ink-soft"> — {option.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          {state.ok ? <p role="status" className="text-sm text-charcoal">Thanks — we'll come prepared.</p> : null}
          {state.error ? <p role="alert" className="text-sm text-charcoal">{state.error}</p> : null}
        </div>
      </form>
    </section>
  );
}
```
(If `Button` has no default `type` or the `variant` prop is required, match its existing usage on this page: `ButtonLink` uses the default variant.)

`app/(site)/thank-you/page.tsx`:
- Add imports:
  ```ts
  import { cookies } from "next/headers";
  import { findQuestionnaire } from "@/lib/leads/questionnaire";
  import { QUESTIONNAIRE_COOKIE } from "@/lib/leads/questionnaire-cookie";
  import { Questionnaire } from "./Questionnaire";
  ```
- Extend the doc comment: "Reading the questionnaire cookie makes it render per request. The key never appears in the URL, so analytics never sees it."
- Add above the component:
  ```ts
  /** The visitor's questionnaire, if their cookie holds a live key. A lookup failure just hides it. */
  async function loadQuestionnaire() {
    const key = (await cookies()).get(QUESTIONNAIRE_COOKIE)?.value;
    try {
      return await findQuestionnaire(key);
    } catch (error) {
      console.error("Questionnaire lookup failed", error);
      return null;
    }
  }
  ```
- `export default async function ThankYouPage() {` starts with `const questionnaire = await loadQuestionnaire();`. In the left column, right after the closing `</ol>` of STEPS and before the PREP `<div>`, insert:
  ```tsx
  {questionnaire ? <Questionnaire initial={questionnaire.answers} windowRange={questionnaire.windowRange} /> : null}
  ```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command, plus `tests/seo/sitemap.test.ts`. Expected: PASS. Then run `npx tsc --noEmit -p .` (no errors in touched files) and `npx eslint "app/(site)/thank-you" lib/leads`.

- [ ] **Step 5: Commit**

```bash
git add lib/leads/questionnaire-schema.ts lib/leads/questionnaire-summary.ts lib/leads/questionnaire.ts "app/(site)/thank-you" tests/leads/questionnaire-schema.test.ts tests/leads/questionnaire.test.ts tests/leads/questionnaire-action.test.ts tests/routes/thank-you.test.tsx tests/routes/questionnaire-form.test.tsx
git commit -m "feat: optional consultation questionnaire on the thank-you page"
```

---

### Task 4: Show the answers in Project details

**Files:**
- Modify: `app/admin/jobs/[id]/OverviewCards.tsx` (`ProjectCard`)
- Test: `tests/admin/project-card.test.tsx`

**Interfaces:**
- Consumes: `treatmentTypeLabels`, `windowCountLabel`, `finishBudgetLabel`; Job fields from Task 1.

- [ ] **Step 1: Write the failing test**

`tests/admin/project-card.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { Job } from "@/lib/admin/jobs";
import { ProjectCard } from "@/app/admin/jobs/[id]/OverviewCards";

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: null,
  address: null, city: "Henderson", treatments: ["Shades"], windowCount: "6-10", heardVia: null,
  notes: null, source: "contact", status: "new", stageChangedAt: new Date(),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false, portalInvitedAt: null, budgetTier: "premium",
  windowCountExact: 31, treatmentTypes: ["cellular_shades", "shutters"], motorized: true, gateCode: "#4321", finish: "luxury",
};

const value = (term: string) => {
  const dt = within(screen.getByRole("region", { name: "Project details" })).getByText(term, { selector: "dt" });
  return dt.nextElementSibling as HTMLElement;
};

describe("ProjectCard", () => {
  it("shows the questionnaire answers beside the website form's", () => {
    render(<ProjectCard job={job} editHref="#" />);
    expect(value("Interested in")).toHaveTextContent("Shades");
    expect(value("Windows")).toHaveTextContent("6-10");
    expect(value("Exact windows")).toHaveTextContent("30+");
    expect(value("Treatment types")).toHaveTextContent("ShuttersCellular shades");
    expect(value("Motorized")).toHaveTextContent("Yes");
    expect(value("Gate code")).toHaveTextContent("#4321");
    expect(value("Budget")).toHaveTextContent("Luxury → Premium");
  });

  it("shows dashes and No when nothing was given", () => {
    render(<ProjectCard job={{ ...job, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null, finish: null, budgetTier: "mid" }} editHref="#" />);
    expect(value("Exact windows")).toHaveTextContent("—");
    expect(value("Treatment types")).toHaveTextContent("—");
    expect(value("Motorized")).toHaveTextContent("No");
    expect(value("Gate code")).toHaveTextContent("—");
    expect(value("Budget")).toHaveTextContent("Mid-range");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/project-card.test.tsx`
Expected: FAIL (no "Exact windows" term).

- [ ] **Step 3: Implement**

In `OverviewCards.tsx`:
- Imports: remove `budgetLabel` if unused afterwards. Add:
  ```ts
  import { finishBudgetLabel } from "@/lib/leads/finish";
  import { treatmentTypeLabels } from "@/lib/leads/treatment-types";
  import { windowCountLabel } from "@/lib/leads/window-count";
  ```
- Replace ProjectCard's `<dl>` body with:
  ```tsx
        <dt className="text-ink-soft">Interested in</dt>
        <dd className="flex flex-wrap gap-1.5">
          {job.treatments.length
            ? job.treatments.map((t) => <span key={t} className="border border-rule bg-sand px-2 py-0.5 text-xs">{t}</span>)
            : "—"}
        </dd>
        <dt className="text-ink-soft">Windows</dt><dd>{job.windowCount ?? "—"}</dd>
        <dt className="text-ink-soft">Exact windows</dt>
        <dd>{job.windowCountExact ? windowCountLabel(job.windowCountExact) : "—"}</dd>
        <dt className="text-ink-soft">Treatment types</dt>
        <dd className="flex flex-wrap gap-1.5">
          {job.treatmentTypes?.length
            ? treatmentTypeLabels(job.treatmentTypes).map((label) => (
                <span key={label} className="border border-rule bg-sand px-2 py-0.5 text-xs">{label}</span>
              ))
            : "—"}
        </dd>
        <dt className="text-ink-soft">Motorized</dt><dd>{job.motorized ? "Yes" : "No"}</dd>
        <dt className="text-ink-soft">Gate code</dt><dd>{job.gateCode ?? "—"}</dd>
        <dt className="text-ink-soft">Budget</dt><dd>{finishBudgetLabel(job.finish, job.budgetTier)}</dd>
        <dt className="text-ink-soft">Brands</dt><dd>{job.brands.join(", ") || "—"}</dd>
  ```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/admin/project-card.test.tsx tests/admin/overview-tab.test.tsx tests/admin/job-page-layout.test.tsx tests/admin/job-page-summary.test.tsx tests/admin/job-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/OverviewCards.tsx" tests/admin/project-card.test.tsx
git commit -m "feat: show questionnaire answers in Project details"
```

---

### Task 5: Call screen asks the same questions

**Files:**
- Modify: `lib/admin/call.ts`, `lib/admin/calls.ts`, `lib/admin/schema.ts` (callSchema only), `app/admin/jobs/call-actions.ts`, `app/admin/jobs/[id]/call/CallForm.tsx`, `e2e/call.spec.ts`
- Test (rewrite where shown): `tests/admin/call.test.ts`, `tests/admin/calls.test.ts`, `tests/admin/call-schema.test.ts`, `tests/admin/call-actions.test.ts`, `tests/admin/call-form.test.tsx`

**Interfaces:**
- Consumes: `windowCountExactField`, `treatmentTypesField`, `gateCodeField` (Task 3); `TREATMENT_TYPES`, `treatmentTypeLabels`, `WINDOW_EXACT_OPTIONS`, `windowsPhrase` (Task 1).
- Produces: `CallInput = { outcome; treatmentTypes: TreatmentType[]; motorized: boolean; windowCountExact: number | null; gateCode: string | null; budgetTier; notes; visitAt; followUpAt; followUpNote }`. `TREATMENT_NAMES` is removed (its only users are schema.ts, CallForm.tsx and tests/admin/call.test.ts).

- [ ] **Step 1: Update the tests to the new fields**

`tests/admin/call.test.ts`:
- `base` becomes `{ treatmentTypes: [], motorized: false, windowCountExact: null, gateCode: null, budgetTier: null, notes: null, visitAt: null, followUpAt: null, followUpNote: null }`.
- Remove `TREATMENT_NAMES` from the import and delete the `offer the website form's treatment categories` test.
- The `callSummary` cases become:
  ```ts
  it("describes a booked visit with everything learned", () => {
    expect(callSummary({
      ...base, outcome: "booked", treatmentTypes: ["cellular_shades", "shutters"], motorized: true, windowCountExact: 12,
      gateCode: "#4321", budgetTier: "mid", visitAt: new Date("2026-10-14T21:00:00Z"),
    })).toBe("Call: booked visit Wed 10/14, 2:00 PM · Shutters, Cellular shades · Motorized · 12 windows · Mid-range");
  });
  it("leaves out what wasn't learned, and never the gate code", () => {
    expect(callSummary({ ...base, outcome: "talked", treatmentTypes: ["roller_shades"], budgetTier: "value", gateCode: "#4321" }))
      .toBe("Call: talked, no visit yet · Roller shades · Value");
    expect(callSummary({ ...base, outcome: "no_answer" })).toBe("Call: no answer");
  });
  ```
  Keep the "never includes the notes" and "adds the call-back" tests as they are.

`tests/admin/calls.test.ts` (full replacement of `input` and the first four tests; keep the last two):
```ts
const input = { outcome: "booked" as const, treatmentTypes: ["shutters" as const], motorized: true, windowCountExact: 8, gateCode: "#4321",
  budgetTier: "mid" as const, notes: "Dog in yard", visitAt: new Date("2026-10-14T21:00:00Z"), followUpAt: null, followUpNote: null };

describe("logCall", () => {
  it("saves answers, the forward-only move and both events in one statement", async () => {
    expect(await logCall(JOB, input, "owner@example.com")).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("treatment_types = $2::text[], motorized = $3, window_count_exact = $4, gate_code = $5, budget_tier = $6");
    expect(text).not.toMatch(/\btreatments =|\bwindow_count =/);
    expect(text).toContain("coalesce($7::timestamptz, visit_at)");
    expect(text).toContain("status = any($9::text[])");
    expect(text).toContain("where updated.status = $8::text and prev.status <> $8::text");
    expect(text).toContain("'note'");
    expect(text).toContain("follow_up_at = $12::timestamptz");
    expect(text).toContain("follow_up_note = $13");
    expect(params).toEqual([
      JOB, ["shutters"], true, 8, "#4321", "mid", input.visitAt, "visit_booked", ["new", "contacted"], "owner@example.com",
      "Call: booked visit Wed 10/14, 2:00 PM · Shutters · Motorized · 8 windows · Mid-range\nDog in yard",
      null, null,
    ]);
  });

  it("moves talked calls only from new", async () => {
    await logCall(JOB, { ...input, outcome: "talked", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(6, 9)).toEqual([null, "contacted", ["new"]]);
    expect(params[10]).toBe("Call: talked, no visit yet · Shutters · Motorized · 8 windows · Mid-range");
  });

  it("never moves on no answer, but still saves what was learned", async () => {
    await logCall(JOB, { ...input, outcome: "no_answer", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(1, 9)).toEqual([["shutters"], true, 8, "#4321", "mid", null, null, []]);
  });

  it("passes the follow-up time and note when set on a no-answer call", async () => {
    const followUpAt = new Date("2026-10-16T17:00:00Z");
    await logCall(JOB, { ...input, outcome: "no_answer", visitAt: null, notes: null, followUpAt, followUpNote: "checking with husband" }, "o@example.com");
    expect(query.mock.calls[0][1].slice(11, 13)).toEqual([followUpAt, "checking with husband"]);
  });

  it("passes null, null for the follow-up on a booked call", async () => {
    await logCall(JOB, input, "o@example.com");
    expect(query.mock.calls[0][1].slice(11, 13)).toEqual([null, null]);
  });
```
Keep `returns false for a missing job or a bad id`.

`tests/admin/call-schema.test.ts`:
- `ok` becomes `{ outcome: "talked", treatmentTypes: [], windowCountExact: "", gateCode: "", budget: "", notes: "", visitAt: "" }`.
- The first test becomes:
  ```ts
  it("parses a talked call to a clean input", () => {
    expect(callSchema.parse({ ...ok, treatmentTypes: ["roman_shades"], motorized: true, windowCountExact: "11", gateCode: " 1234 ", budget: "premium", notes: " Call back " }))
      .toEqual({ outcome: "talked", treatmentTypes: ["roman_shades"], motorized: true, windowCountExact: 11, gateCode: "1234", budgetTier: "premium",
        notes: "Call back", visitAt: null, followUpAt: null, followUpNote: null });
  });
  ```
- The "rejects an unknown" test becomes:
  ```ts
  it("rejects an unknown outcome, treatment type, window count, gate code or budget", () => {
    expect(callSchema.safeParse({ ...ok, outcome: "voicemail" }).error!.issues[0].message).toBe("Pick how the call went");
    expect(callSchema.safeParse({ ...ok, treatmentTypes: ["Shutters"] }).success).toBe(false);
    expect(callSchema.safeParse({ ...ok, windowCountExact: "50" }).success).toBe(false);
    expect(callSchema.safeParse({ ...ok, gateCode: "x".repeat(41) }).success).toBe(false);
    expect(callSchema.safeParse({ ...ok, budget: "luxury" }).success).toBe(false);
  });
  ```
- Add `it("defaults motorized to false", () => expect(callSchema.parse(ok).motorized).toBe(false));`

`tests/admin/call-actions.test.ts`: the "saves the call" test becomes:
```ts
  it("saves the call as the owner and returns to the job", async () => {
    await expect(logCallAction(JOB, {}, form([
      ["outcome", "talked"], ["treatmentTypes", "shutters"], ["treatmentTypes", "roller_shades"], ["motorized", "on"],
      ["windowCountExact", "5"], ["gateCode", "#4321"], ["budget", "value"], ["notes", "Fri pm"],
    ]))).rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}`);
    expect(logCall).toHaveBeenCalledWith(JOB, {
      outcome: "talked", treatmentTypes: ["shutters", "roller_shades"], motorized: true, windowCountExact: 5, gateCode: "#4321",
      budgetTier: "value", notes: "Fri pm", visitAt: null, followUpAt: null, followUpNote: null,
    }, "owner@example.com");
  });
```
In "keeps what was typed", replace `["treatments", "Shutters"]` with `["treatmentTypes", "shutters"]`, and the expectation with `treatmentTypes: "shutters"`.

`tests/admin/call-form.test.tsx`:
- The `job` fixture becomes `{ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", treatmentTypes: ["cellular_shades" as const], motorized: true, windowCountExact: 12, gateCode: "#4321", budgetTier: "mid" as const, visitAt: null }`.
- The prefill test becomes:
  ```tsx
  it("is pre-filled from the job", () => {
    render(<CallForm job={job} />);
    expect(screen.getByLabelText("Cellular shades")).toBeChecked();
    expect(screen.getByLabelText("Shutters")).not.toBeChecked();
    expect(screen.getByLabelText("Motorized")).toBeChecked();
    expect(screen.getByLabelText("Windows")).toHaveValue("12");
    expect(screen.getByLabelText("Gate code")).toHaveValue("#4321");
    expect(screen.getByLabelText("Mid-range")).toBeChecked();
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });
  it("offers all eight treatment types and the exact window count", () => {
    render(<CallForm job={{ ...job, treatmentTypes: [], motorized: false, windowCountExact: null, gateCode: null }} />);
    expect(screen.getAllByRole("checkbox", { name: /blinds|shutters|shades|shadings|not sure/i })).toHaveLength(8);
    const windows = screen.getByLabelText("Windows");
    expect(windows).toHaveValue("");
    expect(windows.querySelectorAll("option")).toHaveLength(32);
    expect(screen.getByLabelText("Gate code")).toHaveAttribute("maxLength", "40");
  });
  ```

`e2e/call.spec.ts`, first test: replace `await page.getByLabel("6-10").check();` with `await page.getByLabel("Windows", { exact: true }).selectOption("8");`. The summary expectation becomes `"Call: booked visit Wed 10/14, 2:00 PM · Shutters · 8 windows · Mid-range"`, and the row check becomes:
```ts
  const [row] = await sql()`select budget_tier, window_count_exact, treatment_types from leads where id = ${id}`;
  expect(row).toMatchObject({ budget_tier: "mid", window_count_exact: 8, treatment_types: ["shutters"] });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/call.test.ts tests/admin/calls.test.ts tests/admin/call-schema.test.ts tests/admin/call-actions.test.ts tests/admin/call-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/admin/call.ts`:
- Remove the `categories` import and `TREATMENT_NAMES`.
- Add imports:
  ```ts
  import { treatmentTypeLabels, type TreatmentType } from "@/lib/leads/treatment-types";
  import { windowsPhrase } from "@/lib/leads/window-count";
  ```
- `CallInput` becomes:
  ```ts
  export type CallInput = {
    outcome: CallOutcome;
    treatmentTypes: TreatmentType[];
    motorized: boolean;
    windowCountExact: number | null;
    gateCode: string | null;
    budgetTier: BudgetTier | null;
    notes: string | null;
    visitAt: Date | null;
    followUpAt: Date | null;
    followUpNote: string | null;
  };
  ```
- In `callSummary`, `parts` becomes the following (the doc comment adds "Never includes the gate code."):
  ```ts
    const parts = [
      treatmentTypeLabels(input.treatmentTypes).join(", "),
      input.motorized ? "Motorized" : "",
      input.windowCountExact !== null ? windowsPhrase(input.windowCountExact) : "",
      input.budgetTier ? budgetLabel(input.budgetTier) : "",
    ].filter(Boolean);
  ```

`lib/admin/calls.ts`: the query becomes (in the doc comment, `updated.status = $6` becomes `$8`):
```ts
  const rows = await db().query(
    `with prev as (select status from leads where id = $1),
     updated as (
       update leads set
         treatment_types = $2::text[], motorized = $3, window_count_exact = $4, gate_code = $5, budget_tier = $6,
         visit_at = coalesce($7::timestamptz, visit_at),
         status = case when $8::text is not null and status = any($9::text[]) then $8::text else status end,
         stage_changed_at = case when $8::text is not null and status = any($9::text[]) then now() else stage_changed_at end,
         follow_up_at = $12::timestamptz, follow_up_note = $13,
         updated_at = now()
       where id = $1
       returning id, status
     ),
     moved as (
       insert into job_events (lead_id, actor, kind, from_status, to_status)
       select updated.id, $10, 'stage', prev.status, updated.status from prev, updated
       where updated.status = $8::text and prev.status <> $8::text
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $10, 'note', $11 from updated
     returning id`,
    [jobId, input.treatmentTypes, input.motorized, input.windowCountExact, input.gateCode, input.budgetTier, input.visitAt,
      move?.to ?? null, move?.from ?? [], actor, body, input.followUpAt, input.followUpNote],
  );
```

`lib/admin/schema.ts`:
- The imports become `import { consultationSchema } from "@/lib/leads/schema";` (drop `WINDOW_COUNTS`), `import { CALL_OUTCOMES, type CallInput } from "./call";`, plus `import { gateCodeField, treatmentTypesField, windowCountExactField } from "@/lib/leads/questionnaire-schema";`.
- In `callSchema`'s object, replace the `treatments` and `windowCount` lines with:
  ```ts
    treatmentTypes: treatmentTypesField,
    motorized: z.boolean().default(false),
    windowCountExact: windowCountExactField,
    gateCode: gateCodeField,
  ```
- In its transform, replace `treatments: value.treatments, windowCount: value.windowCount ?? null,` with:
  ```ts
    treatmentTypes: value.treatmentTypes,
    motorized: value.motorized,
    windowCountExact: value.windowCountExact,
    gateCode: value.gateCode,
  ```

`app/admin/jobs/call-actions.ts`:
- `FIELDS` becomes `["outcome", "treatmentTypes", "motorized", "windowCountExact", "gateCode", "budget", "notes", "visitAt", "callBackAt", "callBackNote"]`.
- In `safeParse`, replace the `treatments` / `windowCount` lines with:
  ```ts
      treatmentTypes: formData.getAll("treatmentTypes").map(String),
      motorized: formData.get("motorized") === "on",
      windowCountExact: formData.get("windowCountExact") ?? "",
      gateCode: formData.get("gateCode") ?? "",
  ```

`app/admin/jobs/[id]/call/CallForm.tsx`:
- Imports: remove `TREATMENT_NAMES` and `WINDOW_COUNTS`. Add:
  ```ts
  import { TREATMENT_TYPES, type TreatmentType } from "@/lib/leads/treatment-types";
  import { WINDOW_EXACT_OPTIONS } from "@/lib/leads/window-count";
  ```
- `CallJob` becomes:
  ```ts
  type CallJob = {
    id: string; treatmentTypes?: TreatmentType[]; motorized?: boolean; windowCountExact?: number | null; gateCode?: string | null;
    budgetTier?: BudgetTier | null; visitAt: Date | null;
  };
  ```
- Replace `checked` and `windows` with:
  ```ts
  // After a failed submit the echoed values win, even an unticked box; before it, the job's answers.
  const checked = (key: string) => {
    if (!values) return (job.treatmentTypes ?? []).includes(key as TreatmentType);
    const submitted = values.treatmentTypes;
    return Array.isArray(submitted) ? submitted.includes(key) : submitted === key;
  };
  const motorized = values ? values.motorized === "on" : Boolean(job.motorized);
  const windows = text("windowCountExact", job.windowCountExact ? String(job.windowCountExact) : "");
  ```
- The Interest fieldset body becomes:
  ```tsx
        <div className="flex flex-wrap gap-2">
          {TREATMENT_TYPES.map((type) => (
            <label key={type.key} htmlFor={`call-t-${type.key}`} className={CHIP}>
              <input id={`call-t-${type.key}`} type="checkbox" name="treatmentTypes" value={type.key} defaultChecked={checked(type.key)} />
              {type.label}
            </label>
          ))}
          <label htmlFor="call-motorized" className={CHIP}>
            <input id="call-motorized" type="checkbox" name="motorized" defaultChecked={motorized} />
            Motorized
          </label>
        </div>
  ```
- Replace the whole Windows `<fieldset>` with:
  ```tsx
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="call-windows" className="flex flex-col gap-2 text-sm">
          <span className={LEGEND}>Windows</span>
          <select id="call-windows" name="windowCountExact" defaultValue={windows}
            className="min-h-11 w-full border border-rule bg-ivory px-4 py-3">
            <option value="">Not sure</option>
            {WINDOW_EXACT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label htmlFor="call-gate" className="flex flex-col gap-2 text-sm">
          <span className={LEGEND}>Gate code</span>
          <input id="call-gate" name="gateCode" type="text" maxLength={40} autoComplete="off"
            defaultValue={text("gateCode", job.gateCode ?? "")}
            className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
        </label>
      </div>
  ```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command plus `tests/admin/call-page.test.tsx tests/admin/call-button.test.tsx`. Expected: PASS. Then run `npx tsc --noEmit -p .`: there should be no errors, in particular no remaining `TREATMENT_NAMES`/`WINDOW_COUNTS` references in `lib/admin`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/call.ts lib/admin/calls.ts lib/admin/schema.ts app/admin/jobs/call-actions.ts "app/admin/jobs/[id]/call/CallForm.tsx" e2e/call.spec.ts tests/admin/call.test.ts tests/admin/calls.test.ts tests/admin/call-schema.test.ts tests/admin/call-actions.test.ts tests/admin/call-form.test.tsx
git commit -m "feat: call screen records treatment types, exact windows and gate code"
```

---

### Task 6: Job details can correct every answer

**Files:**
- Modify: `lib/admin/schema.ts` (detailsSchema), `app/admin/jobs/actions.ts` (saveDetails), `lib/admin/jobs.ts` (updateDetails), `app/admin/jobs/[id]/DetailsForm.tsx`
- Test: `tests/admin/schema.test.ts`, `tests/admin/jobs.test.ts`, `tests/admin/actions.test.ts`, `tests/admin/details-form.test.tsx` (new)

**Interfaces:**
- Consumes: the Task 3 field schemas; Task 1 option lists.
- Produces: `DetailsInput` gains `windowCountExact: number | null; treatmentTypes: TreatmentType[]; motorized: boolean; gateCode: string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/schema.test.ts`:
- In "turns form strings into typed values", add `windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null,` to the expected object.
- Add:
  ```ts
  describe("detailsSchema questionnaire fields", () => {
    it("parses exact windows, treatment types, motorized and gate code", () => {
      expect(detailsSchema.parse({ windowCountExact: "31", treatmentTypes: ["shutters"], motorized: true, gateCode: " 12# " }))
        .toMatchObject({ windowCountExact: 31, treatmentTypes: ["shutters"], motorized: true, gateCode: "12#" });
    });
    it("rejects bad values", () => {
      expect(detailsSchema.safeParse({ windowCountExact: "0" }).success).toBe(false);
      expect(detailsSchema.safeParse({ treatmentTypes: ["Blinds"] }).success).toBe(false);
      expect(detailsSchema.safeParse({ gateCode: "x".repeat(41) }).success).toBe(false);
    });
  });
  ```

`tests/admin/jobs.test.ts`:
- Add `windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null` to every `DetailsInput` literal: the lines at about 94, 118, 130 and 188, the `base` in the "loaded with" describe, and the literal in "saves the budget tier".
- In the `describe("updateDetails with the dates the form was loaded with")` block, `motorized` is now a boolean parameter too. Scope the flag checks to the two date flags (they come first in the statement) with `const dateFlags = (call: unknown[]) => call.slice(1).filter((value) => typeof value === "boolean").slice(0, 2);` and use `dateFlags(sql.mock.calls[0])` in place of the three existing `.slice(1).filter(...)` expressions.
- Add:
  ```ts
  it("updateDetails saves the questionnaire fields", async () => {
    sql.mockResolvedValue([{ visit_changed: false, install_changed: false }]);
    await jobs.updateDetails(ID, {
      visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null, budgetTier: null,
      windowCountExact: 12, treatmentTypes: ["shutters"], motorized: true, gateCode: "#4321",
    }, "owner@example.com");
    const call = sql.mock.calls[0];
    const statement = text(call).replace(/\s+/g, " ");
    expect(statement).toContain("window_count_exact = ?, treatment_types = ?::text[], motorized = ?, gate_code = ?");
    expect(call).toEqual(expect.arrayContaining([12, ["shutters"], "#4321"]));
  });
  ```

`tests/admin/actions.test.ts`: add, in the details area:
```ts
  it("saves the questionnaire fields from Job details", async () => {
    await actions.saveDetails(ID, {}, form({ windowCountExact: "12", treatmentTypes: ["shutters", "roman_shades"], motorized: "on", gateCode: "#4321" }));
    expect(jobs.updateDetails).toHaveBeenCalledWith(ID, expect.objectContaining({
      windowCountExact: 12, treatmentTypes: ["shutters", "roman_shades"], motorized: true, gateCode: "#4321",
    }), "owner@example.com");
  });
```
(This file's `form()` helper takes an object whose array values append once per element. If it doesn't, build the FormData inline.)

`tests/admin/details-form.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({ saveDetails: vi.fn() }));
const { DetailsForm } = await import("@/app/admin/jobs/[id]/DetailsForm");

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: null,
  address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "phone", status: "new", stageChangedAt: new Date(),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false, portalInvitedAt: null, budgetTier: null,
  windowCountExact: 12, treatmentTypes: ["roman_shades"], motorized: true, gateCode: "#4321",
};

describe("DetailsForm", () => {
  it("lets the owner correct the questionnaire answers", () => {
    render(<DetailsForm job={job} />);
    expect(screen.getByLabelText("Exact windows")).toHaveValue("12");
    expect(screen.getByLabelText("Roman shades")).toBeChecked();
    expect(screen.getByLabelText("Shutters")).not.toBeChecked();
    expect(screen.getByLabelText("Motorized")).toBeChecked();
    expect(screen.getByLabelText("Gate code")).toHaveValue("#4321");
  });
  it("keeps the loaded-date inputs", () => {
    const { container } = render(<DetailsForm job={job} />);
    expect(container.querySelector('input[name="visitAtLoaded"]')).not.toBeNull();
    expect(container.querySelector('input[name="installOnLoaded"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/schema.test.ts tests/admin/jobs.test.ts tests/admin/actions.test.ts tests/admin/details-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/admin/schema.ts` detailsSchema: add these to the object, after `budget`:
```ts
    windowCountExact: windowCountExactField,
    treatmentTypes: treatmentTypesField,
    motorized: z.boolean().default(false),
    gateCode: gateCodeField,
```
The transform's `...rest` carries them through unchanged.

`app/admin/jobs/actions.ts` saveDetails:
- Add `"windowCountExact", "treatmentTypes", "motorized", "gateCode"` to the captureValues key list.
- Add these to the `safeParse` input:
  ```ts
      windowCountExact: formData.get("windowCountExact") ?? "",
      treatmentTypes: formData.getAll("treatmentTypes").map(String),
      motorized: formData.get("motorized") === "on",
      gateCode: formData.get("gateCode") ?? "",
  ```

`lib/admin/jobs.ts` updateDetails: in the `changed` update, change `budget_tier = ${input.budgetTier}, updated_at = now()` to the following. The new fields must come after the two date `case when` flags.
```ts
        budget_tier = ${input.budgetTier},
        window_count_exact = ${input.windowCountExact}, treatment_types = ${input.treatmentTypes}::text[], motorized = ${input.motorized}, gate_code = ${input.gateCode},
        updated_at = now()
```

`app/admin/jobs/[id]/DetailsForm.tsx`:
- Add imports:
  ```ts
  import { TREATMENT_TYPES } from "@/lib/leads/treatment-types";
  import { WINDOW_EXACT_OPTIONS } from "@/lib/leads/window-count";
  ```
- Add a helper beside `brandsChecked`:
  ```ts
  const typeChecked = (key: string) => {
    const submitted = values?.treatmentTypes;
    if (!values) return (job.treatmentTypes ?? []).some((type) => type === key);
    return Array.isArray(submitted) ? submitted.includes(key) : submitted === key;
  };
  const motorized = values ? values.motorized === "on" : Boolean(job.motorized);
  ```
- After the Budget `<label>`, insert:
  ```tsx
      <label htmlFor="windowCountExact" className="flex flex-col gap-2 text-sm">
        Exact windows
        <select id="windowCountExact" name="windowCountExact" className={CONTROL}
          defaultValue={field("windowCountExact", job.windowCountExact ? String(job.windowCountExact) : "")}>
          <option value="">—</option>
          {WINDOW_EXACT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <TextField id="gateCode" name="gateCode" label="Gate code" defaultValue={field("gateCode", job.gateCode ?? "")} />
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="text-sm">Treatment types</legend>
        <div className="flex flex-wrap gap-2">
          {TREATMENT_TYPES.map((type) => (
            <label key={type.key} htmlFor={`type-${type.key}`} className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
              <input id={`type-${type.key}`} type="checkbox" name="treatmentTypes" value={type.key} defaultChecked={typeChecked(type.key)} />
              {type.label}
            </label>
          ))}
          <label htmlFor="motorized" className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
            <input id="motorized" type="checkbox" name="motorized" defaultChecked={motorized} />
            Motorized
          </label>
        </div>
      </fieldset>
  ```
  `TextField` has no `maxLength` prop, so the server's 40-character limit is the guard and its message shows inline. Don't widen TextField for this.

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command plus `tests/admin/job-page.test.tsx tests/admin/invite-actions.test.ts tests/calendar`. Expected: PASS. Then run `npx tsc --noEmit -p .`: no errors in touched files or tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/schema.ts app/admin/jobs/actions.ts lib/admin/jobs.ts "app/admin/jobs/[id]/DetailsForm.tsx" tests/admin/schema.test.ts tests/admin/jobs.test.ts tests/admin/actions.test.ts tests/admin/details-form.test.tsx
git commit -m "feat: Job details edits treatment types, exact windows and gate code"
```

---

### Task 7: End-to-end and full verification

**Files:**
- Create: `e2e/questionnaire.spec.ts`
- Controller-only (not committed): add `e2e-questionnaire-owner@example.com` to `ADMIN_EMAILS` in the scratchpad `run-e2e.mjs`.

- [ ] **Step 1: Write the spec**

`e2e/questionnaire.spec.ts`:
```ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run questionnaire tests");

const sql = () => neon(url!);
const OWNER = "e2e-questionnaire-owner@example.com";
const STAMP = Date.now();
const NAME = `E2E Questionnaire ${STAMP}`;

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from leads where name like 'E2E Questionnaire %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("a new lead answers the questionnaire and the owner sees it", async ({ page, browser }) => {
  await page.goto("/contact");
  await page.getByLabel("Name", { exact: true }).fill(NAME);
  await page.getByLabel("Phone", { exact: true }).fill("7025550188");
  await page.getByLabel("Email", { exact: true }).fill(`e2e-q-${STAMP}@example.com`);
  await page.getByLabel("Street address").fill("12 Sample St");
  await page.getByLabel("City", { exact: true }).selectOption("Henderson");
  await page.getByLabel("Approximate number of windows").selectOption("6-10");
  await page.getByRole("button", { name: /request free consultation/i }).click();
  await expect(page).toHaveURL(/\/thank-you$/);

  const card = page.getByRole("region", { name: "Help us come prepared" });
  await expect(card.getByText("You said 6-10 earlier.")).toBeVisible();
  await expect(card.getByLabel("Street address")).toHaveValue("12 Sample St");
  await card.getByLabel("How many windows?").selectOption("12");
  await card.getByLabel("Cellular shades").check();
  await card.getByLabel("Shutters").check();
  await card.getByLabel(/^Motorized/).check();
  await card.getByLabel(/^Gate or community code/).fill("#4321");
  await card.getByRole("radio", { name: /^Luxury/ }).check();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("status")).toHaveText("Thanks — we'll come prepared.");

  const [lead] = await sql()`select id, status, window_count_exact, treatment_types, motorized, gate_code, finish, budget_tier
    from leads where name = ${NAME}`;
  expect(lead).toMatchObject({ status: "new", window_count_exact: 12, treatment_types: ["shutters", "cellular_shades"],
    motorized: true, gate_code: "#4321", finish: "luxury", budget_tier: "premium" });

  // Another browser has no key, so it gets the plain thank-you page.
  const stranger = await browser.newContext();
  const other = await stranger.newPage();
  await other.goto("/thank-you");
  await expect(other.getByRole("heading", { level: 1 })).toContainText(/thank you/i);
  await expect(other.getByRole("region", { name: "Help us come prepared" })).toHaveCount(0);
  await stranger.close();

  await signIn(page);
  await page.goto(`/admin/jobs/${lead.id}`);
  const project = page.getByRole("region", { name: "Project details" });
  for (const text of ["12", "Shutters", "Cellular shades", "#4321", "Luxury → Premium"]) await expect(project).toContainText(text);
  await expect(page.getByText("Customer added details: 12 windows · Shutters, Cellular shades · Motorized · Luxury")).toBeVisible();
});
```

- [ ] **Step 2: Full unit suite, types and lint**

Run: `npx vitest run --maxWorkers=2`, then `npx tsc --noEmit -p .`, then `npx eslint .`
Expected: all pass, 0 errors.

- [ ] **Step 3: Controller runs e2e on a Neon test branch** (owner approval first)

1. Create a branch as before: `npx --no-install neonctl branches create --project-id misty-fire-51038688 --name e2e-questionnaire --parent main`. Write its URL to the scratchpad `e2e-db-url.txt` without printing it.
2. Add `e2e-questionnaire-owner@example.com` to `ADMIN_EMAILS` in `run-e2e.mjs`.
3. Run `npx next build` in the worktree.
4. Run `E2E_ENDPOINT=<branch endpoint> node <scratchpad>/run-e2e.mjs e2e/questionnaire.spec.ts e2e/call.spec.ts e2e/follow-ups.spec.ts e2e/portal.spec.ts e2e/admin.spec.ts e2e/consultation.spec.ts`.

Expected: all pass (2 existing skips). Afterwards delete the branch and the URL file.

- [ ] **Step 4: Commit**

```bash
git add e2e/questionnaire.spec.ts
git commit -m "test: e2e for the consultation questionnaire"
```

## Launch (needs the owner's explicit approval, not part of SDD)

1. Ping pss-eb before merging to main.
2. Merge.
3. Run migration 010 on production: `node scripts/migrate.mjs`.
4. Deploy: `npx vercel --prod`.
5. Verify: `/thank-you` without the cookie returns 200 with no questionnaire; `/contact` returns 200.
