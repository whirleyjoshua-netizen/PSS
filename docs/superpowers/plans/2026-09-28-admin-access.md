# Admin Access from Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners give or remove admin sign-in from `/admin/settings`, with a welcome email, without touching Vercel.

**Architecture:** `ADMIN_EMAILS` stays the owner list (`isOwner`, synchronous). A new `admin_access` table holds added admins. `isAllowed` becomes async: owner first, then one lookup. The three existing callers await it. A new Settings section lists owners and added admins and posts to two server actions.

**Tech Stack:** Next.js App Router (server actions, `useActionState`), Neon serverless SQL (`db()` tagged templates), zod, Resend, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-admin-access-design.md`

## Global Constraints

- Work only in `C:\Users\whirl\pss\.claude\worktrees\admin-access` on branch `feat/admin-access`. Before editing, run `git rev-parse --abbrev-ref HEAD` and confirm `feat/admin-access`.
- Migration number is **025** (`024` is claimed by dc-quote-import).
- Run unit tests with `npx vitest run --maxWorkers=2 <files>`.
- `ADMIN_EMAILS` is never edited by this work. Owners are never removable from the site.
- An error in the access lookup must throw, never fall back to "allowed".
- Remove is one SQL statement (data-modifying CTE), not several `db()` calls.
- Copy (exact): section heading `Admin access`; button `Give access`; owner label `Owner`; self label `That's you`; messages `That address is already an owner.`, `That address already has access.`, `Access given to {email}. We emailed them the sign-in link.`, `Access given to {email}, but the welcome email could not be sent. Tell them to sign in at {origin}/admin/sign-in.`; email subject `You have access to the PSS admin`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Uexfbw9VqeTaJ591SLMKdb
  ```

## Review Focus

1. **Owner typed with different case/spaces** (" Shade.M102@Gmail.com ") → "already an owner", no row inserted. Pinned in Task 3.
2. **A removed admin with an open tab** → next request redirects to sign-in, and an unused sign-in link they hold stops working. Pinned in Tasks 2 (removeAdmin SQL) and 5 (e2e).
3. **Forged remove of an owner or of yourself** (form posted by hand) → refused server-side, nothing deleted. Pinned in Task 3.
4. **Resend down or key missing** → access still given and the message tells the truth. Pinned in Task 3.
5. **Database error during the access check** → the request fails, it does not sign anyone in. Pinned in Task 1.

---

### Task 1: Access table and async access check

**Files:**
- Create: `db/migrations/025_admin_access.sql`
- Modify: `lib/admin/allowlist.ts`
- Modify: `lib/admin/login.ts:25` and `:83`
- Modify: `lib/admin/session.ts:43`
- Create: `tests/admin/allowlist.test.ts`
- Modify: `tests/admin/helpers.test.ts:3,27-31`, `tests/admin/session.test.ts:71-75`, `tests/admin/login.test.ts:90-95,134-137`

**Interfaces:**
- Produces: `isOwner(email: string, raw?: string): boolean`, `isAllowed(email: string): Promise<boolean>`, `parseAllowlist` (unchanged), table `admin_access(email text pk, added_by text, created_at timestamptz)`.

- [ ] **Step 1: Write the migration**

`db/migrations/025_admin_access.sql`:
```sql
-- People an admin gave sign-in to from Settings. Safe to re-run.
-- Owners are not stored here: they live in ADMIN_EMAILS and cannot be removed from the site.
create table if not exists admin_access (
  email      text primary key,
  added_by   text not null,
  created_at timestamptz not null default now(),
  constraint admin_access_email_normalized check (email = lower(btrim(email)) and email like '%_@_%')
);
```

- [ ] **Step 2: Write the failing tests**

`tests/admin/allowlist.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { isAllowed, isOwner } = await import("@/lib/admin/allowlist");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
});

describe("isOwner", () => {
  it("matches the env list regardless of case or surrounding space", () => {
    expect(isOwner("  Owner@Example.com ")).toBe(true);
    expect(isOwner("someone@example.com")).toBe(false);
    expect(isOwner("owner@example.com", "")).toBe(false);
  });
});

