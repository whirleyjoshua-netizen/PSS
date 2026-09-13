# Customer Project Page (Portal Step 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers sign in with an emailed link and see their own job's progress, the photos the owners share, and their referral link. Owners get an "Add photo" button, a per-photo "Share with customer" switch, and an automatic invite email when a job reaches Quoted.

**Architecture:** A separate customer area under `app/(site)/project` (public site chrome) with its own sign-in tables, sessions and `pss_customer` cookie. All customer data rules live in `lib/portal/`, and one function, `visibleJobs(email)`, decides access everywhere. The owner side changes only `JobFiles`, the job page, `moveStage`, and the file and job data helpers.

**Tech Stack:** Next.js 16.3 App Router (async `params`/`searchParams`/`cookies()`, Server Actions, `after()`), Neon Postgres via `@neondatabase/serverless`, Resend, Vercel Blob (`@vercel/blob`, private), zod 4, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-13-customer-project-page-design.md`

## Global Constraints

- Portal stages are exactly `quoted`, `sold`, `ordered`, `installed`. `new`, `contacted`, `visit_booked` and `lost` are never visible to a customer.
- Customer email = the job's `email`, lowercased and trimmed.
- Customer pages show **no money of any kind**. The only dollar figure allowed is the "$100" referral offer.
- Progress wording: quoted → "Quote ready", sold → "Order confirmed", ordered → "In production", installed → "Installed".
- Page-requested sign-in links expire in **15 minutes**; invite-email links in **7 days**; at most **5 links per email per hour**. Only SHA-256 hashes of tokens are stored (`hashToken` from `lib/admin/tokens.ts`).
- Customer session: **30 days**, cookie `pss_customer`, `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/project"`.
- Link origin: `(process.env.ADMIN_BASE_URL || business.domain)` with trailing slashes stripped. Never the request Host.
- Emails are plain text, `from: \`${business.name} <${process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com"}>\``, `replyTo: business.email`.
- Customer photo route: 404 with the same body for every refusal; headers `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition` via `contentDisposition()`.
- Migration `db/migrations/005_customer_portal.sql`: `scripts/migrate.mjs` re-applies every file each run, strips `--` lines and splits on `;`, so every statement must be idempotent and no `;` may appear inside a statement or comment.
- **Coordination with the parallel `admin-look` branch:** do not edit `app/admin/JobPanel.tsx`, `app/globals.css`, `lib/admin/stages.ts`, `lib/admin/schema.ts`, `app/admin/AdminNav.tsx` or `app/admin/page.tsx`. New `Job` and `JobFile` fields are **optional** (`?:`) so existing test fixtures keep compiling, and `toJob`/`toFile` map a missing column to `null`.
- Next.js here is newer than training data: check `node_modules/next/dist/docs/` before using an unfamiliar API. Do not touch `proxy.ts`.
- Verification: `npx vitest run --maxWorkers=2 <paths>`; `npx tsc --noEmit 2>&1 | grep -v '^.next/'` must print nothing; `npx eslint <changed paths>` has no errors. **Do not run `next build` locally** (very slow, stale `.next/dev/types`).
- Commits end with the session's attribution trailer lines.

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/005_customer_portal.sql` | New columns, index, customer token and session tables |
| `lib/portal/progress.ts` | Portal stages, `isPortalStage`, customer progress wording (pure, client-safe) |
| `lib/portal/access.ts` | `normalizeEmail`, `visibleJobs`, `toProject` (the money-free view of a job) |
| `lib/portal/login.ts` | `portalOrigin`, `issueCustomerLink`, `requestCustomerSignIn`, `consumeCustomerSignIn` |
| `lib/portal/session.ts` | Customer sessions: `createCustomerSession`, `getCustomer`, `requireCustomer`, `destroyCustomerSession` |
| `lib/portal/project.ts` | `countReferred` |
| `lib/portal/invite.ts` | Invite email text, `sendPortalInvite`, `autoInvite` |
| `lib/admin/files.ts` (modify) | `sharedAt` on files, exported `toFile`, `setShared`, `listSharedPhotos` |
| `lib/admin/jobs.ts` (modify) | `portalInvitedAt` on `Job` |
| `app/admin/jobs/measure-actions.ts` (modify) | `setFileShared` action |
| `app/admin/jobs/actions.ts` (modify) | Auto invite in `moveStage`, `sendPortalInviteNow` |
| `app/admin/jobs/[id]/JobFiles.tsx` (modify) | Photos list, Add photo, share switches |
| `app/admin/jobs/[id]/ShareSwitch.tsx` | The share switch form |
| `app/admin/jobs/[id]/AddPhotoButton.tsx` | Client photo upload (resize → `kind: "photo"`) |
| `app/admin/jobs/[id]/InviteSection.tsx` | Owner invite status and button |
| `app/admin/jobs/[id]/page.tsx` (modify) | Renders the invite section |
| `app/(site)/project/layout.tsx` | Noindex metadata and page width for the customer area |
| `app/(site)/project/sign-in/{page,SignInForm,actions}.tsx?` | Request a sign-in link |
| `app/(site)/project/auth/{page.tsx,actions.ts}` | Confirm screen that consumes a token |
| `app/(site)/project/actions.ts` | `signOutCustomer` |
| `app/(site)/project/page.tsx` | One job → its page; several → a list |
| `app/(site)/project/[jobId]/page.tsx` | One job's page |
| `app/(site)/project/ProjectView.tsx` | The project page body |
| `app/(site)/project/CopyLinkButton.tsx` | Copies the referral link |
| `app/(site)/project/files/[fileId]/route.ts` | Streams a shared photo to its customer |
| `e2e/portal.spec.ts`, `playwright.config.ts` (modify) | End-to-end walkthrough; desktop-only like the admin spec |

---

### Task 1: Migration, portal stages and access rule

**Files:**
- Create: `db/migrations/005_customer_portal.sql`
- Create: `lib/portal/progress.ts`
- Create: `lib/portal/access.ts`
- Test: `tests/portal/progress.test.ts`, `tests/portal/access.test.ts`

**Interfaces:**
- Consumes: `JOB_COLUMNS`, `toJob`, `type Job` from `lib/admin/jobs.ts`; `type Stage` from `lib/admin/stages.ts`; `db` from `lib/db.ts`.
- Produces:
  - `PORTAL_STAGES: readonly ["quoted","sold","ordered","installed"]`, `type PortalStage`, `isPortalStage(stage: Stage): stage is PortalStage`
  - `type ProgressStep = { stage: PortalStage; label: string; state: "done" | "current" | "upcoming"; detail: string | null }`
  - `progressSteps(stage: PortalStage, installOn: string | null): ProgressStep[]`, `formatInstallDay(day: string): string`
  - `normalizeEmail(raw: string | null | undefined): string`
  - `visibleJobs(rawEmail: string): Promise<Job[]>`
  - `type ProjectSummary = { id: string; firstName: string; address: string | null; city: string; status: PortalStage; installOn: string | null }`, `toProject(job: Job): ProjectSummary`

- [ ] **Step 1: Write the migration**

`db/migrations/005_customer_portal.sql`:

```sql
-- Portal step 3: the customer project page.
-- Every statement is safe to re-run. job_events_kind_check is unchanged.

alter table job_files add column if not exists shared_at timestamptz;

alter table leads add column if not exists portal_invited_at timestamptz;

create index if not exists leads_email_norm_idx on leads (lower(trim(email)));

create table if not exists customer_login_tokens (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists customer_login_tokens_email_idx on customer_login_tokens (email, created_at);

create table if not exists customer_sessions (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
```

Do **not** run the migration against any database. Production migration is a launch step the owner approves.

- [ ] **Step 2: Write the failing tests**

`tests/portal/progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatInstallDay, isPortalStage, progressSteps, PORTAL_STAGES } from "@/lib/portal/progress";

describe("portal stages", () => {
  it("are quoted through installed, in order", () => {
    expect(PORTAL_STAGES).toEqual(["quoted", "sold", "ordered", "installed"]);
  });

  it("exclude every earlier stage and lost", () => {
    for (const stage of ["new", "contacted", "visit_booked", "lost"] as const) {
      expect(isPortalStage(stage)).toBe(false);
    }
    for (const stage of PORTAL_STAGES) expect(isPortalStage(stage)).toBe(true);
  });
});

describe("progressSteps", () => {
  it("uses customer wording", () => {
    expect(progressSteps("quoted", null).map((s) => s.label)).toEqual([
      "Quote ready", "Order confirmed", "In production", "Installed",
    ]);
  });

  it("marks earlier steps done, the current one current, and later ones upcoming", () => {
    expect(progressSteps("ordered", null).map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
  });

  it("explains the quote step", () => {
    expect(progressSteps("quoted", null)[0].detail).toBe("We've put together your quote.");
  });

  it("shows the install date while in production, once it is set", () => {
    expect(progressSteps("ordered", "2026-10-13")[2].detail).toBe("Install scheduled: Tue, Oct 13");
    expect(progressSteps("ordered", null)[2].detail).toBeNull();
  });

  it("shows the install day once installed", () => {
    expect(progressSteps("installed", "2026-10-13")[3].detail).toBe("Installed Tue, Oct 13");
    expect(progressSteps("installed", null)[3].detail).toBeNull();
  });

  it("puts a detail only on the current step", () => {
    const steps = progressSteps("installed", "2026-10-13");
    expect(steps.slice(0, 3).every((s) => s.detail === null)).toBe(true);
  });

  it("formats a date without shifting it across time zones", () => {
    expect(formatInstallDay("2026-01-01")).toBe("Thu, Jan 1");
  });
});
```

`tests/portal/access.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { normalizeEmail, toProject, visibleJobs } = await import("@/lib/portal/access");

const row = (over: Record<string, unknown> = {}) => ({
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", created_at: "2026-09-01T00:00:00Z", name: "Maria  Lopez",
  phone: "7025550100", email: "maria@example.com", address: "12 Palm Way", city: "Henderson",
  treatments: [], window_count: null, heard_via: null, notes: "gate code 1234", source: "website",
  status: "quoted", stage_changed_at: "2026-09-02T00:00:00Z", visit_at: null, quote_cents: 450000,
  sold_cents: 420000, deposit_cents: 100000, brands: [], ordered_on: null, install_on: "2026-10-13",
  lost_reason: null, referral_code: null, referred_by: null, referral_paid_at: null,
  review_requested_at: null, review_opt_out: false, ...over,
});

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Maria@Example.COM ")).toBe("maria@example.com");
    expect(normalizeEmail(null)).toBe("");
  });
});

