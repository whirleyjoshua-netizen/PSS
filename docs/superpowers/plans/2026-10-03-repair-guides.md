# Repair & Care Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish illustrated repair guides at `/guides/<slug>` (first two: cordless cellular reset, broken blind slat), each ending with a free-measure CTA, listed at `/guides`, in the sitemap and footer.

**Architecture:** One content file (`content/guides.ts`) holds every guide as typed data, like `content/products.ts`. One route template renders any guide; diagrams are server-rendered inline SVG components animated by CSS keyframes in `app/globals.css`. Analytics gets one new GA4 event fired by a small client CTA component.

**Tech Stack:** Next.js 16.3 App Router (async `params`), React 19.2, Tailwind v4 tokens from `app/globals.css`, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-03-repair-guides-design.md`

## Global Constraints

- Work only in the worktree `/Users/jenniferjordan/pss/.claude/worktrees/guides` (branch `feat/guides`). Before every edit, run `git -C /Users/jenniferjordan/pss/.claude/worktrees/guides rev-parse --show-toplevel` and confirm it prints that path.
- Commits authored `Joshua <whirleyjoshua@gmail.com>` (already the configured identity), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No color literals (`#hex`, `rgb(`, `hsl(`) in any component; colors come only from the brand tokens as Tailwind classes (`fill-champagne`, `stroke-taupe`, `text-champagne-ink`, …).
- No phone number literal anywhere outside `content/business.ts`; use `business.phone.display` / `business.phone.href` (`tests/business.test.ts` enforces this).
- No new npm dependencies. No animation library, no video, no images in guides.
- No `HowTo` or `FAQPage` JSON-LD. Only `Article` and `BreadcrumbList`.
- Each diagram's SVG attributes are the instructive **end pose**; CSS keyframes animate from the start pose to it, so the existing `prefers-reduced-motion` rule in `globals.css` leaves the end pose on screen.
- Run tests with `npx vitest run --maxWorkers=2 <path>`.
- No database migration. No deploy, no push: pushing `main` deploys production. The owner reviews guide copy and decides when to merge.
- The motorized guide is out of scope until the owner names the motor brand.

## File map

| File | Responsibility |
|---|---|
| `content/guides.ts` (create) | `DIAGRAM_IDS`, `Guide` types, the guide data, `guideBySlug`, `updatedLabel` |
| `components/guides/diagrams/parts.tsx` (create) | Shared SVG pieces: frame, window, headrail, pleat pattern, wall, label |
| `components/guides/diagrams/cellular.tsx` (create) | 4 cellular-shade diagrams |
| `components/guides/diagrams/slat.tsx` (create) | 4 blind-slat diagrams |
| `components/guides/diagrams/index.tsx` (create) | `DIAGRAMS` registry + `<Diagram id>` |
| `app/globals.css` (modify) | Guide keyframes + animation classes |
| `lib/analytics/events.ts` (modify) | `EVENTS.guideCta`, `trackGuideCta` |
| `components/guides/GuideCta.tsx` (create) | Client CTA box (inline + aside variants) with tracking |
| `components/guides/StepCard.tsx` (create) | One step: diagram, label, title, body |
| `lib/seo/schema.ts` (modify) | `articleSchema(guide)` |
| `app/(site)/guides/[slug]/page.tsx` (create) | Guide template |
| `app/(site)/guides/page.tsx` (create) | Guides index |
| `app/sitemap.ts` (modify) | `/guides` + each guide |
| `components/layout/Footer.tsx` (modify) | "Repair & care guides" link |
| `tests/content/guides.test.ts` (create) | Content validation |
| `tests/guides/diagrams.test.tsx` (create) | Diagram registry, end poses, ids, CSS classes, no literals |
| `tests/analytics/events.test.ts` (modify) | `trackGuideCta` |
| `tests/routes/guides.test.tsx` (create) | Guide page, index, footer |
| `tests/seo/sitemap.test.ts`, `tests/seo/every-page-has-a-photo.test.tsx` (modify) | New routes |

---

### Task 1: Content model and the first two guides

**Files:**
- Create: `content/guides.ts`
- Test: `tests/content/guides.test.ts`

**Interfaces:**
- Consumes: `CategorySlug`, `Seo`, `categories` from `@/content/products`.
- Produces (later tasks rely on these exact names):
  - `export const DIAGRAM_IDS: readonly ["cellular-lower","cellular-pull-45","cellular-tug","cellular-raise","slat-plugs","slat-cord-up","slat-swap","slat-reknot"]`
  - `export type DiagramId = (typeof DIAGRAM_IDS)[number]`
  - `export type GuideStep = { title: string; body: string; diagram: DiagramId; sideView?: boolean }`
  - `export type Guide = { slug; category: CategorySlug; crumb; title; seo: Seo; minutes: number; tools: string; published: string; updated: string; quickAnswer; steps: GuideStep[]; why; cta: { eyebrow; headline; body }; faq: { q; a }[]; related: string[] }`
  - `export const guides: Guide[]`
  - `export function guideBySlug(slug: string): Guide | undefined`
  - `export function updatedLabel(guide: Guide): string` → e.g. `"Oct 2026"`

- [ ] **Step 0: Set up the worktree**

```bash
cd /Users/jenniferjordan/pss/.claude/worktrees/guides && git rev-parse --show-toplevel && npm ci
```
Expected: prints the worktree path; `npm ci` finishes without errors.

- [ ] **Step 1: Write the failing test** — `tests/content/guides.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { DIAGRAM_IDS, guides, guideBySlug, updatedLabel } from "@/content/guides";
import { CATEGORY_SLUGS } from "@/content/products";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("guides content", () => {
  it("ships the two first-release guides", () => {
    expect(guides.map((g) => g.slug)).toEqual([
      "cordless-cellular-shade-wont-stay-up",
      "replace-a-broken-blind-slat",
    ]);
  });

  it("has unique slugs that never collide with a category or the index", () => {
    const slugs = guides.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(CATEGORY_SLUGS as readonly string[]).not.toContain(slug);
      expect(slug).not.toBe("guides");
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(CATEGORY_SLUGS as readonly string[]).not.toContain("guides");
  });

  it.each(guides.map((g) => [g.slug, g] as const))("%s is complete", (_slug, guide) => {
    expect(CATEGORY_SLUGS).toContain(guide.category);
    expect(guide.steps.length).toBeGreaterThanOrEqual(3);
    expect(guide.steps.length).toBeLessThanOrEqual(8);
    expect(guide.faq.length).toBeGreaterThanOrEqual(2);
    expect(guide.faq.length).toBeLessThanOrEqual(5);
    expect(guide.published).toMatch(ISO);
    expect(guide.updated).toMatch(ISO);
    expect(guide.updated >= guide.published).toBe(true);
    expect(guide.minutes).toBeGreaterThan(0);
    for (const text of [guide.title, guide.crumb, guide.quickAnswer, guide.why, guide.tools, guide.seo.title, guide.seo.description, guide.cta.eyebrow, guide.cta.headline, guide.cta.body]) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
    for (const step of guide.steps) {
      expect(DIAGRAM_IDS).toContain(step.diagram);
      expect(step.title.trim()).not.toBe("");
      expect(step.body.trim()).not.toBe("");
    }
  });

  it("links related guides that exist and are not itself", () => {
    for (const guide of guides) {
      for (const slug of guide.related) {
        expect(slug).not.toBe(guide.slug);
        expect(guideBySlug(slug), `${guide.slug} → ${slug}`).toBeDefined();
      }
    }
  });

  it("finds a guide by slug and nothing for an unknown slug", () => {
    expect(guideBySlug("replace-a-broken-blind-slat")?.category).toBe("blinds");
    expect(guideBySlug("nope")).toBeUndefined();
  });

  it("labels the updated date as month and year, independent of time zone", () => {
    expect(updatedLabel({ ...guides[0], updated: "2026-10-01" })).toBe("Oct 2026");
    expect(updatedLabel({ ...guides[0], updated: "2027-01-31" })).toBe("Jan 2027");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/content/guides.test.ts`