describe("isAllowed", () => {
  it("allows an owner without touching the database", async () => {
    expect(await isAllowed(" OWNER@example.com")).toBe(true);
    expect(sql).not.toHaveBeenCalled();
  });

  it("allows an address given access in Settings, looked up normalized", async () => {
    sql.mockResolvedValue([{ "?column?": 1 }]);
    expect(await isAllowed("  Alia@Example.com ")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("from admin_access");
    expect(sql.mock.calls[0]).toContain("alia@example.com");
  });

  it("refuses an address that is neither", async () => {
    expect(await isAllowed("stranger@example.com")).toBe(false);
  });

  it("refuses a blank address without a lookup", async () => {
    expect(await isAllowed("   ")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("throws when the lookup fails, never allowing", async () => {
    sql.mockRejectedValue(new Error("db down"));
    await expect(isAllowed("stranger@example.com")).rejects.toThrow("db down");
  });
});
```

In `tests/admin/helpers.test.ts`: change the import to `import { parseAllowlist } from "@/lib/admin/allowlist";` and delete the `"matches regardless of case or surrounding space"` test (it moved to `allowlist.test.ts` as `isOwner`).

In `tests/admin/session.test.ts`, replace the test at lines 71-75 with:
```ts
  it("returns null once the address is off the allowlist", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from admin_access") ? [] : [{ email: "former@example.com" }],
    );
    expect(await getAdmin()).toBeNull();
  });

  it("finds an admin given access in Settings", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from admin_access") ? [{ "?column?": 1 }] : [{ email: "alia@example.com" }],
    );
    expect(await getAdmin()).toEqual({ email: "alia@example.com" });
  });
```

In `tests/admin/login.test.ts`, replace the test at lines 90-95 with:
```ts
  it("says nothing to a stranger and only looks them up", async () => {
    await requestSignIn("stranger@example.com");
    await runScheduledWork();
    expect(send).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
    expect(text(sql.mock.calls[0])).toContain("from admin_access");
  });

  it("emails an admin given access in Settings", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("from admin_access")) return [{ "?column?": 1 }];
      return query.includes("count(*)") ? [{ count: 0 }] : [];
    });
    await requestSignIn("alia@example.com");
    await runScheduledWork();
    expect(send.mock.calls[0][0].to).toBe("alia@example.com");
  });
```
and replace the test at lines 134-137 with:
```ts
  it("returns null when the address has since been removed from the allowlist", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from admin_access") ? [] : [{ email: "former@example.com" }],
    );
    expect(await consumeSignIn("tok")).toBeNull();
  });
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/allowlist.test.ts tests/admin/session.test.ts tests/admin/login.test.ts tests/admin/helpers.test.ts`
Expected: FAIL — `isOwner` is not exported; the Settings-admin cases return null / send nothing.

- [ ] **Step 4: Implement**

`lib/admin/allowlist.ts`:
```ts
import { db } from "@/lib/db";

export const parseAllowlist = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** The owners, from ADMIN_EMAILS. The site can never remove them. */
export const isOwner = (email: string, raw = process.env.ADMIN_EMAILS): boolean =>
  parseAllowlist(raw).includes(email.trim().toLowerCase());

/**
 * An owner, or someone given access in Settings. Read on every request, so
 * removing an address locks it out immediately. A failed lookup throws; it never allows.
 */
export async function isAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (isOwner(normalized)) return true;
  const rows = await db()`select 1 from admin_access where email = ${normalized}`;
  return rows.length > 0;
}
```

`lib/admin/login.ts` line 25: `if (!(await isAllowed(email))) return;`
`lib/admin/login.ts` line 83: `return email && (await isAllowed(email)) ? email : null;`
`lib/admin/session.ts` line 43: `return email && (await isAllowed(email)) ? { email } : null;`

- [ ] **Step 5: Run to see them pass, plus the whole suite**

Run: `npx vitest run --maxWorkers=2 tests/admin/allowlist.test.ts tests/admin/session.test.ts tests/admin/login.test.ts tests/admin/helpers.test.ts` → PASS.
Run: `npx tsc --noEmit` → no errors (catches any other caller of the old sync `isAllowed`).
Run: `npx vitest run --maxWorkers=2` → all pass.

- [ ] **Step 6: Power check**

Temporarily change `isAllowed` to `return isOwner(normalized);` after the blank check. Run the four files: the "given access in Settings" tests in allowlist, session and login must FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/025_admin_access.sql lib/admin/allowlist.ts lib/admin/login.ts lib/admin/session.ts tests/admin/allowlist.test.ts tests/admin/helpers.test.ts tests/admin/session.test.ts tests/admin/login.test.ts
git commit -m "feat: admins given access in Settings can sign in, alongside the owners"
```