describe("visibleJobs", () => {
  it("matches the normalized email against the normalized column, portal stages only", async () => {
    query.mockResolvedValue([row()]);
    const jobs = await visibleJobs(" Maria@Example.com ");

    const [text, params] = query.mock.calls[0];
    expect(text).toContain("lower(trim(email)) = $1");
    expect(text).toContain("status = any($2::text[])");
    expect(params).toEqual(["maria@example.com", ["quoted", "sold", "ordered", "installed"]]);
    expect(jobs.map((j) => j.id)).toEqual(["3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c"]);
  });

  it("returns nothing for a blank email without querying", async () => {
    expect(await visibleJobs("   ")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("toProject", () => {
  it("keeps only what a customer may see", async () => {
    query.mockResolvedValue([row()]);
    const [job] = await visibleJobs("maria@example.com");
    const project = toProject(job);

    expect(project).toEqual({
      id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", firstName: "Maria", address: "12 Palm Way",
      city: "Henderson", status: "quoted", installOn: "2026-10-13",
    });
    expect(JSON.stringify(project)).not.toMatch(/cents|4500|notes|gate code/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: FAIL, cannot resolve `@/lib/portal/progress` and `@/lib/portal/access`.

- [ ] **Step 4: Implement**

`lib/portal/progress.ts`:

```ts
import type { Stage } from "@/lib/admin/stages";

/** The stages a customer can see, in order. Earlier stages and Lost are never shown. */
export const PORTAL_STAGES = ["quoted", "sold", "ordered", "installed"] as const;
export type PortalStage = (typeof PORTAL_STAGES)[number];

export const isPortalStage = (stage: Stage): stage is PortalStage =>
  (PORTAL_STAGES as readonly string[]).includes(stage);

/** The only place the customer-facing stage words live. */
const LABELS: Record<PortalStage, string> = {
  quoted: "Quote ready",
  sold: "Order confirmed",
  ordered: "In production",
  installed: "Installed",
};

export type ProgressStep = {
  stage: PortalStage;
  label: string;
  state: "done" | "current" | "upcoming";
  detail: string | null;
};

/** "2026-10-13" → "Tue, Oct 13". Read at noon UTC so the day never shifts. */
export function formatInstallDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function detailFor(stage: PortalStage, installOn: string | null): string | null {
  if (stage === "quoted") return "We've put together your quote.";
  if (stage === "ordered" && installOn) return `Install scheduled: ${formatInstallDay(installOn)}`;
  if (stage === "installed" && installOn) return `Installed ${formatInstallDay(installOn)}`;
  return null;
}

export function progressSteps(stage: PortalStage, installOn: string | null): ProgressStep[] {
  const current = PORTAL_STAGES.indexOf(stage);
  return PORTAL_STAGES.map((s, index) => ({
    stage: s,
    label: LABELS[s],
    state: index < current ? "done" : index === current ? "current" : "upcoming",
    detail: index === current ? detailFor(s, installOn) : null,
  }));
}
```

`lib/portal/access.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { JOB_COLUMNS, toJob, type Job } from "@/lib/admin/jobs";
import { PORTAL_STAGES, type PortalStage } from "./progress";

export const normalizeEmail = (raw: string | null | undefined): string => (raw ?? "").trim().toLowerCase();

/**
 * The one definition of which jobs a customer email may see: its own jobs,
 * from Quoted onward, never Lost. Sign-in, every customer page and the photo
 * route all go through here.
 */
export async function visibleJobs(rawEmail: string): Promise<Job[]> {
  const email = normalizeEmail(rawEmail);
  if (!email) return [];
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where lower(trim(email)) = $1 and status = any($2::text[])
     order by created_at desc`,
    [email, [...PORTAL_STAGES]],
  );
  return rows.map(toJob);
}

/** What a customer page may render. Deliberately has no money, notes or contact fields. */
export type ProjectSummary = {
  id: string;
  firstName: string;
  address: string | null;
  city: string;
  status: PortalStage;
  installOn: string | null;
};

/** Only call with a job from visibleJobs(), so its status is a portal stage. */
export function toProject(job: Job): ProjectSummary {
  return {
    id: job.id,
    firstName: job.name.trim().split(/\s+/)[0],
    address: job.address,
    city: job.city,
    status: job.status as PortalStage,
    installOn: job.installOn,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/005_customer_portal.sql lib/portal/progress.ts lib/portal/access.ts tests/portal/progress.test.ts tests/portal/access.test.ts
git commit -m "feat: portal access rule, customer progress wording and migration 005"
```

---

### Task 2: Owner photo upload and share switch

**Files:**
- Modify: `lib/admin/files.ts`
- Modify: `app/admin/jobs/measure-actions.ts`
- Modify: `app/admin/jobs/[id]/JobFiles.tsx`
- Create: `app/admin/jobs/[id]/ShareSwitch.tsx`
- Create: `app/admin/jobs/[id]/AddPhotoButton.tsx`
- Test: `tests/admin/file-sharing.test.ts`, `tests/admin/job-files-share.test.tsx`, `tests/admin/add-photo-button.test.tsx`

**Interfaces:**
- Consumes: existing `getFile`, `readFile`, `deleteFile`, `removeFile`, `postFile`, `resizePhoto`, `checkUpload`, `DeleteButton`, `UploadButton`.
- Produces:
  - `JobFile` gains `sharedAt?: Date | null`
  - `export function toFile(row: Record<string, unknown>): JobFile` (now exported)
  - `setShared(jobId: string, fileId: string, shared: boolean, actor: string): Promise<boolean>`
  - `listSharedPhotos(leadId: string): Promise<JobFile[]>`
  - Server action `setFileShared(jobId: string, fileId: string, shared: boolean): Promise<void>` in `measure-actions.ts`

- [ ] **Step 1: Write the failing tests**

`tests/admin/file-sharing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { listSharedPhotos, setShared, toFile } = await import("@/lib/admin/files");
const actions = await import("@/app/admin/jobs/measure-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("toFile", () => {
  it("maps shared_at, and a missing column to null", () => {
    expect(toFile({ id: FILE, shared_at: "2026-09-13T10:00:00Z", size_bytes: "5" }).sharedAt).toEqual(new Date("2026-09-13T10:00:00Z"));
    expect(toFile({ id: FILE, size_bytes: "5" }).sharedAt).toBeNull();
  });
});

describe("setShared", () => {
  it("shares only a photo on that job, logging it in the same statement", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(true);

    const call = sql.mock.calls[0];
    expect(text(call)).toContain("update job_files");
    expect(text(call)).toContain("kind = 'photo'");
    expect(text(call)).toContain("insert into job_events");
    expect(call).toEqual(expect.arrayContaining([JOB, FILE, true, "owner@example.com", "Shared photo ", " with customer"]));
  });

  it("logs stopping, with its own wording", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setShared(JOB, FILE, false, "owner@example.com");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([false, "Stopped sharing photo ", ""]));
  });

  it("returns false for a document, another job's file, or a bad id", async () => {
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(false);
    expect(await setShared(JOB, "nope", true, "owner@example.com")).toBe(false);
  });
});

describe("listSharedPhotos", () => {
  it("returns only shared photos for the job, newest first", async () => {
    await listSharedPhotos(JOB);
    const t = text(sql.mock.calls[0]);
    expect(t).toContain("kind = 'photo'");
    expect(t).toContain("shared_at is not null");
    expect(t).toContain("order by created_at desc");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("returns nothing for a bad id without querying", async () => {
    expect(await listSharedPhotos("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("setFileShared action", () => {
  it("checks the session first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.setFileShared(JOB, FILE, true)).rejects.toThrow("NEXT_REDIRECT");
    expect(sql).not.toHaveBeenCalled();
  });

  it("shares as the signed-in owner", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await actions.setFileShared(JOB, FILE, true);
    expect(sql.mock.calls[0]).toContain("owner@example.com");
  });
});
```

`tests/admin/job-files-share.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/app/admin/jobs/measure-actions", () => ({
  removeFile: vi.fn(), removeMeasurement: vi.fn(), setFileShared: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { JobFiles } = await import("@/app/admin/jobs/[id]/JobFiles");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const file = (id: string, kind: "photo" | "document", sharedAt: Date | null, name = `${id}.jpg`) => ({
  id, leadId: JOB, createdAt: new Date("2026-09-13T10:00:00Z"), uploadedBy: "owner@example.com",
  kind, name, contentType: kind === "photo" ? "image/jpeg" : "application/pdf", sizeBytes: 2048,
  blobPathname: `jobs/${JOB}/${id}`, sharedAt,
});
const measurement = {
  id: "m1", leadId: JOB, createdAt: new Date(), updatedAt: new Date(), measuredBy: "owner@example.com",
  position: 1, room: "Kitchen", label: null, widthEighths: 280, heightEighths: 384, depthEighths: null,
  mount: "inside" as const, requirements: [], notes: null, photoFileId: "window-photo",
};

describe("JobFiles photos and sharing", () => {
  const files = [
    file("install-1", "photo", new Date()),
    file("install-2", "photo", null),
    file("window-photo", "photo", null),
    file("quote", "document", null, "Quote.pdf"),
  ];

  it("lists photos not attached to a window, with an Add photo button", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const photos = screen.getByRole("heading", { name: "Photos · 2" }).parentElement!;
    expect(within(photos).getAllByRole("img")).toHaveLength(2);
    expect(screen.getByLabelText("Add photo")).toBeInTheDocument();
  });

  it("gives every photo a share switch showing its state, and documents none", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const switches = screen.getAllByRole("switch", { name: /share with customer/i });
    expect(switches).toHaveLength(3);
    expect(switches.filter((s) => s.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getAllByText("Shared")).toHaveLength(1);
  });
});
```

`tests/admin/add-photo-button.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const resizePhoto = vi.fn();
const postFile = vi.fn();
vi.mock("@/lib/admin/client-upload", () => ({ resizePhoto, postFile }));

const { AddPhotoButton } = await import("@/app/admin/jobs/[id]/AddPhotoButton");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  refresh.mockReset();
  resizePhoto.mockReset().mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  postFile.mockReset().mockResolvedValue({ id: "new" });
});

describe("AddPhotoButton", () => {
  it("resizes, uploads as a photo named .jpg, and refreshes", async () => {
    render(<AddPhotoButton jobId={JOB} />);
    fireEvent.change(screen.getByLabelText("Add photo"), {
      target: { files: [new File(["x"], "IMG_0042.HEIC", { type: "image/heic" })] },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(postFile).toHaveBeenCalledWith(JOB, expect.any(Blob), "IMG_0042.jpg", "photo");
  });

  it("shows the reason when the photo cannot be read", async () => {
    resizePhoto.mockRejectedValue(new Error("We couldn't read that photo. Try taking it again."));
    render(<AddPhotoButton jobId={JOB} />);
    fireEvent.change(screen.getByLabelText("Add photo"), {
      target: { files: [new File(["x"], "bad.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't read that photo");
    expect(postFile).not.toHaveBeenCalled();
  });

  it("shows an upload error", async () => {
    postFile.mockResolvedValue({ error: "Upload failed. Check your signal and try again." });
    render(<AddPhotoButton jobId={JOB} />);
    fireEvent.change(screen.getByLabelText("Add photo"), {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/file-sharing.test.ts tests/admin/job-files-share.test.tsx tests/admin/add-photo-button.test.tsx`
Expected: FAIL: `toFile`/`setShared`/`listSharedPhotos` are not exported, `AddPhotoButton` is missing, and there is no "Photos" heading.

- [ ] **Step 3: Implement `lib/admin/files.ts` changes**

Add to the `JobFile` type (optional so existing fixtures keep compiling):

```ts
  /** Set when an owner shares this photo with the customer. */
  sharedAt?: Date | null;
```

Change `function toFile` to `export function toFile` and add as its last property:

```ts
    sharedAt: row.shared_at ? new Date(row.shared_at as string) : null,
```

Append:

```ts
/**
 * Shares or stops sharing a photo with the customer, and logs it in the same
 * statement. Only photos on that job qualify; documents are never shared.
 */
export async function setShared(jobId: string, fileId: string, shared: boolean, actor: string): Promise<boolean> {
  if (!UUID.test(jobId) || !UUID.test(fileId)) return false;
  const rows = await db()`
    with changed as (
      update job_files
      set shared_at = case when ${shared} then coalesce(shared_at, now()) else null end
      where id = ${fileId} and lead_id = ${jobId} and kind = 'photo'
      returning lead_id, name
    )
    insert into job_events (lead_id, actor, kind, body)
    select lead_id, ${actor}, 'file',
      ${shared ? "Shared photo " : "Stopped sharing photo "} || name || ${shared ? " with customer" : ""}
    from changed
    returning lead_id`;
  return rows.length > 0;
}

/** The photos a customer may see for one job, newest first. */
export async function listSharedPhotos(leadId: string): Promise<JobFile[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`
    select * from job_files
    where lead_id = ${leadId} and kind = 'photo' and shared_at is not null
    order by created_at desc`;
  return rows.map(toFile);
}
```

- [ ] **Step 4: Add the action to `app/admin/jobs/measure-actions.ts`**

Change the files import to `import { deleteFile, getFile, setShared } from "@/lib/admin/files";` and append:

```ts
export async function setFileShared(jobId: string, fileId: string, shared: boolean): Promise<void> {
  const { email } = await requireAdmin();
  await setShared(jobId, fileId, shared, email);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
}
```

- [ ] **Step 5: Create `app/admin/jobs/[id]/ShareSwitch.tsx`**

```tsx
import { setFileShared } from "@/app/admin/jobs/measure-actions";

/** Submits the opposite state. aria-checked carries the current one for screen readers. */
export function ShareSwitch({ jobId, fileId, shared }: { jobId: string; fileId: string; shared: boolean }) {
  return (
    <form action={setFileShared.bind(null, jobId, fileId, !shared)}>
      <button type="submit" role="switch" aria-checked={shared}
        className="inline-flex min-h-11 items-center gap-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
        <span aria-hidden="true"
          className={`inline-flex h-5 w-9 items-center rounded-full border border-charcoal p-0.5 ${shared ? "bg-charcoal" : "bg-ivory"}`}>
          <span className={`block size-3.5 rounded-full transition-transform ${shared ? "translate-x-4 bg-ivory" : "bg-charcoal"}`} />
        </span>
        Share with customer
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Create `app/admin/jobs/[id]/AddPhotoButton.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postFile, resizePhoto } from "@/lib/admin/client-upload";
import { checkUpload } from "@/lib/admin/uploads";

/** Install and before/after photos. Resized on the phone like measuring photos. */
export function AddPhotoButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center self-start border border-charcoal px-4 text-sm">
        {pending ? "Uploading…" : "Add photo"}
        <input type="file" accept="image/*" className="sr-only" disabled={pending} aria-label="Add photo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setError(null);
            startTransition(async () => {
              try {
                const photo = await resizePhoto(file);
                const problem = checkUpload("photo", "image/jpeg", photo.size);
                if (problem) return setError(problem);
                const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
                const result = await postFile(jobId, photo, name, "photo");
                if ("error" in result) setError(result.error);
                else router.refresh();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Upload failed. Try again.");
              }
            });
          }} />
      </label>
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 7: Update `app/admin/jobs/[id]/JobFiles.tsx`**

Add imports:

```tsx
import { AddPhotoButton } from "./AddPhotoButton";
import { ShareSwitch } from "./ShareSwitch";
```

Inside the component, after `const uploads = …`, add:

```tsx
  const windowPhotoIds = new Set(measurements.map((m) => m.photoFileId).filter(Boolean));
  const photos = files.filter((file) => file.kind === "photo" && !windowPhotoIds.has(file.id));
  const sharedById = new Map(files.map((file) => [file.id, Boolean(file.sharedAt)]));
```

In the top button row, add `<AddPhotoButton jobId={jobId} />` after `<UploadButton jobId={jobId} />`.

In each measurement row's right-hand column, before the delete form, add:

```tsx
                    {m.photoFileId ? (
                      <ShareSwitch jobId={jobId} fileId={m.photoFileId} shared={sharedById.get(m.photoFileId) ?? false} />
                    ) : null}
```

Between the Measurements block and the Uploads block, add:

```tsx
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Photos · {photos.length}</h3>
        {photos.length === 0 ? <p className="text-sm text-ink-soft">No photos yet. Install and before/after photos go here.</p> : (
          <ul className="flex flex-col divide-y divide-rule border border-rule">
            {photos.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <a href={`/admin/files/${file.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                  <img src={`/admin/files/${file.id}`} alt={file.name} className="size-16 object-cover" />
                </a>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{file.name}</p>
                  <p className="text-ink-soft">
                    {formatWhen(file.createdAt)}
                    {file.sharedAt ? <> · <span className="text-xs uppercase tracking-wide text-charcoal">Shared</span></> : null}
                  </p>
                </div>
                <ShareSwitch jobId={jobId} fileId={file.id} shared={Boolean(file.sharedAt)} />
                <form action={removeFile.bind(null, jobId, file.id)}>
                  <DeleteButton />
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
```

Also show the "Shared" label for a shared window photo: in the measurement row's details, after the notes paragraph, add:

```tsx
                    {m.photoFileId && sharedById.get(m.photoFileId) ? (
                      <p className="text-xs uppercase tracking-wide">Shared</p>
                    ) : null}
```

The test fixture shares only the standalone `install-1` photo, so `getAllByText("Shared")` finds exactly one.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/admin`
Expected: PASS, including the existing `files`, `measure-actions` and `job-page` tests.

- [ ] **Step 9: Typecheck, lint, commit**

Run: `npx tsc --noEmit 2>&1 | grep -v '^.next/'` (no output) and `npx eslint lib/admin/files.ts app/admin/jobs tests/admin`.

```bash
git add lib/admin/files.ts app/admin/jobs/measure-actions.ts "app/admin/jobs/[id]/JobFiles.tsx" "app/admin/jobs/[id]/ShareSwitch.tsx" "app/admin/jobs/[id]/AddPhotoButton.tsx" tests/admin/file-sharing.test.ts tests/admin/job-files-share.test.tsx tests/admin/add-photo-button.test.tsx
git commit -m "feat: add job photos and share them with the customer"
```

---

### Task 3: Customer sign-in links and sessions

**Files:**
- Create: `lib/portal/login.ts`
- Create: `lib/portal/session.ts`
- Test: `tests/portal/login.test.ts`, `tests/portal/session.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, `visibleJobs` (Task 1); `newToken`, `hashToken` from `lib/admin/tokens.ts`; `business`.
- Produces:
  - `LINK_MINUTES = 15`, `INVITE_MINUTES = 7 * 24 * 60`
  - `portalOrigin(): string`
  - `issueCustomerLink(email: string, minutes: number): Promise<string>`: stores the hash and returns `${portalOrigin()}/project/auth?token=<token>`
  - `requestCustomerSignIn(rawEmail: string): Promise<void>`
  - `consumeCustomerSignIn(token: string): Promise<string | null>`
  - `CUSTOMER_COOKIE = "pss_customer"`, `createCustomerSession(email: string): Promise<void>`
  - `getCustomer(): Promise<{ email: string; jobs: Job[] } | null>` (cached per request)
  - `requireCustomer(): Promise<{ email: string; jobs: Job[] }>`: redirects to `/project/sign-in`
  - `destroyCustomerSession(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`tests/portal/login.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { business } from "@/content/business";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const visibleJobs = vi.fn();
vi.mock("@/lib/portal/access", () => ({
  visibleJobs,
  normalizeEmail: (raw: string | null | undefined) => (raw ?? "").trim().toLowerCase(),
}));

const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCallbacks.push(cb); } }));
const runScheduledWork = () => Promise.all(afterCallbacks.splice(0).map((cb) => cb()));

const { consumeCustomerSignIn, issueCustomerLink, requestCustomerSignIn, INVITE_MINUTES } = await import("@/lib/portal/login");
const { hashToken } = await import("@/lib/admin/tokens");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const countIs = (n: number) => async (strings: TemplateStringsArray) =>
  strings.join("?").includes("count(*)") ? [{ count: n }] : [];

beforeEach(() => {
  afterCallbacks.length = 0;
  sql.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  visibleJobs.mockReset().mockResolvedValue([{ id: "job" }]);
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test/");
});

describe("issueCustomerLink", () => {
  it("stores only the hash and returns a link on the configured origin", async () => {
    const link = await issueCustomerLink("maria@example.com", INVITE_MINUTES);
    const token = link.match(/token=([A-Za-z0-9_-]{43})$/)![1];
    expect(link.startsWith("https://pss.test/project/auth?token=")).toBe(true);
    const insert = sql.mock.calls[0];
    expect(text(insert)).toContain("insert into customer_login_tokens");
    expect(insert).toContain(hashToken(token));
    expect(insert).not.toContain(token);
    expect(insert).toContain(`${7 * 24 * 60} minutes`);
  });

  it("falls back to the business domain", async () => {
    vi.stubEnv("ADMIN_BASE_URL", "");
    expect(await issueCustomerLink("maria@example.com", 15)).toContain(`${business.domain}/project/auth?token=`);
  });
});

describe("requestCustomerSignIn", () => {
  it("resolves immediately, doing the work later", async () => {
    expect(await requestCustomerSignIn("maria@example.com")).toBeUndefined();
    expect(visibleJobs).not.toHaveBeenCalled();
  });

  it("emails a 15-minute link to a customer with a visible job", async () => {
    sql.mockImplementation(countIs(0));
    await requestCustomerSignIn(" Maria@Example.com ");
    await runScheduledWork();

    expect(visibleJobs).toHaveBeenCalledWith("maria@example.com");
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("maria@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.text).toMatch(/https:\/\/pss\.test\/project\/auth\?token=[A-Za-z0-9_-]{43}/);
    expect(message.text).toContain("expires in 15 minutes");
    expect(sql.mock.calls.find((c) => text(c).includes("insert into customer_login_tokens"))).toContain("15 minutes");
  });

  it("does nothing for an email with no visible job", async () => {
    visibleJobs.mockResolvedValue([]);
    await requestCustomerSignIn("stranger@example.com");
    await runScheduledWork();
    expect(send).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("stops after five links in an hour", async () => {
    sql.mockImplementation(countIs(5));
    await requestCustomerSignIn("maria@example.com");
    await runScheduledWork();
    expect(send).not.toHaveBeenCalled();
  });

  it("logs failures instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    visibleJobs.mockRejectedValue(new Error("db down"));
    await requestCustomerSignIn("maria@example.com");
    await expect(runScheduledWork()).resolves.toBeDefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("consumeCustomerSignIn", () => {
  it("uses the token once and returns the email while a job is visible", async () => {
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    expect(await consumeCustomerSignIn("tok")).toBe("maria@example.com");
    expect(text(sql.mock.calls[0])).toContain("used_at is null and expires_at > now()");
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
  });

  it("returns null for an unknown, used or expired token", async () => {
    expect(await consumeCustomerSignIn("tok")).toBeNull();
  });

  it("returns null once the customer has no visible job", async () => {
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    visibleJobs.mockResolvedValue([]);
    expect(await consumeCustomerSignIn("tok")).toBeNull();
  });
});
```

`tests/portal/session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const visibleJobs = vi.fn();
vi.mock("@/lib/portal/access", () => ({ visibleJobs }));

const jar = new Map<string, string>();
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  set: vi.fn((name: string, value: string, _options?: Record<string, unknown>) => jar.set(name, value)),
  delete: vi.fn((name: string | Record<string, unknown>) => jar.delete(typeof name === "string" ? name : String(name.name))),
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));

const { CUSTOMER_COOKIE, createCustomerSession, destroyCustomerSession, getCustomer, requireCustomer } =
  await import("@/lib/portal/session");
const { hashToken } = await import("@/lib/admin/tokens");

beforeEach(() => {
  jar.clear();
  sql.mockReset().mockResolvedValue([]);
  visibleJobs.mockReset().mockResolvedValue([{ id: "job" }]);
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  redirect.mockClear();
});

describe("customer sessions", () => {
  it("sets a 30-day httpOnly cookie scoped to /project and stores only its hash", async () => {
    await createCustomerSession("maria@example.com");
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("pss_customer");
    expect(name).toBe(CUSTOMER_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/project", maxAge: 60 * 60 * 24 * 30 });
    const insert = sql.mock.calls.find((c) => (c[0] as TemplateStringsArray).join("?").includes("insert into customer_sessions"))!;
    expect(insert).toContain(hashToken(value));
    expect(insert).not.toContain(value);
  });

  it("returns the customer and their visible jobs for a live session", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    expect(await getCustomer()).toEqual({ email: "maria@example.com", jobs: [{ id: "job" }] });
    expect(visibleJobs).toHaveBeenCalledWith("maria@example.com");
  });

  it("returns null without a cookie, and never queries", async () => {
    expect(await getCustomer()).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns null for an expired or deleted session", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    expect(await getCustomer()).toBeNull();
  });

  it("returns null once no job is visible (for example, marked Lost)", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    visibleJobs.mockResolvedValue([]);
    expect(await getCustomer()).toBeNull();
  });

  it("requireCustomer sends a stranger to the customer sign-in", async () => {
    await expect(requireCustomer()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/project/sign-in");
  });

  it("signing out deletes the row and the cookie", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    await destroyCustomerSession();
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
    expect(cookieStore.delete).toHaveBeenCalled();
    expect(jar.has(CUSTOMER_COOKIE)).toBe(false);
  });
});
```

`getCustomer` is wrapped in React `cache()`. Outside a React request, `cache` does not memoize across calls, so each test's call runs fresh, the same as the admin session tests.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/login.test.ts tests/portal/session.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `lib/portal/login.ts`**

```ts
import "server-only";
import { after } from "next/server";
import { Resend } from "resend";
import { business } from "@/content/business";
import { db } from "@/lib/db";
import { hashToken, newToken } from "@/lib/admin/tokens";
import { normalizeEmail, visibleJobs } from "./access";

export const LINK_MINUTES = 15;
/** Invite links last a week: customers don't open email right away. */
export const INVITE_MINUTES = 7 * 24 * 60;
const LINKS_PER_HOUR = 5;

/** From configuration, never the request's Host header. No trailing slash. */
export const portalOrigin = (): string => (process.env.ADMIN_BASE_URL || business.domain).replace(/\/+$/, "");

/** Stores a new single-use token (its hash only) and returns the sign-in link for it. */
export async function issueCustomerLink(email: string, minutes: number): Promise<string> {
  const token = newToken();
  await db()`
    insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + ${`${minutes} minutes`}::interval)`;
  return `${portalOrigin()}/project/auth?token=${token}`;
}

/**
 * Emails a sign-in link to a customer with a visible job. Returns at once,
 * having done nothing yet. The lookup, rate limit and email all run in
 * after(), so the response never reveals who is a customer.
 */
export async function requestCustomerSignIn(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);

  after(async () => {
    try {
      if ((await visibleJobs(email)).length === 0) return;

      const sql = db();
      await sql`delete from customer_login_tokens where expires_at < now() - interval '1 day'`;
      const [{ count }] = await sql`
        select count(*)::int as count from customer_login_tokens
        where email = ${email} and created_at > now() - interval '1 hour'`;
      if (Number(count) >= LINKS_PER_HOUR) return;

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error("Customer sign-in email is not configured (missing RESEND_API_KEY).");
        return;
      }
      const link = await issueCustomerLink(email, LINK_MINUTES);
      const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

      const { error } = await new Resend(apiKey).emails.send({
        from: `${business.name} <${from}>`,
        to: email,
        replyTo: business.email,
        subject: `Your ${business.name} sign-in link`,
        text: [
          "Sign in to see your project:",
          "",
          link,
          "",
          `This link works once and expires in ${LINK_MINUTES} minutes.`,
          "If you did not ask for it, ignore this email.",
        ].join("\n"),
      });
      if (error) console.error("Customer sign-in email failed", error);
    } catch (error) {
      console.error("Customer sign-in request failed", error);
    }
  });
}

/** Marks a token used and returns its email, or null if it cannot be used or no job is visible. */
export async function consumeCustomerSignIn(token: string): Promise<string | null> {
  const rows = await db()`
    update customer_login_tokens set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning email`;
  const email = rows[0]?.email as string | undefined;
  if (!email) return null;
  return (await visibleJobs(email)).length > 0 ? email : null;
}
```

- [ ] **Step 4: Implement `lib/portal/session.ts`**

```ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Job } from "@/lib/admin/jobs";
import { hashToken, newToken } from "@/lib/admin/tokens";
import { visibleJobs } from "./access";

/** Separate from the admin's pss_admin cookie, and only ever sent to /project. */
export const CUSTOMER_COOKIE = "pss_customer";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const COOKIE_PATH = "/project";

export async function createCustomerSession(email: string): Promise<void> {
  const sql = db();
  await sql`delete from customer_sessions where expires_at < now()`;

  const token = newToken();
  await sql`
    insert into customer_sessions (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + interval '30 days')`;

  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: SESSION_SECONDS,
  });
}

/**
 * The signed-in customer and the jobs they may see, or null. Re-checks the
 * session and visibleJobs on every request, so removing an email or marking
 * a job Lost takes effect at once. Cached per request.
 */
export const getCustomer = cache(async (): Promise<{ email: string; jobs: Job[] } | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  const rows = await db()`
    select email from customer_sessions
    where token_hash = ${hashToken(token)} and expires_at > now()`;
  const email = rows[0]?.email as string | undefined;
  if (!email) return null;

  const jobs = await visibleJobs(email);
  return jobs.length > 0 ? { email, jobs } : null;
});

/** The guard every customer page, action and route calls. */
export async function requireCustomer(): Promise<{ email: string; jobs: Job[] }> {
  const customer = await getCustomer();
  if (!customer) redirect("/project/sign-in");
  return customer;
}

export async function destroyCustomerSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) await db()`delete from customer_sessions where token_hash = ${hashToken(token)}`;
  store.delete({ name: CUSTOMER_COOKIE, path: COOKIE_PATH });
}
```

The cookie has a non-root path, so delete it with the object form so the browser clears the right cookie. Check `node_modules/next/dist/docs/` for `cookies().delete` if the object form is rejected by the types; fall back to `store.set(CUSTOMER_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 })`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/portal/login.ts lib/portal/session.ts tests/portal/login.test.ts tests/portal/session.test.ts
git commit -m "feat: customer sign-in links and sessions"
```

---

### Task 4: Customer sign-in, confirm and sign-out pages

**Files:**
- Create: `app/(site)/project/layout.tsx`
- Create: `app/(site)/project/sign-in/page.tsx`, `app/(site)/project/sign-in/SignInForm.tsx`, `app/(site)/project/sign-in/actions.ts`
- Create: `app/(site)/project/auth/page.tsx`, `app/(site)/project/auth/actions.ts`
- Create: `app/(site)/project/actions.ts`
- Test: `tests/portal/sign-in-actions.test.ts`, `tests/portal/sign-in-form.test.tsx`

**Interfaces:**
- Consumes: `requestCustomerSignIn`, `consumeCustomerSignIn` (Task 3); `createCustomerSession`, `getCustomer`, `destroyCustomerSession` (Task 3); `Button`, `TextField`.
- Produces:
  - `requestCustomerSignInAction(prev: CustomerSignInState, formData: FormData): Promise<CustomerSignInState>`, `type CustomerSignInState = { status: "idle" | "sent" | "error"; message?: string }`
  - `completeCustomerSignIn(formData: FormData): Promise<void>`: redirects to `/project` or `/project/sign-in?error=expired`
  - `signOutCustomer(): Promise<void>`: redirects to `/project/sign-in`

`/project` is a static folder, so it takes precedence over the dynamic `app/(site)/[category]` segment.

- [ ] **Step 1: Write the failing tests**

`tests/portal/sign-in-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const login = { requestCustomerSignIn: vi.fn(), consumeCustomerSignIn: vi.fn() };
vi.mock("@/lib/portal/login", () => login);
const session = { createCustomerSession: vi.fn(), destroyCustomerSession: vi.fn() };
vi.mock("@/lib/portal/session", () => session);
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { requestCustomerSignInAction } = await import("@/app/(site)/project/sign-in/actions");
const { completeCustomerSignIn } = await import("@/app/(site)/project/auth/actions");
const { signOutCustomer } = await import("@/app/(site)/project/actions");

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
};

beforeEach(() => {
  Object.values(login).forEach((fn) => fn.mockReset());
  Object.values(session).forEach((fn) => fn.mockReset());
  redirect.mockClear();
});

describe("requestCustomerSignInAction", () => {
  it("rejects a malformed email without doing anything", async () => {
    expect(await requestCustomerSignInAction({ status: "idle" }, form({ email: "nope" })))
      .toEqual({ status: "error", message: "Enter a valid email address" });
    expect(login.requestCustomerSignIn).not.toHaveBeenCalled();
  });

  it("always reports sent for a well-formed email", async () => {
    expect(await requestCustomerSignInAction({ status: "idle" }, form({ email: "maria@example.com" })))
      .toEqual({ status: "sent" });
    expect(login.requestCustomerSignIn).toHaveBeenCalledWith("maria@example.com");
  });
});

describe("completeCustomerSignIn", () => {
  it("starts a session and goes to the project page", async () => {
    login.consumeCustomerSignIn.mockResolvedValue("maria@example.com");
    await expect(completeCustomerSignIn(form({ token: "tok" }))).rejects.toThrow("NEXT_REDIRECT /project");
    expect(session.createCustomerSession).toHaveBeenCalledWith("maria@example.com");
  });

  it("sends an expired or used link back to sign-in", async () => {
    login.consumeCustomerSignIn.mockResolvedValue(null);
    await expect(completeCustomerSignIn(form({ token: "tok" }))).rejects.toThrow("NEXT_REDIRECT /project/sign-in?error=expired");
    expect(session.createCustomerSession).not.toHaveBeenCalled();
  });

  it("treats a missing token as expired", async () => {
    await expect(completeCustomerSignIn(form({}))).rejects.toThrow("/project/sign-in?error=expired");
    expect(login.consumeCustomerSignIn).not.toHaveBeenCalled();
  });
});

describe("signOutCustomer", () => {
  it("ends the session and returns to sign-in", async () => {
    await expect(signOutCustomer()).rejects.toThrow("NEXT_REDIRECT /project/sign-in");
    expect(session.destroyCustomerSession).toHaveBeenCalled();
  });
});
```

`tests/portal/sign-in-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(site)/project/sign-in/actions", () => ({ requestCustomerSignInAction: vi.fn() }));
const { CustomerSignInForm } = await import("@/app/(site)/project/sign-in/SignInForm");

describe("CustomerSignInForm", () => {
  it("asks for an email", () => {
    render(<CustomerSignInForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeInTheDocument();
  });

  it("explains an expired link", () => {
    render(<CustomerSignInForm expired />);
    expect(screen.getByRole("alert")).toHaveTextContent("This link expired or was already used");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/sign-in-actions.test.ts tests/portal/sign-in-form.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`app/(site)/project/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your project | Premier Shade Solutions",
  robots: { index: false, follow: false },
};

/** Customer area. Every page calls requireCustomer() itself. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">{children}</div>;
}
```

`app/(site)/project/sign-in/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { requestCustomerSignIn } from "@/lib/portal/login";

export type CustomerSignInState = { status: "idle" | "sent" | "error"; message?: string };

const email = z.string().trim().max(254).email("Enter a valid email address");

/** Always "sent" for a well-formed email, whether or not it belongs to a customer. */
export async function requestCustomerSignInAction(
  _prev: CustomerSignInState,
  formData: FormData,
): Promise<CustomerSignInState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  await requestCustomerSignIn(parsed.data);
  return { status: "sent" };
}
```

`app/(site)/project/sign-in/SignInForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/Field";
import { requestCustomerSignInAction, type CustomerSignInState } from "./actions";

export function CustomerSignInForm({ expired = false }: { expired?: boolean }) {
  const [state, action, pending] = useActionState<CustomerSignInState, FormData>(
    requestCustomerSignInAction,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-5 text-sm">
        Check your email for a sign-in link. It works once and expires in 15 minutes.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {expired && state.status === "idle" ? (
        <p role="alert" className="border border-rule bg-sand/60 p-4 text-sm">
          This link expired or was already used. Enter your email for a new one.
        </p>
      ) : null}
      <TextField id="customer-email" name="email" label="Email" type="email" autoComplete="email" required />
      {state.status === "error" ? <p role="alert" className="text-sm text-charcoal">{state.message}</p> : null}
      <Button type="submit" variant="solid" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
```

`app/(site)/project/sign-in/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/portal/session";
import { CustomerSignInForm } from "./SignInForm";

export default async function CustomerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCustomer()) redirect("/project");
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-6">
      <h1 className="font-display text-3xl font-light">Your project page</h1>
      <p className="text-ink-soft">
        Follow your project from quote to install. Enter the email you gave us and we&apos;ll send you a sign-in link.
      </p>
      <CustomerSignInForm expired={error === "expired"} />
    </div>
  );
}
```

`app/(site)/project/auth/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { consumeCustomerSignIn } from "@/lib/portal/login";
import { createCustomerSession } from "@/lib/portal/session";

/** Confirmed by a click on /project/auth, never by the GET alone. */
export async function completeCustomerSignIn(formData: FormData): Promise<void> {
  const token = formData.get("token");
  const email = typeof token === "string" && token ? await consumeCustomerSignIn(token) : null;
  if (!email) redirect("/project/sign-in?error=expired");

  await createCustomerSession(email);
  redirect("/project");
}
```

`app/(site)/project/auth/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { completeCustomerSignIn } from "./actions";

/**
 * The emailed link lands here. Opening it does not use the token: email
 * scanners open links automatically. Only pressing Sign in does.
 */
export default async function CustomerAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/project/sign-in?error=expired");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-6">
      <h1 className="font-display text-3xl font-light">Sign in to your project page</h1>
      <form action={completeCustomerSignIn} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="solid">Sign in</Button>
      </form>
    </div>
  );
}
```

`app/(site)/project/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { destroyCustomerSession } from "@/lib/portal/session";

export async function signOutCustomer(): Promise<void> {
  await destroyCustomerSession();
  redirect("/project/sign-in");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npx tsc --noEmit 2>&1 | grep -v '^.next/'` (no output) and `npx eslint "app/(site)/project" tests/portal`.

```bash
git add "app/(site)/project" tests/portal/sign-in-actions.test.ts tests/portal/sign-in-form.test.tsx
git commit -m "feat: customer sign-in, confirm and sign-out pages"
```

---

### Task 5: The project page and the customer photo route

**Files:**
- Create: `lib/portal/project.ts`
- Create: `app/(site)/project/page.tsx`, `app/(site)/project/[jobId]/page.tsx`
- Create: `app/(site)/project/ProjectView.tsx`, `app/(site)/project/CopyLinkButton.tsx`
- Create: `app/(site)/project/files/[fileId]/route.ts`
- Test: `tests/portal/project-view.test.tsx`, `tests/portal/project-pages.test.tsx`, `tests/portal/files-route.test.ts`

**Interfaces:**
- Consumes: `requireCustomer` (Task 3); `toProject`, `ProjectSummary` (Task 1); `progressSteps` (Task 1); `listSharedPhotos`, `getFile`, `readFile` (Task 2 / existing); `ensureReferralCode` from `lib/referrals/db.ts`; `referralUrl` from `lib/referrals/codes.ts`; `contentDisposition` from `lib/admin/uploads.ts`; `signOutCustomer` (Task 4); `business`.
- Produces:
  - `countReferred(jobId: string): Promise<number>`
  - `ProjectView({ job }: { job: Job }): Promise<JSX.Element>` (async server component)
  - `GET /project/files/[fileId]`

- [ ] **Step 1: Write the failing tests**

`tests/portal/project-view.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const listSharedPhotos = vi.fn();
vi.mock("@/lib/admin/files", () => ({ listSharedPhotos }));
const ensureReferralCode = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode }));
const countReferred = vi.fn();
vi.mock("@/lib/portal/project", () => ({ countReferred }));
vi.mock("@/app/(site)/project/actions", () => ({ signOutCustomer: vi.fn() }));

const { ProjectView } = await import("@/app/(site)/project/ProjectView");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job = {
  id: JOB, createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: "maria@example.com",
  address: "12 Palm Way", city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: "Gate code 1234", source: "website", status: "ordered" as const, stageChangedAt: new Date(),
  visitAt: null, quoteCents: 450000, soldCents: 420000, depositCents: 100000, brands: ["Hunter Douglas"],
  orderedOn: "2026-09-20", installOn: "2026-10-13", lostReason: null, referralCode: null, referredBy: null,
  referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};

beforeEach(() => {
  listSharedPhotos.mockReset().mockResolvedValue([{ id: "p1", name: "Living room.jpg" }]);
  ensureReferralCode.mockReset().mockResolvedValue("K7QX2M");
  countReferred.mockReset().mockResolvedValue(2);
});

describe("ProjectView", () => {
  it("greets the customer and shows where the job is", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hi Maria");
    expect(screen.getByText("12 Palm Way, Henderson")).toBeInTheDocument();
    const current = screen.getByText("In production").closest("li")!;
    expect(current).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Install scheduled: Tue, Oct 13")).toBeInTheDocument();
  });

  it("shows only shared photos, through the customer route", async () => {
    render(await ProjectView({ job }));
    expect(listSharedPhotos).toHaveBeenCalledWith(JOB);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/project/files/p1");
  });

  it("shows an empty state with no shared photos", async () => {
    listSharedPhotos.mockResolvedValue([]);
    render(await ProjectView({ job }));
    expect(screen.getByText("Photos from your install will appear here.")).toBeInTheDocument();
  });

  it("gives the referral link and count", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByText("https://premiershadesolutions.com/r/K7QX2M")).toBeInTheDocument();
    expect(screen.getByText("Friends referred so far: 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("never shows money, notes or brands", async () => {
    const { container } = render(await ProjectView({ job }));
    const text = container.textContent ?? "";
    expect(text.replace("$100", "")).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/4,500|4,200|1,000|Gate code|Hunter Douglas/);
  });

  it("lets the customer sign out and contact us", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "(725) 400-5254" })).toHaveAttribute("href", "tel:+17254005254");
  });
});
```

`tests/portal/project-pages.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/app/(site)/project/ProjectView", () => ({
  ProjectView: ({ job }: { job: { id: string } }) => <p>project {job.id}</p>,
}));