Expected: FAIL, cannot resolve `@/content/guides`.

- [ ] **Step 3: Write `content/guides.ts`**

```ts
/**
 * Repair and care guides (spec docs/superpowers/specs/2026-10-03-repair-guides-design.md).
 *
 * Every guide page, the /guides index and the sitemap read from this file, so
 * adding a guide is an edit here plus, if it needs a new picture, one diagram
 * component. Copy is drafted for the owner to check before it goes live: a
 * wrong repair step costs more trust than no guide.
 *
 * Written for the Las Vegas valley, like content/products.ts: dust, heat and
 * afternoon sun are the real causes, so say so.
 */

import type { CategorySlug, Seo } from "@/content/products";

export const DIAGRAM_IDS = [
  "cellular-lower",
  "cellular-pull-45",
  "cellular-tug",
  "cellular-raise",
  "slat-plugs",
  "slat-cord-up",
  "slat-swap",
  "slat-reknot",
] as const;

export type DiagramId = (typeof DIAGRAM_IDS)[number];

export type GuideStep = {
  title: string;
  /** Plain text, one paragraph. */
  body: string;
  diagram: DiagramId;
  /** Adds "· side view" to the step label. */
  sideView?: boolean;
};

export type Guide = {
  slug: string;
  category: CategorySlug;
  /** Short name for the breadcrumb. */
  crumb: string;
  /** The H1, phrased the way people search. */
  title: string;
  seo: Seo;
  minutes: number;
  tools: string;
  /** ISO dates. `updated` is shown on the page and sent as dateModified. */
  published: string;
  updated: string;
  quickAnswer: string;
  steps: GuideStep[];
  why: string;
  cta: { eyebrow: string; headline: string; body: string };
  faq: { q: string; a: string }[];
  related: string[];
};

export const guides: Guide[] = [
  {
    slug: "cordless-cellular-shade-wont-stay-up",
    category: "shades",
    crumb: "Cordless shade won't stay up",
    title: "Cordless cellular shade won't stay up? Reset it in 4 steps",
    seo: {
      title: "Cordless Cellular Shade Won't Stay Up? 4-Step Reset | Premier Shade Solutions",
      description:
        "A cordless cellular shade that drifts down usually needs its spring reset. Four steps, two minutes, no tools, with diagrams from Las Vegas installers.",
    },
    minutes: 2,
    tools: "No tools",
    published: "2026-10-03",
    updated: "2026-10-03",
    quickAnswer:
      "Lower the shade all the way, pull the bottom rail toward you at about 45°, give it three short tugs, then raise it. That resets the spring in the headrail. If it still drops, the spring is worn out.",
    steps: [
      {
        title: "Lower the shade all the way",
        body: "Pull the bottom rail straight down until the shade is fully open and stops on its own.",
        diagram: "cellular-lower",
      },
      {
        title: "Pull it toward you at 45°",
        body: "Hold the middle of the bottom rail and bring it out from the window at about a 45° angle.",
        diagram: "cellular-pull-45",
        sideView: true,
      },
      {
        title: "Give it three short, firm tugs",
        body: "Keep the angle. Quick and gentle, not hard. This re-engages the spring inside the headrail.",
        diagram: "cellular-tug",
        sideView: true,
      },
      {
        title: "Raise it, then let go halfway",
        body: "Lift the shade and release it in the middle of the window. If it holds, you're done.",
        diagram: "cellular-raise",
      },
    ],
    why:
      "Cordless shades hold their place with a spring motor inside the headrail. Raising the shade too fast, pulling from one corner, or the fine desert dust that settles into Las Vegas headrails can knock the spring out of balance. After enough years the spring simply wears out, and no reset will bring it back.",
    cta: {
      eyebrow: "Still dropping?",
      headline: "It may be time for a new shade",
      body: "A worn spring can't be fixed at home on most shades. We measure every window for free and bring cordless and motorized samples to you.",
    },
    faq: [
      {
        q: "Can I replace the spring myself?",
        a: "On most brands, no. The spring is sealed inside the headrail, and opening it usually ruins the shade. Replacing the shade is often cheaper than a repair.",
      },
      {
        q: "Why does my shade only drop on one side?",
        a: "One lift cord inside has slipped. Lower the shade fully and do the 45° reset, which lets both cords settle to the same length. If it is still crooked, that cord has worn.",
      },
      {
        q: "Will this work on my brand?",
        a: "Most cordless cellular shades use a spring motor and respond to this reset. If yours has a button or a wand on the headrail, it uses a different mechanism. Call us and we'll walk you through it.",
      },
    ],
    related: ["replace-a-broken-blind-slat"],
  },
  {
    slug: "replace-a-broken-blind-slat",
    category: "blinds",
    crumb: "Replace a broken slat",
    title: "How to replace a broken blind slat in 4 steps",
    seo: {
      title: "How to Replace a Broken Blind Slat (4 Steps) | Premier Shade Solutions",
      description:
        "Swap one cracked slat without replacing the whole blind. Four steps with diagrams, a screwdriver and fifteen minutes, from Las Vegas installers.",
    },
    minutes: 15,
    tools: "Flathead screwdriver, scissors",
    published: "2026-10-03",
    updated: "2026-10-03",
    quickAnswer:
      "Pop the plugs out of the bottom rail, untie the lift cord and pull it up just past the broken slat, slide the broken slat out of the ladder and a spare one in, then rethread the cord and tie it off. No spare? Borrow the bottom slat.",
    steps: [
      {
        title: "Pop out the bottom-rail plugs",
        body: "Lower the blind all the way and tilt the slats open. Use a flathead screwdriver to pry out the small plugs on the underside of the bottom rail. The lift cords are knotted underneath.",
        diagram: "slat-plugs",
      },
      {
        title: "Untie the cord and pull it up",
        body: "Untie the knot on each lift cord and gently pull the cord up through the slats until its end sits just above the broken slat. Don't pull it out of the headrail.",
        diagram: "slat-cord-up",
      },
      {
        title: "Swap the slat",
        body: "Slide the broken slat sideways out of the ladder strings, then slide the new one in the same way, curved side matching its neighbors. No spare? Use the bottom slat; a missing bottom slat is hard to spot.",
        diagram: "slat-swap",
      },
      {
        title: "Rethread and tie off",
        body: "Feed each cord back down through every slat and the bottom rail. Tie a knot so both sides hang level, tuck it in and press the plugs back in.",
        diagram: "slat-reknot",
      },
    ],
    why:
      "Slats crack when they are pulled while closed, bumped by a pet or a child, or baked by afternoon sun. Vinyl slats on west-facing Las Vegas windows turn brittle fastest.",
    cta: {
      eyebrow: "More than a couple cracked?",
      headline: "Sun-damaged slats keep breaking",
      body: "Once the vinyl has gone brittle, the next slat is not far behind. We measure for free and show you faux wood and shades made for desert sun.",
    },
    faq: [
      {
        q: "Where do I get a replacement slat?",
        a: "Take a broken piece to a home store to match the width and color, or ask the blind's maker for a spare. If we installed your blinds, call us and we'll find a match.",
      },
      {
        q: "My slats have no holes for the cord. Now what?",
        a: "Some blinds run the cord around the back edge of each slat instead. The steps are the same: free the cord, swap the slat, and rethread it around the same edge.",
      },
      {
        q: "Can I just glue a cracked slat?",
        a: "Clear tape or glue on the back holds for a while, but cracked vinyl keeps splitting. Replacing the slat takes about fifteen minutes.",
      },
    ],
    related: ["cordless-cellular-shade-wont-stay-up"],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}

/** "Oct 2026". Noon UTC so no time zone can roll the date into another month. */
export function updatedLabel(guide: Guide): string {
  return new Date(`${guide.updated}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/content/guides.test.ts tests/business.test.ts`
Expected: PASS (business test confirms no phone literal or banned phrase crept into `content/`).

- [ ] **Step 5: Test power check, then commit**

Commit first (memory: a `git checkout --` after a mutation wipes uncommitted edits):
```bash
git add content/guides.ts tests/content/guides.test.ts
git commit -m "feat(guides): content model and the first two repair guides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Then change the second guide's `related` to `["missing-guide"]`, run the test, expect FAIL on "links related guides"; then `git checkout -- content/guides.ts` and rerun, expect PASS.

