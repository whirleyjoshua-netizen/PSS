# Admin "PSS Operations" Look and Board Conveniences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the owners' admin in the Premier Shade Solutions look. That means a dark sidebar with the real logo, the brand palette, muted stage colors, stage tiles, and rounded cards. Also add board search, "+ Add job" in each column (which starts a job in that stage), and a New Job button in the header.

**Architecture:**
- **Colors:** the admin stops overriding the brand palette. New tokens (sidebar, admin ground, one color per stage, overdue) are added to the same `@theme` block, so no component uses a color literal.
- **Icons:** a small local inline-SVG icon module. No new dependency.
- **Stage styling:** each stage's icon and color classes live beside the stage list, in `lib/admin/stages.ts`.
- **Search:** a GET form that sets `?q=`. `listJobs` filters in SQL with parameters, and `q` travels through `boardHref` alongside `lost` and `job`.
- **Starting stage:** the new-job form gains a stage select, defaulted from `?stage=`.

**Tech Stack:** Next.js 16.3 App Router, React 19, Tailwind 4 (`@theme` tokens become utilities), zod 4, `@neondatabase/serverless`, Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-13-admin-pss-look-design.md`

## Global Constraints

**Colors**
- Every color is a token in `app/globals.css` `@theme`. No hex or rgb literal appears in any component.
- Tailwind classes that use stage colors must appear as full literal strings in source (for example `"border-t-stage-new"`), never built by string concatenation, so Tailwind's scanner generates them.
- New tokens, exactly:

  | Token | Value |
  |---|---|
  | `--color-sidebar` | `#1E1E1E` |
  | `--color-sidebar-ink` | `#F7F5F0` |
  | `--color-sidebar-muted` | `#B3AAA0` |
  | `--color-admin-ground` | `#F3F0EA` |
  | `--color-stage-new` | `#C98A2E` |
  | `--color-stage-contacted` | `#6F8F72` |
  | `--color-stage-visit` | `#5B8DB8` |
  | `--color-stage-quoted` | `#8A6A9E` |
  | `--color-stage-sold` | `#5E9A5A` |
  | `--color-stage-ordered` | `#B07D4F` |
  | `--color-stage-installed` | `#1E1E1E` |
  | `--color-overdue` | `#B3261E` |

- Stage colors are used only on non-text elements: column top edges, dots and icon tints. Every column also carries its text label. `--color-overdue` may be used as text (about 6.5:1 on white).

**Icons**
- Icons are decorative (`aria-hidden="true"`, `focusable="false"`). Every control keeps a text label, and existing accessible names do not change.

**Sidebar**
- It lists only Jobs, New job and Settings, with the real logo (`components/brand/Logo.tsx`, `tone="dark"`).

**Board and URLs**
- The board URL carries `lost`, `q` and `job` in that order. Card links, tile links, the lost toggle, the panel Close link and the search form all keep the parameters they don't change.
- Search matching:
  - Case-insensitive substring on name, email, city and address.
  - Phone matches on the digits of `q` against the stored digits.
  - `q` is trimmed and capped at 100 characters; blank means no filter.
  - The match runs as parameterized SQL, and `%`, `_` and `\` in `q` are escaped.
- "+ Add job" (or "+ Add lead" in New lead) links to `/admin/jobs/new?stage=<value>`. Lost has no add link.

**New-job form**
- It accepts `stage`: one of the seven working stages `new, contacted, visit_booked, quoted, sold, ordered, installed`, defaulting to `new`. An invalid value fails validation with "Pick a stage".
- The page heading is "New job" without `?stage`, and "New job · <Stage label>" with a valid one.

**Scope**
- No drag-and-drop, no panel tabs, no card "…" menu, and no database schema change.
- Admin pages keep calling `requireAdmin()` first.

**Local verification on this machine**
- Tests: `npx vitest run --maxWorkers=2`.
- Types: `npx tsc --noEmit`. Run `npx next typegen` first in a fresh worktree.
- Lint: `npx eslint`. The baseline is 1 pre-existing error in `components/forms/ConsultationForm.tsx`, and no new errors are allowed.
- `npx next build` takes about 35 seconds in a fresh worktree and may be used.
- Browser e2e runs only against a production build (`next start --hostname 127.0.0.1 --port 3100`) and a Neon test branch. Never use `next dev` for e2e.

**Shared repo**
- Another session (pss-5d) is building client photo sharing and may touch `JobPanel.tsx`, `app/admin/jobs/[id]/page.tsx` and `lib/admin/jobs.ts`. `git add` only the files each task names, never `git add -A`.

**Next.js docs**
- Read the relevant guide in `node_modules/next/dist/docs/` before using a Next.js API you haven't used in this repo (AGENTS.md).

## File Structure

| File | Responsibility |
|---|---|
| `app/globals.css` (modify) | The new tokens, and a slimmed `.admin-theme` (system-sans type, admin ground) |
| `components/admin/icons.tsx` (new) | `Icon` component with a fixed set of named inline SVGs |
| `lib/admin/stages.ts` (modify) | `WORKING_STAGES`, `parseWorkingStage`, and `STAGE_STYLE` (icon plus literal color classes per stage) |
| `lib/admin/time.ts` (modify) | `formatDay`: "Sat, Sep 13, 2026" in Las Vegas time |
| `lib/admin/links.ts` (modify) | `boardHref` gains `q` |
| `lib/admin/jobs.ts` (modify) | `listJobs({ includeLost, search })`; `createJob` stores `input.stage` |
| `lib/admin/schema.ts` (modify) | `newJobSchema.stage` |
| `app/admin/AdminNav.tsx` (modify) | Dark sidebar, logo, icons, initials badge |
| `app/admin/page.tsx` (modify) | Header (eyebrow, date, search, New Job, lost toggle), match line, tiles, styled columns with add links, `q` plumbing |
| `app/admin/JobCard.tsx` (modify) | Rounded white card, pin and clock icons, red Overdue |
| `app/admin/JobPanel.tsx` (modify) | Rounded panel surface and spacing; styling only |
| `app/admin/jobs/[id]/StageControls.tsx` (modify) | Full-width "Move to …" button with an icon |
| `app/admin/jobs/new/page.tsx`, `NewJobForm.tsx` (modify) | `?stage` default, stage select, heading |
| `app/admin/jobs/actions.ts` (modify) | `addJob` echoes `stage` back on a failed submit |
| `e2e/admin.spec.ts` (modify) | Search and add-from-column journey; make the existing "New job" link lookup exact |

---

### Task 1: Palette tokens, icons, and stage styles

**Files:**
- Modify: `app/globals.css`, `lib/admin/stages.ts`
- Create: `components/admin/icons.tsx`
- Test: `tests/admin/stages.test.ts` (extend), `tests/admin/icons.test.tsx` (new)

**Interfaces:**
- Produces:
  - `WORKING_STAGES: readonly ["new", "contacted", "visit_booked", "quoted", "sold", "ordered", "installed"]`
  - `type WorkingStage`
  - `parseWorkingStage(value: string | null | undefined): WorkingStage | null`
  - `STAGE_STYLE: Record<Stage, { icon: IconName; edge: string; dot: string; tint: string }>`
  - `type IconName`
  - `Icon({ name, className }: { name: IconName; className?: string })`

- [ ] **Step 1: Write the failing tests**

Append to `tests/admin/stages.test.ts`:

```ts
import { ALL_STAGES, STAGES, STAGE_STYLE, WORKING_STAGES, parseWorkingStage } from "@/lib/admin/stages";

