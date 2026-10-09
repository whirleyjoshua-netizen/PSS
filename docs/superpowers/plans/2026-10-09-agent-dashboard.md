# Agent Dashboard and Agent Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every PSS agent's reports, email proposals and decision requests land on one owner dashboard (`/admin/agents`) with a weekday summary email. Approved emails are sent by the app from support@, and agents follow one shared standard (`pss/agents/`) for folders, tools and a runner.

**Architecture:** The agents never call the app. A shared PowerShell runner pulls the owner's decisions, email replies and business counts into the agent's `inbox/`, runs the agent headless, then pushes the agent's `outbox/` to `POST /api/agents/sync` with a per-agent bearer key. The app stores items in Postgres (migration 044), renders them in the admin, sends approved emails through Microsoft Graph, polls only agent-email conversations for replies, and sends a Resend digest by cron.

**Tech Stack:** Next.js 16.3 App Router (this repo's version: read `node_modules/next/dist/docs/` for route handlers and server actions before writing them), Neon serverless Postgres (`db()` tagged templates), zod 4, vitest 4, Playwright, Resend, Microsoft Graph (`lib/calendar/graph.ts`), `react-markdown` + `remark-gfm`, PowerShell 5.1, Windows Task Scheduler.

**Spec:** `docs/superpowers/specs/2026-10-09-agent-dashboard-design.md`

## Global Constraints

- Migration number **044** (renamed from 042 on 2026-10-09: main took 042 and 043) (`db/migrations/044_agents.sql`). Every statement re-runnable. Whole-line `--` comments only, and no semicolons in comments.
- Production DB endpoint is `ep-cold-term`. Never print a connection string. Scripts that write refuse it.
- One recipient per email. No CC/BCC, attachments or HTML in v1.
- `daily_send_cap` default **10**, allowed range **0–50**. Counted per America/Los_Angeles day.
- Report `body_md` ≤ **200 KB** (UTF-8 bytes). ≤ **50** items per push. Reply `body_text` ≤ **50 KB**.
- Opt-out line, verbatim: `If you'd rather not hear from us, just reply "no thanks".`
- Opt-out match: `/\b(no thanks|unsubscribe|stop|remove me)\b/i`.
- Sending is refused until a mailing address is saved in Settings → Agents.
- Agents get **counts and sums only** from `stats`. Never names, phones, emails, addresses, notes or free text.
- Reply polling reads only messages whose `conversationId` belongs to an email an agent sent. It is read-only: never move, flag, mark read or delete.
- Digest cron `30 17 * * 1-5` (UTC), sent only when something changed since `last_digest_at`.
- Agent keys: 32 random bytes base64url, shown once, stored only as sha256 hex.
- Runner: `claude -p` in `--permission-mode dontAsk`. Allowed `Read(./**)`, `Glob`, `Grep`, `Edit(./**)`, `WebSearch`, `WebFetch`. Denied `Bash`, `PowerShell`, `Edit(./.git/**)`, `Edit(./.claude/**)`, `Edit(./inbox/**)`. It never pushes git.
- Follow existing style: each admin action calls `requireAdmin()` first. Unit tests mock `@/lib/db` as `db: () => sql` and assert SQL text. Real SQL is proven by a `scripts/verify-*.ts` run against a Neon test branch.

## Review Focus

1. **Double click on "Approve & send"** must send exactly once. Pinned by the atomic `claimForSend` (status `pending|failed` → `approved`) in Task 3 and the action test in Task 7.
2. **The agent re-pushes an email the owner already edited or decided.** Owner edits and decisions must survive. Pinned by `upsertItem` returning `locked` for decided items, and by owner edits living in `final_*`, which the push never writes (Tasks 3, 6).
3. **A reply in the support@ inbox from a customer who never got an agent email** must never reach an agent. Pinned in Task 5 (`pollReplies` queries only stored conversation ids).
4. **Graph returns 403 because Mail.Send isn't granted yet.** The owner must see a plain explanation, not a 500, and the item must stay retryable. Pinned in Task 5 (`sendApproved` maps 403) and Task 7.
5. **The runner is offline or the app is down.** The agent still runs, the inbox says so, and the outbox is kept for the next push. Pinned in Task 13 (`-SimulatePullFailure` dry run).

---

## File map

| File | Responsibility |
|---|---|
| `db/migrations/044_agents.sql` | tables `agents`, `agent_items`, `agent_replies`, `email_suppressions`, `agent_settings`; seeds Tara and Tobi |
| `lib/agents/rules.ts` | pure: kinds, statuses, zod push schemas, key helpers, footer, opt-out, send blockers |
| `lib/agents/store.ts` | all SQL for the above tables |
| `lib/agents/stats.ts` | aggregate business counts (no PII) |
| `lib/agents/mail.ts` | Graph send of an approved email; reply polling |
| `app/api/agents/sync/route.ts` | GET pull / POST push for runners |
| `app/admin/agents/actions.ts` | owner actions: approve & send, save edits, decline, decide, retry, refresh replies |
| `app/admin/agents/page.tsx` + `NeedsYou.tsx`, `EmailCard.tsx`, `DecisionCard.tsx`, `AgentCards.tsx`, `RecentReplies.tsx` | dashboard |
| `app/admin/agents/[slug]/page.tsx` | one agent's history |
| `app/admin/agents/[slug]/[itemId]/page.tsx` + `components/admin/Markdown.tsx` | one report rendered |
| `app/admin/AdminNav.tsx`, `app/admin/layout.tsx` | "Agents" link + badge |
| `app/admin/settings/AgentsSection.tsx`, `AgentKeyButton.tsx`, `agent-actions.ts` | agents, keys, mailing address, signature, do-not-contact |
| `lib/agents/digest.ts`, `app/api/cron/agent-digest/route.ts`, `vercel.json` | morning email |
| `scripts/verify-agents.ts` + `.config.mts` | real-DB proof of migration 044 and the store SQL |
| `e2e/agents.spec.ts`, `playwright.config.ts` | end-to-end |
| `pss/agents/*` (outside this repo) | STANDARD.md, TOOLS.md, registry.json, run-agent.ps1, set-agent-key.ps1, install-schedules.ps1, README.md |
| `pss/agent_growth/*`, `pss/agent_outreach/*` | move Tara and Tobi onto the standard |

Shared types (defined in Task 2, used everywhere):

```ts
export type ItemKind = "report" | "email" | "decision";
export type ItemStatus = "unread" | "read" | "pending" | "approved" | "sent" | "failed" | "declined" | "answered";
export type AgentItem = {
  id: string; agentSlug: string; externalId: string; kind: ItemKind; title: string; summary: string | null;
  reportType: string | null; bodyMd: string | null; emailTo: string | null; emailSubject: string | null; emailBody: string | null;
  reason: string | null; status: ItemStatus; ownerNote: string | null;
  finalTo: string | null; finalSubject: string | null; finalBody: string | null; sentBody: string | null;
  decidedBy: string | null; decidedAt: Date | null; sentAt: Date | null; conversationId: string | null; error: string | null;
  createdAt: Date; updatedAt: Date;
};
export type Agent = {
  slug: string; name: string; role: string; hasKey: boolean; statsAccess: boolean; dailySendCap: number;
  lastRunAt: Date | null; lastRunStatus: "ok" | "failed" | null; lastRunNote: string | null;
};
```

Spec refinement (no change in intent): `final_to/final_subject/final_body` hold the **approved** recipient, subject and body (the owner's edits, or the proposal unchanged). The new column `sent_body` holds the exact composed text Graph sent, which is the body plus the footer. `agent_settings` also gets `last_reply_poll_at`.

---

### Task 1: Migration 044 and its real-database proof

**Files:**
- Create: `db/migrations/044_agents.sql`
- Create: `scripts/verify-agents.ts`, `scripts/verify-agents.config.mts`

**Interfaces:**
- Produces: the tables and columns every later task's SQL uses (names below are final).

- [ ] **Step 1: Write the migration**

```sql
-- Agent dashboard (docs/superpowers/specs/2026-10-09-agent-dashboard-design.md).
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

create table if not exists agents (
  slug            text primary key,
  name            text not null,
  role            text not null default '',
  key_hash        text,
  stats_access    boolean not null default false,
  daily_send_cap  integer not null default 10,
  last_run_at     timestamptz,
  last_run_status text,
  last_run_note   text,
  created_at      timestamptz not null default now()
);
alter table agents drop constraint if exists agents_slug_check;
alter table agents add constraint agents_slug_check check (slug ~ '^[a-z][a-z0-9-]{1,30}$');
alter table agents drop constraint if exists agents_cap_check;
alter table agents add constraint agents_cap_check check (daily_send_cap between 0 and 50);
alter table agents drop constraint if exists agents_run_status_check;
alter table agents add constraint agents_run_status_check check (last_run_status is null or last_run_status in ('ok', 'failed'));
alter table agents drop constraint if exists agents_key_hash_check;
alter table agents add constraint agents_key_hash_check check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists agents_key_hash_idx on agents (key_hash) where key_hash is not null;

create table if not exists agent_items (
  id                  uuid primary key default gen_random_uuid(),
  agent_slug          text not null references agents (slug) on delete cascade,
  external_id         text not null,
  kind                text not null,
  title               text not null,
  summary             text,
  report_type         text,
  body_md             text,
  email_to            text,
  email_subject       text,
  email_body          text,
  reason              text,
  status              text not null,
  owner_note          text,
  final_to            text,
  final_subject       text,
  final_body          text,
  sent_body           text,
  decided_by          text,
  decided_at          timestamptz,
  sent_at             timestamptz,
  graph_message_id    text,
  conversation_id     text,
  internet_message_id text,
  error               text,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists agent_items_agent_external_idx on agent_items (agent_slug, external_id);
create index if not exists agent_items_agent_created_idx on agent_items (agent_slug, created_at desc);
create index if not exists agent_items_open_idx on agent_items (status) where status in ('pending', 'failed', 'unread');
create index if not exists agent_items_conversation_idx on agent_items (conversation_id) where conversation_id is not null;

alter table agent_items drop constraint if exists agent_items_kind_status_check;
alter table agent_items add constraint agent_items_kind_status_check check (
  (kind = 'report'   and status in ('unread', 'read')) or
  (kind = 'email'    and status in ('pending', 'approved', 'sent', 'failed', 'declined')) or
  (kind = 'decision' and status in ('pending', 'approved', 'declined', 'answered'))
);
alter table agent_items drop constraint if exists agent_items_external_id_check;
alter table agent_items add constraint agent_items_external_id_check check (external_id ~ '^[A-Za-z0-9._-]{1,100}$');
alter table agent_items drop constraint if exists agent_items_title_check;
alter table agent_items add constraint agent_items_title_check check (char_length(title) between 1 and 200);
alter table agent_items drop constraint if exists agent_items_report_type_check;
alter table agent_items add constraint agent_items_report_type_check check (
  (kind = 'report' and report_type in ('daily', 'weekly', 'monthly', 'brief', 'other')) or (kind <> 'report' and report_type is null)
);
alter table agent_items drop constraint if exists agent_items_body_size_check;
alter table agent_items add constraint agent_items_body_size_check check (body_md is null or octet_length(body_md) <= 204800);
alter table agent_items drop constraint if exists agent_items_email_fields_check;
alter table agent_items add constraint agent_items_email_fields_check check (
  kind <> 'email' or (email_to is not null and email_subject is not null and email_body is not null)
);

create table if not exists agent_replies (
  id                  uuid primary key default gen_random_uuid(),
  item_id             uuid not null references agent_items (id) on delete cascade,
  internet_message_id text not null,
  from_address        text not null,
  received_at         timestamptz not null,
  subject             text,
  body_text           text not null default '',
  delivered_at        timestamptz,
  seen_at             timestamptz,
  created_at          timestamptz not null default now()
);
create unique index if not exists agent_replies_message_idx on agent_replies (internet_message_id);
alter table agent_replies drop constraint if exists agent_replies_body_size_check;
alter table agent_replies add constraint agent_replies_body_size_check check (octet_length(body_text) <= 51200);

create table if not exists email_suppressions (
  address    text primary key,
  reason     text,
  source     text not null,
  created_at timestamptz not null default now()
);
alter table email_suppressions drop constraint if exists email_suppressions_address_check;
alter table email_suppressions add constraint email_suppressions_address_check check (address = lower(btrim(address)) and address like '%_@_%');
alter table email_suppressions drop constraint if exists email_suppressions_source_check;
alter table email_suppressions add constraint email_suppressions_source_check check (source in ('reply', 'owner'));

create table if not exists agent_settings (
  id                 boolean primary key default true,
  mailing_address    text,
  signature          text,
  last_digest_at     timestamptz,
  last_reply_poll_at timestamptz,
  updated_by         text,
  updated_at         timestamptz not null default now()
);
alter table agent_settings drop constraint if exists agent_settings_single_row;
alter table agent_settings add constraint agent_settings_single_row check (id);
insert into agent_settings (id) values (true) on conflict do nothing;

-- The two agents that exist today. Keys are created in Settings, never here.
insert into agents (slug, name, role, stats_access) values ('tara', 'Tara', 'Marketing strategist', true) on conflict do nothing;
insert into agents (slug, name, role, stats_access) values ('tobi', 'Tobi', 'B2B commercial outreach', false) on conflict do nothing;
```

- [ ] **Step 2: Write the verify script config** (`scripts/verify-agents.config.mts`), a copy of `scripts/verify-resources.config.mts` with `include: ["scripts/verify-agents.ts"]` and the comment naming verify-agents.

- [ ] **Step 3: Write `scripts/verify-agents.ts`, migration part.** Copy the header pattern from `scripts/verify-resources.ts`: the refuse/`FORBIDDEN_HOSTS`/`check`/`throwsWith`/`apply` helpers, `process.env.POSTGRES_URL = url`. Then:

```ts
const SLUG = `verify-${Date.now().toString(36)}`;
test("agents: migration 044", async () => {
  await apply("044_agents.sql");
  await apply("044_agents.sql");
  check(true, "migration 044 applies, and re-applies", "");
  const seeded = await sql`select slug, stats_access from agents where slug in ('tara','tobi') order by slug`;
  check(seeded.length === 2 && seeded[0].stats_access === true && seeded[1].stats_access === false, "Tara and Tobi seeded", JSON.stringify(seeded));
  check((await sql`select count(*)::int as n from agent_settings`)[0].n === 1, "one settings row", "");
  await sql`insert into agents (slug, name) values (${SLUG}, 'Verify')`;
  const bad = async (label: string, run: () => Promise<unknown>) => check((await throwsWith(run)) !== null, `refuses ${label}`, "");
  await bad("a bad slug", () => sql`insert into agents (slug, name) values ('Bad Slug', 'x')`);
  await bad("a cap of 51", () => sql`update agents set daily_send_cap = 51 where slug = ${SLUG}`);
  await bad("a report with status pending", () => sql`insert into agent_items (agent_slug, external_id, kind, title, report_type, status) values (${SLUG}, 'r1', 'report', 't', 'daily', 'pending')`);
  await bad("a report without a type", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'r2', 'report', 't', 'unread')`);
  await bad("an email without a body", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status, email_to, email_subject) values (${SLUG}, 'e1', 'email', 't', 'pending', 'a@b.co', 's')`);
  await bad("an external id with a space", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'a b', 'decision', 't', 'pending')`);
  await bad("a 201 KB report", () => sql`insert into agent_items (agent_slug, external_id, kind, title, report_type, status, body_md) values (${SLUG}, 'r3', 'report', 't', 'daily', 'unread', ${"x".repeat(205_000)})`);
  await bad("an upper-case suppression", () => sql`insert into email_suppressions (address, source) values ('A@B.CO', 'owner')`);
  await sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'd1', 'decision', 't', 'pending')`;
  await bad("a duplicate (agent, external_id)", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'd1', 'decision', 't', 'pending')`);
});
test.afterAll(async () => { await sql`delete from agents where slug like 'verify-%'`; });
```

(Use `afterAll` from vitest: `import { afterAll, test } from "vitest"`.)

- [ ] **Step 4: Run it against the Neon test branch.** Use the test-branch URL from another worktree's `.env.test.local` (e.g. `.claude/worktrees/dc-quote-import/.env.test.local`) or create a fresh Neon branch. Never print the URL; pass it through the environment only.

Run: `E2E_POSTGRES_URL="$(grep -h '^E2E_POSTGRES_URL=' ../dc-quote-import/.env.test.local | cut -d= -f2- | tr -d '"')" npx vitest run --config scripts/verify-agents.config.mts --disableConsoleIntercept`
Expected: every line `ok`, PASS. To watch it fail: change the cap check to `between 0 and 60` on the branch and re-run; "refuses a cap of 51" fails. Revert.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/044_agents.sql scripts/verify-agents.ts scripts/verify-agents.config.mts
git commit -m "feat(agents): migration 044 agents, items, replies, suppressions, settings, with real-database proof"
```

---

### Task 2: Pure rules (`lib/agents/rules.ts`)

**Files:**
- Create: `lib/agents/rules.ts`
- Test: `tests/agents/rules.test.ts`

**Interfaces:**
- Produces: `ITEM_KINDS`, `REPORT_TYPES`, `ItemKind`, `ItemStatus`, `AgentItem`, `Agent` (types above), `MAX_ITEMS_PER_PUSH = 50`, `MAX_BODY_BYTES = 204800`, `hashKey(key: string): string`, `newAgentKey(): string`, `bearerKey(header: string | null): string | null`, `pushSchema`, `parsePushItem(raw: unknown): { ok: true; item: PushItem } | { ok: false; reason: string }`, `type PushItem`, `OPT_OUT_LINE`, `isOptOut(text: string): boolean`, `defaultSignature(): string`, `composeEmailBody(body, signature, mailingAddress): string`, `sendBlocker(input): string | null`, `agentFormSchema`, `emailEditSchema`, `settingsSchema`, `normalizeAddress(a: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  bearerKey, composeEmailBody, defaultSignature, hashKey, isOptOut, newAgentKey, OPT_OUT_LINE, parsePushItem, pushSchema, sendBlocker,
} from "@/lib/agents/rules";