---

### Task 2: Store for added admins, and the welcome email

**Files:**
- Create: `lib/admin/admin-access.ts`
- Create: `lib/admin/access-email.ts`
- Test: `tests/admin/admin-access.test.ts`, `tests/admin/access-email.test.ts`

**Interfaces:**
- Consumes: table `admin_access` (Task 1).
- Produces:
  - `type AddedAdmin = { email: string; addedBy: string; addedAt: Date }`
  - `listAddedAdmins(): Promise<AddedAdmin[]>` (oldest first)
  - `addAdmin(email: string, addedBy: string): Promise<boolean>` — false if it already existed
  - `removeAdmin(email: string): Promise<boolean>` — false if there was no row
  - `adminSignInUrl(): string` — `{origin}/admin/sign-in`
  - `sendAccessEmail(to: string, addedBy: string): Promise<boolean>` — true when sent; false (and logs) when the key is missing or Resend rejects/throws. Never throws.

- [ ] **Step 1: Write the failing tests**

`tests/admin/admin-access.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { listAddedAdmins, addAdmin, removeAdmin } = await import("@/lib/admin/admin-access");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

describe("admin access store", () => {
  it("lists added admins oldest first", async () => {
    sql.mockResolvedValue([{ email: "a@x.com", added_by: "owner@x.com", created_at: "2026-09-28T15:00:00Z" }]);
    expect(await listAddedAdmins()).toEqual([
      { email: "a@x.com", addedBy: "owner@x.com", addedAt: new Date("2026-09-28T15:00:00Z") },
    ]);
    expect(text(sql.mock.calls[0])).toMatch(/order by created_at/);
  });

  it("adds once, reporting a repeat as false", async () => {
    sql.mockResolvedValueOnce([{ email: "a@x.com" }]).mockResolvedValueOnce([]);
    expect(await addAdmin("a@x.com", "owner@x.com")).toBe(true);
    expect(await addAdmin("a@x.com", "owner@x.com")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("on conflict (email) do nothing");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["a@x.com", "owner@x.com"]));
  });

  it("removes the row, their sessions and unused links in one statement", async () => {
    sql.mockResolvedValue([{ email: "a@x.com" }]);
    expect(await removeAdmin("a@x.com")).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const query = text(sql.mock.calls[0]);
    expect(query).toContain("delete from admin_access");
    expect(query).toContain("delete from admin_sessions");
    expect(query).toMatch(/delete from admin_login_tokens[\s\S]*used_at is null/);
  });

  it("reports removing an unknown address as false", async () => {
    expect(await removeAdmin("nobody@x.com")).toBe(false);
  });
});
```

`tests/admin/access-email.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { business } from "@/content/business";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { sendAccessEmail, adminSignInUrl } = await import("@/lib/admin/access-email");

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test/");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("access email", () => {
  it("builds the sign-in page link on the configured origin", () => {
    expect(adminSignInUrl()).toBe("https://pss.test/admin/sign-in");
    vi.stubEnv("ADMIN_BASE_URL", "");
    expect(adminSignInUrl()).toBe(`${business.domain.replace(/\/+$/, "")}/admin/sign-in`);
  });

  it("tells them who added them and where to sign in", async () => {
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(true);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("alia@x.com");
    expect(message.subject).toBe("You have access to the PSS admin");
    expect(message.text).toContain("owner@x.com");
    expect(message.text).toContain("https://pss.test/admin/sign-in");
    expect(message.text).toContain("Sign in with this email address.");
  });

  it("returns false without sending when email is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns false when Resend rejects or throws", async () => {
    send.mockResolvedValueOnce({ error: { message: "bad" } });
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(false);
    send.mockRejectedValueOnce(new Error("network"));
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/admin-access.test.ts tests/admin/access-email.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`lib/admin/admin-access.ts`:
```ts
import "server-only";
import { db } from "@/lib/db";

/** Someone given sign-in from Settings. Owners (ADMIN_EMAILS) are never rows here. */
export type AddedAdmin = { email: string; addedBy: string; addedAt: Date };

export async function listAddedAdmins(): Promise<AddedAdmin[]> {
  const rows = await db()`select email, added_by, created_at from admin_access order by created_at, email`;
  return rows.map((row) => ({
    email: row.email as string,
    addedBy: row.added_by as string,
    addedAt: new Date(row.created_at as string),
  }));
}