---

### Task 2: Diagrams and their animations

**Files:**
- Create: `components/guides/diagrams/parts.tsx`, `components/guides/diagrams/cellular.tsx`, `components/guides/diagrams/slat.tsx`, `components/guides/diagrams/index.tsx`
- Modify: `app/globals.css` (append a guides block at the end of the file)
- Test: `tests/guides/diagrams.test.tsx`

**Interfaces:**
- Consumes: `DIAGRAM_IDS`, `DiagramId` from `@/content/guides`.
- Produces:
  - `export const DIAGRAMS: Record<DiagramId, { label: string; Component: () => React.JSX.Element }>`
  - `export function Diagram({ id }: { id: DiagramId }): React.JSX.Element`, an `<svg role="img" aria-label={label}>`.

Geometry notes (viewBox `0 0 200 200`):
- Cellular front view: window `20,8 160×184`; fabric `30,24 140×150` (full) or `140×45` (raised); bottom rail at `y=174` (full) or `y=69` (raised); headrail `26,14 148×10`.
- Cellular side view: wall line `x=50`; headrail `50,14 22×10`; fabric strip `58,24 8×150`; rail `55,172 14×8`; pivot `(62,24)`.
- Slat front view: headrail `30,14 140×10`; slats `x=32 w=136 h=6` at `y = 30 + 14·i` for `i = 0..8`; broken slat is `i=4` (`y=86`); ladder strings at `x=60` and `x=140`; lift cords at `x=66` and `x=134`; bottom rail `30,158 140×10`; plugs `8×5` at `x=62` and `x=130`, `y=168` (seated) or `y=182` (out).

End-pose rule: a shape's **attributes** are the end pose. A shape that rotates sits in an outer `<g transform="…">` holding the end pose, with an inner `<g className="guide-…">` that CSS animates *relative* to it, so CSS `transform-origin` never meets an SVG `transform` attribute on the same element.

- [ ] **Step 1: Write the failing test** — `tests/guides/diagrams.test.tsx`

```tsx
import { render } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DIAGRAM_IDS } from "@/content/guides";
import { DIAGRAMS, Diagram } from "@/components/guides/diagrams";

const svgOf = (id: (typeof DIAGRAM_IDS)[number]) =>
  render(<Diagram id={id} />).container.querySelector("svg")!;

describe("guide diagrams", () => {
  it("has exactly one entry per diagram id", () => {
    expect(Object.keys(DIAGRAMS).sort()).toEqual([...DIAGRAM_IDS].sort());
  });

  it.each([...DIAGRAM_IDS])("%s is a labelled image", (id) => {
    const svg = svgOf(id);
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(DIAGRAMS[id].label);
    expect(DIAGRAMS[id].label.length).toBeGreaterThan(15);
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
  });

  // Reduced motion leaves only the attributes on screen, so they must show the instructive pose.
  it("draws the end pose in attributes", () => {
    expect(svgOf("cellular-lower").querySelector("[data-part=fabric]")!.getAttribute("height")).toBe("150");
    expect(svgOf("cellular-raise").querySelector("[data-part=fabric]")!.getAttribute("height")).toBe("45");
    expect(svgOf("cellular-pull-45").querySelector("[data-part=pose]")!.getAttribute("transform")).toBe("rotate(-45 62 24)");
    expect(svgOf("cellular-tug").querySelector("[data-part=pose]")!.getAttribute("transform")).toBe("rotate(-45 62 24)");
    expect([...svgOf("slat-plugs").querySelectorAll("[data-part=plug]")].map((p) => p.getAttribute("y"))).toEqual(["182", "182"]);
    expect([...svgOf("slat-cord-up").querySelectorAll("[data-part=cord]")].map((c) => c.getAttribute("y2"))).toEqual(["80", "80"]);
    expect(svgOf("slat-swap").querySelector("[data-part=old-slat]")!.getAttribute("opacity")).toBe("0");
    expect([...svgOf("slat-reknot").querySelectorAll("[data-part=plug]")].map((p) => p.getAttribute("y"))).toEqual(["168", "168"]);
  });

  it("gives every pleat pattern its own id, and each fabric points at an existing pattern", () => {
    const { container } = render(
      <>
        <Diagram id="cellular-lower" />
        <Diagram id="cellular-raise" />
      </>,
    );
    const ids = [...container.querySelectorAll("pattern")].map((p) => p.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const fabric of container.querySelectorAll("[data-part=fabric]")) {
      const ref = fabric.getAttribute("fill")!.match(/^url\(#(.+)\)$/)![1];
      expect(ids).toContain(ref);
    }
  });

  it("defines in globals.css every guide- animation class the diagrams use", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const used = new Set<string>();
    for (const id of DIAGRAM_IDS) {
      for (const el of svgOf(id).querySelectorAll("[class]")) {
        for (const cls of (el.getAttribute("class") ?? "").split(/\s+/)) if (cls.startsWith("guide-")) used.add(cls);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const cls of used) expect(css, cls).toContain(`.${cls}`);
  });

  it("uses no color literals in guide components", () => {
    const dir = "components/guides";
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const file of walk(dir)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/guides/diagrams.test.tsx`
Expected: FAIL, cannot resolve `@/components/guides/diagrams`.

- [ ] **Step 3: Write `components/guides/diagrams/parts.tsx`**

```tsx
import { useId } from "react";

/** Every guide diagram shares one 200×200 canvas so parts line up across guides. */
export function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label} className="mx-auto block w-full max-w-[220px]">
      {children}
    </svg>
  );
}

/**
 * The pleated-fabric fill. useId keeps two diagrams on one page from sharing
 * an id; colons and other punctuation are stripped so url(#…) always parses.
 */
export function usePleatId(): string {
  return `pleat-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function PleatPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" className="fill-champagne" />
        <line x1="0" y1="7.5" x2="8" y2="7.5" className="stroke-taupe" strokeOpacity="0.5" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

export function WindowPane() {
  return <rect x="20" y="8" width="160" height="184" className="fill-white stroke-rule" strokeWidth="2" />;
}