describe("keys", () => {
  it("makes 43-character base64url keys, different each time", () => {
    const a = newAgentKey(), b = newAgentKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  it("hashes to 64 hex characters", () => {
    expect(hashKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("reads only a well-formed bearer header", () => {
    const key = newAgentKey();
    expect(bearerKey(`Bearer ${key}`)).toBe(key);
    expect(bearerKey(`bearer ${key}`)).toBeNull();
    expect(bearerKey("Bearer short")).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
});

describe("push items", () => {
  const report = { kind: "report", external_id: "2026-10-09-daily", title: "Daily brief", report_type: "daily", body_md: "# Hi" };
  it("accepts a report, an email and a decision", () => {
    expect(parsePushItem(report)).toMatchObject({ ok: true });
    expect(parsePushItem({ kind: "email", external_id: "e-1", title: "Intro", email_to: "Pat@Example.com ", email_subject: "Hello", email_body: "Hi Pat", reason: "Four Seasons" }))
      .toEqual({ ok: true, item: expect.objectContaining({ email_to: "pat@example.com" }) });
    expect(parsePushItem({ kind: "decision", external_id: "A-001", title: "Pick a tagline" })).toMatchObject({ ok: true });
  });
  it("refuses two recipients, a bad id, a 201 KB report and an unknown kind, with a reason", () => {
    expect(parsePushItem({ kind: "email", external_id: "e-2", title: "x", email_to: "a@b.co, c@d.co", email_subject: "s", email_body: "b" })).toMatchObject({ ok: false });
    expect(parsePushItem({ ...report, external_id: "has space" })).toEqual({ ok: false, reason: expect.stringContaining("external_id") });
    expect(parsePushItem({ ...report, body_md: "x".repeat(204_801) })).toEqual({ ok: false, reason: expect.stringContaining("200 KB") });
    expect(parsePushItem({ kind: "tweet", external_id: "t", title: "t" })).toMatchObject({ ok: false });
  });
  it("caps a push at 50 items and allows a push with only a run status", () => {
    expect(pushSchema.safeParse({ items: Array(51).fill(report) }).success).toBe(false);
    expect(pushSchema.safeParse({ run: { status: "ok" } }).success).toBe(true);
  });
});

describe("email body", () => {
  it("adds signature, mailing address and the opt-out line, exactly", () => {
    expect(composeEmailBody("  Hi Pat  ", "PSS\n702", "PO Box 1, Las Vegas NV")).toBe(
      `Hi Pat\n\n--\nPSS\n702\nPO Box 1, Las Vegas NV\n\n${OPT_OUT_LINE}`,
    );
    expect(OPT_OUT_LINE).toBe(`If you'd rather not hear from us, just reply "no thanks".`);
  });
  it("default signature names the business, phone and site", () => {
    expect(defaultSignature()).toBe("Premier Shade Solutions\n(702) 859-8294\npremiershadesolutions.com");
  });
  it("spots opt-outs, and not lookalikes", () => {
    for (const t of ["No thanks.", "please UNSUBSCRIBE me", "STOP", "remove me from your list"]) expect(isOptOut(t)).toBe(true);
    for (const t of ["Thanks so much!", "nonstop schedule", "let's not stopgap"]) expect(isOptOut(t)).toBe(false);
  });
});

describe("sendBlocker", () => {
  const ok = { outlookConfigured: true, mailingAddress: "PO Box 1", suppressed: false, sentToday: 0, cap: 10 };
  it("allows a clean send", () => expect(sendBlocker(ok)).toBeNull());
  it("names each blocker", () => {
    expect(sendBlocker({ ...ok, outlookConfigured: false })).toMatch(/Outlook is not connected/);
    expect(sendBlocker({ ...ok, mailingAddress: " " })).toMatch(/mailing address/);
    expect(sendBlocker({ ...ok, suppressed: true })).toMatch(/do-not-contact/);
    expect(sendBlocker({ ...ok, sentToday: 10 })).toMatch(/10 emails today/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/agents/rules.test.ts`
Expected: FAIL, "Cannot find module '@/lib/agents/rules'".

- [ ] **Step 3: Implement**

```ts
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { business } from "@/content/business";

export const ITEM_KINDS = ["report", "email", "decision"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const REPORT_TYPES = ["daily", "weekly", "monthly", "brief", "other"] as const;
export type ItemStatus = "unread" | "read" | "pending" | "approved" | "sent" | "failed" | "declined" | "answered";
// Paste the AgentItem and Agent types from the plan's "Shared types" block here.

export const MAX_ITEMS_PER_PUSH = 50;
export const MAX_BODY_BYTES = 204_800;
const MAX_EMAIL_BODY = 20_000;

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");
export const newAgentKey = (): string => randomBytes(32).toString("base64url");
export function bearerKey(header: string | null): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(header?.trim() ?? "");
  return match ? match[1] : null;
}
export const normalizeAddress = (address: string): string => address.trim().toLowerCase();

const sized = z.string().refine((s) => Buffer.byteLength(s, "utf8") <= MAX_BODY_BYTES, "body_md is too large (200 KB max)");
const common = {
  external_id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/, "external_id: 1-100 letters, digits, dot, dash or underscore"),
  title: z.string().trim().min(1, "title is required").max(200),
  summary: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(2000).optional(),
};
const itemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report"), ...common, report_type: z.enum(REPORT_TYPES), body_md: sized.pipe(z.string().min(1, "body_md is required")) }),
  z.object({
    kind: z.literal("email"), ...common,
    email_to: z.string().transform(normalizeAddress).pipe(z.email("email_to must be one email address")),
    email_subject: z.string().trim().min(1).max(200),
    email_body: z.string().trim().min(1).max(MAX_EMAIL_BODY),
  }),
  z.object({ kind: z.literal("decision"), ...common, body_md: sized.optional() }),
]);
export type PushItem = z.infer<typeof itemSchema>;

export function parsePushItem(raw: unknown): { ok: true; item: PushItem } | { ok: false; reason: string } {
  const parsed = itemSchema.safeParse(raw);
  return parsed.success ? { ok: true, item: parsed.data } : { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
}

/** Items are checked one by one (parsePushItem), so one bad item doesn't sink the rest. */
export const pushSchema = z.object({
  run: z.object({ status: z.enum(["ok", "failed"]), note: z.string().trim().max(500).optional() }).optional(),
  items: z.array(z.unknown()).max(MAX_ITEMS_PER_PUSH).default([]),
});

export const OPT_OUT_LINE = `If you'd rather not hear from us, just reply "no thanks".`;
const OPT_OUT = /\b(no thanks|unsubscribe|stop|remove me)\b/i;
export const isOptOut = (text: string): boolean => OPT_OUT.test(text);

export const defaultSignature = (): string =>
  [business.name, business.phone.display, business.domain.replace(/^https?:\/\//, "")].join("\n");

export const composeEmailBody = (body: string, signature: string, mailingAddress: string): string =>
  `${body.trim()}\n\n--\n${signature.trim()}\n${mailingAddress.trim()}\n\n${OPT_OUT_LINE}`;

export function sendBlocker(input: {
  outlookConfigured: boolean; mailingAddress: string | null; suppressed: boolean; sentToday: number; cap: number;
}): string | null {
  if (!input.outlookConfigured) return "Outlook is not connected, so the app can't send email.";
  if (!input.mailingAddress?.trim()) return "Add a mailing address in Settings → Agents first. Outreach email must include one.";
  if (input.suppressed) return "This address is on the do-not-contact list.";
  if (input.sentToday >= input.cap) return `This agent has sent ${input.cap} emails today, its daily limit.`;
  return null;
}

export const agentFormSchema = z.object({
  slug: z.string().trim().regex(/^[a-z][a-z0-9-]{1,30}$/, "Slug: lower-case letters, digits and dashes, starting with a letter"),
  name: z.string().trim().min(1, "Name the agent").max(60),
  role: z.string().trim().max(120).default(""),
  statsAccess: z.boolean(),
  dailySendCap: z.coerce.number().int().min(0).max(50),
});
export const emailEditSchema = z.object({
  to: z.string().transform(normalizeAddress).pipe(z.email("One email address")),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(MAX_EMAIL_BODY),
});
export const settingsSchema = z.object({
  mailingAddress: z.string().trim().max(300),
  signature: z.string().trim().max(500),
});
```

- [ ] **Step 4: Run tests, expect PASS.** Run: `npx vitest run tests/agents/rules.test.ts`. Power check: change `{40,100}` to `{4,100}` in `bearerKey` and watch "reads only a well-formed bearer header" fail. Revert.

- [ ] **Step 5: Commit** `git add lib/agents/rules.ts tests/agents/rules.test.ts && git commit -m "feat(agents): push validation, keys, email footer and send rules"`

---

### Task 3: Store (`lib/agents/store.ts`)

**Files:**
- Create: `lib/agents/store.ts`
- Test: `tests/agents/store.test.ts`
- Modify: `scripts/verify-agents.ts` (add a store test block)

**Interfaces:**
- Consumes: `PushItem`, `AgentItem`, `Agent`, `ItemStatus` from Task 2.
- Produces (all async):
  - `findAgentByKeyHash(hash: string): Agent | null`
  - `getAgent(slug): Agent | null`
  - `listAgentCards(): AgentCard[]` where `AgentCard = Agent & { pending: number; unreadReports: number; newestReport: { id: string; title: string; summary: string | null; status: ItemStatus; createdAt: Date } | null }`
  - `createAgent(input: { slug; name; role; statsAccess; dailySendCap }): boolean`
  - `setAgentKeyHash(slug, hash): boolean`
  - `recordRun(slug, status: "ok" | "failed", note: string | null): void`
  - `upsertItem(slug, item: PushItem): "created" | "updated" | "locked"`
  - `listNeedsYou(): AgentItem[]`
  - `listItems(slug, reportType?: string): AgentItem[]`
  - `getItem(id): AgentItem | null`
  - `markRead(id): void`
  - `saveEmailEdits(id, edits: { to; subject; body }): boolean`
  - `decideItem(id, input: { status: "approved" | "declined" | "answered"; note: string | null; by: string }): boolean`
  - `claimForSend(id, by): AgentItem | null`
  - `markSent(id, sent: { sentBody; graphMessageId; conversationId; internetMessageId }): void`
  - `markFailed(id, error: string): void`
  - `sentTodayCount(slug, laDate: string): number`
  - `pullUpdates(slug): AgentItem[]`
  - `insertReply(reply: { itemId; internetMessageId; from; receivedAt: Date; subject: string | null; bodyText: string }): boolean`
  - `pullReplies(slug): ReplyOut[]`
  - `listRecentReplies(limit): RecentReply[]`
  - `markRepliesSeen(): void`
  - `sentConversations(days): { id: string; conversationId: string }[]`
  - `isSuppressed(address): boolean`, `addSuppression(address, reason, source: "reply" | "owner"): void`, `removeSuppression(address): void`, `listSuppressions(): { address; reason; source; createdAt }[]`
  - `getAgentSettings(): { mailingAddress: string | null; signature: string | null; lastDigestAt: Date | null }`
  - `saveAgentSettings(input: { mailingAddress; signature; by }): void`
  - `claimReplyPoll(): boolean` (true at most once per 2 minutes)
  - `setDigestAt(at: Date): void`
  - `needsYouCount(): number`
  - `digestFacts(since: Date | null): DigestFacts`

  `ReplyOut = { external_id: string; from: string; received_at: string; subject: string | null; body_text: string }`; `RecentReply = { id; itemId; agentSlug; itemTitle; from; receivedAt: Date; subject; bodyText; seen: boolean }`; `DigestFacts = { newReports: { agentSlug: string; agentName: string; title: string }[]; pending: number; newReplies: number; failedRuns: { agentName: string; note: string | null }[] }`.

- [ ] **Step 1: Write the failing tests** (SQL text and mapping, mocked `db`, the `resources-store.test.ts` style):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/agents/store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const values = (call: unknown[]) => call.slice(1);
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const itemRow = {
  id: ID, agent_slug: "tobi", external_id: "e-1", kind: "email", title: "Intro", summary: null, report_type: null, body_md: null,
  email_to: "pat@example.com", email_subject: "Hello", email_body: "Hi", reason: "r", status: "pending", owner_note: null,
  final_to: null, final_subject: null, final_body: null, sent_body: null, decided_by: null, decided_at: null, sent_at: null,
  conversation_id: null, error: null, created_at: "2026-10-09T15:00:00Z", updated_at: "2026-10-09T15:00:00Z",
};
beforeEach(() => { sql.mockReset().mockResolvedValue([]); });

describe("upsertItem", () => {
  const email = { kind: "email" as const, external_id: "e-1", title: "Intro", email_to: "pat@example.com", email_subject: "Hello", email_body: "Hi" };
  it("inserts as pending and updates only while the owner hasn't acted", async () => {
    sql.mockResolvedValue([{ created: true }]);
    expect(await store.upsertItem("tobi", email)).toBe("created");
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("on conflict (agent_slug, external_id) do update set");
    expect(q).toContain("where agent_items.status in ('unread', 'pending')");
    expect(q).not.toMatch(/final_(to|subject|body)\s*=/); // owner edits are never overwritten by a push
    expect(values(sql.mock.calls[0])).toContain("pending");
  });
  it("answers updated, or locked when the row was decided", async () => {
    sql.mockResolvedValue([{ created: false }]);
    expect(await store.upsertItem("tobi", email)).toBe("updated");
    sql.mockResolvedValue([]);
    expect(await store.upsertItem("tobi", email)).toBe("locked");
  });
  it("stores a report as unread", async () => {
    sql.mockResolvedValue([{ created: true }]);
    await store.upsertItem("tara", { kind: "report", external_id: "r", title: "t", report_type: "daily", body_md: "# x" });
    expect(values(sql.mock.calls[0])).toContain("unread");
  });
});

describe("claimForSend", () => {
  it("claims only a pending or failed email, in one statement, keeping owner edits", async () => {
    sql.mockResolvedValue([itemRow]);
    expect(await store.claimForSend(ID, "owner@example.com")).toMatchObject({ id: ID, kind: "email" });
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("status = 'approved'");
    expect(q).toContain("final_to = coalesce(final_to, email_to)");
    expect(q).toContain("where id = ? and kind = 'email' and status in ('pending', 'failed')");
  });
  it("answers null when someone else got there first", async () => {
    sql.mockResolvedValue([]);
    expect(await store.claimForSend(ID, "owner@example.com")).toBeNull();
  });
});

describe("pull", () => {
  it("returns and marks delivered only decided items of this agent, in one statement", async () => {
    await store.pullUpdates("tara");
    const q = text(sql.mock.calls[0]);
    expect(q).toMatch(/^ ?update agent_items set delivered_at = now\(\) where agent_slug = \? and delivered_at is null and status not in \('unread', 'read', 'pending'\) returning/);
    expect(values(sql.mock.calls[0])).toEqual(["tara"]);
  });
  it("replies: only this agent's, marked delivered", async () => {
    await store.pullReplies("tobi");
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("from agent_items i where r.item_id = i.id and i.agent_slug = ? and r.delivered_at is null");
  });
});

describe("decisions reset delivery so the agent hears about them", () => {
  it("decideItem, markSent and markFailed set delivered_at = null", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await store.decideItem(ID, { status: "declined", note: "not now", by: "o@x.co" });
    await store.markSent(ID, { sentBody: "b", graphMessageId: "g", conversationId: "c", internetMessageId: "m" });
    await store.markFailed(ID, "boom");
    for (const call of sql.mock.calls) expect(text(call)).toContain("delivered_at = null");
    expect(text(sql.mock.calls[0])).toContain("where id = ? and status = 'pending'");
  });
});

describe("sentTodayCount", () => {
  it("counts sends on the Las Vegas calendar day", async () => {
    sql.mockResolvedValue([{ n: 3 }]);
    expect(await store.sentTodayCount("tobi", "2026-10-09")).toBe(3);
    expect(text(sql.mock.calls[0])).toContain("(sent_at at time zone 'America/Los_Angeles')::date = ?::date");
  });
});

describe("claimReplyPoll", () => {
  it("is one conditional update with a 2-minute window", async () => {
    sql.mockResolvedValue([{ id: true }]);
    expect(await store.claimReplyPoll()).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("last_reply_poll_at < now() - interval '2 minutes'");
    sql.mockResolvedValue([]);
    expect(await store.claimReplyPoll()).toBe(false);
  });
});

describe("suppressions", () => {
  it("normalizes the address", async () => {
    await store.addSuppression("  Pat@Example.COM ", "replied no thanks", "reply");
    expect(values(sql.mock.calls[0])[0]).toBe("pat@example.com");
    expect(text(sql.mock.calls[0])).toContain("on conflict (address) do nothing");
  });
});
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/agents/store.test.ts`. Expected FAIL (module missing).

- [ ] **Step 3: Implement** `lib/agents/store.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";
import { normalizeAddress, type Agent, type AgentItem, type ItemStatus, type PushItem } from "./rules";

/** Rows for migration 044. Unit tests pin this SQL's text. scripts/verify-agents.ts runs it on a real database. */

const date = (v: unknown) => (v ? new Date(v as string) : null);
const ITEM_COLUMNS = `id, agent_slug, external_id, kind, title, summary, report_type, body_md, email_to, email_subject, email_body,
  reason, status, owner_note, final_to, final_subject, final_body, sent_body, decided_by, decided_at, sent_at, conversation_id,
  error, created_at, updated_at`;

export function toItem(r: Record<string, unknown>): AgentItem {
  return {
    id: r.id as string, agentSlug: r.agent_slug as string, externalId: r.external_id as string, kind: r.kind as AgentItem["kind"],
    title: r.title as string, summary: (r.summary as string | null) ?? null, reportType: (r.report_type as string | null) ?? null,
    bodyMd: (r.body_md as string | null) ?? null, emailTo: (r.email_to as string | null) ?? null,
    emailSubject: (r.email_subject as string | null) ?? null, emailBody: (r.email_body as string | null) ?? null,
    reason: (r.reason as string | null) ?? null, status: r.status as ItemStatus, ownerNote: (r.owner_note as string | null) ?? null,
    finalTo: (r.final_to as string | null) ?? null, finalSubject: (r.final_subject as string | null) ?? null,
    finalBody: (r.final_body as string | null) ?? null, sentBody: (r.sent_body as string | null) ?? null,
    decidedBy: (r.decided_by as string | null) ?? null, decidedAt: date(r.decided_at), sentAt: date(r.sent_at),
    conversationId: (r.conversation_id as string | null) ?? null, error: (r.error as string | null) ?? null,
    createdAt: new Date(r.created_at as string), updatedAt: new Date(r.updated_at as string),
  };
}
function toAgent(r: Record<string, unknown>): Agent {
  return {
    slug: r.slug as string, name: r.name as string, role: r.role as string, hasKey: r.key_hash != null,
    statsAccess: Boolean(r.stats_access), dailySendCap: Number(r.daily_send_cap), lastRunAt: date(r.last_run_at),
    lastRunStatus: (r.last_run_status as Agent["lastRunStatus"]) ?? null, lastRunNote: (r.last_run_note as string | null) ?? null,
  };
}

export async function findAgentByKeyHash(hash: string): Promise<Agent | null> {
  const [row] = await db()`select * from agents where key_hash = ${hash}`;
  return row ? toAgent(row) : null;
}
export async function getAgent(slug: string): Promise<Agent | null> {
  const [row] = await db()`select * from agents where slug = ${slug}`;
  return row ? toAgent(row) : null;
}
export async function createAgent(input: { slug: string; name: string; role: string; statsAccess: boolean; dailySendCap: number }): Promise<boolean> {
  const rows = await db()`
    insert into agents (slug, name, role, stats_access, daily_send_cap)
    values (${input.slug}, ${input.name}, ${input.role}, ${input.statsAccess}, ${input.dailySendCap})
    on conflict (slug) do nothing returning slug`;
  return rows.length > 0;
}
export async function setAgentKeyHash(slug: string, hash: string): Promise<boolean> {
  return (await db()`update agents set key_hash = ${hash} where slug = ${slug} returning slug`).length > 0;
}
export async function recordRun(slug: string, status: "ok" | "failed", note: string | null): Promise<void> {
  await db()`update agents set last_run_at = now(), last_run_status = ${status}, last_run_note = ${note} where slug = ${slug}`;
}

export async function upsertItem(slug: string, item: PushItem): Promise<"created" | "updated" | "locked"> {
  const status = item.kind === "report" ? "unread" : "pending";
  const body = item.kind === "email" ? null : (item.body_md ?? null);
  const reportType = item.kind === "report" ? item.report_type : null;
  const [to, subject, emailBody] = item.kind === "email" ? [item.email_to, item.email_subject, item.email_body] : [null, null, null];
  const rows = await db()`
    insert into agent_items (agent_slug, external_id, kind, title, summary, report_type, body_md, email_to, email_subject, email_body, reason, status)
    values (${slug}, ${item.external_id}, ${item.kind}, ${item.title}, ${item.summary ?? null}, ${reportType}, ${body},
            ${to}, ${subject}, ${emailBody}, ${item.reason ?? null}, ${status})
    on conflict (agent_slug, external_id) do update set
      title = excluded.title, summary = excluded.summary, report_type = excluded.report_type, body_md = excluded.body_md,
      email_to = excluded.email_to, email_subject = excluded.email_subject, email_body = excluded.email_body,
      reason = excluded.reason, updated_at = now()
    where agent_items.status in ('unread', 'pending') and agent_items.kind = excluded.kind
    returning (xmax = 0) as created`;
  if (rows.length === 0) return "locked";
  return rows[0].created ? "created" : "updated";
}

export async function listNeedsYou(): Promise<AgentItem[]> {
  const rows = await db().query(
    `select ${ITEM_COLUMNS} from agent_items where kind in ('email', 'decision') and status in ('pending', 'failed') order by created_at`,
  );
  return rows.map(toItem);
}
export async function listItems(slug: string, reportType?: string): Promise<AgentItem[]> {
  const rows = await db().query(
    `select ${ITEM_COLUMNS} from agent_items where agent_slug = $1 and ($2::text is null or report_type = $2) order by created_at desc limit 200`,
    [slug, reportType ?? null],
  );
  return rows.map(toItem);
}
export async function getItem(id: string): Promise<AgentItem | null> {
  if (!isUuid(id)) return null;
  const [row] = await db().query(`select ${ITEM_COLUMNS} from agent_items where id = $1`, [id]);
  return row ? toItem(row) : null;
}
export async function markRead(id: string): Promise<void> {
  await db()`update agent_items set status = 'read', updated_at = now() where id = ${id} and status = 'unread'`;
}
export async function saveEmailEdits(id: string, edits: { to: string; subject: string; body: string }): Promise<boolean> {
  const rows = await db()`
    update agent_items set final_to = ${edits.to}, final_subject = ${edits.subject}, final_body = ${edits.body}, updated_at = now()
    where id = ${id} and kind = 'email' and status in ('pending', 'failed') returning id`;
  return rows.length > 0;
}
export async function decideItem(id: string, input: { status: "approved" | "declined" | "answered"; note: string | null; by: string }): Promise<boolean> {
  const rows = await db()`
    update agent_items set status = ${input.status}, owner_note = ${input.note}, decided_by = ${input.by}, decided_at = now(),
      delivered_at = null, updated_at = now()
    where id = ${id} and status = 'pending' and (kind = 'decision' or ${input.status} = 'declined') returning id`;
  return rows.length > 0;
}
export async function claimForSend(id: string, by: string): Promise<AgentItem | null> {
  const rows = await db()`
    update agent_items set status = 'approved', final_to = coalesce(final_to, email_to),
      final_subject = coalesce(final_subject, email_subject), final_body = coalesce(final_body, email_body),
      decided_by = ${by}, decided_at = now(), error = null, delivered_at = null, updated_at = now()
    where id = ${id} and kind = 'email' and status in ('pending', 'failed')
    returning *`;
  return rows[0] ? toItem(rows[0]) : null;
}
export async function markSent(id: string, sent: { sentBody: string; graphMessageId: string; conversationId: string; internetMessageId: string }): Promise<void> {
  await db()`
    update agent_items set status = 'sent', sent_body = ${sent.sentBody}, graph_message_id = ${sent.graphMessageId},
      conversation_id = ${sent.conversationId}, internet_message_id = ${sent.internetMessageId}, sent_at = now(),
      delivered_at = null, updated_at = now()
    where id = ${id}`;
}
export async function markFailed(id: string, error: string): Promise<void> {
  await db()`update agent_items set status = 'failed', error = ${error.slice(0, 500)}, delivered_at = null, updated_at = now() where id = ${id}`;
}
export async function sentTodayCount(slug: string, laDate: string): Promise<number> {
  const [row] = await db()`
    select count(*)::int as n from agent_items
    where agent_slug = ${slug} and status = 'sent' and (sent_at at time zone 'America/Los_Angeles')::date = ${laDate}::date`;
  return Number(row?.n ?? 0);
}
export async function pullUpdates(slug: string): Promise<AgentItem[]> {
  const rows = await db()`
    update agent_items set delivered_at = now() where agent_slug = ${slug} and delivered_at is null and status not in ('unread', 'read', 'pending')
    returning *`;
  return rows.map(toItem);
}

export type ReplyOut = { external_id: string; from: string; received_at: string; subject: string | null; body_text: string };
export async function insertReply(r: { itemId: string; internetMessageId: string; from: string; receivedAt: Date; subject: string | null; bodyText: string }): Promise<boolean> {
  const rows = await db()`
    insert into agent_replies (item_id, internet_message_id, from_address, received_at, subject, body_text)
    values (${r.itemId}, ${r.internetMessageId}, ${normalizeAddress(r.from)}, ${r.receivedAt.toISOString()}, ${r.subject}, ${r.bodyText})
    on conflict (internet_message_id) do nothing returning id`;
  return rows.length > 0;
}
export async function pullReplies(slug: string): Promise<ReplyOut[]> {
  const rows = await db()`
    update agent_replies r set delivered_at = now()
    from agent_items i where r.item_id = i.id and i.agent_slug = ${slug} and r.delivered_at is null
    returning i.external_id, r.from_address, r.received_at, r.subject, r.body_text`;
  return rows.map((r) => ({
    external_id: r.external_id as string, from: r.from_address as string, received_at: new Date(r.received_at as string).toISOString(),
    subject: (r.subject as string | null) ?? null, body_text: r.body_text as string,
  }));
}
export type RecentReply = { id: string; itemId: string; agentSlug: string; itemTitle: string; from: string; receivedAt: Date; subject: string | null; bodyText: string; seen: boolean };
export async function listRecentReplies(limit: number): Promise<RecentReply[]> {
  const rows = await db()`
    select r.id, r.item_id, i.agent_slug, i.title, r.from_address, r.received_at, r.subject, r.body_text, r.seen_at
    from agent_replies r join agent_items i on i.id = r.item_id order by r.received_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id as string, itemId: r.item_id as string, agentSlug: r.agent_slug as string, itemTitle: r.title as string,
    from: r.from_address as string, receivedAt: new Date(r.received_at as string), subject: (r.subject as string | null) ?? null,
    bodyText: r.body_text as string, seen: r.seen_at != null,
  }));
}
export async function markRepliesSeen(): Promise<void> {
  await db()`update agent_replies set seen_at = now() where seen_at is null`;
}
export async function sentConversations(days: number): Promise<{ id: string; conversationId: string }[]> {
  const rows = await db()`
    select id, conversation_id from agent_items
    where status = 'sent' and conversation_id is not null and sent_at > now() - make_interval(days => ${days})`;
  return rows.map((r) => ({ id: r.id as string, conversationId: r.conversation_id as string }));
}

export async function isSuppressed(address: string): Promise<boolean> {
  return (await db()`select 1 from email_suppressions where address = ${normalizeAddress(address)}`).length > 0;
}
export async function addSuppression(address: string, reason: string | null, source: "reply" | "owner"): Promise<void> {
  await db()`insert into email_suppressions (address, reason, source) values (${normalizeAddress(address)}, ${reason}, ${source}) on conflict (address) do nothing`;
}
export async function removeSuppression(address: string): Promise<void> {
  await db()`delete from email_suppressions where address = ${normalizeAddress(address)}`;
}
export async function listSuppressions(): Promise<{ address: string; reason: string | null; source: string; createdAt: Date }[]> {
  const rows = await db()`select address, reason, source, created_at from email_suppressions order by created_at desc`;
  return rows.map((r) => ({ address: r.address as string, reason: (r.reason as string | null) ?? null, source: r.source as string, createdAt: new Date(r.created_at as string) }));
}

export async function getAgentSettings(): Promise<{ mailingAddress: string | null; signature: string | null; lastDigestAt: Date | null }> {
  const [r] = await db()`select mailing_address, signature, last_digest_at from agent_settings where id`;
  return { mailingAddress: (r?.mailing_address as string | null) ?? null, signature: (r?.signature as string | null) ?? null, lastDigestAt: date(r?.last_digest_at) };
}
export async function saveAgentSettings(input: { mailingAddress: string; signature: string; by: string }): Promise<void> {
  await db()`
    update agent_settings set mailing_address = ${input.mailingAddress || null}, signature = ${input.signature || null},
      updated_by = ${input.by}, updated_at = now() where id`;
}
export async function claimReplyPoll(): Promise<boolean> {
  const rows = await db()`
    update agent_settings set last_reply_poll_at = now()
    where id and (last_reply_poll_at is null or last_reply_poll_at < now() - interval '2 minutes') returning id`;
  return rows.length > 0;
}
export async function setDigestAt(at: Date): Promise<void> {
  await db()`update agent_settings set last_digest_at = ${at.toISOString()} where id`;
}
export async function needsYouCount(): Promise<number> {
  const [r] = await db()`
    select (select count(*) from agent_items where kind in ('email', 'decision') and status in ('pending', 'failed'))
         + (select count(*) from agent_replies where seen_at is null) as n`;
  return Number(r?.n ?? 0);
}

export type AgentCard = Agent & {
  pending: number; unreadReports: number;
  newestReport: { id: string; title: string; summary: string | null; status: ItemStatus; createdAt: Date } | null;
};
export async function listAgentCards(): Promise<AgentCard[]> {
  const rows = await db()`
    select a.*,
      (select count(*)::int from agent_items i where i.agent_slug = a.slug and i.kind in ('email', 'decision') and i.status in ('pending', 'failed')) as pending,
      (select count(*)::int from agent_items i where i.agent_slug = a.slug and i.kind = 'report' and i.status = 'unread') as unread_reports,
      r.id as report_id, r.title as report_title, r.summary as report_summary, r.status as report_status, r.created_at as report_created_at
    from agents a
    left join lateral (
      select id, title, summary, status, created_at from agent_items where agent_slug = a.slug and kind = 'report' order by created_at desc limit 1
    ) r on true
    order by a.name`;
  return rows.map((row) => ({
    ...toAgent(row), pending: Number(row.pending), unreadReports: Number(row.unread_reports),
    newestReport: row.report_id
      ? { id: row.report_id as string, title: row.report_title as string, summary: (row.report_summary as string | null) ?? null,
          status: row.report_status as ItemStatus, createdAt: new Date(row.report_created_at as string) }
      : null,
  }));
}

export type DigestFacts = { newReports: { agentSlug: string; agentName: string; title: string }[]; pending: number; newReplies: number; failedRuns: { agentName: string; note: string | null }[] };
export async function digestFacts(since: Date | null): Promise<DigestFacts> {
  const from = (since ?? new Date(0)).toISOString();
  const [reports, pending, replies, failed] = await Promise.all([
    db()`select i.agent_slug, a.name, i.title from agent_items i join agents a on a.slug = i.agent_slug
         where i.kind = 'report' and i.created_at > ${from} order by a.name, i.created_at`,
    db()`select count(*)::int as n from agent_items where kind in ('email', 'decision') and status in ('pending', 'failed')`,
    db()`select count(*)::int as n from agent_replies where created_at > ${from}`,
    db()`select name, last_run_note from agents where last_run_status = 'failed' and last_run_at > ${from}`,
  ]);
  return {
    newReports: reports.map((r) => ({ agentSlug: r.agent_slug as string, agentName: r.name as string, title: r.title as string })),
    pending: Number(pending[0]?.n ?? 0), newReplies: Number(replies[0]?.n ?? 0),
    failedRuns: failed.map((r) => ({ agentName: r.name as string, note: (r.last_run_note as string | null) ?? null })),
  };
}
```

- [ ] **Step 4: Run unit tests, expect PASS.** Power check: delete `and agent_items.kind = excluded.kind` … no, delete `where agent_items.status in ('unread', 'pending')` and watch the upsert test fail. Revert.

- [ ] **Step 5: Extend `scripts/verify-agents.ts`** with a second `test("agents: store SQL on a real database", …)` that imports the store and checks, on the `SLUG` agent:
  - `upsertItem` email → `created`; the same again → `updated`;
  - `saveEmailEdits(id, {to:"x@y.co",…})` then `upsertItem` with a new body → `updated`, and `final_body` is still the edit;
  - `claimForSend` twice concurrently (`Promise.all`) → exactly one non-null;
  - after `markSent`, `upsertItem` → `locked`;
  - `pullUpdates` returns that item once, then `[]`;
  - `insertReply` twice with the same message id → `true`, then `false`; `pullReplies(SLUG)` returns 1, then 0; `pullReplies('tara')` never returns it;
  - `sentTodayCount(SLUG, lasVegasDate(new Date()))` === 1;
  - `claimReplyPoll()` true, then false (first `update agent_settings set last_reply_poll_at = null`; restore the old value after);
  - `addSuppression(" A@B.co ")` then `isSuppressed("a@b.co")` true;
  - `listAgentCards()` includes `SLUG` with `pending` counted;
  - `digestFacts(null)` runs.

  Clean up in `afterAll` (`delete from email_suppressions where address = 'a@b.co'`). Run as in Task 1, Step 4. Expected: all `ok`.

- [ ] **Step 6: Commit** `git add lib/agents/store.ts tests/agents/store.test.ts scripts/verify-agents.ts && git commit -m "feat(agents): store for items, replies, suppressions and settings"`

---

### Task 4: Business counts (`lib/agents/stats.ts`)

**Files:**
- Create: `lib/agents/stats.ts`
- Test: `tests/agents/stats.test.ts`
- Modify: `scripts/verify-agents.ts` (run `businessCounts(7)` against the branch and check the key set)

**Interfaces:**
- Consumes: `BOOKED_OR_LATER`, `SOLD_OR_LATER` from `@/lib/admin/stages`; `HEARD_VIA_OPTIONS` from `@/lib/leads/referral`.
- Produces: `type BusinessCounts = { window_days: number; leads: number; leads_by_source: Record<string, number>; leads_by_heard_via: Record<string, number>; ad_click_leads: number; referral_leads: number; consultations_booked: number; sales: number; revenue_cents: number }`, `businessCounts(days: 7 | 28): Promise<BusinessCounts>`, `BUSINESS_COUNT_KEYS`.

- [ ] **Step 1: Failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const sql = { query: vi.fn() };
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { businessCounts, BUSINESS_COUNT_KEYS } = await import("@/lib/agents/stats");

beforeEach(() => {
  sql.query.mockReset()
    .mockResolvedValueOnce([{ leads: "5", ad_click_leads: "2", referral_leads: "1" }])
    .mockResolvedValueOnce([{ source: "contact", n: "3" }, { source: "google_form", n: "2" }])
    .mockResolvedValueOnce([{ heard_via: "Google search", n: "2" }, { heard_via: "My neighbor Maria Lopez", n: "1" }, { heard_via: null, n: "2" }])
    .mockResolvedValueOnce([{ booked: "2", sales: "1", revenue_cents: "450000" }]);
});

describe("businessCounts", () => {
  it("returns only counts, with free-text answers folded into Other", async () => {
    const counts = await businessCounts(7);
    expect(Object.keys(counts).sort()).toEqual([...BUSINESS_COUNT_KEYS].sort());
    expect(counts).toEqual({
      window_days: 7, leads: 5, ad_click_leads: 2, referral_leads: 1,
      leads_by_source: { contact: 3, google_form: 2 },
      leads_by_heard_via: { "Google search": 2, Other: 1, "Not answered": 2 },
      consultations_booked: 2, sales: 1, revenue_cents: 450000,
    });
    expect(JSON.stringify(counts)).not.toContain("Maria");
  });
  it("never selects a personal column", async () => {
    await businessCounts(28);
    const all = sql.query.mock.calls.map((c) => c[0] as string).join(" ");
    for (const col of ["name", "phone", "email", "address", "notes"]) expect(all).not.toMatch(new RegExp(`\\b(l\\.)?${col}\\b`));
    expect(sql.query.mock.calls[0][1]).toContain(28);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import "server-only";
import { db } from "@/lib/db";
import { BOOKED_OR_LATER, SOLD_OR_LATER } from "@/lib/admin/stages";
import { HEARD_VIA_OPTIONS } from "@/lib/leads/referral";

export const BUSINESS_COUNT_KEYS = ["window_days", "leads", "leads_by_source", "leads_by_heard_via", "ad_click_leads", "referral_leads", "consultations_booked", "sales", "revenue_cents"] as const;
export type BusinessCounts = {
  window_days: number; leads: number; leads_by_source: Record<string, number>; leads_by_heard_via: Record<string, number>;
  ad_click_leads: number; referral_leads: number; consultations_booked: number; sales: number; revenue_cents: number;
};
const KNOWN: ReadonlySet<string> = new Set(HEARD_VIA_OPTIONS);

/** Aggregates for agents. Counts and sums only: heard_via is free text, so anything not a form option becomes "Other". */
export async function businessCounts(days: 7 | 28): Promise<BusinessCounts> {
  const window = `created_at > now() - make_interval(days => $1)`;
  const [totals, bySource, byHeard, outcomes] = await Promise.all([
    db().query(`select count(*) as leads, count(gclid) as ad_click_leads, count(referred_by) as referral_leads from leads where ${window}`, [days]),
    db().query(`select source, count(*) as n from leads where ${window} group by source`, [days]),
    db().query(`select heard_via, count(*) as n from leads where ${window} group by heard_via`, [days]),
    db().query(
      `with firsts as (
         select lead_id,
           min(created_at) filter (where to_status = any($2::text[])) as booked_at,
           min(created_at) filter (where to_status = any($3::text[])) as sold_at
         from job_events where kind = 'stage' group by lead_id)
       select count(*) filter (where f.booked_at > now() - make_interval(days => $1)) as booked,
              count(*) filter (where f.sold_at > now() - make_interval(days => $1)) as sales,
              coalesce(sum(l.sold_cents) filter (where f.sold_at > now() - make_interval(days => $1)), 0) as revenue_cents
       from firsts f join leads l on l.id = f.lead_id`,
      [days, [...BOOKED_OR_LATER], [...SOLD_OR_LATER]],
    ),
  ]);
  const heard: Record<string, number> = {};
  for (const row of byHeard) {
    const label = row.heard_via == null || String(row.heard_via).trim() === "" ? "Not answered" : KNOWN.has(String(row.heard_via)) ? String(row.heard_via) : "Other";
    heard[label] = (heard[label] ?? 0) + Number(row.n);
  }
  return {
    window_days: days, leads: Number(totals[0]?.leads ?? 0), ad_click_leads: Number(totals[0]?.ad_click_leads ?? 0),
    referral_leads: Number(totals[0]?.referral_leads ?? 0),
    leads_by_source: Object.fromEntries(bySource.map((r) => [String(r.source), Number(r.n)])),
    leads_by_heard_via: heard,
    consultations_booked: Number(outcomes[0]?.booked ?? 0), sales: Number(outcomes[0]?.sales ?? 0),
    revenue_cents: Number(outcomes[0]?.revenue_cents ?? 0),
  };
}
```

- [ ] **Step 4: Run, expect PASS.** Power check: return `String(row.heard_via)` unconditionally and watch the "Maria" assertion fail. Revert. Add to `verify-agents.ts`: `const c = await businessCounts(7); check(Object.keys(c).length === 9, "business counts run on a real database", JSON.stringify(Object.keys(c)))`. Run the verify script.

- [ ] **Step 5: Commit** `git add lib/agents/stats.ts tests/agents/stats.test.ts scripts/verify-agents.ts && git commit -m "feat(agents): business counts for agents, counts only"`

---

### Task 5: Sending and replies via Graph (`lib/agents/mail.ts`)

**Files:**
- Create: `lib/agents/mail.ts`
- Test: `tests/agents/mail.test.ts`

**Interfaces:**
- Consumes: `graphFetch`, `GraphError` from `@/lib/calendar/graph`; `calendarConfig` from `@/lib/calendar/config`; store `markSent`, `markFailed`, `sentConversations`, `insertReply`, `addSuppression`, `claimReplyPoll`; rules `isOptOut`.
- Produces: `sendApproved(item: AgentItem, sentBody: string): Promise<{ ok: true } | { ok: false; error: string }>`, `pollReplies(options?: { force?: boolean }): Promise<{ stored: number }>`, `htmlToText(html: string): string`.

- [ ] **Step 1: Failing tests**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const graphFetch = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphFetch, GraphError: class extends Error {} }));
vi.mock("@/lib/calendar/config", () => ({ calendarConfig: () => ({ mailbox: "support@premiershadesolutions.com" }) }));
const store = {
  markSent: vi.fn(), markFailed: vi.fn(), sentConversations: vi.fn(), insertReply: vi.fn(), addSuppression: vi.fn(), claimReplyPoll: vi.fn(),
};
vi.mock("@/lib/agents/store", () => store);
const { sendApproved, pollReplies, htmlToText } = await import("@/lib/agents/mail");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const item = { id: "i1", finalTo: "pat@example.com", finalSubject: "Hello", finalBody: "Hi Pat" } as never;

beforeEach(() => {
  graphFetch.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
  store.claimReplyPoll.mockResolvedValue(true);
});

describe("sendApproved", () => {
  it("creates a draft with exactly the approved text, sends it, and records the ids", async () => {
    graphFetch
      .mockResolvedValueOnce(json(201, { id: "m1", conversationId: "c1", internetMessageId: "<x@y>" }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    expect(await sendApproved(item, "Hi Pat\n\n--\nPSS")).toEqual({ ok: true });
    const [path, init] = graphFetch.mock.calls[0];
    expect(path).toBe("users/support%40premiershadesolutions.com/messages");
    expect(init.body).toEqual({
      subject: "Hello", body: { contentType: "Text", content: "Hi Pat\n\n--\nPSS" },
      toRecipients: [{ emailAddress: { address: "pat@example.com" } }],
    });
    expect(graphFetch.mock.calls[1][0]).toBe("users/support%40premiershadesolutions.com/messages/m1/send");
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: "Hi Pat\n\n--\nPSS", graphMessageId: "m1", conversationId: "c1", internetMessageId: "<x@y>" });
  });
  it("explains a 403 as the missing Mail.Send permission and marks it failed", async () => {
    graphFetch.mockResolvedValueOnce(json(403, {}));
    const result = await sendApproved(item, "b");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Mail.Send") });
    expect(store.markFailed).toHaveBeenCalledWith("i1", expect.stringContaining("Mail.Send"));
    expect(store.markSent).not.toHaveBeenCalled();
  });
  it("marks failed when the send step fails after the draft", async () => {
    graphFetch.mockResolvedValueOnce(json(201, { id: "m1", conversationId: "c1", internetMessageId: "<x>" })).mockResolvedValueOnce(json(500, {}));
    expect(await sendApproved(item, "b")).toMatchObject({ ok: false });
    expect(store.markFailed).toHaveBeenCalled();
  });
});

describe("pollReplies", () => {
  it("asks Graph only about stored conversations and stores replies from others", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c'1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [
      { internetMessageId: "<own>", from: { emailAddress: { address: "support@premiershadesolutions.com" } }, receivedDateTime: "2026-10-09T16:00:00Z", subject: "Hello", body: { contentType: "text", content: "Hi Pat" } },
      { internetMessageId: "<r1>", from: { emailAddress: { address: "Pat@Example.com" } }, receivedDateTime: "2026-10-09T17:00:00Z", subject: "Re: Hello", body: { contentType: "html", content: "<p>Sounds good</p>" } },
    ] }));
    store.insertReply.mockResolvedValue(true);
    expect(await pollReplies()).toEqual({ stored: 1 });
    const path = graphFetch.mock.calls[0][0] as string;
    expect(path).toContain("$filter=" + encodeURIComponent("conversationId eq 'c''1'"));
    expect(graphFetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(store.insertReply).toHaveBeenCalledWith(expect.objectContaining({ itemId: "i1", internetMessageId: "<r1>", from: "Pat@Example.com", bodyText: "Sounds good" }));
    expect(store.addSuppression).not.toHaveBeenCalled();
  });
  it("adds an opt-out reply's sender to do-not-contact", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [
      { internetMessageId: "<r2>", from: { emailAddress: { address: "pat@example.com" } }, receivedDateTime: "2026-10-09T17:00:00Z", subject: "Re", body: { contentType: "text", content: "No thanks." } },
    ] }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    expect(store.addSuppression).toHaveBeenCalledWith("pat@example.com", "Replied: No thanks.", "reply");
  });
  it("does nothing inside the 2-minute window unless forced", async () => {
    store.claimReplyPoll.mockResolvedValue(false);
    expect(await pollReplies()).toEqual({ stored: 0 });
    expect(store.sentConversations).not.toHaveBeenCalled();
  });
});