/** False when the address already had access. The caller passes a normalized address. */
export async function addAdmin(email: string, addedBy: string): Promise<boolean> {
  const rows = await db()`
    insert into admin_access (email, added_by) values (${email}, ${addedBy})
    on conflict (email) do nothing
    returning email`;
  return rows.length > 0;
}

/** One statement, so the access row, their sessions and unused sign-in links go together. */
export async function removeAdmin(email: string): Promise<boolean> {
  const rows = await db()`
    with removed as (
      delete from admin_access where email = ${email} returning email
    ), ended as (
      delete from admin_sessions where email in (select email from removed)
    ), unused as (
      delete from admin_login_tokens where used_at is null and email in (select email from removed)
    )
    select email from removed`;
  return rows.length > 0;
}
```

`lib/admin/access-email.ts`:
```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";

/** The same origin rule as the sign-in link: configuration, never the request. */
export const adminSignInUrl = (): string =>
  `${(process.env.ADMIN_BASE_URL || business.domain).replace(/\/+$/, "")}/admin/sign-in`;

/** True when the welcome email went out. Never throws: access is already given either way. */
export async function sendAccessEmail(to: string, addedBy: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) {
    console.error("Access email is not configured (missing RESEND_API_KEY).");
    return false;
  }
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${business.name} <${from}>`,
      to,
      subject: "You have access to the PSS admin",
      text: [
        `${addedBy} gave you access to the ${business.name} admin.`,
        "",
        "Sign in here:",
        adminSignInUrl(),
        "",
        "Sign in with this email address. We will email you a one-time link each time.",
      ].join("\n"),
    });
    if (error) {
      console.error("Access email failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Access email failed", error);
    return false;
  }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run --maxWorkers=2 tests/admin/admin-access.test.ts tests/admin/access-email.test.ts` → PASS.

- [ ] **Step 5: Prove the SQL on a real Neon branch** (mocked tests only check text)

Create a Neon branch from production, apply migrations to it with `MIGRATE_DATABASE_URL=<branch url> node scripts/migrate.mjs` **twice** (re-run safety). Keep the URL in a scratchpad file, never print it. Then, against the branch, run and check:
```sql
insert into admin_access (email, added_by) values ('Alia@X.com', 'o@x.com');            -- must fail: admin_access_email_normalized
insert into admin_access (email, added_by) values ('a@x.com', 'o@x.com') on conflict (email) do nothing returning email; -- 1 row
insert into admin_access (email, added_by) values ('a@x.com', 'o@x.com') on conflict (email) do nothing returning email; -- 0 rows
insert into admin_sessions (token_hash, email, expires_at) values ('t1', 'a@x.com', now() + interval '1 day');
insert into admin_login_tokens (token_hash, email, expires_at) values ('l1', 'a@x.com', now() + interval '1 hour');
-- the removeAdmin statement with 'a@x.com' → returns 1 row; then all three counts for a@x.com are 0
```
Delete the branch afterwards.

- [ ] **Step 6: Power check**