export function Headrail({ x, y, width }: { x: number; y: number; width: number }) {
  return <rect x={x} y={y} width={width} height="10" rx="2" className="fill-charcoal" />;
}

export function Wall() {
  return (
    <>
      <line x1="50" y1="6" x2="50" y2="194" className="stroke-taupe" strokeWidth="3" />
      <Label x={14} y={100}>wall</Label>
    </>
  );
}

export function Label({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <text x={x} y={y} className="fill-champagne-ink font-display text-[12px] font-semibold">
      {children}
    </text>
  );
}
```

- [ ] **Step 4: Write `components/guides/diagrams/cellular.tsx`**

```tsx
import { Frame, Headrail, Label, PleatPattern, Wall, WindowPane, usePleatId } from "./parts";

function FrontView({ label, fabricHeight, fabricClass, railClass }: {
  label: string;
  fabricHeight: number;
  fabricClass: string;
  railClass: string;
}) {
  const pleat = usePleatId();
  return (
    <Frame label={label}>
      <PleatPattern id={pleat} />
      <WindowPane />
      <rect data-part="fabric" x="30" y="24" width="140" height={fabricHeight} fill={`url(#${pleat})`} className={`guide-fabric ${fabricClass}`} />
      <rect data-part="rail" x="28" y={24 + fabricHeight} width="144" height="8" rx="2" className={`fill-taupe ${railClass}`} />
      <Headrail x={26} y={14} width={148} />
    </Frame>
  );
}

function SideView({ label, motionClass, children }: { label: string; motionClass: string; children?: React.ReactNode }) {
  const pleat = usePleatId();
  return (
    <Frame label={label}>
      <PleatPattern id={pleat} />
      <Wall />
      {children}
      <g data-part="pose" transform="rotate(-45 62 24)">
        <g className={`guide-swing ${motionClass}`}>
          <rect data-part="fabric" x="58" y="24" width="8" height="150" fill={`url(#${pleat})`} />
          <rect x="55" y="172" width="14" height="8" rx="2" className="fill-taupe" />
        </g>
      </g>
      <Headrail x={50} y={14} width={22} />
    </Frame>
  );
}

export const CellularLower = () => (
  <FrontView label="Cellular shade lowered all the way to the window sill" fabricHeight={150} fabricClass="guide-lower-fabric" railClass="guide-lower-rail" />
);

export const CellularRaise = () => (
  <FrontView label="Cellular shade raised and holding near the top of the window" fabricHeight={45} fabricClass="guide-raise-fabric" railClass="guide-raise-rail" />
);

export const CellularPull45 = () => (
  <SideView label="Side view: the bottom rail pulled out from the window at a 45 degree angle" motionClass="guide-pull">
    <path d="M62 180 A156 156 0 0 0 172 134" fill="none" className="stroke-champagne-ink" strokeWidth="1.5" strokeDasharray="4 4" />
    <Label x={126} y={184}>45°</Label>
  </SideView>
);

export const CellularTug = () => (
  <SideView label="Side view: three short tugs on the bottom rail, held at 45 degrees" motionClass="guide-tug">
    <Label x={110} y={188}>3 short tugs</Label>
  </SideView>
);
```

- [ ] **Step 5: Write `components/guides/diagrams/slat.tsx`**

```tsx
import { Frame, Headrail, Label } from "./parts";

const SLAT_YS = [30, 44, 58, 72, 86, 100, 114, 128, 142];
const BROKEN_Y = 86;
const CORD_XS = [66, 134];
const PLUG_XS = [62, 130];

function Blind({ cordEnd, cordClass, broken = true, children }: {
  /** Where the lift cords end; 168 is threaded all the way into the bottom rail. */
  cordEnd: number;
  cordClass?: string;
  broken?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      {[60, 140].map((x) => (
        <line key={x} x1={x} y1="24" x2={x} y2="158" className="stroke-taupe" strokeWidth="1" />
      ))}
      {SLAT_YS.filter((y) => !(y === BROKEN_Y && !broken)).map((y) => (
        <rect key={y} x="32" y={y} width="136" height="6" rx="1" className="fill-champagne" />
      ))}
      {broken ? <path d={`M96 ${BROKEN_Y} l4 3 l-3 3`} fill="none" className="stroke-charcoal" strokeWidth="1.5" /> : null}
      {CORD_XS.map((x) => (
        <line key={x} data-part="cord" x1={x} y1="24" x2={x} y2={cordEnd} className={`stroke-charcoal ${cordClass ?? ""}`} strokeWidth="1.2" />
      ))}
      <rect x="30" y="158" width="140" height="10" rx="2" className="fill-taupe" />
      <Headrail x={30} y={14} width={140} />
      {children}
    </>
  );
}

function Plugs({ y, motionClass }: { y: number; motionClass: string }) {
  return (
    <>
      {PLUG_XS.map((x) => (
        <rect key={x} data-part="plug" x={x} y={y} width="8" height="5" className={`fill-charcoal ${motionClass}`} />
      ))}
    </>
  );
}

export const SlatPlugs = () => (
  <Frame label="Plugs pried out of the underside of the bottom rail">
    <Blind cordEnd={168}>
      <Plugs y={182} motionClass="guide-plug-out" />
      <Label x={80} y={196}>plugs</Label>
    </Blind>
  </Frame>
);

export const SlatCordUp = () => (
  <Frame label="Lift cords pulled up through the slats to just above the broken slat">
    <Blind cordEnd={80} cordClass="guide-cord-up">
      <Label x={72} y={186}>pull cords up</Label>
    </Blind>
  </Frame>
);

export const SlatSwap = () => (
  <Frame label="The broken slat slides out of the ladder strings and a new slat slides in">
    <Blind cordEnd={80} broken={false}>
      <rect data-part="old-slat" x="32" y={BROKEN_Y} width="136" height="6" rx="1" opacity="0" className="fill-champagne guide-slat-out" />
      <rect data-part="new-slat" x="32" y={BROKEN_Y} width="136" height="6" rx="1" className="fill-champagne guide-slat-in" />
      <Label x={62} y={186}>slide out, slide in</Label>
    </Blind>
  </Frame>
);

export const SlatReknot = () => (
  <Frame label="Cords threaded back through the bottom rail, knotted, and the plugs pressed back in">
    <Blind cordEnd={168} broken={false} cordClass="guide-rethread">
      {CORD_XS.map((x) => (
        <circle key={x} data-part="knot" cx={x} cy="163" r="3" className="fill-champagne-ink guide-knot" />
      ))}
      <Plugs y={168} motionClass="guide-plug-in" />
      <Label x={70} y={190}>knot, plug in</Label>
    </Blind>
  </Frame>
);
```

- [ ] **Step 6: Write `components/guides/diagrams/index.tsx`**

```tsx
import type { DiagramId } from "@/content/guides";
import { CellularLower, CellularPull45, CellularRaise, CellularTug } from "./cellular";
import { SlatCordUp, SlatPlugs, SlatReknot, SlatSwap } from "./slat";

/**
 * Every DiagramId maps to a drawing. A Record makes a missing id a type error,
 * and tests/guides/diagrams.test.tsx checks the keys at runtime too. The label
 * is the SVG's aria-label, so it describes the action, not the drawing.
 */
const entry = (label: string, Component: () => React.JSX.Element) => ({ label, Component });

