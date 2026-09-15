# Team and "Assigned to" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owners keep a simple team list (name + Designer/Installer) in Settings and assign each job to one person, shown on the job page, the board and the All jobs list.

**Architecture:** Migration 013 adds `team_members` and `leads.assigned_to` (FK, `on delete set null`). `lib/admin/team-roles.ts` holds the role list (client-safe); `lib/admin/team.ts` (server-only) reads and writes members. Jobs carry optional `assignedTo/assignedName/assignedRole` via correlated subqueries in `JOB_COLUMNS`. `assignJob` updates and logs an `edit` event in one statement. A client `AssignControl` (reusing `SubmitOnChange`) sits in the job header and the board panel.

**Tech Stack:** Next.js App Router (this repo's version — read `node_modules/next/dist/docs/` before using any Next API), React server components + server actions with `useActionState`, zod, Tailwind v4 tokens, Neon Postgres via `db()`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-team-assignment-design.md`

## Global Constraints

- Team members are names only; never touch `ADMIN_EMAILS`, sign-in or session code.
- Roles: value `designer` label `Designer`; value `installer` label `Installer`. Exactly one per person.
- Name: trimmed, 1–60 characters. Messages: "Enter a name", "Keep the name under 60 characters", "Pick Designer or Installer".
- Display format: "Shade · Designer" on the card and list; "Shade — Designer" in selects and the Settings list; activity body "Assigned to Shade (Designer)" or "Unassigned".
- Every server action calls `requireAdmin()` before reading input.
- Tailwind class names are complete literals.
- Migrations: idempotent, whole-line `--` comments only, no `;` inside comments.
- Deviation from spec wording, decided in planning: the new `Job` fields are optional (`assignedTo?: string | null` etc., like `lastContactAt?`) so existing fixtures stay valid; `assignJob` returns `"ok" | "missing" | "unknown-member" | "unchanged"` instead of a boolean so the action can show "That person is no longer on the team."
- Unit tests: `npx vitest run --maxWorkers=2 <paths>`. Typecheck `npm run typecheck` (run `npx next typegen` once first in a fresh worktree). Lint `npm run lint`. Never run vitest alongside build/typecheck (memory is tight).
- Never use `git stash`. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
  ```

---

### Task 1: Migration, team data module and validation

**Files:**
- Create: `db/migrations/013_team.sql`, `lib/admin/team-roles.ts`, `lib/admin/team.ts`, `tests/db/migration-013.test.ts`, `tests/admin/team.test.ts`
- Modify: `lib/admin/schema.ts` (add `teamMemberSchema`), `tests/admin/schema.test.ts`

**Interfaces (Produces):**
- `team-roles.ts`: `TEAM_ROLES = [{ value: "designer", label: "Designer" }, { value: "installer", label: "Installer" }] as const`, `type TeamRole = "designer" | "installer"`, `roleLabel(role: TeamRole): string`, `isTeamRole(value: unknown): value is TeamRole`.
- `team.ts` (`import "server-only"`): `type TeamMember = { id: string; name: string; role: TeamRole }`, `listTeam(): Promise<TeamMember[]>`, `addTeamMember(name: string, role: TeamRole): Promise<string>`, `removeTeamMember(id: string): Promise<boolean>`.
- `schema.ts`: `teamMemberSchema = z.object({ name, role })`.

- [ ] **Step 1: Write the failing tests**

`tests/db/migration-013.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = readFileSync("db/migrations/013_team.sql", "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 013", () => {
  it("creates the team table if missing", () => {
    expect(statements[0]).toMatch(/^create table if not exists team_members \(/);
    expect(statements[0]).toContain("id uuid primary key default gen_random_uuid()");
  });

  it("allows only designer and installer, and a 1-60 character name", () => {
    expect(statements.join(" ")).toContain("check ( role in ('designer','installer') )");
    expect(statements.join(" ")).toContain("check ( length(trim(name)) between 1 and 60 )");
  });

  it("adds assigned_to that clears when a person is removed", () => {
    expect(statements.join(" ")).toContain(
      "alter table leads add column if not exists assigned_to uuid references team_members(id) on delete set null",
    );
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists|alter table (team_members|leads) (drop constraint if exists|add constraint|add column if not exists))/);
    }
  });
});
```

`tests/admin/team.test.ts` (mock `@/lib/db` the way `tests/admin/jobs.test.ts` does — read its top 20 lines and copy the `sql` mock and `text()` helper pattern):
```ts
// after the db mock and `const team = await import("@/lib/admin/team")`:
describe("team", () => {
  it("lists people by name, ignoring case", async () => {
    sql.mockResolvedValue([{ id: ID, name: "Shade", role: "designer" }]);
    expect(await team.listTeam()).toEqual([{ id: ID, name: "Shade", role: "designer" }]);
    expect(text(sql.mock.calls[0])).toContain("order by lower(name)");
  });

  it("adds a person and returns the new id", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await team.addTeamMember("Shade", "designer")).toBe(ID);
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Shade", "designer"]));
  });

  it("removes a person by id", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await team.removeTeamMember(ID)).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("delete from team_members");
  });

  it("refuses a bad id without touching the database", async () => {
    expect(await team.removeTeamMember("nope")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("says false when the person was already gone", async () => {
    sql.mockResolvedValue([]);
    expect(await team.removeTeamMember(ID)).toBe(false);
  });
});
```
Add to `tests/admin/schema.test.ts`:
```ts
describe("teamMemberSchema", () => {
  it("trims the name and accepts a role", () => {
    expect(teamMemberSchema.parse({ name: "  Shade ", role: "designer" })).toEqual({ name: "Shade", role: "designer" });
  });
  it("explains a missing name, a long name and a missing role", () => {
    expect(teamMemberSchema.safeParse({ name: " ", role: "designer" }).error?.issues[0].message).toBe("Enter a name");
    expect(teamMemberSchema.safeParse({ name: "x".repeat(61), role: "designer" }).error?.issues[0].message).toBe("Keep the name under 60 characters");
    expect(teamMemberSchema.safeParse({ name: "Shade", role: "" }).error?.issues[0].message).toBe("Pick Designer or Installer");
  });
});
```
Add a `team-roles` case to the same file or a small `tests/admin/team-roles.test.ts`: `roleLabel("installer") === "Installer"`, `isTeamRole("designer")` true, `isTeamRole("owner")` false.

- [ ] **Step 2: Run to verify failure** — `npx vitest run --maxWorkers=2 tests/db/migration-013.test.ts tests/admin/team.test.ts tests/admin/schema.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`db/migrations/013_team.sql`:
```sql
-- The team the owners assign jobs to. Names only, never sign-in.
-- Every statement is safe to re-run. Removing a person leaves their jobs unassigned.

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  created_at timestamptz not null default now()
);

alter table team_members drop constraint if exists team_members_role_check;

alter table team_members add constraint team_members_role_check check (
  role in ('designer','installer')
);

alter table team_members drop constraint if exists team_members_name_check;

alter table team_members add constraint team_members_name_check check (
  length(trim(name)) between 1 and 60
);

alter table leads add column if not exists assigned_to uuid references team_members(id) on delete set null;
```

`lib/admin/team-roles.ts`:
```ts
/** The tags a team member can have. Safe to import from client components. */
export const TEAM_ROLES = [
  { value: "designer", label: "Designer" },
  { value: "installer", label: "Installer" },
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number]["value"];

export const isTeamRole = (value: unknown): value is TeamRole =>
  TEAM_ROLES.some((role) => role.value === value);

export const roleLabel = (role: TeamRole): string => TEAM_ROLES.find((r) => r.value === role)?.label ?? role;
```

`lib/admin/team.ts`:
```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { TeamRole } from "./team-roles";

/** A person the owners assign jobs to. Names only: never a sign-in. */
export type TeamMember = { id: string; name: string; role: TeamRole };

export async function listTeam(): Promise<TeamMember[]> {
  const rows = await db()`select id, name, role from team_members order by lower(name), created_at`;
  return rows.map((row) => ({ id: row.id as string, name: row.name as string, role: row.role as TeamRole }));
}

export async function addTeamMember(name: string, role: TeamRole): Promise<string> {
  const [row] = await db()`insert into team_members (name, role) values (${name}, ${role}) returning id`;
  return row.id as string;
}

/** Their jobs become unassigned (the foreign key clears them). */
export async function removeTeamMember(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`delete from team_members where id = ${id} returning id`;
  return rows.length > 0;
}
```
(Confirm `isUuid` is exported from `lib/admin/jobs.ts`; it is used by `lib/reviews/db.ts`. If importing jobs.ts creates a cycle later, move nothing — jobs.ts must not import team.ts.)

`lib/admin/schema.ts` — add (import `TEAM_ROLES`-derived values from `./team-roles`):
```ts
const TEAM_ROLE_VALUES = ["designer", "installer"] as const;

export const teamMemberSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60, "Keep the name under 60 characters"),
  role: z.enum(TEAM_ROLE_VALUES, { error: "Pick Designer or Installer" }),
});
```
(Derive `TEAM_ROLE_VALUES` from `TEAM_ROLES.map(r => r.value)` if zod's enum typing allows a readonly tuple; otherwise keep the literal and add a test that it equals `TEAM_ROLES.map(r => r.value)`.)

- [ ] **Step 4: Run tests, typecheck** — all PASS.
- [ ] **Step 5: Commit** — `feat: team members table and data module`

---

### Task 2: The Team section in Settings

**Files:**
- Create: `app/admin/settings/actions.ts`, `app/admin/settings/TeamSection.tsx`, `app/admin/settings/AddMemberForm.tsx`, `tests/admin/settings-actions.test.ts`
- Modify: `app/admin/settings/page.tsx`, `tests/admin/settings-page.test.tsx`

**Interfaces:**
- Consumes: `listTeam`, `addTeamMember`, `removeTeamMember`, `TeamMember` (Task 1), `teamMemberSchema`, `TEAM_ROLES`, `roleLabel`.
- Produces: `addMember(prev: TeamFormState, formData: FormData): Promise<TeamFormState>`, `removeMember(id: string): Promise<void>`, `type TeamFormState = { error?: string; ok?: boolean; name?: string }`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/settings-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => { order.push("auth"); return { email: "owner@example.com" }; });
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const addTeamMember = vi.fn(async () => { order.push("add"); return "id-1"; });
const removeTeamMember = vi.fn(async () => { order.push("remove"); return true; });
vi.mock("@/lib/admin/team", () => ({ addTeamMember, removeTeamMember }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const { addMember, removeMember } = await import("@/app/admin/settings/actions");
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

beforeEach(() => { order.length = 0; vi.clearAllMocks(); });

describe("team actions", () => {
  it("checks the session before adding, then refreshes Settings and the board", async () => {
    expect(await addMember({}, form({ name: " Shade ", role: "designer" }))).toEqual({ ok: true });
    expect(order).toEqual(["auth", "add"]);
    expect(addTeamMember).toHaveBeenCalledWith("Shade", "designer");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("returns the first problem and keeps the typed name", async () => {
    expect(await addMember({}, form({ name: "Shade", role: "" }))).toEqual({ error: "Pick Designer or Installer", name: "Shade" });
    expect(addTeamMember).not.toHaveBeenCalled();
  });

  it("checks the session before removing", async () => {
    await removeMember("3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(order).toEqual(["auth", "remove"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });
});
```

In `tests/admin/settings-page.test.tsx` add `const listTeam = vi.fn(); vi.mock("@/lib/admin/team", () => ({ listTeam }));`, mock `@/app/admin/settings/actions` (`addMember: vi.fn(async () => ({})), removeMember: vi.fn()`), default `listTeam.mockResolvedValue([])` in `beforeEach`, and add:
```ts
describe("team section", () => {
  it("says no one is added yet", async () => {
    calendarEnabled.mockReturnValue(false);
    render(await SettingsPage());
    const team = screen.getByRole("region", { name: "Team" });
    expect(team).toHaveTextContent("No one added yet.");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toHaveDisplayValue("Designer");
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("lists each person with their tag and a Remove button", async () => {
    calendarEnabled.mockReturnValue(false);
    listTeam.mockResolvedValue([
      { id: "a", name: "Joshua", role: "installer" },
      { id: "b", name: "Shade", role: "designer" },
    ]);
    render(await SettingsPage());
    const team = screen.getByRole("region", { name: "Team" });
    expect(team).toHaveTextContent("Joshua — Installer");
    expect(team).toHaveTextContent("Shade — Designer");
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove Shade" })).toBeInTheDocument();
    expect(team).toHaveTextContent("Removing someone leaves their jobs unassigned.");
  });
});
```
Also a small `AddMemberForm` test (render with a mocked `addMember` resolving `{ error: "Enter a name", name: "" }`, submit, expect the alert) if time allows — required: the inline error renders with `role="alert"`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`app/admin/settings/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { teamMemberSchema } from "@/lib/admin/schema";
import { addTeamMember, removeTeamMember } from "@/lib/admin/team";

export type TeamFormState = { error?: string; ok?: boolean; name?: string };

const refresh = () => {
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
};

// Every action calls requireAdmin() before reading its input.

export async function addMember(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await requireAdmin();
  const parsed = teamMemberSchema.safeParse({ name: formData.get("name"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: String(formData.get("name") ?? "") };
  await addTeamMember(parsed.data.name, parsed.data.role);
  refresh();
  return { ok: true };
}

export async function removeMember(id: string): Promise<void> {
  await requireAdmin();
  await removeTeamMember(id);
  refresh();
}
```
(If `revalidatePath` also needs to cover `/admin/jobs/[id]` so open job pages drop a removed person, add `revalidatePath("/admin/jobs/[id]", "page")` — check the Next docs in node_modules for the signature in this version.)

`app/admin/settings/AddMemberForm.tsx` (client, `useActionState`):
```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TEAM_ROLES } from "@/lib/admin/team-roles";
import { addMember, type TeamFormState } from "./actions";

export function AddMemberForm() {
  const [state, action, adding] = useActionState<TeamFormState, FormData>(addMember, {});
  return (
    // A new key after each successful add clears the form.
    <form key={state.ok ? `added-${Date.now()}` : "form"} action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Name
        <input name="name" defaultValue={state.name ?? ""} maxLength={60} className="min-h-11 border border-rule bg-ivory px-3" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Role
        <select name="role" defaultValue="designer" className="min-h-11 border border-rule bg-ivory px-3">
          {TEAM_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={adding}>Add</Button>
      {state.error ? <p role="alert" className="w-full text-sm text-overdue">{state.error}</p> : null}
    </form>
  );
}
```
Do NOT use `Date.now()` in render if lint's purity rule flags it (React 19 lint); instead keep a counter in state from the action result (e.g. the action returns `{ ok: true, added: <new id> }` and the key is `state.added ?? "form"`). Choose whichever passes lint; the test only needs the form to clear.

`app/admin/settings/TeamSection.tsx` (server):
```tsx
import { Button } from "@/components/ui/Button";
import type { TeamMember } from "@/lib/admin/team";
import { roleLabel } from "@/lib/admin/team-roles";
import { removeMember } from "./actions";
import { AddMemberForm } from "./AddMemberForm";

export function TeamSection({ team }: { team: TeamMember[] }) {
  return (
    <section aria-labelledby="team-heading" className="flex flex-col gap-3">
      <h2 id="team-heading" className="text-lg font-semibold">Team</h2>
      {team.length ? (
        <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
          {team.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>{person.name} — {roleLabel(person.role)}</span>
              <form action={removeMember.bind(null, person.id)}>
                <Button type="submit" variant="outline" aria-label={`Remove ${person.name}`}>Remove</Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">No one added yet.</p>
      )}
      <p className="text-sm text-ink-soft">Removing someone leaves their jobs unassigned.</p>
      <AddMemberForm />
    </section>
  );
}
```
(Check `components/ui/Button` accepts `aria-label`; it's a button wrapper.)

`app/admin/settings/page.tsx`: load `listTeam()` (in parallel with the calendar read when enabled), render `<TeamSection team={team} />` directly under the `<h1>`, before the Outlook section. Update the component doc comment.

- [ ] **Step 4: Run tests, typecheck, lint** — PASS.
- [ ] **Step 5: Commit** — `feat: Team section in Settings`

---

### Task 3: Assigning a job (data and action)

**Files:**
- Modify: `lib/admin/jobs.ts` (Job type, `JOB_COLUMNS`, `toJob`, new `assignJob`), `app/admin/jobs/actions.ts` (new `assignJob` action), `tests/admin/jobs.test.ts`, `tests/admin/actions.test.ts`

**Interfaces:**
- Consumes: `TeamRole` from `@/lib/admin/team-roles`.
- Produces: `Job.assignedTo?: string | null`, `Job.assignedName?: string | null`, `Job.assignedRole?: TeamRole | null`; lib `assignJob(id: string, memberId: string | null, actor: string): Promise<"ok" | "missing" | "unknown-member" | "unchanged">`; action `assignJobAction(id: string, prev: FormState, formData: FormData): Promise<FormState>` exported from `app/admin/jobs/actions.ts` (name it `assignJobAction` to avoid clashing with the lib import).

- [ ] **Step 1: Write the failing tests**

In `tests/admin/jobs.test.ts`:
```ts
describe("assigning jobs", () => {
  const MEMBER = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";

  it("maps the assignee fields", async () => {
    sql.query.mockResolvedValue([{ ...row, assigned_to: MEMBER, assigned_name: "Shade", assigned_role: "designer" }]);
    const [job] = await jobs.listJobs({});
    expect(job).toMatchObject({ assignedTo: MEMBER, assignedName: "Shade", assignedRole: "designer" });
  });

  it("maps an unassigned job to nulls", async () => {
    sql.query.mockResolvedValue([row]);
    const [job] = await jobs.listJobs({});
    expect(job).toMatchObject({ assignedTo: null, assignedName: null, assignedRole: null });
  });

  it("selects the assignee's name and role with the job", () => {
    expect(jobs.JOB_COLUMNS).toContain("assigned_to");
    expect(jobs.JOB_COLUMNS).toContain("as assigned_name");
    expect(jobs.JOB_COLUMNS).toContain("as assigned_role");
  });

  it("assigns, logging who it went to", async () => {
    sql.mockResolvedValue([{ job: 1, member: 1, changed: 1 }]);
    expect(await jobs.assignJob(ID, MEMBER, "owner@example.com")).toBe("ok");
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("assigned_to is distinct from");
    expect(statement).toContain("'Assigned to ' || name || ' (' || initcap(role) || ')'");
    expect(statement).toContain("'Unassigned'");
  });

  it("unassigns with null", async () => {
    sql.mockResolvedValue([{ job: 1, member: 0, changed: 1 }]);
    expect(await jobs.assignJob(ID, null, "owner@example.com")).toBe("ok");
  });

  it("reports a missing job, an unknown person and a no-op", async () => {
    sql.mockResolvedValue([{ job: 0, member: 1, changed: 0 }]);
    expect(await jobs.assignJob(ID, MEMBER, "o")).toBe("missing");
    sql.mockResolvedValue([{ job: 1, member: 0, changed: 0 }]);
    expect(await jobs.assignJob(ID, MEMBER, "o")).toBe("unknown-member");
    sql.mockResolvedValue([{ job: 1, member: 1, changed: 0 }]);
    expect(await jobs.assignJob(ID, MEMBER, "o")).toBe("unchanged");
  });

  it("refuses bad ids without touching the database", async () => {
    expect(await jobs.assignJob("nope", MEMBER, "o")).toBe("missing");
    expect(await jobs.assignJob(ID, "nope", "o")).toBe("unknown-member");
    expect(sql).not.toHaveBeenCalled();
  });
});
```
(Use the file's existing `row`, `ID`, `sql`, `text` fixtures; check whether `sql` is reset in a `beforeEach` there.)

In `tests/admin/actions.test.ts` (follow its mocking of `@/lib/admin/jobs`; add `assignJob` to that mock):
```ts
describe("assignJobAction", () => {
  it("checks the session first, and '' unassigns", async () => {
    jobsLib.assignJob.mockResolvedValue("ok");
    const data = new FormData(); data.set("assignedTo", "");
    expect(await assignJobAction(ID, {}, data)).toEqual({});
    expect(requireAdmin).toHaveBeenCalled();
    expect(jobsLib.assignJob).toHaveBeenCalledWith(ID, null, "owner@example.com");
  });

  it("explains a removed person and a missing job", async () => {
    const data = new FormData(); data.set("assignedTo", MEMBER);
    jobsLib.assignJob.mockResolvedValue("unknown-member");
    expect(await assignJobAction(ID, {}, data)).toEqual({ error: "That person is no longer on the team." });
    jobsLib.assignJob.mockResolvedValue("missing");
    expect(await assignJobAction(ID, {}, data)).toEqual({ error: "That job no longer exists." });
  });
});
```
(Adapt names `jobsLib`, `requireAdmin`, `ID`, `MEMBER` to that file's existing identifiers; assert requireAdmin runs before assignJob using the file's existing ordering pattern if it has one.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`lib/admin/jobs.ts`:
- Import `type TeamRole` from `./team-roles`.
- `Job` gains (optional, next to `lastContactAt?`):
```ts
  /** Who the job is assigned to, with their name and tag; absent or null when unassigned. */
  assignedTo?: string | null;
  assignedName?: string | null;
  assignedRole?: TeamRole | null;
```
- Append to `JOB_COLUMNS` (inside the template, after `finish,`, before the last_contact_at subquery or after it — keep it valid SQL):
```
  assigned_to,
  (select t.name from team_members t where t.id = leads.assigned_to) as assigned_name,
  (select t.role from team_members t where t.id = leads.assigned_to) as assigned_role,
```
- `toJob` maps `assignedTo: (row.assigned_to as string | null) ?? null`, `assignedName: (row.assigned_name as string | null) ?? null`, `assignedRole: (row.assigned_role as TeamRole | null) ?? null`.
- New function:
```ts
export type AssignResult = "ok" | "missing" | "unknown-member" | "unchanged";

/** Assigns a job to one team member (or nobody) and logs it, in one statement. */
export async function assignJob(id: string, memberId: string | null, actor: string): Promise<AssignResult> {
  if (!isUuid(id)) return "missing";
  if (memberId !== null && !isUuid(memberId)) return "unknown-member";
  const [result] = await db()`
    with member as (select id, name, role from team_members where id = ${memberId}::uuid),
    target as (select id from leads where id = ${id}),
    changed as (
      update leads set assigned_to = ${memberId}::uuid, updated_at = now()
      where id = ${id} and assigned_to is distinct from ${memberId}::uuid
        and (${memberId}::uuid is null or exists (select 1 from member))
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'edit',
        coalesce((select 'Assigned to ' || name || ' (' || initcap(role) || ')' from member), 'Unassigned')
      from changed
      returning id
    )
    select (select count(*) from target)::int as job, (select count(*) from member)::int as member,
           (select count(*) from changed)::int as changed`;
  if (!result?.job) return "missing";
  if (memberId !== null && !result.member) return "unknown-member";
  return result.changed ? "ok" : "unchanged";
}
```
`app/admin/jobs/actions.ts`:
```ts
export async function assignJobAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const raw = formData.get("assignedTo");
  const memberId = typeof raw === "string" && raw !== "" ? raw : null;
  const result = await assignJob(id, memberId, email);
  if (result === "missing") return MISSING;
  if (result === "unknown-member") return { error: "That person is no longer on the team." };
  refresh(id);
  return {};
}
```
(Import `assignJob` from `@/lib/admin/jobs`.)

- [ ] **Step 4: Run tests, typecheck** — PASS (the full suite too: `JOB_COLUMNS` string assertions elsewhere may need the new columns; update only if they compare the whole string).
- [ ] **Step 5: Commit** — `feat: assign a job to one team member`

---

### Task 4: The Assigned to control and where it shows

**Files:**
- Create: `app/admin/jobs/[id]/AssignControl.tsx`, `tests/admin/assign-control.test.tsx`
- Modify: `app/admin/jobs/[id]/JobHeader.tsx`, the job page that renders `JobHeader` (find it: `grep -rn "<JobHeader" app`), `app/admin/JobPanel.tsx`, `app/admin/page.tsx`, `app/admin/JobCard.tsx`, `app/admin/JobList.tsx`, and their tests (`tests/admin/job-header.test.tsx`, `tests/admin/job-panel.test.tsx`, `tests/admin/board-page.test.tsx`, `tests/admin/board.test.tsx`, `tests/admin/job-list.test.tsx`, plus any test rendering the job page).

**Interfaces:**
- Consumes: `TeamMember`, `listTeam` (Task 1), `roleLabel` (Task 1), `assignJobAction` + `FormState` (Task 3), `Job.assignedTo/assignedName/assignedRole` (Task 3), `SubmitOnChange` from `app/admin/SubmitOnChange.tsx` (props `{ id, name, defaultValue, children }`, renders a select that calls `form.requestSubmit()` on change).
- Produces: `AssignControl({ jobId, assignedTo, team }: { jobId: string; assignedTo: string | null; team: TeamMember[] })`; `JobHeader` and `JobPanel` gain a `team: TeamMember[]` prop.

- [ ] **Step 1: Write the failing tests**

`tests/admin/assign-control.test.tsx` (mock `@/app/admin/jobs/actions` with `assignJobAction: vi.fn(async () => ({}))`):
```tsx
describe("AssignControl", () => {
  const team = [
    { id: "a", name: "Joshua", role: "installer" as const },
    { id: "b", name: "Shade", role: "designer" as const },
  ];

  it("offers Unassigned then each person with their tag, and shows the current choice", () => {
    render(<AssignControl jobId={ID} assignedTo="b" team={team} />);
    const select = screen.getByLabelText("Assigned to");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Unassigned", "Joshua — Installer", "Shade — Designer",
    ]);
    expect(select).toHaveValue("b");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows Unassigned when nobody is assigned", () => {
    render(<AssignControl jobId={ID} assignedTo={null} team={team} />);
    expect(screen.getByLabelText("Assigned to")).toHaveValue("");
  });

  it("points to Settings when there is no team yet", () => {
    render(<AssignControl jobId={ID} assignedTo={null} team={[]} />);
    expect(screen.queryByLabelText("Assigned to")).toBeNull();
    expect(screen.getByRole("link", { name: "Add people in Settings" })).toHaveAttribute("href", "/admin/settings");
  });
});
```
`tests/admin/board.test.tsx`: a card for `job({ assignedName: "Shade", assignedRole: "designer", assignedTo: "b" })` has text "Shade · Designer"; an unassigned card has no "·" assignee line (assert `not.toHaveTextContent("Designer")`).
`tests/admin/job-list.test.tsx`: header row has "Assigned to" after "City"; an assigned row shows "Shade · Designer"; an unassigned row shows "—" in that cell.
`tests/admin/job-header.test.tsx` and `tests/admin/job-panel.test.tsx`: pass `team` and assert `getByLabelText("Assigned to")` exists (mock `assignJobAction` in the actions mock those files already have).
`tests/admin/board-page.test.tsx`: mock `@/lib/admin/team` (`listTeam: vi.fn(async () => [])`), and add `assignJobAction` to its actions mock; with `?job=ID` the panel shows "Add people in Settings".

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/AssignControl.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { TeamMember } from "@/lib/admin/team";
import { roleLabel } from "@/lib/admin/team-roles";
import { SubmitOnChange } from "../../SubmitOnChange";
import { assignJobAction, type FormState } from "../actions";

/** One person per job. Saves as soon as the choice changes; Save covers no-JS. */
export function AssignControl({ jobId, assignedTo, team }: {
  jobId: string;
  assignedTo: string | null;
  team: TeamMember[];
}) {
  const [state, action] = useActionState<FormState, FormData>(assignJobAction.bind(null, jobId), {});
  if (!team.length) {
    return <Link href="/admin/settings" className="text-sm underline underline-offset-4">Add people in Settings</Link>;
  }
  const id = `assign-${jobId}`;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor={id} className="text-ink-soft">Assigned to</label>
      <SubmitOnChange key={assignedTo ?? "none"} id={id} name="assignedTo" defaultValue={assignedTo ?? ""}>
        <option value="">Unassigned</option>
        {team.map((person) => (
          <option key={person.id} value={person.id}>{person.name} — {roleLabel(person.role)}</option>
        ))}
      </SubmitOnChange>
      <button type="submit" className="sr-only">Save</button>
      {state.error ? <p role="alert" className="w-full text-overdue">{state.error}</p> : null}
    </form>
  );
}
```
(`import type { TeamMember } from "@/lib/admin/team"` is type-only, so the server-only module is not bundled; confirm the build agrees. If it complains, move `TeamMember` into `team-roles.ts` and re-export it from `team.ts`.)

`JobHeader.tsx`: add prop `team: TeamMember[]`; render `<AssignControl jobId={job.id} assignedTo={job.assignedTo ?? null} team={team} />` under the city/created line (after "Last contacted"). The job page passes `team={await listTeam()}` (load it in parallel with the page's existing data).

`JobPanel.tsx`: add prop `team: TeamMember[]`; render the control in the "Contact" section above `CallButton` (or a new first "Assigned to" row — keep it in Contact to avoid a new section).

`app/admin/page.tsx`: load `listTeam()` in the existing `Promise.all`; pass `team` to `JobPanel`.

`JobCard.tsx`: after the city line:
```tsx
      {job.assignedName && job.assignedRole ? (
        <span className="text-ink-soft">{job.assignedName} · {roleLabel(job.assignedRole)}</span>
      ) : null}
```
`JobList.tsx`: add `<th scope="col" className="px-4 py-3 font-medium">Assigned to</th>` after City, and a cell `{job.assignedName && job.assignedRole ? `${job.assignedName} · ${roleLabel(job.assignedRole)}` : "—"}` with `className="px-4 py-3 text-ink-soft"`.

- [ ] **Step 4: Run the touched tests, then the full suite once, typecheck, lint, build** — all PASS.
- [ ] **Step 5: Commit** — `feat: Assigned to on the job page, board and list`

---

### Task 5: End-to-end and release

**Files:**
- Create: `e2e/team.spec.ts`
- Modify: `playwright.config.ts` (add `e2e-team-owner@example.com` to the e2e `ADMIN_EMAILS` string and `team` to the mobile project's `testIgnore` regex)

- [ ] **Step 1: Write the spec** (copy the `signIn` + `lead` helper pattern from `e2e/stages.spec.ts`, with `OWNER = "e2e-team-owner@example.com"`, heading check `getByRole("heading", { name: "Jobs", exact: true })`, lead names `E2E Team …`; `afterAll` deletes `leads where name like 'E2E Team %'`, `team_members where name like 'E2E Team %'`, and the owner's tokens/sessions):
```ts
test("add a person, assign a job, see it on the board, remove them", async ({ page }) => {
  const person = `E2E Team Designer ${STAMP}`;
  const jobName = `E2E Team Job ${STAMP}`;
  const id = await lead(jobName);
  await signIn(page);

  await page.goto("/admin/settings");
  await page.getByLabel("Name").fill(person);
  await page.getByLabel("Role").selectOption("designer");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("region", { name: "Team" })).toContainText(`${person} — Designer`);

  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("Assigned to").selectOption({ label: `${person} — Designer` });
  await expect(page.getByText(`Assigned to ${person} (Designer)`)).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Board" }).getByRole("link", { name: new RegExp(jobName) })).toContainText(`${person} · Designer`);

  await page.goto("/admin/settings");
  await page.getByRole("button", { name: `Remove ${person}` }).click();
  await expect(page.getByRole("region", { name: "Team" })).not.toContainText(person);
  const [row] = await sql()`select assigned_to from leads where id = ${id}`;
  expect(row.assigned_to).toBeNull();
});
```
(The Settings list may contain other people on a shared test branch; the assertions above only look for this run's names.)

- [ ] **Step 2: Unit suite, typecheck, lint, build** — all PASS. `npx playwright test --list` shows the new test.
- [ ] **Step 3: Commit** — `test: e2e for the team list and Assigned to`
- [ ] **Step 4: E2E (controller):** Neon test branch, migrate it, full desktop e2e, delete the branch.
- [ ] **Step 5: Release (owner approval required):** migrate production (013) before deploying, `vercel --prod`, check the live Settings and board.