Remove the `ended as (...)` CTE: the "one statement" test must FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/admin-access.ts lib/admin/access-email.ts tests/admin/admin-access.test.ts tests/admin/access-email.test.ts
git commit -m "feat: store for admins given access, and the welcome email they get"
```

---

### Task 3: Server actions — give and remove access

**Files:**
- Modify: `lib/admin/schema.ts` (add `adminAccessSchema`)
- Modify: `app/admin/settings/actions.ts`
- Modify: `tests/admin/settings-actions.test.ts`

**Interfaces:**
- Consumes: `isOwner` (Task 1); `addAdmin`, `removeAdmin`, `sendAccessEmail`, `adminSignInUrl` (Task 2).
- Produces:
  - `type AccessFormState = { error?: string; ok?: string; email?: string }`
  - `giveAccess(_prev: AccessFormState, formData: FormData): Promise<AccessFormState>`
  - `removeAccess(email: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add to `tests/admin/settings-actions.test.ts`, next to the existing `vi.mock` calls (before the actions are imported):
```ts
const addAdmin = vi.fn(async (..._args: unknown[]) => {
  order.push("addAdmin");
  return true;
});
const removeAdmin = vi.fn(async (..._args: unknown[]) => {
  order.push("removeAdmin");
  return true;
});
vi.mock("@/lib/admin/admin-access", () => ({ addAdmin, removeAdmin }));
const sendAccessEmail = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@/lib/admin/access-email", () => ({
  sendAccessEmail,
  adminSignInUrl: () => "https://pss.test/admin/sign-in",
}));
```
Import `giveAccess` and `removeAccess` alongside the existing action imports. In `beforeEach`, reset: `addAdmin.mockClear(); removeAdmin.mockClear(); sendAccessEmail.mockReset().mockResolvedValue(true); vi.stubEnv("ADMIN_EMAILS", "owner@example.com,shade@example.com");`. Then:
```ts
const accessForm = (email: string) => {
  const data = new FormData();
  data.set("email", email);
  return data;
};

describe("giveAccess", () => {
  it("checks the session, normalizes, adds, emails, and says so", async () => {
    const result = await giveAccess({}, accessForm("  Alia@Example.com "));
    expect(order[0]).toBe("auth");
    expect(addAdmin).toHaveBeenCalledWith("alia@example.com", "owner@example.com");
    expect(sendAccessEmail).toHaveBeenCalledWith("alia@example.com", "owner@example.com");
    expect(result).toEqual({ ok: "Access given to alia@example.com. We emailed them the sign-in link." });
  });

  it("still gives access when the email fails, and says how to tell them", async () => {
    sendAccessEmail.mockResolvedValue(false);
    const result = await giveAccess({}, accessForm("alia@example.com"));
    expect(addAdmin).toHaveBeenCalled();
    expect(result.ok).toBe(
      "Access given to alia@example.com, but the welcome email could not be sent. Tell them to sign in at https://pss.test/admin/sign-in.",
    );
  });

  it("rejects an invalid address, keeping what was typed", async () => {
    const result = await giveAccess({}, accessForm("not-an-email"));
    expect(result).toEqual({ error: "Please enter a valid email address", email: "not-an-email" });
    expect(addAdmin).not.toHaveBeenCalled();
  });

  it("refuses an owner however it is typed, adding nothing", async () => {
    const result = await giveAccess({}, accessForm(" Shade@EXAMPLE.com "));
    expect(result).toEqual({ error: "That address is already an owner.", email: " Shade@EXAMPLE.com " });
    expect(addAdmin).not.toHaveBeenCalled();
  });

  it("does not email someone who already had access", async () => {
    addAdmin.mockResolvedValueOnce(false);
    const result = await giveAccess({}, accessForm("alia@example.com"));
    expect(result).toEqual({ error: "That address already has access.", email: "alia@example.com" });
    expect(sendAccessEmail).not.toHaveBeenCalled();
  });
});

describe("removeAccess", () => {
  it("checks the session, then removes", async () => {
    await removeAccess("alia@example.com");
    expect(order).toEqual(["auth", "removeAdmin"]);
    expect(removeAdmin).toHaveBeenCalledWith("alia@example.com");
  });

  it("refuses to remove an owner, even posted by hand", async () => {
    await removeAccess(" SHADE@example.com");
    expect(removeAdmin).not.toHaveBeenCalled();
  });

  it("refuses to remove yourself", async () => {
    requireAdmin.mockResolvedValueOnce({ email: "alia@example.com" });
    await removeAccess("Alia@example.com");
    expect(removeAdmin).not.toHaveBeenCalled();
  });
});
```
(If the file's `order` array is reset in `beforeEach`, keep that; the tests above assume it is cleared per test.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/settings-actions.test.ts`
Expected: FAIL — `giveAccess` is not exported.

- [ ] **Step 3: Implement**

`lib/admin/schema.ts`, after the existing `teamMemberSchema`:
```ts
/** The website form's email rule: trimmed, lowercased, a real-looking address. */
export const adminAccessSchema = z.object({ email: site.email });
```

`app/admin/settings/actions.ts`, add imports:
```ts
import { adminAccessSchema } from "@/lib/admin/schema";   // merge into the existing schema import
import { isOwner } from "@/lib/admin/allowlist";
import { addAdmin, removeAdmin } from "@/lib/admin/admin-access";
import { adminSignInUrl, sendAccessEmail } from "@/lib/admin/access-email";
```
and add:
```ts
/** `ok` is the sentence to show; on error `email` carries what was typed. */
export type AccessFormState = { error?: string; ok?: string; email?: string };

export async function giveAccess(_prev: AccessFormState, formData: FormData): Promise<AccessFormState> {
  const admin = await requireAdmin();
  const typed = String(formData.get("email") ?? "");
  const parsed = adminAccessSchema.safeParse({ email: typed });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: typed };
  const { email } = parsed.data;
  if (isOwner(email)) return { error: "That address is already an owner.", email: typed };
  if (!(await addAdmin(email, admin.email))) return { error: "That address already has access.", email: typed };
  revalidatePath("/admin/settings");
  const sent = await sendAccessEmail(email, admin.email);
  return {
    ok: sent
      ? `Access given to ${email}. We emailed them the sign-in link.`
      : `Access given to ${email}, but the welcome email could not be sent. Tell them to sign in at ${adminSignInUrl()}.`,
  };
}

/** Owners and your own address are refused here too, not only hidden in the page. */
export async function removeAccess(rawEmail: string): Promise<void> {
  const admin = await requireAdmin();
  const email = rawEmail.trim().toLowerCase();
  if (isOwner(email) || email === admin.email.trim().toLowerCase()) return;
  await removeAdmin(email);
  revalidatePath("/admin/settings");
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run --maxWorkers=2 tests/admin/settings-actions.test.ts` → PASS.

- [ ] **Step 5: Power check**

Delete the `isOwner(email) ||` guard in `removeAccess`: "refuses to remove an owner" must FAIL. Delete the self check: "refuses to remove yourself" must FAIL. Restore both.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/schema.ts app/admin/settings/actions.ts tests/admin/settings-actions.test.ts
git commit -m "feat: give and remove admin access from Settings, never an owner or yourself"
```

---

### Task 4: The Admin access section on Settings

**Files:**
- Create: `app/admin/settings/AdminAccessSection.tsx`, `app/admin/settings/GiveAccessForm.tsx`
- Modify: `app/admin/settings/page.tsx`
- Test: `tests/admin/admin-access-section.test.tsx`, `tests/admin/settings-page.test.tsx`

**Interfaces:**
- Consumes: `AddedAdmin`, `listAddedAdmins` (Task 2); `giveAccess`, `removeAccess`, `AccessFormState` (Task 3); `parseAllowlist` (Task 1); `formatDay(date: Date)` from `lib/admin/time`.
- Produces: `AdminAccessSection({ owners: string[]; added: AddedAdmin[]; me: string })`, `GiveAccessForm()`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/admin-access-section.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const giveAccess = vi.fn();
const removeAccess = vi.fn();
vi.mock("@/app/admin/settings/actions", () => ({ giveAccess, removeAccess }));

const { AdminAccessSection } = await import("@/app/admin/settings/AdminAccessSection");

const added = [
  { email: "alia@example.com", addedBy: "owner@example.com", addedAt: new Date("2026-09-28T18:00:00Z") },
  { email: "me@example.com", addedBy: "owner@example.com", addedAt: new Date("2026-09-28T19:00:00Z") },
];

beforeEach(() => {
  giveAccess.mockReset();
  removeAccess.mockReset();
});

describe("admin access section", () => {
  it("shows owners with no Remove button", () => {
    render(<AdminAccessSection owners={["owner@example.com"]} added={[]} me="owner@example.com" />);
    const region = screen.getByRole("region", { name: "Admin access" });
    const owner = within(region).getByText("owner@example.com").closest("li")!;
    expect(owner).toHaveTextContent("Owner");
    expect(within(owner).queryByRole("button")).toBeNull();
  });

  it("offers Remove for added admins but not for yourself", () => {
    render(<AdminAccessSection owners={["owner@example.com"]} added={added} me="me@example.com" />);
    expect(screen.getByRole("button", { name: "Remove alia@example.com" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove me@example.com" })).toBeNull();
    expect(screen.getByText("me@example.com").closest("li")).toHaveTextContent("That's you");
    expect(screen.getByText("alia@example.com").closest("li")).toHaveTextContent("added by owner@example.com");
  });

  it("shows the result of giving access", async () => {
    giveAccess.mockResolvedValue({ ok: "Access given to new@example.com. We emailed them the sign-in link." });
    render(<AdminAccessSection owners={[]} added={[]} me="owner@example.com" />);
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Access given to new@example.com.");
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("shows a problem and keeps what was typed", async () => {
    giveAccess.mockResolvedValue({ error: "That address is already an owner.", email: "Owner@example.com" });
    render(<AdminAccessSection owners={[]} added={[]} me="owner@example.com" />);
    await userEvent.type(screen.getByLabelText("Email"), "Owner@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That address is already an owner.");
    expect(screen.getByLabelText("Email")).toHaveValue("Owner@example.com");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
```

In `tests/admin/settings-page.test.tsx`: add `giveAccess: vi.fn(async () => ({})), removeAccess: vi.fn(),` to the actions mock; add
```ts
const listAddedAdmins = vi.fn(async () => []);
vi.mock("@/lib/admin/admin-access", () => ({ listAddedAdmins }));
```
before the page import, `vi.stubEnv("ADMIN_EMAILS", "owner@example.com");` in `beforeEach`, and:
```ts
  it("lists who can sign in, owners first", async () => {
    calendarEnabled.mockReturnValue(false);
    listAddedAdmins.mockResolvedValueOnce([
      { email: "alia@example.com", addedBy: "owner@example.com", addedAt: new Date("2026-09-28T18:00:00Z") },
    ]);
    render(await SettingsPage());
    const region = screen.getByRole("region", { name: "Admin access" });
    expect(region).toHaveTextContent(/owner@example\.com[\s\S]*alia@example\.com/);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/admin-access-section.test.tsx tests/admin/settings-page.test.tsx`
Expected: FAIL — module not found / no "Admin access" region.

- [ ] **Step 3: Implement**

`app/admin/settings/GiveAccessForm.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { giveAccess, type AccessFormState } from "./actions";

export function GiveAccessForm() {
  const [state, action, giving] = useActionState<AccessFormState, FormData>(giveAccess, {});

  return (
    <form
      // Remount so a rejected address comes back as the default and a success clears the box.
      key={state.email ?? state.ok ?? "form"}
      action={action}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex min-w-56 flex-1 flex-col gap-2">
        <Label htmlFor="access-email">Email</Label>
        <input
          id="access-email"
          name="email"
          type="email"
          autoComplete="off"
          defaultValue={state.email ?? ""}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "access-email-error" : undefined}
          className={CONTROL}
        />
      </div>
      <Button type="submit" variant="outline" disabled={giving}>
        Give access
      </Button>
      {state.error ? (
        <p id="access-email-error" role="alert" className="w-full text-sm text-overdue">
          {state.error}
        </p>
      ) : state.ok ? (
        <p role="status" className="w-full text-sm text-ink-soft">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
```

`app/admin/settings/AdminAccessSection.tsx`:
```tsx
import { Button } from "@/components/ui/Button";
import type { AddedAdmin } from "@/lib/admin/admin-access";
import { formatDay } from "@/lib/admin/time";
import { removeAccess } from "./actions";
import { GiveAccessForm } from "./GiveAccessForm";

/** Who can sign in. Owners come from ADMIN_EMAILS and are never removable here. */
export function AdminAccessSection({ owners, added, me }: { owners: string[]; added: AddedAdmin[]; me: string }) {
  const self = me.trim().toLowerCase();
  return (
    <section aria-labelledby="access-heading" className="flex flex-col gap-3">
      <h2 id="access-heading" className="text-lg font-semibold">
        Admin access
      </h2>
      <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
        {owners.map((email) => (
          <li key={email} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>{email}</span>
            <span className="text-ink-soft">Owner</span>
          </li>
        ))}
        {added.map((person) => (
          <li key={person.email} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>
              {person.email}
              <span className="block text-ink-soft">
                added by {person.addedBy} on {formatDay(person.addedAt)}
              </span>
            </span>
            {person.email === self ? (
              <span className="text-ink-soft">That&apos;s you</span>
            ) : (
              <form action={removeAccess.bind(null, person.email)}>
                <Button type="submit" variant="outline" aria-label={`Remove ${person.email}`}>
                  Remove
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft">
        Anyone here can use the whole admin, including this list. Removing someone signs them out right away.
      </p>
      <GiveAccessForm />
    </section>
  );
}
```

`app/admin/settings/page.tsx`:
- Imports: `import { parseAllowlist } from "@/lib/admin/allowlist";`, `import { listAddedAdmins } from "@/lib/admin/admin-access";`, `import { AdminAccessSection } from "./AdminAccessSection";`
- `await requireAdmin();` → `const admin = await requireAdmin();`
- Add `listAddedAdmins()` to the `Promise.all` and destructure it as `addedAdmins` (append at the end of both lists).
- After `<TeamSection team={team} />` render:
  ```tsx
  <AdminAccessSection owners={parseAllowlist(process.env.ADMIN_EMAILS)} added={addedAdmins} me={admin.email} />
  ```

- [ ] **Step 4: Run to see them pass, then the suite and types**

Run: `npx vitest run --maxWorkers=2 tests/admin/admin-access-section.test.tsx tests/admin/settings-page.test.tsx` → PASS.
Run: `npx tsc --noEmit` and `npx vitest run --maxWorkers=2` → clean.

- [ ] **Step 5: Commit**

```bash
git add app/admin/settings/AdminAccessSection.tsx app/admin/settings/GiveAccessForm.tsx app/admin/settings/page.tsx tests/admin/admin-access-section.test.tsx tests/admin/settings-page.test.tsx
git commit -m "feat: Admin access section on Settings, owners first, then who was added"
```

---

### Task 5: End-to-end — add, sign in, remove, locked out

**Files:**
- Create: `e2e/admin-access.spec.ts`
- Modify: `playwright.config.ts:37` (append `,e2e-access-owner@example.com` to `ADMIN_EMAILS`)

**Interfaces:**
- Consumes: everything above; e2e runs against `next build && next start` on 127.0.0.1 with `E2E_POSTGRES_URL` set to a Neon test branch migrated through 025.

- [ ] **Step 1: Write the spec**

`e2e/admin-access.spec.ts`:
```ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin access tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-access-owner@example.com";
const GUEST = `e2e-access-guest-${Date.now()}@example.com`;

async function signInAs(page: Page, email: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${email}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from admin_access where email like 'e2e-access-%'`;
  await sql()`delete from admin_login_tokens where email like 'e2e-access-%'`;
  await sql()`delete from admin_sessions where email like 'e2e-access-%'`;
});