export const DIAGRAMS: Record<DiagramId, { label: string; Component: () => React.JSX.Element }> = {
  "cellular-lower": entry("Cellular shade lowered all the way to the window sill", CellularLower),
  "cellular-pull-45": entry("Side view: the bottom rail pulled out from the window at a 45 degree angle", CellularPull45),
  "cellular-tug": entry("Side view: three short tugs on the bottom rail, held at 45 degrees", CellularTug),
  "cellular-raise": entry("Cellular shade raised and holding near the top of the window", CellularRaise),
  "slat-plugs": entry("Plugs pried out of the underside of the bottom rail", SlatPlugs),
  "slat-cord-up": entry("Lift cords pulled up through the slats to just above the broken slat", SlatCordUp),
  "slat-swap": entry("The broken slat slides out of the ladder strings and a new slat slides in", SlatSwap),
  "slat-reknot": entry("Cords threaded back through the bottom rail, knotted, and the plugs pressed back in", SlatReknot),
};

export function Diagram({ id }: { id: DiagramId }) {
  const { Component } = DIAGRAMS[id];
  return <Component />;
}
```

Note: each component also hard-codes its label for `Frame`; the test asserts the rendered `aria-label` equals `DIAGRAMS[id].label`, so the two can't drift.

- [ ] **Step 7: Append the animations to `app/globals.css`**

Append at the very end of the file (after the existing `prefers-reduced-motion` block, which already collapses these to one 0.01 ms iteration):

```css
/*
 * Repair guide diagrams (spec 2026-10-03-repair-guides-design). Each shape's
 * SVG attributes are the end pose; these loops run from the start pose to it,
 * so with reduced motion the instructive end pose is what stays on screen.
 * Rotations animate an inner <g> relative to an outer <g transform>, so a CSS
 * transform-origin never meets an SVG transform attribute on one element.
 */
.guide-fabric { transform-box: fill-box; transform-origin: top; }
.guide-swing { transform-box: view-box; transform-origin: 62px 24px; }

.guide-lower-fabric { animation: guide-lower-fabric 3.2s ease-in-out infinite; }
.guide-lower-rail { animation: guide-lower-rail 3.2s ease-in-out infinite; }
.guide-raise-fabric { animation: guide-raise-fabric 3.2s ease-in-out infinite; }
.guide-raise-rail { animation: guide-raise-rail 3.2s ease-in-out infinite; }
.guide-pull { animation: guide-pull 3.4s ease-in-out infinite; }
.guide-tug { animation: guide-tug 2.6s ease-in-out infinite; }

.guide-plug-out { animation: guide-plug-out 3s ease-in-out infinite; }
.guide-cord-up { transform-box: fill-box; transform-origin: top; animation: guide-cord-up 3.2s ease-in-out infinite; }
.guide-slat-out { animation: guide-slat-out 3.4s ease-in-out infinite; }
.guide-slat-in { animation: guide-slat-in 3.4s ease-in-out infinite; }
.guide-rethread { transform-box: fill-box; transform-origin: top; animation: guide-rethread 3.4s ease-in-out infinite; }
.guide-knot { transform-box: fill-box; transform-origin: center; animation: guide-knot 3.4s ease-in-out infinite; }
.guide-plug-in { animation: guide-plug-in 3.4s ease-in-out infinite; }

@keyframes guide-lower-fabric { 0%, 10% { transform: scaleY(0.25); } 60%, 100% { transform: scaleY(1); } }
@keyframes guide-lower-rail { 0%, 10% { transform: translateY(-112px); } 60%, 100% { transform: translateY(0); } }
/* Raised end pose is 45 tall; 150 / 45 = 3.333 starts it fully lowered. */
@keyframes guide-raise-fabric { 0%, 10% { transform: scaleY(3.333); } 60%, 100% { transform: scaleY(1); } }
@keyframes guide-raise-rail { 0%, 10% { transform: translateY(105px); } 60%, 100% { transform: translateY(0); } }
/* Relative to the outer rotate(-45): +45deg is hanging straight down. */
@keyframes guide-pull { 0%, 12% { transform: rotate(45deg); } 50%, 85% { transform: rotate(0); } 100% { transform: rotate(45deg); } }
@keyframes guide-tug {
  0% { transform: rotate(0); } 7% { transform: rotate(-8deg); } 14% { transform: rotate(0); }
  21% { transform: rotate(-8deg); } 28% { transform: rotate(0); } 35% { transform: rotate(-8deg); }
  42%, 100% { transform: rotate(0); }
}

@keyframes guide-plug-out { 0%, 15% { transform: translateY(-14px); } 55%, 100% { transform: translateY(0); } }
/* Cord end pose is 56 long (24→80); 144 / 56 = 2.571 starts it threaded to the rail. */
@keyframes guide-cord-up { 0%, 10% { transform: scaleY(2.571); } 60%, 100% { transform: scaleY(1); } }
@keyframes guide-slat-out { 0%, 8% { transform: translateX(0); opacity: 1; } 40%, 100% { transform: translateX(150px); opacity: 0; } }
@keyframes guide-slat-in { 0%, 45% { transform: translateX(-150px); opacity: 0; } 80%, 100% { transform: translateX(0); opacity: 1; } }
@keyframes guide-rethread { 0%, 5% { transform: scaleY(0.4); } 40%, 100% { transform: scaleY(1); } }
@keyframes guide-knot { 0%, 40% { transform: scale(0); } 55%, 100% { transform: scale(1); } }
@keyframes guide-plug-in { 0%, 55% { transform: translateY(14px); } 80%, 100% { transform: translateY(0); } }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/guides/diagrams.test.tsx tests/tokens.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit, then test power check**

```bash
git add components/guides/diagrams app/globals.css tests/guides/diagrams.test.tsx
git commit -m "feat(guides): animated SVG diagrams for the cellular reset and slat swap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Then, one at a time, rerunning the test after each and restoring with `git checkout -- <file>`:
1. Delete the `.guide-tug { … }` rule from `app/globals.css` → expect FAIL ("defines in globals.css…").
2. Change `transform="rotate(-45 62 24)"` to `transform="rotate(0 62 24)"` in `cellular.tsx` → expect FAIL ("draws the end pose").
3. Replace `usePleatId()` body with `return "pleat";` → expect FAIL ("its own id").
4. Add `className="fill-[#fff]"` to `WindowPane` → expect FAIL ("no color literals").

---

### Task 3: Guide CTA and its analytics event

**Files:**
- Modify: `lib/analytics/events.ts`
- Create: `components/guides/GuideCta.tsx`
- Test: `tests/analytics/events.test.ts` (append), `tests/guides/guide-cta.test.tsx` (create)

**Interfaces:**
- Consumes: `Guide` from `@/content/guides`; `business` from `@/content/business`.
- Produces:
  - `EVENTS.guideCta === "guide_cta_click"`
  - `export const trackGuideCta = (guide: string, kind: "book" | "call") => void` → sends `{ guide, kind }`
  - `export function GuideCta(props: { slug: string; variant: "inline"; cta: Guide["cta"] } | { slug: string; variant: "aside" })` (client component)

- [ ] **Step 1: Write the failing tests**

Append to `tests/analytics/events.test.ts` (and add `trackGuideCta` to the existing import from `@/lib/analytics/events`):

```ts
describe("trackGuideCta", () => {
  it("sends guide_cta_click with the guide and which button", () => {
    trackGuideCta("replace-a-broken-blind-slat", "book");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "guide_cta_click", { guide: "replace-a-broken-blind-slat", kind: "book" });
  });

  it("never throws when analytics fails", () => {
    sendGAEvent.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => trackGuideCta("x", "call")).not.toThrow();
  });
});
```

Create `tests/guides/guide-cta.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendGAEvent = vi.fn();
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: (...args: unknown[]) => sendGAEvent(...args) }));