it("htmlToText drops tags, scripts and entities", () => {
  expect(htmlToText("<style>p{}</style><p>Hi&nbsp;there &amp; you</p><br><div>Bye</div>")).toBe("Hi there & you\nBye");
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import "server-only";
import { graphFetch } from "@/lib/calendar/graph";
import { calendarConfig } from "@/lib/calendar/config";
import { isOptOut, type AgentItem } from "./rules";
import { addSuppression, claimReplyPoll, insertReply, markFailed, markSent, sentConversations } from "./store";

const MAX_REPLY = 50 * 1024;
const mailboxPath = () => `users/${encodeURIComponent(calendarConfig()?.mailbox ?? "")}`;

function explain(status: number, step: string): string {
  if (status === 403) return "Microsoft refused to send: the app needs the Mail.Send permission (Azure → PSS Job Calendar → API permissions → add Mail.Send (Application) → Grant admin consent).";
  if (status === 401) return "Microsoft sign-in failed: check the Outlook app credentials.";
  return `Microsoft ${step} failed (${status}). Try again in a minute.`;
}

/** Sends one approved email from support@: create a draft (to learn its ids), then send it. */
export async function sendApproved(item: AgentItem, sentBody: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const fail = async (error: string) => { await markFailed(item.id, error); return { ok: false as const, error }; };
  try {
    const draft = await graphFetch(`${mailboxPath()}/messages`, {
      method: "POST",
      body: { subject: item.finalSubject, body: { contentType: "Text", content: sentBody }, toRecipients: [{ emailAddress: { address: item.finalTo } }] },
    });
    if (!draft.ok) return fail(explain(draft.status, "draft"));
    const created = (await draft.json()) as { id: string; conversationId: string; internetMessageId: string };
    const sent = await graphFetch(`${mailboxPath()}/messages/${encodeURIComponent(created.id)}/send`, { method: "POST" });
    if (!sent.ok) return fail(explain(sent.status, "send"));
    await markSent(item.id, { sentBody, graphMessageId: created.id, conversationId: created.conversationId, internetMessageId: created.internetMessageId });
    return { ok: true };
  } catch (error) {
    return fail(`Couldn't reach Microsoft: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

type GraphMessage = { internetMessageId: string; from?: { emailAddress?: { address?: string } }; receivedDateTime: string; subject: string | null; body?: { contentType: string; content: string } };

/** READ ONLY. Fetches only messages in conversations an agent email started. Never moves, flags or marks anything. */
export async function pollReplies(options: { force?: boolean } = {}): Promise<{ stored: number }> {
  const mailbox = calendarConfig()?.mailbox?.toLowerCase();
  if (!mailbox) return { stored: 0 };
  if (!options.force && !(await claimReplyPoll())) return { stored: 0 };
  let stored = 0;
  for (const { id, conversationId } of await sentConversations(60)) {
    const filter = encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`);
    const response = await graphFetch(`${mailboxPath()}/messages?$filter=${filter}&$top=50&$select=internetMessageId,from,receivedDateTime,subject,body`);
    if (!response.ok) continue;
    const { value } = (await response.json()) as { value: GraphMessage[] };
    for (const m of value) {
      const from = m.from?.emailAddress?.address ?? "";
      if (!from || from.toLowerCase() === mailbox) continue;
      const raw = m.body?.content ?? "";
      const bodyText = (m.body?.contentType?.toLowerCase() === "html" ? htmlToText(raw) : raw.trim()).slice(0, MAX_REPLY);
      const isNew = await insertReply({ itemId: id, internetMessageId: m.internetMessageId, from, receivedAt: new Date(m.receivedDateTime), subject: m.subject, bodyText });
      if (!isNew) continue;
      stored += 1;
      if (isOptOut(bodyText)) await addSuppression(from, `Replied: ${bodyText.slice(0, 120)}`, "reply");
    }
  }
  return { stored };
}
```

Note: `slice(0, MAX_REPLY)` counts characters. The DB check is bytes, so use `Buffer.from(bodyText).subarray(0, MAX_REPLY).toString()` if multibyte text is expected. Implement it that way.

- [ ] **Step 4: Run, expect PASS.** Power check: remove the `from.toLowerCase() === mailbox` skip and watch the first poll test fail (stored becomes 2). Revert.

- [ ] **Step 5: Commit** `git add lib/agents/mail.ts tests/agents/mail.test.ts && git commit -m "feat(agents): send approved email from support@ and read replies to agent emails only"`

---

### Task 6: Sync API (`app/api/agents/sync/route.ts`)

Before writing it, read `node_modules/next/dist/docs/` on route handlers (App Router `route.ts`) for this version.

**Files:**
- Create: `app/api/agents/sync/route.ts`
- Test: `tests/agents/sync-route.test.ts`

**Interfaces:**
- Consumes: rules `bearerKey`, `hashKey`, `pushSchema`, `parsePushItem`; store `findAgentByKeyHash`, `upsertItem`, `recordRun`, `pullUpdates`, `pullReplies`; stats `businessCounts`; mail `pollReplies`.
- Produces: `GET`, `POST` handlers. The response shapes in spec §4 are what `run-agent.ps1` (Task 12) reads:
  - GET → `{ agent, now, updates: [{ external_id, kind, status, owner_note, final_to, final_subject, final_body, decided_at, sent_at, error }], replies: ReplyOut[], stats: { last_7: BusinessCounts, last_28: BusinessCounts } | null }`
  - POST → `{ results: [{ external_id, result }] }`

- [ ] **Step 1: Failing tests**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const store = { findAgentByKeyHash: vi.fn(), upsertItem: vi.fn(), recordRun: vi.fn(), pullUpdates: vi.fn(), pullReplies: vi.fn() };
vi.mock("@/lib/agents/store", () => store);
const businessCounts = vi.fn();
vi.mock("@/lib/agents/stats", () => ({ businessCounts }));
const pollReplies = vi.fn();
vi.mock("@/lib/agents/mail", () => ({ pollReplies }));
const { GET, POST } = await import("@/app/api/agents/sync/route");
const { hashKey, newAgentKey } = await import("@/lib/agents/rules");

const KEY = newAgentKey();
const tara = { slug: "tara", name: "Tara", statsAccess: true };
const req = (method: string, body?: unknown, key: string | null = KEY) =>
  new Request("https://pss.test/api/agents/sync", {
    method, headers: key ? { authorization: `Bearer ${key}`, "content-type": "application/json" } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset();
  store.findAgentByKeyHash.mockImplementation(async (h: string) => (h === hashKey(KEY) ? tara : null));
  store.pullUpdates.mockResolvedValue([]); store.pullReplies.mockResolvedValue([]);
  businessCounts.mockReset().mockResolvedValue({ leads: 1 }); pollReplies.mockReset().mockResolvedValue({ stored: 0 });
});

describe("auth", () => {
  it("401s with no key, a wrong key, or a malformed header, and reads nothing", async () => {
    for (const r of [req("GET", undefined, null), req("GET", undefined, newAgentKey())]) expect((await GET(r)).status).toBe(401);
    expect((await POST(new Request("https://pss.test/x", { method: "POST", headers: { authorization: "Basic abc" } }))).status).toBe(401);
    expect(store.pullUpdates).not.toHaveBeenCalled();
    expect(store.upsertItem).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("pulls this agent's updates and replies, with stats when allowed", async () => {
    store.pullUpdates.mockResolvedValue([{ externalId: "A-001", kind: "decision", status: "approved", ownerNote: "yes", finalTo: null, finalSubject: null, finalBody: null, decidedAt: new Date("2026-10-09T16:00:00Z"), sentAt: null, error: null }]);
    const res = await GET(req("GET"));
    const body = await res.json();
    expect(store.pullUpdates).toHaveBeenCalledWith("tara");
    expect(body.updates[0]).toMatchObject({ external_id: "A-001", status: "approved", owner_note: "yes" });
    expect(body.stats).toEqual({ last_7: { leads: 1 }, last_28: { leads: 1 } });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("gives no stats to an agent without stats access", async () => {
    store.findAgentByKeyHash.mockResolvedValue({ ...tara, slug: "tobi", statsAccess: false });
    expect((await (await GET(req("GET"))).json()).stats).toBeNull();
    expect(businessCounts).not.toHaveBeenCalled();
  });
  it("still answers when reply polling fails", async () => {
    pollReplies.mockRejectedValue(new Error("graph down"));
    expect((await GET(req("GET"))).status).toBe(200);
  });
});

describe("POST", () => {
  it("stores valid items, reports invalid ones per item, and records the run", async () => {
    store.upsertItem.mockResolvedValue("created");
    const res = await POST(req("POST", { run: { status: "ok", note: "fine" }, items: [
      { kind: "report", external_id: "r1", title: "Daily", report_type: "daily", body_md: "# x" },
      { kind: "email", external_id: "e1", title: "x", email_to: "a@b.co, c@d.co", email_subject: "s", email_body: "b" },
    ] }));
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results[0]).toEqual({ external_id: "r1", result: "created" });
    expect(results[1].result).toMatch(/^invalid:/);
    expect(store.upsertItem).toHaveBeenCalledTimes(1);
    expect(store.recordRun).toHaveBeenCalledWith("tara", "ok", "fine");
  });
  it("400s on a body that isn't JSON or has 51 items", async () => {
    const bad = new Request("https://pss.test/api/agents/sync", { method: "POST", headers: { authorization: `Bearer ${KEY}` }, body: "{" });
    expect((await POST(bad)).status).toBe(400);
    expect((await POST(req("POST", { items: Array(51).fill({}) }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import { bearerKey, hashKey, parsePushItem, pushSchema, type Agent } from "@/lib/agents/rules";
import { findAgentByKeyHash, pullReplies, pullUpdates, recordRun, upsertItem } from "@/lib/agents/store";
import { businessCounts } from "@/lib/agents/stats";
import { pollReplies } from "@/lib/agents/mail";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function authenticate(request: Request): Promise<Agent | null> {
  const key = bearerKey(request.headers.get("authorization"));
  return key ? findAgentByKeyHash(hashKey(key)) : null;
}

/** The runner's pull: the owner's decisions, replies to this agent's emails, and (if allowed) business counts. */
export async function GET(request: Request) {
  const agent = await authenticate(request);
  if (!agent) return json({ error: "unauthorized" }, 401);
  try { await pollReplies(); } catch (error) { console.error("Agent reply poll failed", error); }
  const [updates, replies, stats] = await Promise.all([
    pullUpdates(agent.slug),
    pullReplies(agent.slug),
    agent.statsAccess ? Promise.all([businessCounts(7), businessCounts(28)]).then(([last_7, last_28]) => ({ last_7, last_28 })) : Promise.resolve(null),
  ]);
  return json({
    agent: agent.slug, now: new Date().toISOString(), stats, replies,
    updates: updates.map((i) => ({
      external_id: i.externalId, kind: i.kind, status: i.status, owner_note: i.ownerNote, final_to: i.finalTo,
      final_subject: i.finalSubject, final_body: i.finalBody, decided_at: i.decidedAt?.toISOString() ?? null,
      sent_at: i.sentAt?.toISOString() ?? null, error: i.error,
    })),
  });
}

/** The runner's push: reports, email proposals and decision requests, plus how the run went. */
export async function POST(request: Request) {
  const agent = await authenticate(request);
  if (!agent) return json({ error: "unauthorized" }, 401);
  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "body must be JSON" }, 400); }
  const parsed = pushSchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid push" }, 400);
  const results: { external_id: string; result: string }[] = [];
  for (const rawItem of parsed.data.items) {
    const externalId = typeof (rawItem as { external_id?: unknown })?.external_id === "string" ? (rawItem as { external_id: string }).external_id : "?";
    const item = parsePushItem(rawItem);
    if (!item.ok) { results.push({ external_id: externalId, result: `invalid: ${item.reason}` }); continue; }
    results.push({ external_id: item.item.external_id, result: await upsertItem(agent.slug, item.item) });
  }
  if (parsed.data.run) await recordRun(agent.slug, parsed.data.run.status, parsed.data.run.note ?? null);
  return json({ results });
}
```

- [ ] **Step 4: Run, expect PASS.** Power check: return `json({...})` without the `if (!agent)` in GET and watch the auth test fail. Revert.

- [ ] **Step 5: Commit** `git add app/api/agents/sync/route.ts tests/agents/sync-route.test.ts && git commit -m "feat(agents): sync API for runners: pull decisions/replies/counts, push items"`

---

### Task 7: Owner actions (`app/admin/agents/actions.ts`)

**Files:**
- Create: `app/admin/agents/actions.ts`
- Test: `tests/agents/actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`; store `claimForSend`, `saveEmailEdits`, `decideItem`, `getItem`, `getAgent`, `getAgentSettings`, `isSuppressed`, `sentTodayCount`, `markFailed`; rules `emailEditSchema`, `composeEmailBody`, `defaultSignature`, `sendBlocker`; mail `sendApproved`, `pollReplies`; `calendarEnabled` from `@/lib/calendar/config`; `lasVegasDate` from `@/lib/admin/time`.
- Produces: `type CardState = { error?: string; ok?: string }`, `approveAndSend(id: string, _prev: CardState, form: FormData): Promise<CardState>`, `saveEdits(id, _prev, form)`, `declineItem(id, _prev, form)`, `decide(id, _prev, form)` (form field `choice` = approved | declined | answered, plus `note`), `refreshReplies(): Promise<void>`.

- [ ] **Step 1: Failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = {
  claimForSend: vi.fn(), saveEmailEdits: vi.fn(), decideItem: vi.fn(), getItem: vi.fn(), getAgent: vi.fn(),
  getAgentSettings: vi.fn(), isSuppressed: vi.fn(), sentTodayCount: vi.fn(), markFailed: vi.fn(),
};
vi.mock("@/lib/agents/store", () => store);
const mail = { sendApproved: vi.fn(), pollReplies: vi.fn() };
vi.mock("@/lib/agents/mail", () => mail);
let outlook = true;
vi.mock("@/lib/calendar/config", () => ({ calendarEnabled: () => outlook }));
const actions = await import("@/app/admin/agents/actions");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const pending = { id: ID, kind: "email", status: "pending", agentSlug: "tobi", emailTo: "pat@example.com", emailSubject: "Hello", emailBody: "Hi", finalTo: null, finalSubject: null, finalBody: null };
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const edited = form({ to: "pat@example.com", subject: "Hello there", body: "Hi Pat, edited" });

beforeEach(() => {
  outlook = true;
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  for (const fn of [...Object.values(store), ...Object.values(mail)]) fn.mockReset();
  store.getItem.mockResolvedValue(pending);
  store.getAgent.mockResolvedValue({ slug: "tobi", dailySendCap: 10 });
  store.getAgentSettings.mockResolvedValue({ mailingAddress: "PO Box 1, Las Vegas NV 89101", signature: null });
  store.isSuppressed.mockResolvedValue(false);
  store.sentTodayCount.mockResolvedValue(0);
  store.saveEmailEdits.mockResolvedValue(true);
  store.claimForSend.mockImplementation(async () => ({ ...pending, status: "approved", finalTo: "pat@example.com", finalSubject: "Hello there", finalBody: "Hi Pat, edited" }));
  mail.sendApproved.mockResolvedValue({ ok: true });
});

describe("approveAndSend", () => {
  it("checks the admin first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.approveAndSend(ID, {}, edited)).rejects.toThrow("NEXT_REDIRECT");
    expect(mail.sendApproved).not.toHaveBeenCalled();
  });
  it("saves the on-screen text, claims it, and sends exactly that text plus the footer", async () => {
    expect(await actions.approveAndSend(ID, {}, edited)).toEqual({ ok: "Sent." });
    expect(store.saveEmailEdits).toHaveBeenCalledWith(ID, { to: "pat@example.com", subject: "Hello there", body: "Hi Pat, edited" });
    expect(store.claimForSend).toHaveBeenCalledWith(ID, "owner@example.com");
    const sentBody = mail.sendApproved.mock.calls[0][1] as string;
    expect(sentBody.startsWith("Hi Pat, edited\n\n--\nPremier Shade Solutions")).toBe(true);
    expect(sentBody).toContain("PO Box 1, Las Vegas NV 89101");
    expect(sentBody.endsWith(`If you'd rather not hear from us, just reply "no thanks".`)).toBe(true);
  });
  it("refuses without a mailing address, to a suppressed address, over the cap, or without Outlook, and sends nothing", async () => {
    const cases: [string, () => void][] = [
      ["mailing address", () => store.getAgentSettings.mockResolvedValue({ mailingAddress: null, signature: null })],
      ["do-not-contact", () => store.isSuppressed.mockResolvedValue(true)],
      ["daily limit", () => store.sentTodayCount.mockResolvedValue(10)],
      ["Outlook", () => { outlook = false; }],
    ];
    for (const [words, arrange] of cases) {
      arrange();
      expect((await actions.approveAndSend(ID, {}, edited)).error).toContain(words);
      expect(store.claimForSend).not.toHaveBeenCalled();
      beforeEachReset();
    }
    function beforeEachReset() {
      outlook = true;
      store.getAgentSettings.mockResolvedValue({ mailingAddress: "PO Box 1, Las Vegas NV 89101", signature: null });
      store.isSuppressed.mockResolvedValue(false); store.sentTodayCount.mockResolvedValue(0);
    }
  });
  it("a second click finds it already claimed and sends nothing", async () => {
    store.claimForSend.mockResolvedValue(null);
    expect((await actions.approveAndSend(ID, {}, edited)).error).toMatch(/already/);
    expect(mail.sendApproved).not.toHaveBeenCalled();
  });
  it("shows Microsoft's refusal and leaves it retryable", async () => {
    mail.sendApproved.mockResolvedValue({ ok: false, error: "needs the Mail.Send permission" });
    expect((await actions.approveAndSend(ID, {}, edited)).error).toContain("Mail.Send");
  });
  it("rejects two recipients typed into To", async () => {
    expect((await actions.approveAndSend(ID, {}, form({ to: "a@b.co, c@d.co", subject: "s", body: "b" }))).error).toBeTruthy();
    expect(store.claimForSend).not.toHaveBeenCalled();
  });
});

describe("decisions", () => {
  it("records approve with a note, as the signed-in owner", async () => {
    store.decideItem.mockResolvedValue(true);
    expect(await actions.decide(ID, {}, form({ choice: "approved", note: "go ahead" }))).toEqual({ ok: "Saved." });
    expect(store.decideItem).toHaveBeenCalledWith(ID, { status: "approved", note: "go ahead", by: "owner@example.com" });
  });
  it("refuses an unknown choice", async () => {
    expect((await actions.decide(ID, {}, form({ choice: "maybe" }))).error).toBeTruthy();
  });
  it("declines an email with a note", async () => {
    store.decideItem.mockResolvedValue(true);
    await actions.declineItem(ID, {}, form({ note: "wrong person" }));
    expect(store.decideItem).toHaveBeenCalledWith(ID, { status: "declined", note: "wrong person", by: "owner@example.com" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { calendarEnabled } from "@/lib/calendar/config";
import { lasVegasDate } from "@/lib/admin/time";
import { composeEmailBody, defaultSignature, emailEditSchema, sendBlocker } from "@/lib/agents/rules";
import {
  claimForSend, decideItem, getAgent, getAgentSettings, getItem, isSuppressed, saveEmailEdits, sentTodayCount,
} from "@/lib/agents/store";
import { pollReplies, sendApproved } from "@/lib/agents/mail";

export type CardState = { error?: string; ok?: string };
const refresh = () => { revalidatePath("/admin/agents"); revalidatePath("/admin/agents/[slug]", "page"); revalidatePath("/admin", "layout"); };
const note = (form: FormData) => String(form.get("note") ?? "").trim().slice(0, 2000) || null;
const edits = (form: FormData) => emailEditSchema.safeParse({ to: form.get("to"), subject: form.get("subject"), body: form.get("body") });

export async function saveEdits(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  await requireAdmin();
  const parsed = edits(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await saveEmailEdits(id, parsed.data))) return { error: "This email was already decided." };
  refresh();
  return { ok: "Edits saved." };
}

/** Saves what's on screen, checks every blocker, claims the row (so a second click can't send twice), then sends. */
export async function approveAndSend(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  const admin = await requireAdmin();
  const parsed = edits(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const item = await getItem(id);
  if (!item || item.kind !== "email") return { error: "That email no longer exists." };
  const [agent, settings, suppressed] = await Promise.all([getAgent(item.agentSlug), getAgentSettings(), isSuppressed(parsed.data.to)]);
  const blocker = sendBlocker({
    outlookConfigured: calendarEnabled(), mailingAddress: settings.mailingAddress, suppressed,
    sentToday: await sentTodayCount(item.agentSlug, lasVegasDate(new Date())), cap: agent?.dailySendCap ?? 0,
  });
  if (blocker) return { error: blocker };
  if (!(await saveEmailEdits(id, parsed.data))) return { error: "This email was already sent or decided." };
  const claimed = await claimForSend(id, admin.email);
  if (!claimed) return { error: "This email was already sent or decided." };
  const sentBody = composeEmailBody(claimed.finalBody ?? "", settings.signature ?? defaultSignature(), settings.mailingAddress ?? "");
  const result = await sendApproved(claimed, sentBody);
  refresh();
  return result.ok ? { ok: "Sent." } : { error: result.error };
}

export async function declineItem(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  const admin = await requireAdmin();
  if (!(await decideItem(id, { status: "declined", note: note(form), by: admin.email }))) return { error: "Already decided." };
  refresh();
  return { ok: "Declined." };
}

const choice = z.enum(["approved", "declined", "answered"]);
export async function decide(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  const admin = await requireAdmin();
  const picked = choice.safeParse(form.get("choice"));
  if (!picked.success) return { error: "Pick Approve, Decline or Reply." };
  const text = note(form);
  if (picked.data === "answered" && !text) return { error: "Write a reply first." };
  if (!(await decideItem(id, { status: picked.data, note: text, by: admin.email }))) return { error: "Already decided." };
  refresh();
  return { ok: "Saved." };
}

export async function refreshReplies(): Promise<void> {
  await requireAdmin();
  await pollReplies({ force: true });
  refresh();
}
```

Note: `decideItem`'s SQL only lets `approved`/`answered` apply to decisions (`kind = 'decision' or status = 'declined'`), so an email can't be "approved" without being sent.

- [ ] **Step 4: Run, expect PASS.** Power check: move `claimForSend` before the blocker check and watch the blocker test fail. Revert.

- [ ] **Step 5: Commit** `git add app/admin/agents/actions.ts tests/agents/actions.test.ts && git commit -m "feat(agents): owner actions: approve and send, edit, decline, decide"`

---

### Task 8: Dashboard pages and navigation

**Files:**
- Create:
  - `components/admin/Markdown.tsx`
  - `app/admin/agents/page.tsx`
  - `app/admin/agents/EmailCard.tsx`
  - `app/admin/agents/DecisionCard.tsx`
  - `app/admin/agents/AgentCards.tsx`
  - `app/admin/agents/RecentReplies.tsx`
  - `app/admin/agents/[slug]/page.tsx`
  - `app/admin/agents/[slug]/[itemId]/page.tsx`
- Modify: `app/admin/AdminNav.tsx` (add the link plus an optional `badge` prop), `app/admin/layout.tsx` (pass `needsYouCount()`), `components/admin/icons.tsx` (add a `spark` icon only if no fitting icon exists; else reuse `lead`)
- Test: `tests/agents/markdown.test.tsx`, `tests/agents/agents-page.test.tsx`, `tests/admin/admin-nav.test.tsx` (extend)

**Interfaces:**
- Consumes: store `listNeedsYou`, `listAgentCards`, `listRecentReplies`, `markRepliesSeen`, `needsYouCount`, `getAgent`, `listItems`, `getItem`, `markRead`, `getAgentSettings`; actions from Task 7; `formatWhen` from `@/lib/admin/time`; rules `composeEmailBody`, `defaultSignature`.
- Produces: `<Markdown source={string} />`; `AdminNav` prop `badge?: number`.

- [ ] **Step 1: Add the dependency.** Run: `npm install react-markdown@10 remark-gfm@4`. Then `npm ls react-markdown remark-gfm` should show both.

- [ ] **Step 2: Failing tests**

`tests/agents/markdown.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/admin/Markdown";

describe("Markdown", () => {
  it("renders tables and headings", () => {
    render(<Markdown source={"# Brief\n\n| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expect(screen.getByRole("heading", { name: "Brief" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("never renders raw HTML from a report", () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script><img src=x onerror=alert(1)> ok'} />);
    expect(container.querySelector("script, img")).toBeNull();
  });
  it("opens links in a new tab, safely", () => {
    render(<Markdown source="[site](https://example.com)" />);
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
```
(Check `tests/setup.ts` for jest-dom; other `.tsx` tests in `tests/admin` use the same imports.)

`tests/agents/agents-page.test.tsx`: mock `@/lib/admin/session` (requireAdmin) and `@/lib/agents/store` (listNeedsYou → one email item + one decision item; listAgentCards → Tara with a newest report and `lastRunStatus: "failed", lastRunNote: "Claude login expired"`; listRecentReplies → []; markRepliesSeen; getAgentSettings → `{ mailingAddress: null, signature: null }`). Render `await AgentsPage()`, then assert:
- the heading "Needs you" appears with both cards;
- the email card has text boxes for To/Subject/Body prefilled with the proposal;
- it shows the footer preview with the text "Add a mailing address";
- it shows the button "Approve & send";
- Tara's card shows "Claude login expired";
- `markRepliesSeen` was called.

Add to `tests/admin/admin-nav.test.tsx`: an "Agents" link to `/admin/agents`, with badge text "3" when `badge={3}` and no badge when 0.

- [ ] **Step 3: Run, expect FAIL.**

- [ ] **Step 4: Implement**

`components/admin/Markdown.tsx`:
```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Agent reports. Raw HTML is never rendered (react-markdown's default, kept on purpose: reports are agent-written). */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="agent-report flex flex-col gap-3 text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-rule [&_td]:p-2 [&_th]:border [&_th]:border-rule [&_th]:bg-ivory [&_th]:p-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-ivory [&_code]:px-1 [&_a]:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
```

`app/admin/agents/EmailCard.tsx` (client):
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import type { AgentItem } from "@/lib/agents/rules";
import { approveAndSend, declineItem, saveEdits, type CardState } from "./actions";

/** What you see in the boxes, plus the footer shown below them, is exactly what gets sent. */
export function EmailCard({ item, agentName, footer }: { item: AgentItem; agentName: string; footer: string | null }) {
  const [sendState, send, sending] = useActionState<CardState, FormData>(approveAndSend.bind(null, item.id), {});
  const [editState, save, saving] = useActionState<CardState, FormData>(saveEdits.bind(null, item.id), {});
  const [declineState, decline, declining] = useActionState<CardState, FormData>(declineItem.bind(null, item.id), {});
  const state = sendState.error || sendState.ok ? sendState : editState.error || editState.ok ? editState : declineState;
  const id = (f: string) => `${item.id}-${f}`;
  return (
    <article className="flex flex-col gap-3 border border-rule bg-ivory p-4" aria-label={`Email from ${agentName}: ${item.title}`}>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-ink-soft">{agentName} · email {item.status === "failed" ? "· send failed" : ""}</p>
        <h3 className="font-semibold">{item.title}</h3>
        {item.reason && <p className="text-sm text-ink-soft">Why: {item.reason}</p>}
        {item.status === "failed" && item.error && <p role="alert" className="text-sm text-red-700">{item.error}</p>}
      </header>
      <form className="flex flex-col gap-3">
        <Label htmlFor={id("to")}>To</Label>
        <input id={id("to")} name="to" type="email" defaultValue={item.finalTo ?? item.emailTo ?? ""} className={CONTROL} required />
        <Label htmlFor={id("subject")}>Subject</Label>
        <input id={id("subject")} name="subject" defaultValue={item.finalSubject ?? item.emailSubject ?? ""} className={CONTROL} required />
        <Label htmlFor={id("body")}>Body</Label>
        <textarea id={id("body")} name="body" rows={10} defaultValue={item.finalBody ?? item.emailBody ?? ""} className={CONTROL} required />
        <p className="whitespace-pre-wrap text-xs text-ink-soft" aria-label="Added to every email">
          {footer ?? "Add a mailing address in Settings → Agents before this can be sent."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" formAction={send} disabled={sending || saving || declining}>
            {item.status === "failed" ? "Retry send" : "Approve & send"}
          </Button>
          <Button type="submit" variant="outline" formAction={save} disabled={sending || saving}>Save edits</Button>
        </div>
      </form>
      <form action={decline} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor={id("note")}>Note to {agentName} (optional)</Label>
          <input id={id("note")} name="note" className={CONTROL} />
        </div>
        <Button type="submit" variant="outline" disabled={declining || sending}>Decline</Button>
      </form>
      <p role="status" className="text-sm">{state.error ? <span className="text-red-700">{state.error}</span> : state.ok}</p>
    </article>
  );
}
```

`app/admin/agents/DecisionCard.tsx` (client): the same structure, holding the title, the `Markdown` body (pass the rendered body from the server as `children` to keep `react-markdown` server-side), the reason, a `note` textarea, and three submit buttons with `name="choice"` and values `approved`/`declined`/`answered`, labelled "Approve", "Decline" and "Reply with note". All three submit to one `useActionState(decide.bind(null, item.id))` form.

`app/admin/agents/AgentCards.tsx` (server):
```tsx
import Link from "next/link";
import type { AgentCard } from "@/lib/agents/store";
import { formatWhen } from "@/lib/admin/time";

export function AgentCards({ agents }: { agents: AgentCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {agents.map((a) => (
        <li key={a.slug} className="flex flex-col gap-2 border border-rule bg-ivory p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`/admin/agents/${a.slug}`} className="font-semibold underline-offset-4 hover:underline">{a.name}</Link>
            <span className="text-xs text-ink-soft">{a.role}</span>
          </div>
          <p className={`text-sm ${a.lastRunStatus === "failed" ? "text-red-700" : "text-ink-soft"}`}>
            {a.lastRunAt ? `${a.lastRunStatus === "failed" ? "⚠ Run failed" : "✓ Ran"} ${formatWhen(a.lastRunAt)}` : "Hasn't run yet"}
            {a.lastRunStatus === "failed" && a.lastRunNote ? `: ${a.lastRunNote}` : ""}
          </p>
          {a.newestReport ? (
            <Link href={`/admin/agents/${a.slug}/${a.newestReport.id}`} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{a.newestReport.status === "unread" && <span aria-label="unread" className="mr-1 inline-block size-2 rounded-full bg-champagne" />}{a.newestReport.title}</span>
              {a.newestReport.summary && <span className="text-ink-soft">{a.newestReport.summary}</span>}
            </Link>
          ) : <p className="text-sm text-ink-soft">No reports yet</p>}
          <p className="text-xs text-ink-soft">{a.pending} waiting on you · {a.unreadReports} unread</p>
          {!a.hasKey && <p className="text-xs text-red-700">No key yet: create one in Settings → Agents.</p>}
        </li>
      ))}
    </ul>
  );
}
```

`app/admin/agents/RecentReplies.tsx` (server): a list of `RecentReply`. Each row shows from, received (formatWhen), the item title linked to `/admin/agents/${agentSlug}/${itemId}`, and the first 300 characters of `bodyText` in a `whitespace-pre-wrap` paragraph. Unseen replies get a "new" chip. At the top is a `<form action={refreshReplies}><Button variant="outline">Check for replies</Button></form>`.

`app/admin/agents/page.tsx`:
```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { getAgentSettings, listAgentCards, listNeedsYou, listRecentReplies, markRepliesSeen } from "@/lib/agents/store";
import { composeEmailBody, defaultSignature } from "@/lib/agents/rules";
import { Markdown } from "@/components/admin/Markdown";
import { EmailCard } from "./EmailCard";
import { DecisionCard } from "./DecisionCard";
import { AgentCards } from "./AgentCards";
import { RecentReplies } from "./RecentReplies";

export const dynamic = "force-dynamic";

/** One place for every agent: what needs the owner first, then each agent, then replies. */
export default async function AgentsPage() {
  await requireAdmin();
  const [needs, agents, replies, settings] = await Promise.all([listNeedsYou(), listAgentCards(), listRecentReplies(10), getAgentSettings()]);
  await markRepliesSeen();
  const names = new Map(agents.map((a) => [a.slug, a.name]));
  const footer = settings.mailingAddress ? composeEmailBody("", settings.signature ?? defaultSignature(), settings.mailingAddress).trimStart() : null;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Agents</h1>
        <Link href="/admin/settings#agents-heading" className="text-sm underline underline-offset-4">Agent settings</Link>
      </div>
      <section aria-labelledby="needs-heading" className="flex flex-col gap-3">
        <h2 id="needs-heading" className="text-lg font-semibold">Needs you {needs.length > 0 && `(${needs.length})`}</h2>
        {needs.length === 0 ? <p className="text-sm text-ink-soft">Nothing waiting on you.</p> : needs.map((item) =>
          item.kind === "email"
            ? <EmailCard key={item.id} item={item} agentName={names.get(item.agentSlug) ?? item.agentSlug} footer={footer} />
            : <DecisionCard key={item.id} item={item} agentName={names.get(item.agentSlug) ?? item.agentSlug}>{item.bodyMd ? <Markdown source={item.bodyMd} /> : null}</DecisionCard>,
        )}
      </section>
      <section aria-labelledby="agents-list-heading" className="flex flex-col gap-3">
        <h2 id="agents-list-heading" className="text-lg font-semibold">Your agents</h2>
        <AgentCards agents={agents} />
      </section>
      <section aria-labelledby="replies-heading" className="flex flex-col gap-3">
        <h2 id="replies-heading" className="text-lg font-semibold">Recent replies</h2>
        <RecentReplies replies={replies} />
      </section>
    </div>
  );
}
```

`app/admin/agents/[slug]/page.tsx`:
- `params: Promise<{ slug: string }>`, `searchParams: Promise<{ type?: string }>`.
- `requireAdmin`; `getAgent`, or `notFound()`.
- Filter links: All · Daily · Weekly · Monthly · Brief · Other, using `?type=`. Only values in `REPORT_TYPES` pass to `listItems`.
- Two lists. **Reports**: title link to the item page, created date, unread dot. **Emails and decisions**: title, status chip, sent date, owner note.

`app/admin/agents/[slug]/[itemId]/page.tsx`:
- `requireAdmin`; `getItem(itemId)`; `notFound()` when the item is missing or `item.agentSlug !== slug`.
- `await markRead(item.id)` for reports.
- Shows title, type, date, a "← {agent}" back link, and `<Markdown source={item.bodyMd ?? ""} />`.
- For a sent email, also: the sent text in a `<pre className="whitespace-pre-wrap">` (`sentBody`) and its replies (fetch with a store helper `listRepliesForItem(itemId)`). Add that helper to `lib/agents/store.ts`: `select from_address, received_at, subject, body_text from agent_replies where item_id = ${id} order by received_at`. Add a unit test to `tests/agents/store.test.ts` asserting the `where item_id = ?` text.

`app/admin/AdminNav.tsx`:
- Add `{ href: "/admin/agents", label: "Agents", icon: "lead" }` after Tasks.
- Add the `badge?: number` prop to `AdminNav` and thread it to `NavLinks`.
- Render `{href === "/admin/agents" && badge ? <span className="ml-auto rounded-full bg-champagne px-2 text-xs font-semibold text-charcoal" aria-label={`${badge} need you`}>{badge}</span> : null}`.

`app/admin/layout.tsx`:
- `const badge = await needsYouCount().catch(() => 0);` (a missing table must not break every admin page before 044 is applied).
- Pass `<AdminNav email={admin.email} badge={badge} />`.

- [ ] **Step 5: Run the new tests plus the whole admin suite.** Run: `npx vitest run tests/agents tests/admin --maxWorkers=2`. Expected PASS. Then `npm run typecheck`, expected clean.

- [ ] **Step 6: Commit** `git add -A components/admin/Markdown.tsx app/admin/agents app/admin/AdminNav.tsx app/admin/layout.tsx lib/agents/store.ts tests package.json package-lock.json && git commit -m "feat(agents): dashboard: needs-you cards, agent cards, replies, report pages, nav badge"`

---

### Task 9: Settings → Agents

**Files:**
- Create: `app/admin/settings/AgentsSection.tsx`, `app/admin/settings/AgentKeyButton.tsx`, `app/admin/settings/agent-actions.ts`
- Modify: `app/admin/settings/page.tsx` (load and render the section)
- Test: `tests/agents/agent-settings-actions.test.ts`, `tests/agents/agents-section.test.tsx`

**Interfaces:**
- Consumes: store `createAgent`, `setAgentKeyHash`, `listAgentCards`, `getAgentSettings`, `saveAgentSettings`, `listSuppressions`, `addSuppression`, `removeSuppression`; rules `agentFormSchema`, `settingsSchema`, `newAgentKey`, `hashKey`, `defaultSignature`.
- Produces:
  - `addAgentAction(_prev: FormState, form): Promise<FormState>`
  - `createKeyAction(slug: string, _prev: KeyState, _form): Promise<KeyState>`, where `KeyState = { key?: string; error?: string }`
  - `saveAgentSettingsAction(_prev, form)`
  - `addSuppressionAction(_prev, form)`
  - `removeSuppressionAction(address: string): Promise<void>`

- [ ] **Step 1: Failing tests** (`tests/agents/agent-settings-actions.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { createAgent: vi.fn(), setAgentKeyHash: vi.fn(), saveAgentSettings: vi.fn(), addSuppression: vi.fn(), removeSuppression: vi.fn() };
vi.mock("@/lib/agents/store", () => store);
const a = await import("@/app/admin/settings/agent-actions");
const { hashKey } = await import("@/lib/agents/rules");
const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d; };
beforeEach(() => { requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" }); for (const fn of Object.values(store)) fn.mockReset(); });

it("creates a key, stores only its hash, and shows it once", async () => {
  store.setAgentKeyHash.mockResolvedValue(true);
  const state = await a.createKeyAction("tara", {}, new FormData());
  expect(state.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(store.setAgentKeyHash).toHaveBeenCalledWith("tara", hashKey(state.key!));
});
it("adds an agent with a valid slug and refuses a bad one", async () => {
  store.createAgent.mockResolvedValue(true);
  expect(await a.addAgentAction({}, form({ slug: "scout", name: "Scout", role: "Reviews", dailySendCap: "5" }))).toEqual({ ok: true });
  expect(store.createAgent).toHaveBeenCalledWith({ slug: "scout", name: "Scout", role: "Reviews", statsAccess: false, dailySendCap: 5 });
  expect((await a.addAgentAction({}, form({ slug: "Bad Slug", name: "x", dailySendCap: "5" }))).error).toBeTruthy();
});
it("says when the slug is taken", async () => {
  store.createAgent.mockResolvedValue(false);
  expect((await a.addAgentAction({}, form({ slug: "tara", name: "Tara", dailySendCap: "10" }))).error).toMatch(/already/);
});
it("saves mailing address and signature as the signed-in owner", async () => {
  await a.saveAgentSettingsAction({}, form({ mailingAddress: " PO Box 1 ", signature: "" }));
  expect(store.saveAgentSettings).toHaveBeenCalledWith({ mailingAddress: "PO Box 1", signature: "", by: "owner@example.com" });
});
it("every action requires an admin", async () => {
  requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(a.createKeyAction("tara", {}, new FormData())).rejects.toThrow();
  expect(store.setAgentKeyHash).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `agent-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { agentFormSchema, hashKey, newAgentKey, settingsSchema } from "@/lib/agents/rules";
import { addSuppression, createAgent, removeSuppression, saveAgentSettings, setAgentKeyHash } from "@/lib/agents/store";

export type FormState = { error?: string; ok?: boolean };
export type KeyState = { key?: string; error?: string };
const refresh = () => { revalidatePath("/admin/settings"); revalidatePath("/admin/agents"); };

export async function addAgentAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = agentFormSchema.safeParse({
    slug: form.get("slug"), name: form.get("name"), role: form.get("role") ?? "",
    statsAccess: form.get("statsAccess") === "on", dailySendCap: form.get("dailySendCap"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await createAgent(parsed.data))) return { error: `An agent called "${parsed.data.slug}" already exists.` };
  refresh();
  return { ok: true };
}

/** A new key replaces the old one at once. The old key stops working. Shown once, never stored. */
export async function createKeyAction(slug: string, _prev: KeyState, _form: FormData): Promise<KeyState> {
  await requireAdmin();
  const key = newAgentKey();
  if (!(await setAgentKeyHash(slug, hashKey(key)))) return { error: "That agent no longer exists." };
  refresh();
  return { key };
}

export async function saveAgentSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse({ mailingAddress: form.get("mailingAddress") ?? "", signature: form.get("signature") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveAgentSettings({ ...parsed.data, by: admin.email });
  refresh();
  return { ok: true };
}

const address = z.string().trim().toLowerCase().pipe(z.email("Enter one email address"));
export async function addSuppressionAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = address.safeParse(form.get("address"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await addSuppression(parsed.data, "Added by owner", "owner");
  refresh();
  return { ok: true };
}
export async function removeSuppressionAction(addr: string): Promise<void> {
  await requireAdmin();
  await removeSuppression(addr);
  refresh();
}
```

`AgentKeyButton.tsx` (client): `useActionState(createKeyAction.bind(null, slug), {})`. Its button reads "Create key", or "Replace key" when `hasKey`. A replace click first confirms through an inline second button ("Yes, replace. The old key stops working"); use no `window.confirm`. When `state.key` is set, it shows the key in a read-only `<input>` with a Copy button (`navigator.clipboard.writeText`) and the text: "Copy it now. It won't be shown again. On the agents PC run: `powershell -File C:\Users\whirl\pss\agents\set-agent-key.ps1 -Slug {slug}` and paste it."

`AgentsSection.tsx` (server) contains:
- the heading `id="agents-heading"` "Agents";
- a list of agents with key status and `AgentKeyButton`;
- an add-agent form (a client sub-form using `useActionState(addAgentAction)`, fields slug, name, role, a stats checkbox and the cap with default 10);
- the mailing address and signature form, with a hint that the default signature is `defaultSignature()` and that the address is required before any email can be sent;
- the do-not-contact list with Remove buttons, and an add form.

Small client forms follow the `GiveAccessForm` pattern.

`page.tsx`: add `listAgentCards()`, `getAgentSettings()` and `listSuppressions()` to the `Promise.all`, each with `.catch(() => [] or the default)` so Settings still loads before migration 044. Render `<AgentsSection … />` after `AdminAccessSection`.

`tests/agents/agents-section.test.tsx`: render `AgentsSection` with Tara (with key) and Tobi (without) and assert "Replace key" vs "Create key", the mailing-address field, and the empty do-not-contact message.

- [ ] **Step 4: Run, expect PASS** (`npx vitest run tests/agents --maxWorkers=2`), then `npm run typecheck`.

- [ ] **Step 5: Commit** `git add app/admin/settings tests/agents && git commit -m "feat(agents): Settings: agents, keys shown once, mailing address, signature, do-not-contact"`

---

### Task 10: Morning digest

**Files:**
- Create: `lib/agents/digest.ts`, `app/api/cron/agent-digest/route.ts`
- Modify: `vercel.json`
- Test: `tests/agents/digest.test.ts`, `tests/agents/digest-cron.test.ts`

**Interfaces:**
- Consumes: store `digestFacts`, `getAgentSettings`, `setDigestAt`; `ownerRecipients` from `@/lib/leads/email`; `adminOrigin`; `business`; `formatDay`.
- Produces: `digestEmail(facts: DigestFacts, now: Date): { subject: string; text: string } | null`, `sendAgentDigest(now?: Date): Promise<{ sent: number; error?: string }>`.

- [ ] **Step 1: Failing tests** (`digest.test.ts`, in the `follow-up-digest.test.ts` style; mock `resend` and `@/lib/agents/store`):

```ts
const now = new Date("2026-10-12T17:30:00Z");
it("is null when nothing changed", () => {
  expect(digestEmail({ newReports: [], pending: 0, newReplies: 0, failedRuns: [] }, now)).toBeNull();
});
it("lists reports per agent, what needs you, replies and failures, with the dashboard link", () => {
  const email = digestEmail({
    newReports: [{ agentSlug: "tara", agentName: "Tara", title: "Daily brief 2026-10-12" }, { agentSlug: "tobi", agentName: "Tobi", title: "Owner report" }],
    pending: 3, newReplies: 1, failedRuns: [{ agentName: "Tobi", note: "Claude login expired" }],
  }, now)!;
  expect(email.subject).toBe("Agents for Mon, Oct 12, 2026: 3 need you");
  expect(email.text).toBe([
    "Tara: Daily brief 2026-10-12",
    "Tobi: Owner report",
    "",
    "3 items need you · 1 new reply",
    "⚠ Tobi's run failed: Claude login expired",
    "",
    "Open the dashboard: https://pss.test/admin/agents",
  ].join("\n"));
});
it("sends to the owners and records the time only after a successful send", async () => { /* digestFacts mocked non-empty; send resolves {error:null}; expect setDigestAt called with now; then error case: setDigestAt not called */ });
it("sends nothing and records nothing when nothing changed", async () => { /* … */ });
```

Write out the last two tests fully, following `follow-up-digest.test.ts` (stub `RESEND_API_KEY`, `LEAD_NOTIFICATION_EMAIL`, `ADMIN_BASE_URL=https://pss.test`).

`digest-cron.test.ts`: copy `tests/admin/follow-ups-cron.test.ts` and point it at the new route. It covers 401 without `Bearer CRON_SECRET`, and 200 with `sendAgentDigest` called.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `lib/agents/digest.ts`:

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { ownerRecipients } from "@/lib/leads/email";
import { adminOrigin } from "@/lib/admin/origin";
import { formatDay } from "@/lib/admin/time";
import { digestFacts, getAgentSettings, setDigestAt, type DigestFacts } from "./store";

export function digestEmail(f: DigestFacts, now: Date): { subject: string; text: string } | null {
  if (f.newReports.length === 0 && f.pending === 0 && f.newReplies === 0 && f.failedRuns.length === 0) return null;
  const lines = f.newReports.map((r) => `${r.agentName}: ${r.title}`);
  if (lines.length) lines.push("");
  lines.push(`${f.pending} item${f.pending === 1 ? "" : "s"} need${f.pending === 1 ? "s" : ""} you · ${f.newReplies} new repl${f.newReplies === 1 ? "y" : "ies"}`);
  for (const run of f.failedRuns) lines.push(`⚠ ${run.agentName}'s run failed${run.note ? `: ${run.note}` : ""}`);
  lines.push("", `Open the dashboard: ${adminOrigin()}/admin/agents`);
  return { subject: `Agents for ${formatDay(now)}: ${f.pending} need you`, text: lines.join("\n") };
}

/** Run by the weekday cron. Never throws. Only moves last_digest_at after a successful send. */
export async function sendAgentDigest(now: Date = new Date()): Promise<{ sent: number; error?: string }> {
  try {
    const { lastDigestAt } = await getAgentSettings();
    const email = digestEmail(await digestFacts(lastDigestAt), now);
    if (!email) return { sent: 0 };
    const apiKey = process.env.RESEND_API_KEY;
    const to = ownerRecipients();
    if (!apiKey || to.length === 0) return { sent: 0, error: "Resend or owner recipients not configured" };
    const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
    const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text });
    if (error) return { sent: 0, error: error.message };
    await setDigestAt(now);
    return { sent: to.length };
  } catch (error) {
    return { sent: 0, error: error instanceof Error ? error.message : String(error) };
  }
}
```

The route copies `app/api/cron/follow-ups/route.ts` and calls `sendAgentDigest()`. In `vercel.json` add `{ "path": "/api/cron/agent-digest", "schedule": "30 17 * * 1-5" }`.

Note: the "pending" line is always printed. When only `pending > 0` triggers the email, the owner gets a daily reminder, which is intended.

- [ ] **Step 4: Run, expect PASS.** Power check: move `setDigestAt(now)` before the send and watch "records the time only after a successful send" fail. Revert.

- [ ] **Step 5: Commit** `git add lib/agents/digest.ts app/api/cron/agent-digest tests/agents/digest*.ts vercel.json && git commit -m "feat(agents): weekday morning digest of agent reports and what needs the owner"`

---

### Task 11: End-to-end test

**Files:**
- Create: `e2e/agents.spec.ts`
- Modify: `playwright.config.ts`
  - append `e2e-agents-owner@example.com` to `ADMIN_EMAILS`;
  - add `agents` to the mobile project's `testIgnore` list;
  - add env `MS_TENANT_ID: ""` so Outlook is off in e2e, if not already blank. Check the existing env block first; the DC spec may set Graph vars.

**Interfaces:**
- Consumes: the sync API, the dashboard and the actions above.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run the agent dashboard tests");
test.describe.configure({ mode: "serial" });
const sql = () => neon(url!);
const OWNER = "e2e-agents-owner@example.com";
const SLUG = `e2e-${Date.now().toString(36)}`;
const KEY = randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function signInAs(page: Page, email: string) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.beforeAll(async () => {
  await sql()`insert into agents (slug, name, role, key_hash) values (${SLUG}, 'E2E Agent', 'Testing', ${hash(KEY)})`;
  await sql()`update agent_settings set mailing_address = null where id`;
});
test.afterAll(async () => {
  await sql()`delete from agents where slug like 'e2e-%'`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("a pushed report, email and decision reach the dashboard, and the owner's decision reaches the agent", async ({ page, request }) => {
  const auth = { authorization: `Bearer ${KEY}` };
  expect((await request.get("/api/agents/sync")).status()).toBe(401);
  const push = await request.post("/api/agents/sync", { headers: auth, data: { run: { status: "ok" }, items: [
    { kind: "report", external_id: "r1", title: "E2E daily brief", summary: "One line", report_type: "daily", body_md: "# Hello\n\n| a | b |\n|---|---|\n| 1 | 2 |" },
    { kind: "email", external_id: "e1", title: "E2E intro", email_to: "pat@example.com", email_subject: "Hello", email_body: "Hi Pat", reason: "test" },
    { kind: "decision", external_id: "d1", title: "E2E pick a tagline", body_md: "Option A or B?" },
  ] } });
  expect(push.status()).toBe(200);
  expect((await push.json()).results.map((r: { result: string }) => r.result)).toEqual(["created", "created", "created"]);

  await signInAs(page, OWNER);
  await page.goto("/admin/agents");
  await expect(page.getByRole("link", { name: /Agents/ })).toBeVisible();
  const email = page.getByRole("article", { name: /E2E intro/ });
  await expect(email.getByLabel("Subject")).toHaveValue("Hello");
  await expect(email.getByText(/Add a mailing address/)).toBeVisible();
  await email.getByRole("button", { name: "Approve & send" }).click();
  await expect(email.getByText(/mailing address/i).last()).toBeVisible(); // blocked, nothing sent
  expect((await sql()`select status from agent_items where agent_slug = ${SLUG} and external_id = 'e1'`)[0].status).toBe("pending");

  const decision = page.getByRole("article", { name: /E2E pick a tagline/ });
  await decision.getByLabel(/Note/).fill("Go with A");
  await decision.getByRole("button", { name: "Approve" }).click();
  await expect(decision.getByText("Saved.")).toBeVisible();

  await page.getByRole("link", { name: "E2E Agent" }).click();
  await page.getByRole("link", { name: "E2E daily brief" }).click();
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();

  const pull = await (await request.get("/api/agents/sync", { headers: auth })).json();
  expect(pull.updates).toEqual([expect.objectContaining({ external_id: "d1", status: "approved", owner_note: "Go with A" })]);
  expect(pull.stats).toBeNull();
  expect((await (await request.get("/api/agents/sync", { headers: auth })).json()).updates).toEqual([]);

  const again = await request.post("/api/agents/sync", { headers: auth, data: { items: [{ kind: "decision", external_id: "d1", title: "changed" }] } });
  expect((await again.json()).results[0].result).toBe("locked");
});
```

The decision card's `aria-label` must be the title, as for `EmailCard` (`Decision from {agent}: {title}`). The regex above matches that.

- [ ] **Step 2: Apply migration 044 to the test branch** (the verify script in Task 1 already did), then run the e2e. Per memory: build in a fresh worktree, `next start` on 127.0.0.1, test branch only.

Run: `E2E_POSTGRES_URL=… E2E_TEST_ENDPOINT=<ep-id if not lingering-fog> npx playwright test e2e/agents.spec.ts --project=desktop`
Expected: 1 passed.

- [ ] **Step 3: Run the full unit suite and typecheck.** `npx vitest run --maxWorkers=2` (expected all pass), `npm run typecheck`, `npm run lint`.

- [ ] **Step 4: Commit** `git add e2e/agents.spec.ts playwright.config.ts && git commit -m "test(agents): e2e: push, dashboard, blocked send, decision pulled back"`

---

### Task 12: Production: migration 044, then deploy

The owner approved the rollout order in the spec. Before pushing to `main`, tell the owner in one line and wait for "go": a push to main deploys production.

- [ ] **Step 1:** Merge `origin/main` into the branch. Re-run `npx vitest run --maxWorkers=2` and `npm run typecheck`. Check that no other branch has taken 044 since: run `git fetch` and `git ls-tree` across `refs/remotes`.
- [ ] **Step 2:** Apply migration 044 to production following `pss-production-migrations`:
  - confirm the target endpoint pattern is `ep-cold-term` without printing the URL, and that `MIGRATE_DATABASE_URL` is unset;
  - run `node scripts/migrate.mjs > migrate-044.log 2>&1`, check the exit code, and `grep -iE "error|fail" migrate-044.log`;
  - verify read-only with a small script: the 5 tables exist, Tara and Tobi rows are present, and `leads` and `agent_settings` row counts are as expected.
- [ ] **Step 3:** After the owner's "go": `git push origin feat/agent-dashboard:main` (fast-forward after the merge), which triggers the production deploy. Wait for it, then `curl -s -o /dev/null -w "%{http_code}" https://premiershadesolutions.com/api/agents/sync` → `401`.
- [ ] **Step 4:** In the browser (Chrome tools), sign-in is the owner's. Ask the owner to open `/admin/agents` and confirm the page and the "Agents" nav link load. Ask the owner to click **Create key** for Tara and Tobi in Settings → Agents and paste each into `set-agent-key.ps1` (Task 13). Never ask them to paste a key into chat.

---

### Task 13: `pss/agents/` standard and shared runner

**Files (outside the PSS repo, in `C:\Users\whirl\pss\agents\`, its own git repo; add `agents/` to `C:\Users\whirl\pss\.git\info\exclude`):**
- Create: `STANDARD.md`, `TOOLS.md`, `registry.json`, `run-agent.ps1`, `set-agent-key.ps1`, `install-schedules.ps1`, `README.md`, `.gitignore`

**Interfaces:**
- Consumes: `GET`/`POST https://premiershadesolutions.com/api/agents/sync` (Task 6 shapes).
- Produces: the folder contract every agent follows, and `run-agent.ps1 -Slug <slug> [-Prompt <text>] [-NoNetwork] [-SimulatePullFailure] [-BaseUrl <url>]`.

- [ ] **Step 1: `registry.json`**

```json
[
  { "slug": "tara", "name": "Tara", "folder": "C:\\Users\\whirl\\pss\\agent_growth", "prompt": "/daily-brief", "time": "08:30", "days": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "max_budget_usd": 15 },
  { "slug": "tobi", "name": "Tobi", "folder": "C:\\Users\\whirl\\pss\\agent_outreach", "prompt": "/daily-run", "time": "08:45", "days": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "max_budget_usd": 15 }
]
```

- [ ] **Step 2: `set-agent-key.ps1`**

```powershell
# Saves an agent's dashboard key for this Windows user only (DPAPI). Paste the key shown once in Settings → Agents.
param([Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{1,30}$')][string]$Slug)
$dir = Join-Path $env:APPDATA "pss-agents"
New-Item -ItemType Directory -Force $dir | Out-Null
$secure = Read-Host "Paste the key for $Slug" -AsSecureString
$secure | ConvertFrom-SecureString | Set-Content -Path (Join-Path $dir "$Slug.key") -Encoding ascii
Write-Output "Saved. Only this Windows account on this PC can read it."
```

- [ ] **Step 3: `run-agent.ps1`.** Generalizes `agent_growth/operations/run-daily-brief.ps1`, with the same permission flags plus `Edit(./inbox/**)` denied:

```powershell
# Runs one registered agent: PULL decisions/replies/counts → RUN claude headless → PUSH outbox → commit. Never publishes, never git-pushes.
param(
  [Parameter(Mandatory)][string]$Slug,
  [string]$Prompt,
  [switch]$NoNetwork,
  [switch]$SimulatePullFailure,
  [string]$BaseUrl = "https://premiershadesolutions.com",
  [decimal]$MaxBudgetUsd = 0
)
$ErrorActionPreference = "Stop"
$agent = (Get-Content (Join-Path $PSScriptRoot "registry.json") -Raw | ConvertFrom-Json) | Where-Object slug -eq $Slug
if (-not $agent) { throw "No agent '$Slug' in registry.json" }
$root = $agent.folder
if (-not $Prompt) { $Prompt = $agent.prompt }
if ($MaxBudgetUsd -le 0) { $MaxBudgetUsd = [decimal]$agent.max_budget_usd }
Set-Location $root
foreach ($d in "outbox", "outbox\sent", "inbox", "operations\logs") { New-Item -ItemType Directory -Force (Join-Path $root $d) | Out-Null }
$date = Get-Date -Format "yyyy-MM-dd"
$log = Join-Path $root "operations\logs\$date-$Slug.log"
function Log($m) { "[$(Get-Date -Format 'HH:mm:ss')] $m" | Out-File -FilePath $log -Append -Encoding utf8 }

function Get-Key {
  $file = Join-Path $env:APPDATA "pss-agents\$Slug.key"
  if (-not (Test-Path $file)) { return $null }
  $secure = Get-Content $file | ConvertTo-SecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
$key = if ($NoNetwork) { $null } else { Get-Key }
$headers = if ($key) { @{ Authorization = "Bearer $key" } } else { $null }

# 1. PULL
$latest = Join-Path $root "inbox\latest.md"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
try {
  if ($NoNetwork) { throw "network disabled for this run (-NoNetwork)" }
  if ($SimulatePullFailure) { throw "simulated pull failure" }
  if (-not $key) { throw "no dashboard key saved for $Slug (run set-agent-key.ps1)" }
  $pull = Invoke-RestMethod -Uri "$BaseUrl/api/agents/sync" -Headers $headers -Method Get -TimeoutSec 60
  $pull | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $root "inbox\$stamp.json") -Encoding utf8
  $md = @("# Inbox — $stamp", "", "## Owner decisions")
  if ($pull.updates.Count -eq 0) { $md += "None new." }
  foreach ($u in $pull.updates) {
    $md += "- **$($u.external_id)** ($($u.kind)): **$($u.status)**$(if ($u.owner_note) { " — owner note: $($u.owner_note)" })$(if ($u.error) { " — error: $($u.error)" })"
    if ($u.kind -eq "email" -and $u.status -eq "sent") { $md += "  - Sent to $($u.final_to), subject ""$($u.final_subject)"" at $($u.sent_at). Final body as sent by owner approval is in inbox/$stamp.json." }
  }
  $md += "", "## Replies to your emails"
  if ($pull.replies.Count -eq 0) { $md += "None new." }
  foreach ($r in $pull.replies) { $md += "- Re **$($r.external_id)** from $($r.from) at $($r.received_at): $($r.subject)", "", "  > $(($r.body_text -replace "`r?`n", "`n  > "))", "" }
  if ($pull.stats) { $md += "", "## Business counts (observed, source: PSS app, $($pull.now))", '```json', ($pull.stats | ConvertTo-Json -Depth 5), '```' }
  $md -join "`n" | Out-File -FilePath $latest -Encoding utf8
  Log "pull ok: $($pull.updates.Count) updates, $($pull.replies.Count) replies"
} catch {
  "# Inbox — $stamp`n`n**Could not reach the dashboard:** $($_.Exception.Message). No new owner decisions or replies this run; carry on and say so in your report." | Out-File -FilePath $latest -Encoding utf8
  Log "pull failed: $($_.Exception.Message)"
}

# 2. RUN
$claude = Join-Path $env:USERPROFILE ".local\bin\claude.exe"
if (-not (Test-Path $claude)) { $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source }
$allowed = @("Read(./**)", "Glob", "Grep", "Edit(./**)", "WebSearch", "WebFetch")
$denied  = @("Bash", "PowerShell", "Read(./.env*)", "Edit(./.git/**)", "Edit(./.claude/**)", "Edit(./inbox/**)")
$exit = 1
try {
  & $claude -p $Prompt --permission-mode dontAsk --allowedTools $allowed --disallowedTools $denied --max-budget-usd $MaxBudgetUsd --output-format text 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
  $exit = $LASTEXITCODE
} catch { Log "claude failed to start: $_" }
$runStatus = if ($exit -eq 0) { "ok" } else { "failed" }
$runNote = if ($exit -eq 0) { $null } else { "claude exited $exit (see operations/logs/$date-$Slug.log). If it says login, run claude once and sign in." }

# 3. PUSH (items in batches of 50; each report inlines its file)
$items = @(); $files = @()
foreach ($f in Get-ChildItem (Join-Path $root "outbox") -Filter *.json -File) {
  try {
    $item = Get-Content $f.FullName -Raw -Encoding utf8 | ConvertFrom-Json
    if ($item.kind -eq "report") {
      $path = Join-Path $root $item.path
      $item | Add-Member -NotePropertyName body_md -NotePropertyValue (Get-Content $path -Raw -Encoding utf8) -Force
      $item.PSObject.Properties.Remove("path")
    }
    $items += $item; $files += $f
  } catch { Log "skipped unreadable outbox file $($f.Name): $_" }
}
$pushed = $false
if (-not $NoNetwork -and $key) {
  try {
    $batches = [Math]::Max(1, [Math]::Ceiling($items.Count / 50))
    for ($b = 0; $b -lt $batches; $b++) {
      $chunk = @($items | Select-Object -Skip ($b * 50) -First 50)
      $payload = @{ items = $chunk }
      if ($b -eq $batches - 1) { $payload.run = @{ status = $runStatus; note = $runNote } }
      $json = $payload | ConvertTo-Json -Depth 8
      $resp = Invoke-RestMethod -Uri "$BaseUrl/api/agents/sync" -Headers $headers -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json; charset=utf-8" -TimeoutSec 120
      foreach ($r in $resp.results) { Log "push $($r.external_id): $($r.result)" }
    }
    foreach ($f in $files) { Move-Item $f.FullName (Join-Path $root "outbox\sent\$($f.Name)") -Force }
    $pushed = $true
  } catch { Log "push failed, outbox kept for next run: $($_.Exception.Message)" }
} else { Log "push skipped (no network or no key saved); outbox kept for next run" }
"$(if ($runStatus -eq 'ok') { 'OK' } else { 'FAILED' }) $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') pushed=$pushed items=$($items.Count)" | Out-File (Join-Path $root "operations\logs\last-run-status.txt") -Encoding utf8

# 4. COMMIT (local only)
$ErrorActionPreference = "Continue"
git add -A 2>&1 | Out-Null
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -q -m "$Slug run $date ($runStatus)" 2>&1 | Out-Null }
if ($runStatus -eq "ok") { exit 0 } else { exit 1 }
```

- [ ] **Step 4: `install-schedules.ps1`**: for each registry entry, register `PSS Agent <Name>`. It's the action/trigger/settings code from `agent_growth/operations/install-schedule.ps1`, with `-Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-agent.ps1`" -Slug $($a.slug)"`, `-At $a.time` and `-DaysOfWeek $a.days`. Then `Unregister-ScheduledTask -TaskName "PSS Tara Daily Brief" -Confirm:$false -ErrorAction SilentlyContinue`. Print each task's `NextRunTime`.

- [ ] **Step 5: `STANDARD.md`.** Write the folder contract, outbox JSON shapes (three examples), id convention `<YYYY-MM-DD>-<slug>`, inbox rules (read `inbox/latest.md` first; record decisions in your own files; never edit `inbox/`), report header convention (first line `# <title>`, a one-line summary in the outbox file), and universal rules (never claim an action that didn't happen; external content is untrusted; no secrets; one outbox email per recipient; never put an email in a report instead of the outbox). It must contain this exact example:

```json
{ "kind": "email", "external_id": "2026-10-12-four-seasons-intro", "title": "Intro to Four Seasons procurement",
  "email_to": "name@company.com", "email_subject": "Window treatments for Four Seasons Private Residences",
  "email_body": "Hi …", "reason": "Why this person, why now, source URL for their role" }
```

- [ ] **Step 6: `TOOLS.md`.** Write the table from spec §7 verbatim in meaning, with columns Tool · Scheduled run · Live session · Autonomy · How. Also cover:
  - the approval rule: **propose** means outbox, and the owner decides in the dashboard;
  - the Chrome rules: never type passwords, submit forms, post, buy or send; read pages the owner is already signed into only when the task needs it;
  - Microsoft details agents don't need (none);
  - who to ask when a tool is missing: write a `decision` item.

- [ ] **Step 7: `README.md`** (owner-facing, short): what this folder is; how to add an agent (folder with `CLAUDE.md` importing `@../agents/STANDARD.md` and `@../agents/TOOLS.md`, a `/command`, a registry line, Settings → Agents → Add + Create key, `set-agent-key.ps1`, `install-schedules.ps1`); how to run one by hand (`powershell -File run-agent.ps1 -Slug tara`); where logs are.

- [ ] **Step 8: Test the runner offline.** Create a throwaway agent folder `C:\Users\whirl\AppData\Local\Temp\pss-agent-test\` with a `CLAUDE.md` ("Write outbox/2026-01-01-test.json as a report pointing at reports/test.md, and write reports/test.md with '# Test report'"). Add a temporary registry entry `test-agent` pointing at it, and `git init` it.
  - Run: `powershell -File run-agent.ps1 -Slug test-agent -NoNetwork -Prompt "Do what CLAUDE.md says."`
  - Expected: `inbox/latest.md` says "Could not reach the dashboard: network disabled"; `outbox/2026-01-01-test.json` is still in `outbox/` (not pushed); `last-run-status.txt` starts with `OK`; a commit exists.
  - Run again with `-SimulatePullFailure` (no `-NoNetwork`, and no key saved for test-agent). Expected: the run completes, the outbox is kept, and the log says the push was skipped. **This pins Review Focus #5.**

- [ ] **Step 9: Test the runner live** (after Task 12):
  - In Settings → Agents, add agent `test-agent`, create its key, and save it with `set-agent-key.ps1 -Slug test-agent` (owner pastes).
  - Run without `-NoNetwork`. Expected: the log shows `push 2026-01-01-test: created`; the file moved to `outbox/sent/`; the dashboard shows "Test report" under Test Agent with ✓.
  - Then delete `test-agent` from the registry and from the database: add a "Delete agent" button? **No (YAGNI).** Delete via one SQL statement run by Claude against production with the owner's OK (`delete from agents where slug = 'test-agent'`), and delete the temp folder.

- [ ] **Step 10: Commit** in `pss/agents/`: `git init -b main; git add -A; git commit -m "Agent standard, tools, registry and shared runner"`.

---

### Task 14: Move Tara and Tobi onto the standard, then go live

**Files:**
- Modify:
  - `agent_growth/CLAUDE.md` (two import lines);
  - `agent_growth/operations/daily-brief.md` (inbox step, outbox step, stats);
  - `agent_growth/operations/scheduling.md` and `README.md` (point to the shared runner);
  - `agent_growth/operations/approval-queue.md` (header: the dashboard is now the place to decide; this file mirrors it).
- Delete: `agent_growth/operations/run-daily-brief.ps1`, `agent_growth/operations/install-schedule.ps1`
- Create in `agent_outreach/`: `operations/daily-run.md`, `.claude/commands/daily-run.md`, `.gitignore`. Modify `CLAUDE.md` (imports) and `TOBI.md` (one line: approval happens in the dashboard).
- Run: `git init` in `agent_outreach/`, and add `agent_outreach/` to `pss/.git/info/exclude`.

- [ ] **Step 1: Tara.**
  - Append to `CLAUDE.md`:
    ```
    @../agents/STANDARD.md
    @../agents/TOOLS.md
    ```
  - In `operations/daily-brief.md`, step 2: first read `inbox/latest.md`. For each owner decision, update the matching row in `operations/approval-queue.md` (Status = approved/declined/answered + owner note) and record durable decisions in `operations/decisions.md`. Log "Business counts" from the inbox into `analytics/performance-log.csv` with `source` = "PSS app sync <now>", `status` = observed, one row per metric, using `period_start`/`period_end` for the 7-day window. Don't log the same window twice.
  - Step 12 adds: write `outbox/<TODAY>-daily-brief.json` (`kind: report`, `report_type: daily`, `path: reports/daily/<TODAY>.md`, a one-line `summary`). Do the same for weekly/monthly reports. For every new approval-queue row, write `outbox/<ID>.json` (`kind: decision`, `external_id` = the queue ID, `title` = the action, `body_md` = the why and cost, `reason`).
  - Replace "the scheduled wrapper handles git" with "the shared runner (`../agents/run-agent.ps1`) handles network and git".
  - Delete the two old scripts.
  - **First run only:** outbox the existing A-001…A-008 as decisions so they appear in the dashboard.
- [ ] **Step 2: Tobi.** Create `agent_outreach/operations/daily-run.md`:
  1. Date/time in Las Vegas.
  2. Read `inbox/latest.md`. Apply decisions (sent emails → mark contacted in `pipeline/` with date; declined → note why; replies → record in pipeline and draft a follow-up if useful; opt-outs → mark do-not-contact in the pipeline).
  3. Read `TOBI.md`, the latest `reports/*owner-report.md` and `pipeline/`.
  4. Follow TOBI.md's daily rhythm within available tools: research and qualify, verify contacts with sources, update `pipeline/prospects.csv` and `decision-makers.csv`.
  5. Draft outreach. Each email the owner should consider goes to `outbox/<date>-<slug>.json` (`kind: email`), with `reason` citing the prospect, the person's verified role and the source URL. One recipient each. **Never** invent an address.
  6. Write `reports/<date>-owner-report.md` (TOBI's existing format: completed work, messages actually sent (from the inbox only), responses, blockers, next three actions) and outbox it (`report_type: daily`).
  7. Anything needing an owner decision that isn't an email goes in as an outbox `decision`.

  Create `.claude/commands/daily-run.md` ("You are Tobi. Run `operations/daily-run.md` step by step, obeying `CLAUDE.md`."), and append the two import lines to `CLAUDE.md`. `git init -b main`, add a `.gitignore` (`.env*`, `operations/logs/*.log`), and make the first commit. Before changing anything, check `git -C agent_outreach status` and the file list, and confirm no other session is mid-write (file mtimes within the last 10 minutes → stop and ask the owner).
- [ ] **Step 3: Keys and schedules.**
  - The owner creates keys for `tara` and `tobi` in Settings → Agents, and runs `set-agent-key.ps1 -Slug tara` and `-Slug tobi`.
  - Run `powershell -File C:\Users\whirl\pss\agents\install-schedules.ps1`.
  - Expected: `PSS Agent Tara` next run at the next weekday 8:30, `PSS Agent Tobi` at 8:45, and "PSS Tara Daily Brief" gone (`Get-ScheduledTask | ? TaskName -match 'PSS'`).
- [ ] **Step 4: Live verification.**
  - Run `run-agent.ps1 -Slug tara` by hand, in the background.
  - Then check: the log shows the pull ok and the pushes `created`; `/admin/agents` (owner checks, or Chrome tools if the owner's session is open) shows Tara's daily brief and the A-00x decisions under Needs you; Tara's card shows ✓ with the time.
  - Repeat for Tobi.
  - Decide one harmless decision in the dashboard (the owner's choice). Run Tara again with `-Prompt "Read inbox/latest.md and update operations/approval-queue.md only."` and confirm the queue row changed.
- [ ] **Step 5: Commit** in each agent repo, and update memories: `tara-marketing-agent`, `tobi-outreach-agent`, `agent-dashboard-in-progress` (→ shipped, with the commit hash and what the owner still owes: Mail.Send and the mailing address).

---

## Self-review notes

- **Spec coverage:**
  - §2 runner → T13
  - §3 tables → T1
  - §4 API → T6
  - §5 UI → T8, T9
  - §6 sending → T5, T7; replies → T5; digest → T10
  - §7 standard → T13, T14
  - §8 tests → each task + T1/T3 verify + T11 e2e
  - §9 rollout → T12, T14
- **Refinements from the spec:** `sent_body` and `last_reply_poll_at` columns. The badge counts unseen replies, which are marked seen when `/admin/agents` renders.
- **Owner-only steps:** Mail.Send consent and the mailing address (sending stays blocked with a clear message until both exist); pasting keys; "go" before the push to main.