describe("working stages and styles", () => {
  it("lists the seven working stages in board order", () => {
    expect([...WORKING_STAGES]).toEqual(STAGES.map((s) => s.value));
  });

  it("parses only working stages", () => {
    expect(parseWorkingStage("quoted")).toBe("quoted");
    expect(parseWorkingStage("lost")).toBeNull();
    expect(parseWorkingStage("nope")).toBeNull();
    expect(parseWorkingStage(undefined)).toBeNull();
  });

  it("gives every stage an icon and literal color classes", () => {
    for (const stage of ALL_STAGES) {
      const style = STAGE_STYLE[stage];
      expect(style.icon).toBeTruthy();
      expect(style.edge).toMatch(/^border-t-/);
      expect(style.dot).toMatch(/^bg-/);
      expect(style.tint).toMatch(/^text-/);
    }
    expect(STAGE_STYLE.quoted.edge).toBe("border-t-stage-quoted");
  });
});
```

(If the existing file already imports from `@/lib/admin/stages`, merge the import lists instead of adding a second import.)

`tests/admin/icons.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Icon, ICON_NAMES } from "@/components/admin/icons";

describe("Icon", () => {
  it("renders every icon as decorative SVG", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} className="size-4" />);
      const svg = container.querySelector("svg")!;
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
      expect(svg.getAttribute("class")).toContain("size-4");
      unmount();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/stages.test.ts tests/admin/icons.test.tsx --maxWorkers=2`
Expected: FAIL, because `WORKING_STAGES` and the icons module don't exist.

- [ ] **Step 3: Implement**

`app/globals.css`:

1. Inside the `@theme { … }` block, after `--font-body`, add:

```css
  /* Owner admin — see docs/superpowers/specs/2026-09-13-admin-pss-look-design.md §4.
     Stage colors are for edges, dots and icon tints only, never text (most are
     under 4.5:1 on white). --color-overdue is 6.5:1 on white and may be text. */
  --color-sidebar: #1E1E1E;
  --color-sidebar-ink: #F7F5F0;
  --color-sidebar-muted: #B3AAA0;
  --color-admin-ground: #F3F0EA;
  --color-stage-new: #C98A2E;
  --color-stage-contacted: #6F8F72;
  --color-stage-visit: #5B8DB8;
  --color-stage-quoted: #8A6A9E;
  --color-stage-sold: #5E9A5A;
  --color-stage-ordered: #B07D4F;
  --color-stage-installed: #1E1E1E;
  --color-overdue: #B3261E;
```

2. Replace the whole `.admin-theme { … }` rule, along with the comment above it, with:

```css
/*
 * The owner-only admin uses the brand palette (tokens above) with a system
 * sans-serif for dense working screens and a slightly warmer ground.
 */
.admin-theme {
  --font-display: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --font-body: var(--font-display);

  background: var(--color-admin-ground);
  color: var(--color-charcoal);
  font-family: var(--font-body);
}
```

`lib/admin/stages.ts`: append:

```ts
import type { IconName } from "@/components/admin/icons";

export const WORKING_STAGES = ["new", "contacted", "visit_booked", "quoted", "sold", "ordered", "installed"] as const;
export type WorkingStage = (typeof WORKING_STAGES)[number];

export const parseWorkingStage = (value: string | null | undefined): WorkingStage | null =>
  (WORKING_STAGES as readonly string[]).includes(value ?? "") ? (value as WorkingStage) : null;

/**
 * Each stage's icon and color classes. The class names are complete literals so
 * Tailwind generates them; never build them by concatenation.
 */
export const STAGE_STYLE: Record<Stage, { icon: IconName; edge: string; dot: string; tint: string }> = {
  new: { icon: "lead", edge: "border-t-stage-new", dot: "bg-stage-new", tint: "text-stage-new" },
  contacted: { icon: "phone", edge: "border-t-stage-contacted", dot: "bg-stage-contacted", tint: "text-stage-contacted" },
  visit_booked: { icon: "calendar", edge: "border-t-stage-visit", dot: "bg-stage-visit", tint: "text-stage-visit" },
  quoted: { icon: "document", edge: "border-t-stage-quoted", dot: "bg-stage-quoted", tint: "text-stage-quoted" },
  sold: { icon: "cart", edge: "border-t-stage-sold", dot: "bg-stage-sold", tint: "text-stage-sold" },
  ordered: { icon: "box", edge: "border-t-stage-ordered", dot: "bg-stage-ordered", tint: "text-stage-ordered" },
  installed: { icon: "wrench", edge: "border-t-stage-installed", dot: "bg-stage-installed", tint: "text-stage-installed" },
  lost: { icon: "lost", edge: "border-t-taupe", dot: "bg-taupe", tint: "text-taupe" },
};
```

Put the `import type` line at the top of the file with any other imports. It is type-only, so `stages.ts` stays free of runtime imports.

`components/admin/icons.tsx`:

```tsx
/** Small stroke icons for the admin. Decorative only: every control keeps a text label. */
const PATHS = {
  jobs: "M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16",
  plus: "M12 5v14M5 12h14",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .3-1.3-1.3.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L6 7.3 4 7l-1 3 2 1v2l-2 1 1 3 2-.3 1.3 1.3-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .3 1-3-2-1z",
  signout: "M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 16l4-4-4-4M14 12H4",
  search: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4.5-4.5",
  pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  chevron: "M9 6l6 6-6 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  lead: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M17 13a6 6 0 0 1 4 6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  calendar: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
  document: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  cart: "M4 5h2l2 10h10l2-7H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  box: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  wrench: "M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z",
  lost: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9 9l6 6M15 9l-6 6",
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-4"}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin/stages.test.ts tests/admin/icons.test.tsx --maxWorkers=2`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css lib/admin/stages.ts components/admin/icons.tsx tests/admin/stages.test.ts tests/admin/icons.test.tsx
git commit -m "feat: admin palette tokens, icon set, and per-stage styles"
```

---

### Task 2: The dark sidebar with the PSS logo

**Files:**
- Modify: `app/admin/AdminNav.tsx`
- Test: `tests/admin/admin-nav.test.tsx` (extend)

**Interfaces:**
- Consumes: `Icon` (Task 1), `Logo` (`components/brand/Logo.tsx`)
- Produces: `initialsFor(email: string): string`, exported from `app/admin/AdminNav.tsx`

- [ ] **Step 1: Add the failing tests**

Append to `tests/admin/admin-nav.test.tsx`, and add `initialsFor` to the existing `await import`:

```tsx
describe("sidebar look", () => {
  it("shows the Premier Shade Solutions logo and an initials badge", () => {
    pathname.mockReturnValue("/admin");
    render(<AdminNav email="joshua.whirley@example.com" />);
    expect(screen.getAllByRole("img", { name: "Premier Shade Solutions" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("JW").length).toBeGreaterThan(0);
  });

  it("makes initials from the email's local part", () => {
    expect(initialsFor("joshua.whirley@example.com")).toBe("JW");
    expect(initialsFor("owner@example.com")).toBe("OW");
    expect(initialsFor("a@example.com")).toBe("A");
  });
});
```

Change the import line to:

```tsx
const { AdminNav, initialsFor } = await import("@/app/admin/AdminNav");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/admin-nav.test.tsx --maxWorkers=2`
Expected: FAIL, because `initialsFor` doesn't exist and there's no logo.

- [ ] **Step 3: Implement**

Replace `app/admin/AdminNav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Icon, type IconName } from "@/components/admin/icons";
import { signOut } from "./actions";

const LINKS: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Jobs", icon: "jobs" },
  { href: "/admin/jobs/new", label: "New job", icon: "plus" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

/** A job page belongs under Jobs; the new-job form has its own entry. */
function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin" || (pathname.startsWith("/admin/jobs/") && pathname !== "/admin/jobs/new");
  }
  return pathname === href;
}

/** "joshua.whirley@…" → "JW"; "owner@…" → "OW". */
export function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase();
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map(({ href, label, icon }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 text-sm transition-colors focus-visible:outline-champagne ${
                active
                  ? "border-champagne bg-champagne/15 font-semibold text-sidebar-ink"
                  : "border-transparent text-sidebar-muted hover:bg-sidebar-ink/5 hover:text-sidebar-ink"
              }`}
            >
              <Icon name={icon} className="size-5" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Account({ email }: { email: string }) {
  return (
    <form action={signOut} className="flex items-center gap-3 border-t border-sidebar-ink/10 px-3 pt-4">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-champagne text-sm font-semibold text-charcoal">
        {initialsFor(email)}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-xs text-sidebar-muted" title={email}>{email}</span>
        <button type="submit" className="flex items-center gap-1 self-start text-sm text-sidebar-ink underline underline-offset-4 focus-visible:outline-champagne">
          Sign out <Icon name="signout" className="size-4" />
        </button>
      </span>
    </form>
  );
}

function Brand() {
  return (
    <div className="flex flex-col gap-1 px-3">
      <Logo tone="dark" className="text-[1.15rem]" />
      <span className="pl-[2.6rem] text-[0.6rem] tracking-[0.32em] text-sidebar-muted">OPERATIONS</span>
    </div>
  );
}

/** Dark left column on desktop; a dark header with a Menu on phones. */
export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-sidebar px-3 py-6 text-sidebar-ink md:flex">
        <div className="flex flex-col gap-8">
          <Brand />
          <nav aria-label="Admin">
            <NavLinks pathname={pathname} />
          </nav>
        </div>
        <Account email={email} />
      </aside>

      <details className="bg-sidebar text-sidebar-ink md:hidden">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between px-4">
          <Logo tone="dark" className="text-[0.95rem]" />
          <span className="text-sm text-sidebar-muted">Menu</span>
        </summary>
        <div className="flex flex-col gap-4 px-2 pb-4">
          <nav aria-label="Admin">
            <NavLinks pathname={pathname} />
          </nav>
          <Account email={email} />
        </div>
      </details>
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin/admin-nav.test.tsx --maxWorkers=2`
Expected: PASS. The existing tests still find the "Jobs", "New job" and "Settings" link names, because icons are `aria-hidden`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/AdminNav.tsx tests/admin/admin-nav.test.tsx
git commit -m "feat: dark admin sidebar with the PSS logo, icons, and initials"
```

---

### Task 3: Search data, board links, and the day label

**Files:**
- Modify: `lib/admin/jobs.ts`, `lib/admin/links.ts`, `lib/admin/time.ts`
- Test: `tests/admin/jobs.test.ts`, `tests/admin/links.test.ts`, `tests/admin/helpers.test.ts` (or a new `tests/admin/time.test.ts` if helpers doesn't cover time)

**Interfaces:**
- Produces:
  - `listJobs({ includeLost, search }: { includeLost: boolean; search?: string }): Promise<Job[]>`
  - `boardHref({ lost, job, q }: { lost: boolean; job?: string | null; q?: string | null }): string`
  - `formatDay(date: Date): string`

- [ ] **Step 1: Write the failing tests**

Append to `tests/admin/jobs.test.ts`:

```ts
describe("searching jobs", () => {
  it("keeps the plain query when there is no search", async () => {
    await jobs.listJobs({ includeLost: false, search: "   " });
    expect(sql.query.mock.calls[0][1]).toEqual([false]);
  });

  it("matches name, email, city and address, and phone by digits, with parameters", async () => {
    await jobs.listJobs({ includeLost: true, search: " Reyes 702 " });
    const [statement, params] = sql.query.mock.calls[0];
    expect(statement).toContain("name ilike $2");
    expect(statement).toContain("email ilike $2");
    expect(statement).toContain("city ilike $2");
    expect(statement).toContain("address ilike $2");
    expect(statement).toContain("phone like");
    expect(params).toEqual([true, "%Reyes 702%", "702"]);
  });

  it("escapes LIKE wildcards and caps the length", async () => {
    await jobs.listJobs({ includeLost: false, search: `50%_off\\${"x".repeat(200)}` });
    const [, params] = sql.query.mock.calls[0];
    expect(params[1]).toMatch(/^%50\\%\\_off\\\\x+%$/);
    expect((params[1] as string).length).toBeLessThanOrEqual(100 + 2 + 3);
  });
});
```

Append to `tests/admin/links.test.ts`:

```ts
describe("boardHref with search", () => {
  it("carries q between lost and job", () => {
    expect(boardHref({ lost: true, q: "reyes smith", job: "abc" })).toBe("/admin?lost=1&q=reyes%20smith&job=abc");
    expect(boardHref({ lost: false, q: "" })).toBe("/admin");
    expect(boardHref({ lost: false, q: null, job: "abc" })).toBe("/admin?job=abc");
  });
});
```

Add a time test, in the existing helpers file if it covers `lib/admin/time`, otherwise in a new `tests/admin/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatDay } from "@/lib/admin/time";

describe("formatDay", () => {
  it("names the Las Vegas day, not the UTC one", () => {
    // 03:00 UTC Sep 14 is still Sep 13 in Las Vegas.
    expect(formatDay(new Date("2026-09-14T03:00:00Z"))).toBe("Sun, Sep 13, 2026");
  });
});
```

(Sep 13, 2026 is a Sunday. The test asserts the exact string `Intl` produces for `en-US` with `weekday: "short", month: "short", day: "numeric", year: "numeric"`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/jobs.test.ts tests/admin/links.test.ts tests/admin/time.test.ts --maxWorkers=2`
Expected: FAIL. There's no search, no `q`, and no `formatDay` yet.

- [ ] **Step 3: Implement**

`lib/admin/jobs.ts`: replace `listJobs` with:

```ts
const SEARCH_MAX = 100;

/** `%`, `_` and `\` are LIKE wildcards; escape them so a search is literal. */
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listJobs({ includeLost, search }: { includeLost: boolean; search?: string }): Promise<Job[]> {
  const term = (search ?? "").trim().slice(0, SEARCH_MAX);
  if (!term) {
    const rows = await db().query(
      `select ${JOB_COLUMNS} from leads where ($1 or status <> 'lost') order by stage_changed_at desc`,
      [includeLost],
    );
    return rows.map(toJob);
  }
  const digits = term.replace(/\D/g, "");
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where ($1 or status <> 'lost')
       and (name ilike $2 or email ilike $2 or city ilike $2 or address ilike $2
            or ($3 <> '' and phone like '%' || $3 || '%'))
     order by stage_changed_at desc`,
    [includeLost, likePattern(term), digits],
  );
  return rows.map(toJob);
}
```

`lib/admin/links.ts`: replace `boardHref` with:

```ts
/** The board URL: keeps the lost toggle and search, and optionally opens a job's panel. */
export function boardHref({ lost, job, q }: { lost: boolean; job?: string | null; q?: string | null }): string {
  const params = new URLSearchParams();
  if (lost) params.set("lost", "1");
  if (q && q.trim()) params.set("q", q.trim());
  if (job) params.set("job", job);
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `/admin?${query}` : "/admin";
}
```

`lib/admin/time.ts`: append:

```ts
/** "Sun, Sep 13, 2026" in Las Vegas time, for the board header. */
export const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", year: "numeric" });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin --maxWorkers=2`
Expected: PASS. The existing `listJobs` test ("hides lost jobs unless asked") still gets `[false]` and `[true]`, since it passes no search.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/jobs.ts lib/admin/links.ts lib/admin/time.ts tests/admin/jobs.test.ts tests/admin/links.test.ts tests/admin/time.test.ts
git commit -m "feat: job search by name, email, city, address, and phone digits"
```

(Use `tests/admin/helpers.test.ts` in the `git add` instead of `time.test.ts` if that's where the time test went.)

---

### Task 4: Starting a new job in a chosen stage

**Files:**
- Modify: `lib/admin/schema.ts`, `lib/admin/jobs.ts` (`createJob`), `app/admin/jobs/actions.ts` (`addJob`), `app/admin/jobs/new/NewJobForm.tsx`, `app/admin/jobs/new/page.tsx`
- Test: `tests/admin/schema.test.ts`, `tests/admin/jobs.test.ts`, `tests/admin/new-job-form.test.tsx`, `tests/admin/actions.test.ts`

**Interfaces:**
- Consumes: `WORKING_STAGES`, `parseWorkingStage`, `stageLabel` (Task 1 and existing)
- Produces:
  - `NewJobInput.stage: WorkingStage`
  - `NewJobForm({ defaultStage }: { defaultStage?: WorkingStage })`

- [ ] **Step 1: Write the failing tests**

Append to `tests/admin/schema.test.ts`:

```ts
describe("new job stage", () => {
  const base = { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone" };
  it("defaults to a new lead", () => {
    expect(newJobSchema.parse(base).stage).toBe("new");
    expect(newJobSchema.parse({ ...base, stage: "" }).stage).toBe("new");
  });
  it("accepts any working stage", () => {
    expect(newJobSchema.parse({ ...base, stage: "quoted" }).stage).toBe("quoted");
  });
  it("rejects lost and unknown stages", () => {
    const lost = newJobSchema.safeParse({ ...base, stage: "lost" });
    expect(lost.success).toBe(false);
    expect(lost.error?.issues[0].message).toBe("Pick a stage");
    expect(newJobSchema.safeParse({ ...base, stage: "shipped" }).success).toBe(false);
  });
});
```

(Import `newJobSchema` at the top if the file doesn't already.)

In `tests/admin/jobs.test.ts`, change the existing "creates a hand-entered job" test's input to include `stage: "new"`, and add:

```ts
  it("creates a hand-entered job in the chosen stage and logs it", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "quoted" },
      "owner@example.com",
    );
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("status");
    expect(sql.mock.calls[0].filter((v: unknown) => v === "quoted")).toHaveLength(2);
  });