import { GuideCta } from "@/components/guides/GuideCta";
import { guides } from "@/content/guides";
import { business } from "@/content/business";

const guide = guides[0];

beforeEach(() => sendGAEvent.mockReset());

describe("GuideCta", () => {
  it("inline: shows the guide's own copy, books at /contact and calls the business number", () => {
    render(<GuideCta slug={guide.slug} variant="inline" cta={guide.cta} />);
    expect(screen.getByText(guide.cta.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: guide.cta.headline })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a free in-home measure" })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: `Call ${business.phone.display}` })).toHaveAttribute("href", business.phone.href);
  });

  it("aside: no heading, same two buttons", () => {
    render(<GuideCta slug={guide.slug} variant="aside" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("link", { name: "Book a free in-home measure" })).toHaveAttribute("href", "/contact");
  });

  it("counts each button with the guide's slug", async () => {
    render(<GuideCta slug={guide.slug} variant="inline" cta={guide.cta} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Book a free in-home measure" }));
    await user.click(screen.getByRole("link", { name: `Call ${business.phone.display}` }));
    expect(sendGAEvent).toHaveBeenCalledWith("event", "guide_cta_click", { guide: guide.slug, kind: "book" });
    expect(sendGAEvent).toHaveBeenCalledWith("event", "guide_cta_click", { guide: guide.slug, kind: "call" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/analytics/events.test.ts tests/guides/guide-cta.test.tsx`
Expected: FAIL, `trackGuideCta` is not exported; `@/components/guides/GuideCta` not found.

- [ ] **Step 3: Add the event to `lib/analytics/events.ts`**

Replace the `EVENTS` line with:
```ts
export const EVENTS = { lead: "generate_lead", phone: "phone_click", promo: "promo_click", leadTimes: "lead_times_open", guideCta: "guide_cta_click" } as const;
```
After `trackLeadTimesOpen`, add:
```ts
/** A booking or call button on a repair guide, so we can see which guides bring consults. */
export const trackGuideCta = (guide: string, kind: "book" | "call") => send(EVENTS.guideCta, { guide, kind });
```

- [ ] **Step 4: Write `components/guides/GuideCta.tsx`**

```tsx
"use client";

import Link from "next/link";
import { business } from "@/content/business";
import type { Guide } from "@/content/guides";
import { trackGuideCta } from "@/lib/analytics/events";

type Props =
  | { slug: string; variant: "inline"; cta: Guide["cta"] }
  | { slug: string; variant: "aside" };

/**
 * The bridge from "fix it" to a consult. The inline box sits after the steps
 * with the guide's own copy; the aside is pinned beside the article on wide
 * screens. A tap on the call button is also counted as phone_click by the
 * site-wide PhoneClickTracking listener; this adds which guide it came from.
 */
export function GuideCta(props: Props) {
  const { slug } = props;
  const inline = props.variant === "inline";

  return (
    <div className={`bg-charcoal text-ivory ${inline ? "my-12 p-6 md:p-8" : "p-5"}`}>
      <p className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne">
        {inline ? props.cta.eyebrow : "Free in-home measure"}
      </p>
      {inline ? (
        <h2 className="mt-2 text-2xl font-light text-ivory">{props.cta.headline}</h2>
      ) : null}
      <p className="mt-3 text-sand/80">
        {inline ? props.cta.body : "We bring samples to you anywhere in the Las Vegas valley."}
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <Link
          href="/contact"
          onClick={() => trackGuideCta(slug, "book")}
          className="inline-flex min-h-11 items-center justify-center bg-champagne px-5 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-ivory"
        >
          Book a free in-home measure
        </Link>
        <a
          href={business.phone.href}
          onClick={() => trackGuideCta(slug, "call")}
          className="inline-flex min-h-11 items-center justify-center border border-ivory/30 px-5 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-ivory transition-colors hover:border-ivory"
        >
          Call {business.phone.display}
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/analytics tests/guides tests/business.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit, then test power check**

```bash
git add lib/analytics/events.ts components/guides/GuideCta.tsx tests/analytics/events.test.ts tests/guides/guide-cta.test.tsx
git commit -m "feat(guides): consult CTA box that counts guide_cta_click by guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Remove `onClick={() => trackGuideCta(slug, "call")}` → run `tests/guides/guide-cta.test.tsx`, expect FAIL on "counts each button"; `git checkout -- components/guides/GuideCta.tsx`.

---

### Task 4: The guide page

**Files:**
- Create: `components/guides/StepCard.tsx`, `app/(site)/guides/[slug]/page.tsx`
- Modify: `lib/seo/schema.ts`
- Test: `tests/routes/guides.test.tsx` (create), `tests/seo/schema.test.ts` (append)

**Interfaces:**
- Consumes: `guides`, `guideBySlug`, `updatedLabel`, `Guide`, `GuideStep` (Task 1); `Diagram` (Task 2); `GuideCta` (Task 3); `PageHero`, `Crumb` from `@/components/product/ProductParts`; `Section` from `@/components/ui/Section`; `JsonLd`; `breadcrumbSchema`; `categories`.
- Produces:
  - `export function articleSchema(guide: Guide)` in `lib/seo/schema.ts`
  - `export function StepCard({ step, index }: { step: GuideStep; index: number })`
  - Route default export `GuidePage({ params }: { params: Promise<{ slug: string }> })`, plus `generateStaticParams`, `generateMetadata`, `dynamicParams = false`.

- [ ] **Step 1: Read the Next.js docs for this version (AGENTS.md)**

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`. Confirm `params` is a `Promise` and `dynamicParams = false` 404s unknown slugs, as `app/(site)/[category]/page.tsx` already does. If the docs disagree with the code below, follow the docs and note it in the commit message.

- [ ] **Step 2: Write the failing tests**

In `tests/seo/schema.test.ts`, add `articleSchema` to the existing `import { … } from "@/lib/seo/schema"` list, add `import { guides } from "@/content/guides";` below the existing `business` import, then append:
```ts
describe("articleSchema", () => {
  it("describes a guide as an Article by the business, dated by the guide", () => {
    const guide = guides[0];
    const schema = articleSchema(guide);
    expect(schema["@type"]).toBe("Article");
    expect(schema.headline).toBe(guide.title);
    expect(schema.url).toBe(`${business.domain}/guides/${guide.slug}`);
    expect(schema.datePublished).toBe(guide.published);
    expect(schema.dateModified).toBe(guide.updated);
    expect(schema.author).toEqual({ "@type": "Organization", name: business.name, url: business.domain });
    expect(JSON.stringify(schema)).not.toMatch(/HowTo|FAQPage/);
  });
});
```

Create `tests/routes/guides.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import GuidePage, { generateMetadata, generateStaticParams } from "@/app/(site)/guides/[slug]/page";
import { guides } from "@/content/guides";

const renderGuide = async (slug: string) => render(await GuidePage({ params: Promise.resolve({ slug }) }));

describe("guide page", () => {
  it("builds one static page per guide", async () => {
    expect(await generateStaticParams()).toEqual(guides.map((g) => ({ slug: g.slug })));
  });

  it.each(guides.map((g) => [g.slug, g] as const))("%s renders the approved layout", async (_slug, guide) => {
    const { container } = await renderGuide(guide.slug);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: guide.title })).toBeInTheDocument();
    expect(screen.getByText(guide.quickAnswer)).toBeInTheDocument();
    expect(screen.getByText(/Updated [A-Z][a-z]{2} \d{4}/)).toBeInTheDocument();

    const steps = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
    expect(steps).toHaveLength(guide.steps.length);
    steps.forEach((li, i) => {
      expect(li.querySelectorAll("svg[role=img]")).toHaveLength(1);
      expect(within(li).getByRole("heading", { level: 3, name: guide.steps[i].title })).toBeInTheDocument();
      expect(li.textContent).toContain(guide.steps[i].sideView ? `Step ${i + 1} · side view` : `Step ${i + 1}`);
    });

    expect(screen.getByRole("heading", { level: 2, name: "Why it happens" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: guide.cta.headline })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Book a free in-home measure" })) {
      expect(link).toHaveAttribute("href", "/contact");
    }
    for (const { q } of guide.faq) expect(screen.getByText(q)).toBeInTheDocument();
    for (const slug of guide.related) {
      expect(container.querySelector(`a[href="/guides/${slug}"]`)).not.toBeNull();
    }

    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? ""));
    expect(ld.map((s) => s["@type"]).sort()).toEqual(["Article", "BreadcrumbList"]);
  });

  it("returns a 404 for an unknown guide", async () => {
    await expect(GuidePage({ params: Promise.resolve({ slug: "nope" }) })).rejects.toThrow();
  });

  it("sets the title, description and canonical from the guide", async () => {
    const guide = guides[1];
    const meta = await generateMetadata({ params: Promise.resolve({ slug: guide.slug }) });
    expect(meta.title).toBe(guide.seo.title);
    expect(meta.description).toBe(guide.seo.description);
    expect(meta.alternates?.canonical).toBe(`/guides/${guide.slug}`);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/routes/guides.test.tsx tests/seo/schema.test.ts`
Expected: FAIL, the route module and `articleSchema` don't exist.

- [ ] **Step 4: Add `articleSchema` to `lib/seo/schema.ts`**

Add `import type { Guide } from "@/content/guides";` beside the existing `Product` import, then append:
```ts
/**
 * A repair guide is an Article written by the business. No HowTo or FAQPage
 * markup: Google stopped showing either for ordinary sites in 2023.
 */
export function articleSchema(guide: Guide) {
  const url = absolute(`/guides/${guide.slug}`);
  const organization = { "@type": "Organization", name: business.name, url: business.domain };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.seo.description,
    url,
    mainEntityOfPage: url,
    datePublished: guide.published,
    dateModified: guide.updated,
    author: organization,
    publisher: organization,
  };
}
```

- [ ] **Step 5: Write `components/guides/StepCard.tsx`**

```tsx
import type { GuideStep } from "@/content/guides";
import { Diagram } from "@/components/guides/diagrams";

export function StepCard({ step, index }: { step: GuideStep; index: number }) {
  return (
    <li className="flex flex-col gap-2 border border-rule bg-white p-5">
      <Diagram id={step.diagram} />
      <p className="mt-2 font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
        Step {index + 1}
        {step.sideView ? " · side view" : ""}
      </p>
      <h3 className="text-lg font-medium text-charcoal">{step.title}</h3>
      <p className="leading-relaxed text-ink-soft">{step.body}</p>
    </li>
  );
}
```

- [ ] **Step 6: Write `app/(site)/guides/[slug]/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/product/ProductParts";
import { Section } from "@/components/ui/Section";
import { JsonLd } from "@/components/seo/JsonLd";
import { GuideCta } from "@/components/guides/GuideCta";
import { StepCard } from "@/components/guides/StepCard";
import { breadcrumbSchema, articleSchema } from "@/lib/seo/schema";
import { categories } from "@/content/products";
import { guideBySlug, guides, updatedLabel } from "@/content/guides";

/** An unknown slug is a real 404 rather than a rendered page. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return {};

  return {
    title: guide.seo.title,
    description: guide.seo.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.seo.title,
      description: guide.seo.description,
      url: `/guides/${guide.slug}`,
      type: "article",
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const trail = [
    { name: "Guides", url: "/guides" },
    { name: guide.crumb, url: `/guides/${guide.slug}` },
  ];
  const category = categories.find((c) => c.slug === guide.category)!;
  const related = guide.related.map((s) => guideBySlug(s)!);

  return (
    <>
      <JsonLd schema={breadcrumbSchema(trail)} />
      <JsonLd schema={articleSchema(guide)} />
      <PageHero eyebrow={`${category.name} · Repair guide`} title={guide.title} trail={trail} />

      <Section tone="ivory" padding="tight-top">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
          <article className="max-w-3xl pt-6">
            <p className="flex flex-wrap gap-x-4 gap-y-1 font-display text-sm text-ink-soft">
              <span className="font-medium text-charcoal">{guide.minutes} minutes</span>
              <span>{guide.tools}</span>
              <span>Updated {updatedLabel(guide)}</span>
              <span>Written by our installers</span>
            </p>

            <div className="mt-6 border-l-4 border-champagne bg-white px-5 py-4">
              <p className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">Quick answer</p>
              <p className="mt-1 leading-relaxed text-charcoal">{guide.quickAnswer}</p>
            </div>

            <h2 className="mt-12 text-2xl font-light text-charcoal">Step by step</h2>
            <ol aria-label="Steps" className="mt-4 grid gap-4 md:grid-cols-2">
              {guide.steps.map((step, index) => (
                <StepCard key={step.title} step={step} index={index} />
              ))}
            </ol>

            <h2 className="mt-12 text-2xl font-light text-charcoal">Why it happens</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{guide.why}</p>

            <GuideCta slug={guide.slug} variant="inline" cta={guide.cta} />

            <h2 className="text-2xl font-light text-charcoal">Common questions</h2>
            <div className="mt-3">
              {guide.faq.map(({ q, a }, index) => (
                <details key={q} open={index === 0} className="border-t border-rule py-4">
                  <summary className="cursor-pointer font-display font-medium text-charcoal">{q}</summary>
                  <p className="mt-2 leading-relaxed text-ink-soft">{a}</p>
                </details>
              ))}
            </div>

            {related.length > 0 ? (
              <>
                <h2 className="mt-12 text-2xl font-light text-charcoal">Other guides</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {related.map((other) => (
                    <li key={other.slug}>
                      <Link href={`/guides/${other.slug}`} className="block border border-rule bg-white px-4 py-3 font-display text-charcoal transition-colors hover:border-champagne">
                        {other.title} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <GuideCta slug={guide.slug} variant="aside" />
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/routes/guides.test.tsx tests/seo/schema.test.ts tests/guides`
Expected: PASS. If the 404 test fails because `notFound()` does not throw under vitest, check how `tests/routes/products.test.ts` handles it and match that pattern.

- [ ] **Step 8: Commit, then test power check**

```bash
git add components/guides/StepCard.tsx "app/(site)/guides/[slug]/page.tsx" lib/seo/schema.ts tests/routes/guides.test.tsx tests/seo/schema.test.ts
git commit -m "feat(guides): guide page with quick answer, step cards, CTA, FAQ and Article schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Then delete `<Diagram id={step.diagram} />` from `StepCard.tsx` → expect FAIL ("one svg per step"); restore. Then remove `<JsonLd schema={articleSchema(guide)} />` → expect FAIL; restore.

---

### Task 5: Guides index, sitemap and footer

**Files:**
- Create: `app/(site)/guides/page.tsx`
- Modify: `app/sitemap.ts`, `components/layout/Footer.tsx`, `tests/seo/sitemap.test.ts`, `tests/seo/every-page-has-a-photo.test.tsx`
- Test: `tests/routes/guides.test.tsx` (append)

**Interfaces:**
- Consumes: `guides`, `Guide` (Task 1); `PageHero`; `Section`; `categories`.
- Produces: route default export `GuidesIndexPage()` and `metadata`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/routes/guides.test.tsx` (merge imports at the top):
```tsx
import GuidesIndexPage from "@/app/(site)/guides/page";
import { Footer } from "@/components/layout/Footer";

describe("guides index", () => {
  it("lists every guide under its category", () => {
    const { container } = render(<GuidesIndexPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Repair & care guides" })).toBeInTheDocument();
    for (const guide of guides) {
      expect(container.querySelector(`a[href="/guides/${guide.slug}"]`)).not.toBeNull();
    }
    expect(screen.getByRole("heading", { level: 2, name: "Shades" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Blinds" })).toBeInTheDocument();
  });
});

describe("footer", () => {
  it("links to the guides", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Repair & care guides" })).toHaveAttribute("href", "/guides");
  });
});
```

In `tests/seo/sitemap.test.ts`, replace the count test with:
```ts
  it("lists every public route exactly once", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    // 1 home + 5 hubs + 12 products + 4 cities
    // + gallery, reviews, about, contact, privacy, accessibility
    // + the guides index and 2 guides
    expect(urls).toHaveLength(31);
    expect(new Set(urls).size).toBe(31);
  });

  it("lists the guides index and every guide, dated by the guide", async () => {
    const { guides } = await import("@/content/guides");
    const entries = await sitemap();
    expect(entries.some((e) => e.url === `${business.domain}/guides`)).toBe(true);
    for (const guide of guides) {
      const entry = entries.find((e) => e.url === `${business.domain}/guides/${guide.slug}`);
      expect(entry, guide.slug).toBeDefined();
      expect(entry!.lastModified).toEqual(new Date(guide.updated));
    }
  });
```

In `tests/seo/every-page-has-a-photo.test.tsx`, after `const EXEMPT = …`, add and use:
```ts
/** Guides are illustrated with SVG diagrams instead of photos (spec 2026-10-03 repair guides). */
const ILLUSTRATED = ["/guides", ...guides.map((g) => `/guides/${g.slug}`)];
```
with `import { guides } from "@/content/guides";` at the top, and change the filter to:
```ts
      .filter((path) => !EXEMPT.includes(path) && !ILLUSTRATED.includes(path));
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/routes/guides.test.tsx tests/seo`
Expected: FAIL: index route missing, footer link missing, sitemap length 28.

- [ ] **Step 3: Write `app/(site)/guides/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/product/ProductParts";
import { Section } from "@/components/ui/Section";
import { categories } from "@/content/products";
import { guides } from "@/content/guides";

export const metadata: Metadata = {
  title: "Blind & Shade Repair Guides | Premier Shade Solutions",
  description:
    "Step-by-step fixes for blinds and shades, with diagrams, from the installers who put them up across the Las Vegas valley.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndexPage() {
  const groups = categories
    .map((category) => ({ category, items: guides.filter((g) => g.category === category.slug) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <PageHero
        title="Repair & care guides"
        lead="Step-by-step fixes for blinds and shades, with diagrams, from the installers who put them up across the Las Vegas valley."
        trail={[{ name: "Guides", url: "/guides" }]}
      />
      <Section tone="ivory">
        <div className="flex flex-col gap-12">
          {groups.map(({ category, items }) => (
            <section key={category.slug}>
              <h2 className="text-2xl font-light text-charcoal">{category.name}</h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {items.map((guide) => (
                  <li key={guide.slug}>
                    <Link href={`/guides/${guide.slug}`} className="flex h-full flex-col gap-2 border border-rule bg-white p-5 transition-colors hover:border-champagne">
                      <span className="font-display text-lg text-charcoal">{guide.title}</span>
                      <span className="line-clamp-3 text-ink-soft">{guide.quickAnswer}</span>
                      <span className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">{guide.minutes} minutes</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 4: Add the guides to `app/sitemap.ts`**

Add `import { guides } from "@/content/guides";` with the other imports. In the returned array, after the `cities` spread, add:
```ts
    { url: url("/guides"), priority: 0.6, changeFrequency: "monthly" as const, lastModified },

    ...guides.map((guide) => ({
      url: url(`/guides/${guide.slug}`),
      priority: 0.6,
      changeFrequency: "monthly" as const,
      lastModified: new Date(guide.updated),
    })),
```

- [ ] **Step 5: Add the footer link in `components/layout/Footer.tsx`**

Inside the Products `<ul>`, after the `categories.map(...)` block, add:
```tsx
              <li>
                <Link href="/guides" className="text-sand/80 transition-colors hover:text-ivory">
                  Repair &amp; care guides
                </Link>
              </li>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/routes/guides.test.tsx tests/seo tests/layout`
Expected: PASS.

- [ ] **Step 7: Commit, then test power check**

```bash
git add "app/(site)/guides/page.tsx" app/sitemap.ts components/layout/Footer.tsx tests/routes/guides.test.tsx tests/seo/sitemap.test.ts tests/seo/every-page-has-a-photo.test.tsx
git commit -m "feat(guides): guides index, sitemap entries and footer link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Remove the `...guides.map(...)` block from `app/sitemap.ts` → expect FAIL in `tests/seo/sitemap.test.ts`; restore.

---

### Task 6: Whole-branch verification and owner review

**Files:** none changed unless a check fails.

- [ ] **Step 1: Full checks**

```bash
cd /Users/jenniferjordan/pss/.claude/worktrees/guides
npm run typecheck && npm run lint && npx vitest run --maxWorkers=2
```
Expected: all pass. Report the test count from the vitest summary.

- [ ] **Step 2: Production build**

```bash
npx next build
```
Expected: succeeds; the route list shows `/guides`, `/guides/cordless-cellular-shade-wont-stay-up` and `/guides/replace-a-broken-blind-slat` as prerendered (●/○). A fresh worktree build takes about 34 s; if it runs for many minutes, delete `.next/dev` and retry.

- [ ] **Step 3: Look at it in a real browser**

```bash
npx next start -H 127.0.0.1 -p 3100
```
In Chrome at 390×844 and at desktop width, open both guides and `/guides`. Check: each diagram animates and its pose reads correctly (shade lowers; rail swings out to 45° away from the wall; tugs; shade raises and holds; plugs drop out; cords rise to just above the cracked slat; old slat slides out, new slides in; cords rethread, knots appear, plugs go back in). Then enable reduced motion (DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`) and confirm each diagram shows its end pose, not a blank or start pose. Fix anything that reads wrong in the SVG geometry or keyframes, rerun Task 2's tests, commit as `fix(guides): …`. Stop the server.

- [ ] **Step 4: Hand to the owner**

Do not merge or push. Tell the owner:
- the branch and how to view it locally;
- **they must check every step, FAQ answer and "why" paragraph** in `content/guides.ts` for accuracy against the brands they install;
- the motorized guide is waiting on which motor brand(s) they install;
- after merge, a push to `main` deploys production, and they should submit `/guides` in Search Console.