test("give access, they sign in, remove them, they are out", async ({ browser }) => {
  const ownerPage = await (await browser.newContext()).newPage();
  await signInAs(ownerPage, OWNER);
  await expect(ownerPage.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();

  await ownerPage.goto("/admin/settings");
  const access = ownerPage.getByRole("region", { name: "Admin access" });
  await expect(access.getByText(OWNER).locator("xpath=ancestor::li")).toContainText("Owner");
  await access.getByLabel("Email").fill(GUEST.toUpperCase());
  await access.getByRole("button", { name: "Give access" }).click();
  // No RESEND_API_KEY in e2e, so the honest fallback message shows.
  await expect(access.getByRole("status")).toContainText(`Access given to ${GUEST}`);
  await expect(access.getByRole("button", { name: `Remove ${GUEST}` })).toBeVisible();

  const guestPage = await (await browser.newContext()).newPage();
  await signInAs(guestPage, GUEST);
  await expect(guestPage.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();

  await access.getByRole("button", { name: `Remove ${GUEST}` }).click();
  await expect(access.getByText(GUEST)).toHaveCount(0);

  await guestPage.goto("/admin/settings");
  await expect(guestPage).toHaveURL(/\/admin\/sign-in/);
});

test("an unknown address cannot sign in", async ({ page }) => {
  await signInAs(page, "e2e-access-stranger@example.com");
  await expect(page).not.toHaveURL(/\/admin$/);
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/sign-in/);
});
```

- [ ] **Step 2: Run it**

With the migrated test branch URL in `E2E_POSTGRES_URL` (from a scratchpad file, never echoed): `npx next build && npx playwright test e2e/admin-access.spec.ts e2e/team.spec.ts e2e/admin.spec.ts`.
Expected: PASS. If the status text differs because the e2e env does set a Resend key, check `playwright.config.ts` — it must not send real email; fix the assertion to accept either sentence only if the config deliberately stubs Resend.

- [ ] **Step 3: Power check**

Temporarily make `isAllowed` return `isOwner(normalized)` only: the first test must FAIL at the guest's "Jobs" heading. Restore.

- [ ] **Step 4: Commit**

```bash
git add e2e/admin-access.spec.ts playwright.config.ts
git commit -m "test: e2e for giving and removing admin access"
```

---

### Rollout (controller, after the whole-branch review)

1. Confirm migration 025 still unclaimed on main and other worktrees.
2. Apply `025_admin_access.sql` to production following the production-migrations memory: prove on a branch twice (done in Task 2), verify the target endpoint pattern is `ep-cold-term` without printing the URL, apply, then read-only verify `select count(*) from admin_access` returns 0 and the constraint exists.
3. Merge `feat/admin-access` into main and push (push auto-deploys production). Confirm the deployment finishes with `vercel ls --prod`.
4. Tell the owner to open Settings → Admin access and give access to alia.whirley9@gmail.com.