```

Append to `tests/admin/new-job-form.test.tsx`:

```tsx
  it("offers a stage picker, pre-set from the column the owner came from", () => {
    render(<NewJobForm defaultStage="quoted" />);
    expect(screen.getByLabelText("Stage")).toHaveValue("quoted");
  });

  it("defaults the stage to a new lead", () => {
    render(<NewJobForm />);
    expect(screen.getByLabelText("Stage")).toHaveValue("new");
  });
```

In `tests/admin/actions.test.ts`, add a case to the `with a session` block:

```ts
  it("adds a job in the chosen stage", async () => {
    jobs.createJob.mockResolvedValue(ID);
    await expect(
      actions.addJob({}, form({ name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "sold" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(jobs.createJob).toHaveBeenCalledWith(expect.objectContaining({ stage: "sold" }), "owner@example.com");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/schema.test.ts tests/admin/jobs.test.ts tests/admin/new-job-form.test.tsx tests/admin/actions.test.ts --maxWorkers=2`
Expected: FAIL. `stage` isn't in the schema, createJob, or the form yet.

- [ ] **Step 3: Implement**

`lib/admin/schema.ts`:
- Import `WORKING_STAGES` from `./stages`.
- Add this to `newJobSchema` after `source`:

```ts
  stage: z.preprocess(
    (value) => (value === undefined || value === "" ? "new" : value),
    z.enum(WORKING_STAGES, { error: "Pick a stage" }),
  ),
```

`lib/admin/jobs.ts`: in `createJob`:
- Add `status` to the insert.
- Use `input.stage` for both the stored status and the logged `to_status`:

```ts
export async function createJob(input: NewJobInput, actor: string): Promise<string> {
  const rows = await db()`
    with created as (
      insert into leads (name, phone, email, city, address, notes, source, status)
      values (${input.name}, ${input.phone}, ${input.email ?? null}, ${input.city},
              ${input.address ?? null}, ${input.notes ?? null}, ${input.source}, ${input.stage})
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, to_status, body)
      select id, ${actor}, 'stage', ${input.stage}, 'Added by hand' from created
    )
    select id from created`;
  return rows[0].id as string;
}
```

`app/admin/jobs/actions.ts`: in `addJob`, add `"stage"` to the `captureValues` key list.

`app/admin/jobs/new/NewJobForm.tsx`:
- Import `STAGES` and `type WorkingStage` from `@/lib/admin/stages`.
- Change the signature to `export function NewJobForm({ defaultStage = "new" }: { defaultStage?: WorkingStage })`.
- Add this after the source select:

```tsx
      <label htmlFor="job-stage" className="flex flex-col gap-2 text-sm">
        Stage
        <select
          id="job-stage"
          name="stage"
          defaultValue={field(values, "stage", defaultStage)}
          className="min-h-11 rounded-md border border-rule bg-ivory px-3"
        >
          {STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
      </label>
```

`app/admin/jobs/new/page.tsx`: replace with:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { parseWorkingStage, stageLabel } from "@/lib/admin/stages";
import { NewJobForm } from "./NewJobForm";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string | string[] }>;
}) {
  await requireAdmin();
  const raw = (await searchParams).stage;
  const stage = parseWorkingStage(Array.isArray(raw) ? raw[0] : raw);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href="/admin" className="text-sm underline underline-offset-4">← All jobs</Link>
      <h1 className="font-display text-2xl font-light">{stage ? `New job · ${stageLabel(stage)}` : "New job"}</h1>
      <NewJobForm defaultStage={stage ?? "new"} />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin --maxWorkers=2`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors. Every `createJob` call site must now pass `stage`; the schema always supplies it.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/schema.ts lib/admin/jobs.ts app/admin/jobs/actions.ts app/admin/jobs/new/NewJobForm.tsx app/admin/jobs/new/page.tsx tests/admin/schema.test.ts tests/admin/jobs.test.ts tests/admin/new-job-form.test.tsx tests/admin/actions.test.ts
git commit -m "feat: start a hand-entered job in any working stage"
```

---

### Task 5: The board — header, search, tiles, columns, and cards

**Files:**
- Modify: `app/admin/page.tsx`, `app/admin/JobCard.tsx`
- Test: `tests/admin/board-page.test.tsx`, `tests/admin/board.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `STAGE_STYLE`, `Icon`
  - From Task 3: `listJobs({ includeLost, search })`, `boardHref({ lost, job, q })`, `formatDay`
  - Existing: `groupByStage`, `JobPanel`
- Produces: the new board markup. `JobCard` props are unchanged: `{ job, now, href, selected? }`.

- [ ] **Step 1: Write the failing tests**

In `tests/admin/board-page.test.tsx`:
- Change the `open` helper's parameter type to `{ lost?: string; job?: string; q?: string }`.
- Add:

```tsx
describe("board look and conveniences", () => {
  it("shows a tile per working stage linking to its column", async () => {
    await open({});
    const tiles = screen.getByRole("navigation", { name: "Stages" });
    const links = within(tiles).getAllByRole("link");
    expect(links).toHaveLength(7);
    expect(links[3]).toHaveAttribute("href", "/admin#stage-quoted");
    expect(links[3]).toHaveTextContent("Quoted");
  });

  it("has an add link in every working column, and none for lost", async () => {
    await open({ lost: "1" });
    expect(screen.getByRole("link", { name: "+ Add lead" })).toHaveAttribute("href", "/admin/jobs/new?stage=new");
    expect(screen.getAllByRole("link", { name: "+ Add job" })).toHaveLength(6);
    const lost = screen.getByRole("region", { name: /lost/i });
    expect(within(lost).queryByRole("link", { name: /add/i })).toBeNull();
  });

  it("has a New Job button and a search box that keeps the lost toggle and open panel", async () => {
    await open({ lost: "1", job: ID });
    expect(screen.getByRole("link", { name: "New Job" })).toHaveAttribute("href", "/admin/jobs/new");
    const search = screen.getByRole("search");
    expect(within(search).getByRole("searchbox", { name: "Search jobs" })).toBeInTheDocument();
    expect(search.querySelector('input[name="lost"]')).toHaveValue("1");
    expect(search.querySelector('input[name="job"]')).toHaveValue(ID);
  });

  it("filters by ?q, keeps q in links, and offers to clear the search", async () => {
    await open({ q: "reyes", job: ID });
    expect(jobs.listJobs).toHaveBeenCalledWith({ includeLost: false, search: "reyes" });
    expect(screen.getByText(/1 job matches "reyes"/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", `/admin?job=${ID}`);
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin?q=reyes");
    expect(screen.getByRole("link", { name: /dana reyes/i, current: true })).toHaveAttribute("href", `/admin?q=reyes&job=${ID}`);
  });

  it("says when nothing matches", async () => {
    jobs.listJobs.mockResolvedValue([]);
    await open({ q: "zzz" });
    expect(screen.getByText(/no jobs match "zzz"/i)).toBeInTheDocument();
  });
});
```

Add `within` to the `@testing-library/react` import.

In `tests/admin/board.test.tsx`, add:

```tsx
  it("shows the city with a pin and the days with a clock, both decorative", () => {
    const { container } = render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/board-page.test.tsx tests/admin/board.test.tsx --maxWorkers=2`
Expected: FAIL. There are no tiles, add links, search, or icons yet.

- [ ] **Step 3: Implement the card**

Replace the `JobCard` function in `app/admin/JobCard.tsx`. Keep `groupByStage` as is. Add the import `import { Icon } from "@/components/admin/icons";`.

```tsx
export function JobCard({ job, now, href, selected = false }: {
  job: Job;
  now: Date;
  href: string;
  selected?: boolean;
}) {
  const days = daysInStage(job.stageChangedAt, now);
  const overdue = isOverdue(job, now);
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`flex flex-col gap-1.5 rounded-lg border bg-ivory p-3 text-sm shadow-sm transition-shadow hover:shadow-md ${
        overdue ? "border-overdue/50" : "border-rule"
      } ${selected ? "outline outline-2 outline-offset-2 outline-champagne" : ""}`}
    >
      <span className="text-base font-semibold text-charcoal">{job.name}</span>
      {job.referredBy ? (
        <span className="w-fit rounded border border-champagne-ink px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
          Referral
        </span>
      ) : null}
      <span className="flex items-center gap-1.5 text-ink-soft">
        <Icon name="pin" className="size-4 shrink-0" />
        {job.city}
      </span>
      {job.treatments.length ? <span className="text-ink-soft">{job.treatments.join(", ")}</span> : null}
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-ink-soft">
        <Icon name="clock" className="size-4 shrink-0" />
        {days === 1 ? "1 day" : `${days} days`} in stage
        {overdue ? <strong className="font-semibold uppercase text-overdue">· Overdue</strong> : null}
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Implement the page**

Replace `app/admin/page.tsx` with:

```tsx
import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import { listFiles } from "@/lib/admin/files";
import { getJob, listJobs } from "@/lib/admin/jobs";
import { boardHref } from "@/lib/admin/links";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { STAGE_STYLE } from "@/lib/admin/stages";
import { formatDay } from "@/lib/admin/time";
import { JobCard, groupByStage } from "./JobCard";
import { JobPanel } from "./JobPanel";

/** The panel's data, loaded only when a job is open. A missing job still gets a panel that says so. */
async function loadPanel(id: string) {
  const job = await getJob(id);
  if (!job) return { job: null, measurements: [], files: [] };
  const [measurements, files] = await Promise.all([listMeasurements(id), listFiles(id)]);
  return { job, measurements, files };
}

/** `?job=a&job=b` arrives as an array; treat it as the first value. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string | string[]; job?: string | string[]; q?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const includeLost = first(params.lost) === "1";
  const openId = first(params.job);
  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const [jobs, panel] = await Promise.all([
    listJobs({ includeLost, search: q }),
    openId ? loadPanel(openId) : Promise.resolve(null),
  ]);
  const groups = groupByStage(jobs, includeLost);
  const working = groups.filter((group) => group.stage !== "lost");
  const now = new Date();
  const here = { lost: includeLost, q };

  return (
    <div className="mx-auto flex max-w-[110rem] items-start gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-soft">PSS Operations</p>
            <h1 className="text-3xl font-semibold text-charcoal">Jobs</h1>
            <p className="text-sm text-ink-soft">Track every project from lead to installation.</p>
          </div>
          <p className="flex flex-col items-end text-sm text-charcoal">
            <span>{formatDay(now)}</span>
            <span className="text-ink-soft">Las Vegas, NV</span>
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <form role="search" action="/admin" className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-lg border border-rule bg-ivory px-3 shadow-sm">
            <Icon name="search" className="size-4 text-ink-soft" />
            <label htmlFor="board-search" className="sr-only">Search jobs</label>
            <input
              id="board-search"
              type="search"
              name="q"
              defaultValue={q}
              maxLength={100}
              placeholder="Search jobs, customers, or addresses…"
              className="min-h-11 flex-1 bg-transparent text-sm outline-none"
            />
            {includeLost ? <input type="hidden" name="lost" value="1" /> : null}
            {openId ? <input type="hidden" name="job" value={openId} /> : null}
            <button type="submit" className="sr-only">Search</button>
          </form>
          <Link href={boardHref({ lost: !includeLost, q, job: openId })} className="text-sm underline underline-offset-4">
            {includeLost ? "Hide lost" : "Show lost"}
          </Link>
          <Link href="/admin/jobs/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charcoal px-4 text-sm font-medium text-ivory">
            <Icon name="plus" className="size-4" />
            New Job
          </Link>
        </div>

        {q ? (
          <p className="text-sm text-ink-soft">
            {jobs.length === 0 ? `No jobs match "${q}"` : `${jobs.length} ${jobs.length === 1 ? "job matches" : "jobs match"} "${q}"`}
            {" · "}
            <Link href={boardHref({ lost: includeLost, job: openId })} className="underline underline-offset-4">Clear search</Link>
          </p>
        ) : null}

        <nav aria-label="Stages">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {working.map((group) => {
              const style = STAGE_STYLE[group.stage];
              return (
                <li key={group.stage}>
                  <Link
                    href={`${boardHref({ ...here, job: openId })}#stage-${group.stage}`}
                    className="flex items-center gap-3 rounded-xl border border-rule bg-ivory p-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <Icon name={style.icon} className={`size-6 shrink-0 ${style.tint}`} />
                    <span className="flex flex-1 flex-col">
                      <span className="text-xl font-semibold tabular-nums text-charcoal">{group.jobs.length}</span>
                      <span className="text-xs text-ink-soft">{group.label}</span>
                    </span>
                    <Icon name="chevron" className="size-4 text-ink-soft" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Stacked on phones; one scrolling row of columns from md up. */}
        <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-4">
          {groups.map((group) => {
            const style = STAGE_STYLE[group.stage];
            return (
              <section
                key={group.stage}
                aria-labelledby={`stage-${group.stage}`}
                className={`flex flex-col gap-3 rounded-xl border border-rule border-t-[3px] ${style.edge} bg-sand/40 p-3 md:w-72 md:shrink-0`}
              >
                <h2 id={`stage-${group.stage}`} className="flex scroll-mt-6 items-center gap-2 text-sm font-semibold text-charcoal">
                  <Icon name={style.icon} className={`size-4 ${style.tint}`} />
                  {group.label} · {group.jobs.length}
                </h2>
                {group.jobs.length ? (
                  group.jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      now={now}
                      href={boardHref({ ...here, job: job.id })}
                      selected={job.id === openId}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ink-soft">
                    <Icon name={style.icon} className="size-8 opacity-40" />
                    <p>No jobs in this stage</p>
                  </div>
                )}
                {group.stage !== "lost" ? (
                  <Link
                    href={`/admin/jobs/new?stage=${group.stage}`}
                    className="mt-auto rounded-lg bg-ivory/80 py-2 text-center text-sm text-charcoal hover:bg-ivory"
                  >
                    {group.stage === "new" ? "+ Add lead" : "+ Add job"}
                  </Link>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>

      {panel ? (
        <JobPanel
          {...panel}
          now={now}
          closeHref={boardHref(here)}
          key={panel.job ? `${panel.job.id}:${panel.job.status}` : `missing:${openId}`}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/admin --maxWorkers=2`
Expected: PASS. If an older `board-page` test asserted the removed "Jobs per stage" list, update it to the tiles.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx app/admin/JobCard.tsx tests/admin/board-page.test.tsx tests/admin/board.test.tsx
git commit -m "feat: PSS board header, search, stage tiles, colored columns, and add buttons"
```

---

### Task 6: Panel and stage controls in the new look

**Files:**
- Modify: `app/admin/JobPanel.tsx`, `app/admin/jobs/[id]/StageControls.tsx`
- Test: `tests/admin/job-panel.test.tsx`, `tests/admin/job-page.test.tsx` (only if an assertion depends on removed classes)

**Interfaces:** No prop or behavior changes.

- [ ] **Step 1: Add a failing test**

Append to `tests/admin/job-page.test.tsx`:

```tsx
  it("makes the next-stage button full width with a decorative icon", () => {
    render(<StageControls job={job} />);
    const button = screen.getByRole("button", { name: "Move to Sold" });
    expect(button.className).toContain("w-full");
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/admin/job-page.test.tsx --maxWorkers=2`
Expected: FAIL. The button is `w-full sm:w-auto` and has no icon.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/StageControls.tsx`:
- Import `Icon` from `@/components/admin/icons`.
- Change the primary button to:

```tsx
          <Button type="submit" variant="solid" className="w-full gap-2">
            <Icon name="arrow" className="size-4" />
            Move to {stageLabel(next)}
          </Button>
```

The accessible name stays "Move to <stage>".

`app/admin/JobPanel.tsx` is a styling change only:
- Change the `PANEL` constant to:

```ts
const PANEL =
  "fixed inset-0 z-40 flex flex-col gap-6 overflow-y-auto overscroll-contain bg-ivory p-5 lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:max-h-[calc(100dvh-3rem)] lg:w-[28rem] lg:shrink-0 lg:rounded-2xl lg:border lg:border-rule lg:p-6 lg:shadow-lg";
```

- Change `HEADING` to `"text-sm font-semibold text-charcoal"`.
- Give each `Section` a top rule: add `border-t border-rule pt-5` to its `section` className.
- Change the name heading class to `"text-2xl font-semibold text-charcoal"`.

Leave all labels and structure as they are, so the existing panel tests keep passing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/JobPanel.tsx "app/admin/jobs/[id]/StageControls.tsx" tests/admin/job-page.test.tsx
git commit -m "feat: client panel and stage controls in the PSS look"
```

---

### Task 7: End-to-end, full verification

**Files:**
- Modify: `e2e/admin.spec.ts`

- [ ] **Step 1: Keep the existing journey unambiguous**

The header now has a "New Job" link, and the sidebar has "New job". Playwright's default name match is a case-insensitive substring, so these collide in strict mode.
- In the existing test "an owner adds a job, advances it, and leaves a note", change `page.getByRole("link", { name: "New job" })` to `page.getByRole("link", { name: "New job", exact: true })`.

- [ ] **Step 2: Add the new journey** at the end of `e2e/admin.spec.ts`:

```ts
test("search finds a job, and a column's add button starts a job in that stage", async ({ page }) => {
  const name = `E2E Tracker Search ${Date.now()}`;
  await signIn(page);

  await page.getByRole("region", { name: /quoted/i }).getByRole("link", { name: "+ Add job" }).click();
  await expect(page.getByRole("heading", { name: "New job · Quoted" })).toBeVisible();
  await expect(page.getByLabel("Stage")).toHaveValue("quoted");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0177");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByText("Stage:")).toContainText("Quoted");

  await page.goto("/admin");
  await page.getByRole("searchbox", { name: "Search jobs" }).fill("555 0177");
  await page.getByRole("searchbox", { name: "Search jobs" }).press("Enter");
  await expect(page).toHaveURL(/\/admin\?q=555/);
  await expect(page.getByRole("region", { name: /quoted/i }).getByRole("link", { name: new RegExp(name) })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search jobs" }).fill(name.slice(-8));
  await page.getByRole("searchbox", { name: "Search jobs" }).press("Enter");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});
```

The name starts with `E2E Tracker `, so the file's existing `afterAll` cleanup deletes it.

- [ ] **Step 3: Run the full verification**

- `npx vitest run --maxWorkers=2`: everything passes. The count before this plan was 408, plus the new tests.
- `npx tsc --noEmit`: no errors.
- `npx eslint`: no errors beyond the one pre-existing error in `ConsultationForm.tsx`.

- [ ] **Step 4: Commit**

```bash
git add e2e/admin.spec.ts
git commit -m "test: e2e search and add-from-column journey"
```

- [ ] **Step 5: Run the e2e suite**

Only do this if the user has approved a Neon test branch. Run it against a production build (`npx next build`, then serve with `next start --hostname 127.0.0.1 --port 3100`), with `E2E_POSTGRES_URL` set to the branch and `RESEND_API_KEY` empty. Use the recipe in the local verification notes, and delete the branch afterward.

If there's no approval, report the test as written but not run. This task never deploys.