const Home = (await import("@/app/(site)/project/page")).default;
const JobPage = (await import("@/app/(site)/project/[jobId]/page")).default;

const one = { id: "a", address: "12 Palm Way", city: "Henderson" };
const two = { id: "b", address: null, city: "Las Vegas" };

beforeEach(() => {
  requireCustomer.mockReset();
  notFound.mockClear();
});

describe("/project", () => {
  it("shows the only job straight away", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one] });
    render(await Home());
    expect(screen.getByText("project a")).toBeInTheDocument();
  });

  it("lists several jobs by address", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, two] });
    render(await Home());
    expect(screen.getByRole("link", { name: "12 Palm Way, Henderson" })).toHaveAttribute("href", "/project/a");
    expect(screen.getByRole("link", { name: "Las Vegas" })).toHaveAttribute("href", "/project/b");
  });
});

describe("/project/[jobId]", () => {
  it("shows a visible job", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, two] });
    render(await JobPage({ params: Promise.resolve({ jobId: "b" }) }));
    expect(screen.getByText("project b")).toBeInTheDocument();
  });

  it("404s for any job that is not theirs", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one] });
    await expect(JobPage({ params: Promise.resolve({ jobId: "someone-else" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

`tests/portal/files-route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
const files = { getFile: vi.fn(), readFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);

const { GET } = await import("@/app/(site)/project/files/[fileId]/route");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const call = () => GET(new Request("http://localhost"), { params: Promise.resolve({ fileId: FILE }) });
const photo = (over: Record<string, unknown> = {}) => ({
  id: FILE, leadId: JOB, kind: "photo", name: "Living room.jpg", sharedAt: new Date(), ...over,
});

beforeEach(() => {
  requireCustomer.mockReset().mockResolvedValue({ email: "maria@example.com", jobs: [{ id: JOB }] });
  files.getFile.mockReset().mockResolvedValue(photo());
  files.readFile.mockReset().mockResolvedValue({ stream: new Blob(["jpeg"]).stream(), contentType: "image/jpeg" });
});

describe("customer photo route", () => {
  it("streams a shared photo on the customer's job, privately", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it.each([
    ["an unshared photo", photo({ sharedAt: null })],
    ["a document", photo({ kind: "document" })],
    ["another customer's photo", photo({ leadId: "00000000-0000-4000-8000-000000000000" })],
    ["a missing file", null],
  ])("404s for %s, without reading the blob", async (_label, file) => {
    files.getFile.mockResolvedValue(file);
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it("404s when the blob is gone", async () => {
    files.readFile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("does nothing without a customer session", async () => {
    requireCustomer.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT");
    expect(files.getFile).not.toHaveBeenCalled();
  });
});
```

A Lost job is not in `jobs` (Task 3's `getCustomer` uses `visibleJobs`), so it is covered by the "another customer's photo" case. When no job at all is visible, it is covered by the "no session" case.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/project-view.test.tsx tests/portal/project-pages.test.tsx tests/portal/files-route.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`lib/portal/project.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";

/** How many jobs this customer's referral link has brought in. No reward status. */
export async function countReferred(jobId: string): Promise<number> {
  const [{ count }] = await db()`select count(*)::int as count from leads where referred_by = ${jobId}`;
  return Number(count);
}
```

`app/(site)/project/CopyLinkButton.tsx`:

```tsx
"use client";

import { useState } from "react";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-11 items-center self-start border border-charcoal px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
```

The button's accessible name changes to "Copied" after a click. The test asserts "Copy link" before any click.

`app/(site)/project/ProjectView.tsx`:

```tsx
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { listSharedPhotos } from "@/lib/admin/files";
import { toProject } from "@/lib/portal/access";
import { progressSteps } from "@/lib/portal/progress";
import { countReferred } from "@/lib/portal/project";
import { ensureReferralCode } from "@/lib/referrals/db";
import { referralUrl } from "@/lib/referrals/codes";
import { signOutCustomer } from "./actions";
import { CopyLinkButton } from "./CopyLinkButton";

const heading = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

/**
 * The customer's view of one job. It renders only from toProject(), which has
 * no money, notes or contact fields, so nothing private can slip onto the page.
 */
export async function ProjectView({ job }: { job: Job }) {
  const project = toProject(job);
  const [photos, code, referred] = await Promise.all([
    listSharedPhotos(project.id),
    ensureReferralCode(project.id),
    countReferred(project.id),
  ]);
  const steps = progressSteps(project.status, project.installOn);
  const place = [project.address, project.city].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-light">Hi {project.firstName}</h1>
          <p className="text-ink-soft">{place}</p>
        </div>
        <form action={signOutCustomer}>
          <button type="submit" className="min-h-11 px-3 text-sm underline underline-offset-4">Sign out</button>
        </form>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="progress-heading">
        <h2 id="progress-heading" className={heading}>Your project</h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.stage} aria-current={step.state === "current" ? "step" : undefined}
              className={`flex gap-3 border-l-2 pl-4 ${step.state === "upcoming" ? "border-rule text-ink-soft" : "border-charcoal"}`}>
              <span aria-hidden="true" className="w-4 shrink-0">{step.state === "done" ? "✓" : step.state === "current" ? "●" : "○"}</span>
              <div className="flex flex-col">
                <span className={step.state === "current" ? "font-semibold" : undefined}>{step.label}</span>
                <span className="sr-only">{step.state === "done" ? "(done)" : step.state === "current" ? "(current step)" : "(coming up)"}</span>
                {step.detail ? <span className="text-sm text-ink-soft">{step.detail}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="photos-heading">
        <h2 id="photos-heading" className={heading}>Photos</h2>
        {photos.length === 0 ? (
          <p className="text-ink-soft">Photos from your install will appear here.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id}>
                <a href={`/project/files/${photo.id}`} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                  <img src={`/project/files/${photo.id}`} alt="Photo of your project" className="aspect-square w-full max-w-full object-cover" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {code ? (
        <section className="flex flex-col gap-3" aria-labelledby="refer-heading">
          <h2 id="refer-heading" className={heading}>Refer a friend</h2>
          <p>Know someone who needs new blinds? Share your link. When they buy, you get $100.</p>
          <p className="break-all font-semibold">{referralUrl(code)}</p>
          <CopyLinkButton link={referralUrl(code)} />
          <p className="text-sm text-ink-soft">Friends referred so far: {referred}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className={heading}>Questions?</h2>
        <a href={business.phone.href} className="underline underline-offset-4">{business.phone.display}</a>
        <a href={`mailto:${business.email}`} className="underline underline-offset-4">{business.email}</a>
      </section>
    </div>
  );
}
```

`tests/business.test.ts` fails if a phone number appears in a component. This file reads it from `business`, which is allowed. Confirm by running that test.

`app/(site)/project/page.tsx`:

```tsx
import Link from "next/link";
import { requireCustomer } from "@/lib/portal/session";
import { ProjectView } from "./ProjectView";

export default async function ProjectHome() {
  const { jobs } = await requireCustomer();
  if (jobs.length === 1) return <ProjectView job={jobs[0]} />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-light">Your projects</h1>
      <ul className="flex flex-col divide-y divide-rule border border-rule">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link href={`/project/${job.id}`} className="block min-h-11 p-4 underline-offset-4 hover:underline">
              {[job.address, job.city].filter(Boolean).join(", ")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`app/(site)/project/[jobId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/portal/session";
import { ProjectView } from "../ProjectView";

/** Only a job in the customer's own visible list. Anything else looks missing. */
export default async function ProjectJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobs } = await requireCustomer();
  const { jobId } = await params;
  const job = jobs.find((j) => j.id === jobId);
  if (!job) notFound();
  return <ProjectView job={job} />;
}
```

`app/(site)/project/files/[fileId]/route.ts`:

```ts
import { getFile, readFile } from "@/lib/admin/files";
import { contentDisposition } from "@/lib/admin/uploads";
import { requireCustomer } from "@/lib/portal/session";

const NOT_FOUND = () => new Response("Not found", { status: 404 });

/** Streams a shared photo to the customer whose job it is. Every refusal looks the same. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { jobs } = await requireCustomer();
  const { fileId } = await params;

  const file = await getFile(fileId);
  if (!file || file.kind !== "photo" || !file.sharedAt || !jobs.some((job) => job.id === file.leadId)) {
    return NOT_FOUND();
  }
  const content = await readFile(file);
  if (!content) return NOT_FOUND();

  return new Response(content.stream, {
    headers: {
      "Content-Type": content.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(file.name),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/portal tests/business.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npx tsc --noEmit 2>&1 | grep -v '^.next/'` (no output) and `npx eslint "app/(site)/project" lib/portal tests/portal`.

```bash
git add lib/portal/project.ts "app/(site)/project" tests/portal/project-view.test.tsx tests/portal/project-pages.test.tsx tests/portal/files-route.test.ts
git commit -m "feat: customer project page with progress, shared photos and referral link"
```

---

### Task 6: Portal invites (automatic and by hand)

**Files:**
- Create: `lib/portal/invite.ts`
- Modify: `lib/admin/jobs.ts` (`Job`, `JOB_COLUMNS`, `toJob` only)
- Modify: `app/admin/jobs/actions.ts` (`moveStage`, new `sendPortalInviteNow`)
- Create: `app/admin/jobs/[id]/InviteSection.tsx`
- Modify: `app/admin/jobs/[id]/page.tsx`
- Test: `tests/portal/invite.test.ts`, `tests/admin/invite-actions.test.ts`, `tests/admin/invite-section.test.tsx`

**Interfaces:**
- Consumes: `issueCustomerLink`, `INVITE_MINUTES` (Task 3); `normalizeEmail` (Task 1); `isPortalStage`, `PORTAL_STAGES` (Task 1); `JOB_COLUMNS`, `toJob`, `getJob`, `setStage`.
- Produces:
  - `Job.portalInvitedAt?: Date | null`
  - `inviteEmailText(input: { firstName: string; link: string }): string`
  - `sendPortalInvite(job: Job, actor: string): Promise<void>`: throws on missing config, a missing email, or a rejected send; stamps `portal_invited_at` and logs an `email` event
  - `autoInvite(jobId: string): Promise<void>`: never throws
  - Server action `sendPortalInviteNow(id: string, prev: FormState, formData: FormData): Promise<FormState>`

- [ ] **Step 1: Write the failing tests**

`tests/portal/invite.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { business } from "@/content/business";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const issueCustomerLink = vi.fn();
vi.mock("@/lib/portal/login", () => ({ issueCustomerLink, INVITE_MINUTES: 10080 }));

const { autoInvite, inviteEmailText, sendPortalInvite } = await import("@/lib/portal/invite");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const row = {
  id: JOB, created_at: "2026-09-01T00:00:00Z", name: "Maria Lopez", phone: "7025550100",
  email: " Maria@Example.com ", address: null, city: "Henderson", treatments: [], window_count: null,
  heard_via: null, notes: null, source: "website", status: "quoted", stage_changed_at: "2026-09-02T00:00:00Z",
  visit_at: null, quote_cents: null, sold_cents: null, deposit_cents: null, brands: [], ordered_on: null,
  install_on: null, lost_reason: null, referral_code: null, referred_by: null, referral_paid_at: null,
  review_requested_at: null, review_opt_out: false, portal_invited_at: null,
};
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  sql.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  issueCustomerLink.mockReset().mockResolvedValue("https://pss.test/project/auth?token=abc");
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("inviteEmailText", () => {
  it("follows the approved wording", () => {
    const body = inviteEmailText({ firstName: "Maria", link: "https://pss.test/project/auth?token=abc" });
    expect(body).toContain("Hi Maria,");
    expect(body).toContain("You can follow your project, from quote to install, on your own page:");
    expect(body).toContain("https://pss.test/project/auth?token=abc");
    expect(body).toContain("This link works for 7 days. After that, sign in any time at premiershadesolutions.com/project with this email address.");
    expect(body).toContain(`Questions? Call us at ${business.phone.display} or just reply to this email.`);
    expect(body).not.toMatch(/\$\d/);
  });
});

describe("sendPortalInvite", () => {
  it("sends a 7-day link to the normalized email, then stamps and logs it", async () => {
    const { toJob } = await import("@/lib/admin/jobs");
    await sendPortalInvite(toJob(row), "owner@example.com");

    expect(issueCustomerLink).toHaveBeenCalledWith("maria@example.com", 10080);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("maria@example.com");
    expect(message.subject).toBe("Your Premier Shade Solutions project page");
    expect(message.replyTo).toBe(business.email);
    const record = sql.mock.calls.find((c) => text(c).includes("portal_invited_at = now()"))!;
    expect(text(record)).toContain("insert into job_events");
    expect(record).toEqual(expect.arrayContaining([JOB, "owner@example.com", "Portal invite sent to maria@example.com"]));
  });

  it("throws when Resend rejects it, without recording", async () => {
    const { toJob } = await import("@/lib/admin/jobs");
    send.mockResolvedValue({ error: { message: "down" } });
    await expect(sendPortalInvite(toJob(row), "owner@example.com")).rejects.toThrow(/Resend/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("throws for a job with no email", async () => {
    const { toJob } = await import("@/lib/admin/jobs");
    await expect(sendPortalInvite(toJob({ ...row, email: null }), "owner@example.com")).rejects.toThrow(/email/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("autoInvite", () => {
  it("claims the job before sending, and only an uninvited portal-stage job with an email", async () => {
    query.mockResolvedValue([row]);
    await autoInvite(JOB);
    const [claim, params] = query.mock.calls[0];
    expect(claim).toContain("portal_invited_at is null");
    expect(claim).toContain("nullif(trim(email), '') is not null");
    expect(claim).toContain("status = any($2::text[])");
    expect(params).toEqual([JOB, ["quoted", "sold", "ordered", "installed"]]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the claim finds nothing (already invited, no email, wrong stage)", async () => {
    await autoInvite(JOB);
    expect(send).not.toHaveBeenCalled();
  });

  it("releases the claim when the send fails, and never throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockResolvedValue([row]);
    send.mockResolvedValue({ error: { message: "down" } });
    await expect(autoInvite(JOB)).resolves.toBeUndefined();
    const release = sql.mock.calls.find((c) => text(c).includes("portal_invited_at = null"));
    expect(release).toContain(JOB);
    consoleError.mockRestore();
  });

  it("never throws even when the database is down", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockRejectedValue(new Error("db down"));
    await expect(autoInvite(JOB)).resolves.toBeUndefined();
    consoleError.mockRestore();
  });
});
```

`tests/admin/invite-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const jobs = { setStage: vi.fn(), getJob: vi.fn(), addNote: vi.fn(), createJob: vi.fn(), updateDetails: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const invite = { autoInvite: vi.fn(), sendPortalInvite: vi.fn() };
vi.mock("@/lib/portal/invite", () => invite);
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode: vi.fn(), markReferralPaid: vi.fn() }));
vi.mock("@/lib/reviews/db", () => ({
  releaseReview: vi.fn(), restoreReviewRequested: vi.fn(), setReviewOptOut: vi.fn(), stampReviewRequested: vi.fn(),
}));
vi.mock("@/lib/reviews/send", () => ({ sendReviewRequest: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCallbacks.push(cb); } }));

const { moveStage, sendPortalInviteNow } = await import("@/app/admin/jobs/actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  afterCallbacks.length = 0;
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  Object.values(jobs).forEach((fn) => fn.mockReset());
  Object.values(invite).forEach((fn) => fn.mockReset());
});

describe("moveStage invites", () => {
  it.each(["quoted", "sold", "ordered", "installed"] as const)("schedules an invite on a move to %s", async (to) => {
    jobs.setStage.mockResolvedValue(true);
    await moveStage(JOB, to);
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(invite.autoInvite).toHaveBeenCalledWith(JOB);
  });

  it.each(["new", "contacted", "visit_booked", "lost"] as const)("does not invite on a move to %s", async (to) => {
    jobs.setStage.mockResolvedValue(true);
    await moveStage(JOB, to);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("does not invite when nothing changed", async () => {
    jobs.setStage.mockResolvedValue(false);
    await moveStage(JOB, "quoted");
    expect(afterCallbacks).toHaveLength(0);
  });
});

describe("sendPortalInviteNow", () => {
  const job = (over: Record<string, unknown> = {}) => ({ id: JOB, email: "maria@example.com", status: "quoted", ...over });

  it("sends as the signed-in owner", async () => {
    jobs.getJob.mockResolvedValue(job());
    expect(await sendPortalInviteNow(JOB, {}, new FormData())).toEqual({ ok: true });
    expect(invite.sendPortalInvite).toHaveBeenCalledWith(job(), "owner@example.com");
  });

  it("refuses a job without an email", async () => {
    jobs.getJob.mockResolvedValue(job({ email: null }));
    expect((await sendPortalInviteNow(JOB, {}, new FormData())).error).toMatch(/email/);
    expect(invite.sendPortalInvite).not.toHaveBeenCalled();
  });

  it("refuses a job before Quoted, or Lost", async () => {
    for (const status of ["visit_booked", "lost"]) {
      jobs.getJob.mockResolvedValue(job({ status }));
      expect((await sendPortalInviteNow(JOB, {}, new FormData())).error).toMatch(/Quoted/);
    }
    expect(invite.sendPortalInvite).not.toHaveBeenCalled();
  });

  it("reports a failed send", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    jobs.getJob.mockResolvedValue(job());
    invite.sendPortalInvite.mockRejectedValue(new Error("down"));
    expect(await sendPortalInviteNow(JOB, {}, new FormData()))
      .toEqual({ error: "Could not send the invite. Check the settings and try again." });
    consoleError.mockRestore();
  });

  it("returns MISSING for a job that is gone", async () => {
    jobs.getJob.mockResolvedValue(null);
    expect(await sendPortalInviteNow(JOB, {}, new FormData())).toEqual({ error: "That job no longer exists." });
  });
});
```

`tests/admin/invite-section.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/admin/jobs/actions", () => ({ sendPortalInviteNow: vi.fn() }));
const { InviteSection } = await import("@/app/admin/jobs/[id]/InviteSection");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("InviteSection", () => {
  it("asks for an email when there is none", () => {
    render(<InviteSection jobId={JOB} hasEmail={false} canInvite invitedLabel={null} />);
    expect(screen.getByText("Add an email to invite this customer to their project page.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("waits for Quoted", () => {
    render(<InviteSection jobId={JOB} hasEmail canInvite={false} invitedLabel={null} />);
    expect(screen.getByText("The customer can be invited once the job is Quoted.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a first invite", () => {
    render(<InviteSection jobId={JOB} hasEmail canInvite invitedLabel={null} />);
    expect(screen.getByRole("button", { name: "Send portal invite" })).toBeInTheDocument();
  });

  it("offers a resend once invited, with when", () => {
    render(<InviteSection jobId={JOB} hasEmail canInvite invitedLabel="Sep 13, 10:00 AM" />);
    expect(screen.getByText("Invite sent Sep 13, 10:00 AM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend portal invite" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/invite.test.ts tests/admin/invite-actions.test.ts tests/admin/invite-section.test.tsx`
Expected: FAIL: modules are missing and `sendPortalInviteNow` is undefined.

- [ ] **Step 3: Add `portalInvitedAt` to `lib/admin/jobs.ts`**

Touch only these three places, because the `admin-look` branch edits `listJobs` and `createJob` in this file.

In `type Job`, after `reviewOptOut: boolean;`:

```ts
  /** When the customer was last sent a portal invite. Optional so older fixtures still type-check. */
  portalInvitedAt?: Date | null;
```

In `JOB_COLUMNS`, change the last line to:

```ts
  referral_code, referred_by, referral_paid_at, review_requested_at, review_opt_out, portal_invited_at`;
```

In `toJob`, after `reviewOptOut`:

```ts
    portalInvitedAt: row.portal_invited_at ? new Date(row.portal_invited_at as string) : null,
```

- [ ] **Step 4: Implement `lib/portal/invite.ts`**

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { db } from "@/lib/db";
import { JOB_COLUMNS, toJob, type Job } from "@/lib/admin/jobs";
import { normalizeEmail } from "./access";
import { INVITE_MINUTES, issueCustomerLink } from "./login";
import { PORTAL_STAGES } from "./progress";

const bareDomain = business.domain.replace(/^https?:\/\//, "");

/** Plain text, like the other customer emails. */
export function inviteEmailText(input: { firstName: string; link: string }): string {
  return [
    `Hi ${input.firstName},`,
    "",
    "Thanks for having us out. You can follow your project, from quote to install, on your own page:",
    "",
    input.link,
    "",
    `This link works for 7 days. After that, sign in any time at ${bareDomain}/project with this email address.`,
    "",
    `Questions? Call us at ${business.phone.display} or just reply to this email.`,
    "",
    business.name,
  ].join("\n");
}

/** Sends one invite and records it. Throws on missing config, no email, or a rejected send. */
export async function sendPortalInvite(job: Job, actor: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const email = normalizeEmail(job.email);
  if (!email) throw new Error("This job has no email address");

  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0];
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: email,
    replyTo: business.email,
    subject: `Your ${business.name} project page`,
    text: inviteEmailText({ firstName, link }),
  });
  if (error) throw new Error(`Resend rejected the portal invite: ${error.message}`);

  try {
    await db()`
      with stamped as (
        update leads set portal_invited_at = now(), updated_at = now()
        where id = ${job.id}
        returning id
      )
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'email', ${`Portal invite sent to ${email}`} from stamped`;
  } catch (recordError) {
    console.error(`Portal invite sent but not recorded for job ${job.id}`, recordError);
  }
}

/**
 * The automatic invite after a stage change. Claims the job first (only if
 * never invited, it has an email, and it is in a portal stage), so two quick
 * stage changes send one email. If the send fails the claim is released so
 * the owner's button can retry. Never throws: it runs in after().
 */
export async function autoInvite(jobId: string): Promise<void> {
  try {
    const rows = await db().query(
      `update leads set portal_invited_at = now()
       where id = $1 and portal_invited_at is null
         and nullif(trim(email), '') is not null and status = any($2::text[])
       returning ${JOB_COLUMNS}`,
      [jobId, [...PORTAL_STAGES]],
    );
    if (!rows[0]) return;

    try {
      await sendPortalInvite(toJob(rows[0]), "system");
    } catch (error) {
      console.error(`Portal invite failed for job ${jobId}`, error);
      await db()`update leads set portal_invited_at = null where id = ${jobId}`;
    }
  } catch (error) {
    console.error(`Portal invite could not run for job ${jobId}`, error);
  }
}
```

In the test, the claim's `returning` row gives `sendPortalInvite` the job. The recording statement inside `sendPortalInvite` sets `portal_invited_at = now()` again; that's harmless.

- [ ] **Step 5: Update `app/admin/jobs/actions.ts`**

Add imports:

```ts
import { after } from "next/server";
import { autoInvite, sendPortalInvite } from "@/lib/portal/invite";
import { isPortalStage } from "@/lib/portal/progress";
```

Replace `moveStage` (both the "Move to …" button and the "Set stage" picker call it):

```ts
export async function moveStage(id: string, to: Stage): Promise<void> {
  const { email } = await requireAdmin();
  const changed = await setStage(id, to, email);
  // After the consultation, the customer gets their project page. autoInvite
  // sends at most once per job and never throws.
  if (changed && isPortalStage(to)) after(() => autoInvite(id));
  refresh(id);
}
```

Append:

```ts
export async function sendPortalInviteNow(id: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const job = await getJob(id);
  if (!job) return MISSING;
  if (!job.email?.trim()) return { error: "This job has no email address." };
  if (!isPortalStage(job.status)) return { error: "Customers can be invited once the job is Quoted." };
  try {
    await sendPortalInvite(job, email);
  } catch (error) {
    console.error("Portal invite failed", error);
    return { error: "Could not send the invite. Check the settings and try again." };
  }
  refresh(id);
  return { ok: true };
}
```

- [ ] **Step 6: Create `app/admin/jobs/[id]/InviteSection.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { sendPortalInviteNow, type FormState } from "../actions";

export function InviteSection({ jobId, hasEmail, canInvite, invitedLabel }: {
  jobId: string;
  hasEmail: boolean;
  /** The job is in a portal stage (Quoted or later, not Lost). */
  canInvite: boolean;
  /** Preformatted time of the last invite, or null if never invited. */
  invitedLabel: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendPortalInviteNow.bind(null, jobId), {});

  if (!hasEmail) return <p className="text-sm text-ink-soft">Add an email to invite this customer to their project page.</p>;
  if (!canInvite) return <p className="text-sm text-ink-soft">The customer can be invited once the job is Quoted.</p>;

  return (
    <form action={action} className="flex flex-col gap-2">
      {invitedLabel ? <p className="text-sm text-ink-soft">Invite sent {invitedLabel}.</p> : null}
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Sending…" : invitedLabel ? "Resend portal invite" : "Send portal invite"}
      </Button>
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm">Invite sent.</p> : null}
    </form>
  );
}
```

- [ ] **Step 7: Render it on `app/admin/jobs/[id]/page.tsx`**

Add imports:

```tsx
import { isPortalStage } from "@/lib/portal/progress";
import { InviteSection } from "./InviteSection";
```

Insert this section directly after the "Stage" section:

```tsx
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Customer project page</h2>
        <InviteSection
          jobId={job.id}
          hasEmail={Boolean(job.email?.trim())}
          canInvite={isPortalStage(job.status)}
          invitedLabel={job.portalInvitedAt ? formatWhen(job.portalInvitedAt) : null}
        />
      </section>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/portal tests/admin tests/reviews`
Expected: PASS, including the existing job-page, board and review tests, which still build `Job` literals without `portalInvitedAt`.

- [ ] **Step 9: Typecheck, lint, commit**

Run: `npx tsc --noEmit 2>&1 | grep -v '^.next/'` (no output) and `npx eslint lib/portal lib/admin/jobs.ts app/admin/jobs tests/portal tests/admin`.

```bash
git add lib/portal/invite.ts lib/admin/jobs.ts app/admin/jobs/actions.ts "app/admin/jobs/[id]/InviteSection.tsx" "app/admin/jobs/[id]/page.tsx" tests/portal/invite.test.ts tests/admin/invite-actions.test.ts tests/admin/invite-section.test.tsx
git commit -m "feat: invite customers to their project page after the consultation"
```

---

### Task 7: End-to-end walkthrough

**Files:**
- Create: `e2e/portal.spec.ts`
- Modify: `playwright.config.ts` (mobile project's `testIgnore`)

**Interfaces:**
- Consumes: everything above; `e2e/fixtures/window.jpg` (existing); tables from migration 005 on the test branch.
- Produces: nothing.

- [ ] **Step 1: Keep the portal spec desktop-only**

In `playwright.config.ts`, change the mobile project to:

```ts
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /(admin|portal)\.spec\.ts/ },
```

and update the comment above it to say "admin.spec.ts and portal.spec.ts run serially, desktop-only".

- [ ] **Step 2: Write `e2e/portal.spec.ts`**

```ts
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run portal tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const NAME = `E2E Portal ${Date.now()}`;
const CUSTOMER = `e2e-customer-${Date.now()}@example.com`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function signInOwner(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, 'e2e-owner@example.com', now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
}

async function customerPage(browser: Browser): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${CUSTOMER}, now() + interval '15 minutes')`;
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/project/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/project$/);
  return page;
}

let jobId: string;

test.beforeAll(async () => {
  if (!url) return;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${NAME}, '7025550150', ${CUSTOMER}, 'Henderson', 'phone', 'quoted') returning id`;
  jobId = row.id as string;
});

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Portal %')`;
  await sql()`delete from leads where name like 'E2E Portal %'`;
  await sql()`delete from customer_login_tokens where email like 'e2e-customer-%'`;
  await sql()`delete from customer_sessions where email like 'e2e-customer-%'`;
  await sql()`delete from admin_login_tokens where email = 'e2e-owner@example.com'`;
  await sql()`delete from admin_sessions where email = 'e2e-owner@example.com'`;
});

test("a stranger is sent to the customer sign-in", async ({ page }) => {
  await page.goto("/project");
  await expect(page).toHaveURL(/\/project\/sign-in$/);
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
});

test("opening a customer link alone does not use it", async ({ page }) => {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${CUSTOMER}, now() + interval '15 minutes')`;
  await page.goto(`/project/auth?token=${token}`);
  await expect(page.getByRole("heading", { name: "Sign in to your project page" })).toBeVisible();
  const rows = await sql()`select used_at from customer_login_tokens where token_hash = ${hash(token)}`;
  expect(rows[0].used_at).toBeNull();
});

test("a customer sees their progress and referral link, with no money", async ({ browser }) => {
  await sql()`update leads set quote_cents = 450000 where id = ${jobId}`;
  const page = await customerPage(browser);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi E2E");
  await expect(page.locator('li[aria-current="step"]')).toContainText("Quote ready");
  await expect(page.getByText("Photos from your install will appear here.")).toBeVisible();
  await expect(page.getByText(/\/r\/[A-Z2-9]{6}$/)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("4,500");
});

test("a shared photo appears for the customer and disappears when unshared", async ({ page, browser }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run photo tests");

  await signInOwner(page);
  await page.goto(`/admin/jobs/${jobId}`);
  await page.getByLabel("Add photo").setInputFiles(path.join(__dirname, "fixtures", "window.jpg"));
  const share = page.getByRole("switch", { name: "Share with customer" });
  await expect(share).toHaveAttribute("aria-checked", "false");
  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "true");

  const customer = await customerPage(browser);
  const photo = customer.locator('img[src^="/project/files/"]');
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute("src");
  expect((await customer.request.get(src!)).status()).toBe(200);

  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "false");
  await customer.reload();
  await expect(customer.getByText("Photos from your install will appear here.")).toBeVisible();
  expect((await customer.request.get(src!)).status()).toBe(404);
});

test("a lost job locks the customer out", async ({ browser }) => {
  const page = await customerPage(browser);
  await sql()`update leads set status = 'lost' where id = ${jobId}`;
  await page.reload();
  await expect(page).toHaveURL(/\/project\/sign-in$/);
});
```

The e2e `webServer` already passes `E2E_POSTGRES_URL` as `POSTGRES_URL` and blanks `RESEND_API_KEY`, so no real email is sent. The test branch must have migration 005 applied: `MIGRATE_DATABASE_URL=<branch url> node scripts/migrate.mjs`.

- [ ] **Step 3: Verify**

Without `E2E_POSTGRES_URL` the whole file is skipped. Run `npx playwright test e2e/portal.spec.ts --list` to confirm it parses and lists 5 tests under the desktop project only. Run it against a Neon test branch only if one is available; never against production.

- [ ] **Step 4: Run the full unit suite, typecheck and lint once more**

Run: `npx vitest run --maxWorkers=2` (all pass), `npx tsc --noEmit 2>&1 | grep -v '^.next/'` (no output), `npx eslint e2e/portal.spec.ts playwright.config.ts`.

- [ ] **Step 5: Commit**

```bash
git add e2e/portal.spec.ts playwright.config.ts
git commit -m "test: end-to-end customer project page walkthrough"
```

---

## Launch (not part of any task: owner approval required)

1. Ping the `pss-eb` session before merging to `main` (agreed coordination).
2. With the owner's explicit OK: `node scripts/migrate.mjs` (applies 005 to production).
3. With the owner's explicit OK: `npx vercel --prod`.
4. Live check on an iPhone: add and share a photo on a Quoted job with the owner's own email; use "Send portal invite"; open the email, sign in, see "Quote ready" and the photo; unshare it and confirm it is gone.
