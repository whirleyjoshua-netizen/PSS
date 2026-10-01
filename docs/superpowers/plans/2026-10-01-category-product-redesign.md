# Category and Product Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the 5 category pages and 14 product pages after the owner's mockup (photo hero with the form on it, icon row, story section, photo cards, reviews band, serif headings) without changing any SEO element, body copy, or the city/reviews pages.

**Architecture:** New presentational components in `components/treatment/` used only by `app/(site)/[category]/page.tsx` and `app/(site)/[category]/[product]/page.tsx`. Two pieces of `BookingBlock` (promise badges + family line, featured review card) move into their own files so both the old block (city, reviews pages) and the new hero share them with identical output. New per-category wording lives in `content/products.ts`. A small helper decides which photo each slot shows so no page repeats a photo.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, Tailwind CSS v4 (tokens in `app/globals.css` `@theme`), `next/image`, Vitest + Testing Library (jsdom), Playwright.

Spec: `docs/superpowers/specs/2026-10-01-category-product-redesign-design.md`.

## Global Constraints

- Scope: category pages and product pages only. Homepage, `/service-area/*`, `/reviews`, `/about`, `/contact`, `/gallery`, header and footer render exactly as before.
- Body copy is not rewritten: every tagline, intro/body paragraph, `bestFor`, `features`, title and `seo` field stays word for word.
- Exactly one `<h1>` per page, text `{Name} in Las Vegas`. Titles, descriptions, canonicals, Open Graph, breadcrumb and product JSON-LD unchanged.
- The booking section keeps `id="book"`; its form is `HeroForm` with `idPrefix="book"`, `source="booking"`, `treatment` = the category name. In the DOM the form comes after the h1 and before the review card and before any intro/body paragraph.
- A photo is only shown for the product it truly depicts; no page shows the same image `src` twice; slots fill hero → story → cards and a repeat becomes the fabric panel.
- Past-work reviews keep the label "From our years with {pastWork.source}, before we opened Premier Shade Solutions." and stay out of review schema. No review quote appears twice on a page.
- No colour literals in components: use the `@theme` tokens (`ivory`, `sand`, `champagne`, `champagne-ink`, `charcoal`, `rule`, `ink-soft`, `taupe`).
- Serif headings use the `.heading-serif` class (unlayered CSS in `app/globals.css`, declared after the `h1, h2, h3, h4` rule). No new font file.
- New wording, verbatim (spec §5):

| Category | Highlights (label · icon) | Story eyebrow | Story heading | Caption eyebrow — line |
|---|---|---|---|---|
| blinds | Glare control · sun; Privacy · eye; Wipe clean · droplet; Wide glass · window | Keep the light, lose the glare | Control Without Closing the Room Off | Made for hard-working rooms — Kitchens, baths and home offices. |
| shades | Light control · sun; Privacy · eye; Energy savings · leaf; Desert-ready fabrics · home | More than a window covering | A Single Panel That Changes the Room | Chosen for this valley — The right fabric for every exposure. |
| shutters | Built to fit · ruler; Sun-proof · sun; No cords · shield; Adds value · home | Part of the house | The Treatment That Reads as Architecture | Fitted to the opening — Framed, finished and built to last. |
| outdoor | Heat blocking · thermometer; Patio comfort · sofa; Energy savings · leaf; UV protection · shield | Shade before the glass | The Patio You Actually Use | Measured properly — A covered patio, 15–20° cooler. |
| motorization | App & remote · phone; Schedules · clock; No wiring · battery; High windows · arrow-up | No electrician required | Shades That Beat the Sun to the Window | On schedule — Closes itself every summer afternoon. |

- Product story: eyebrow = category name, heading `Why {product name}` (name as written, e.g. "Why Roller Shades"), caption eyebrow `Best for`, caption line = `bestFor`.
- Button in every story section: "Meet the family" → `/about`.
- Unit tests: `npx vitest run --maxWorkers=2 <files>`. Typecheck: `npx tsc --noEmit` (run `npx next typegen` once in a fresh worktree). Lint changed files by path: `npx eslint <files>` — never bare `npm run lint`.

---

## File Structure

- Modify `content/products.ts` — `Highlight`, `HighlightIcon`, `CategoryStory` types; `highlights` + `story` on every category; optional `storyPhoto` on Roller Shades, Cellular Shades, Plantation Shutters.
- Create `lib/content/page-photos.ts` — `uniquePhotos()`: blank out a slot whose photo already appeared earlier.
- Create `components/ui/LineIcon.tsx` — the 14 stroke icons.
- Create `components/treatment/FabricPanel.tsx` — the no-photo stand-in.
- Create `components/booking/PromiseRow.tsx` — `PROMISES`, `FAMILY_LINE`, `PromiseRow` (moved from BookingBlock).
- Create `components/booking/FeaturedReview.tsx` — `FEATURED_REVIEW`, `FeaturedReviewCard` (moved from BookingBlock).
- Modify `components/booking/BookingBlock.tsx` — use the two moved pieces; re-export `FAMILY_LINE`; identical output.
- Modify `app/globals.css` — `.heading-serif`.
- Create `components/treatment/TreatmentHero.tsx` — photo hero with title, form, review card.
- Create `components/treatment/IconRow.tsx`, `StorySection.tsx`, `PhotoCardGrid.tsx`, `DetailsBand.tsx`.
- Modify `app/(site)/[category]/page.tsx`, `app/(site)/[category]/[product]/page.tsx`.
- Tests: `tests/products.test.ts` (extend), `tests/content/page-photos.test.ts`, `tests/treatment/*.test.tsx`, `tests/booking/promise-row.test.tsx`, `tests/routes/treatment-pages.test.tsx`, `e2e/consultation.spec.ts` (extend). Existing `tests/routes/booking-pages.test.tsx`, `tests/booking/booking-block.test.tsx`, `tests/seo/*` must pass unchanged.

---

### Task 1: Content — highlights, story wording, story photos, and the photo-slot helper

**Files:**
- Modify: `content/products.ts` (types at lines ~28-62; category objects; three products)
- Create: `lib/content/page-photos.ts`
- Test: `tests/products.test.ts`, `tests/content/page-photos.test.ts`

**Interfaces:**
- Produces:
  - `export type HighlightIcon = "sun" | "eye" | "droplet" | "window" | "leaf" | "home" | "ruler" | "shield" | "thermometer" | "sofa" | "phone" | "clock" | "battery" | "arrow-up";`
  - `export type Highlight = { label: string; icon: HighlightIcon };`
  - `export type CategoryStory = { eyebrow: string; heading: string; caption: { eyebrow: string; line: string } };`
  - `Category` gains `highlights: Highlight[]` (exactly 4) and `story: CategoryStory`.
  - `Product` gains `storyPhoto?: Photo`.
  - `export function uniquePhotos(slots: (Photo | undefined)[]): (Photo | undefined)[]` in `lib/content/page-photos.ts`.

- [ ] **Step 1: Write the failing content tests**

Append to `tests/products.test.ts` (keep its existing imports; add `existsSync` and `path` imports at the top):

```ts
import { existsSync } from "node:fs";
import path from "node:path";
```

```ts
describe("redesign wording (spec 2026-10-01 §5)", () => {
  const WORDING: Record<string, { highlights: [string, string][]; eyebrow: string; heading: string; caption: [string, string] }> = {
    blinds: {
      highlights: [["Glare control", "sun"], ["Privacy", "eye"], ["Wipe clean", "droplet"], ["Wide glass", "window"]],
      eyebrow: "Keep the light, lose the glare",
      heading: "Control Without Closing the Room Off",
      caption: ["Made for hard-working rooms", "Kitchens, baths and home offices."],
    },
    shades: {
      highlights: [["Light control", "sun"], ["Privacy", "eye"], ["Energy savings", "leaf"], ["Desert-ready fabrics", "home"]],
      eyebrow: "More than a window covering",
      heading: "A Single Panel That Changes the Room",
      caption: ["Chosen for this valley", "The right fabric for every exposure."],
    },
    shutters: {
      highlights: [["Built to fit", "ruler"], ["Sun-proof", "sun"], ["No cords", "shield"], ["Adds value", "home"]],
      eyebrow: "Part of the house",
      heading: "The Treatment That Reads as Architecture",
      caption: ["Fitted to the opening", "Framed, finished and built to last."],
    },
    outdoor: {
      highlights: [["Heat blocking", "thermometer"], ["Patio comfort", "sofa"], ["Energy savings", "leaf"], ["UV protection", "shield"]],
      eyebrow: "Shade before the glass",
      heading: "The Patio You Actually Use",
      caption: ["Measured properly", "A covered patio, 15–20° cooler."],
    },
    motorization: {
      highlights: [["App & remote", "phone"], ["Schedules", "clock"], ["No wiring", "battery"], ["High windows", "arrow-up"]],
      eyebrow: "No electrician required",
      heading: "Shades That Beat the Sun to the Window",
      caption: ["On schedule", "Closes itself every summer afternoon."],
    },
  };

  it.each(categories.map((c) => [c.slug, c] as const))("%s carries the approved highlights and story wording", (slug, category) => {
    const want = WORDING[slug];
    expect(category.highlights.map((h) => [h.label, h.icon])).toEqual(want.highlights);
    expect(category.story).toEqual({ eyebrow: want.eyebrow, heading: want.heading, caption: { eyebrow: want.caption[0], line: want.caption[1] } });
  });
});

describe("story photos (spec §6)", () => {
  const WITH_STORY = ["roller-shades", "cellular-shades", "plantation-shutters"];

  it("are set on exactly the three products the gallery has a second photo of", () => {
    expect(products.filter((p) => p.storyPhoto).map((p) => p.slug).sort()).toEqual([...WITH_STORY].sort());
  });

  it.each(WITH_STORY)("%s: the story photo differs from its own photo, exists, and has alt text", (slug) => {
    const product = products.find((p) => p.slug === slug)!;
    expect(product.storyPhoto!.src).not.toBe(product.image?.src);
    expect(product.storyPhoto!.alt.trim().length).toBeGreaterThan(20);
    expect(existsSync(path.join(process.cwd(), "public", product.storyPhoto!.src))).toBe(true);
  });
});
```

Create `tests/content/page-photos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { uniquePhotos } from "@/lib/content/page-photos";

const a = { src: "/gallery/a.webp", alt: "A" };
const b = { src: "/gallery/b.webp", alt: "B" };

describe("uniquePhotos", () => {
  it("keeps every slot when no photo repeats", () => {
    expect(uniquePhotos([a, b, undefined])).toEqual([a, b, undefined]);
  });

  it("blanks a later slot whose photo already appeared higher on the page", () => {
    expect(uniquePhotos([a, b, a, b])).toEqual([a, b, undefined, undefined]);
  });

  it("matches on src, not on object identity", () => {
    expect(uniquePhotos([a, { ...a, alt: "other words" }])).toEqual([a, undefined]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/products.test.ts tests/content/page-photos.test.ts`
Expected: FAIL — `category.highlights` is undefined; `@/lib/content/page-photos` cannot be resolved.

- [ ] **Step 3: Add the types and wording**

In `content/products.ts`, after `export type Photo = …`:

```ts
/** The line icons the icon row can draw (components/ui/LineIcon.tsx). */
export type HighlightIcon =
  | "sun" | "eye" | "droplet" | "window" | "leaf" | "home" | "ruler"
  | "shield" | "thermometer" | "sofa" | "phone" | "clock" | "battery" | "arrow-up";

/** One entry in a category's icon row: a two-or-three-word label the page copy already backs up. */
export type Highlight = { label: string; icon: HighlightIcon };

/** The story section's wording on a category page (spec 2026-10-01 §5). */
export type CategoryStory = {
  eyebrow: string;
  heading: string;
  caption: { eyebrow: string; line: string };
};
```

Add to `Category` (after `bookingPhoto?`):

```ts
  /** Exactly four; product pages reuse their category's row. */
  highlights: Highlight[];
  story: CategoryStory;
```

Add to `Product` (after `image?`):

```ts
  /**
   * A second, different photo of this same product for the story section, so the
   * page never repeats `image`. Unset means the story shows the fabric panel.
   */
  storyPhoto?: Photo;
```

Add to each category object (after `bookingPhoto`, or after `intro` where there is none), values from the Global Constraints table. Blinds:

```ts
    highlights: [
      { label: "Glare control", icon: "sun" },
      { label: "Privacy", icon: "eye" },
      { label: "Wipe clean", icon: "droplet" },
      { label: "Wide glass", icon: "window" },
    ],
    story: {
      eyebrow: "Keep the light, lose the glare",
      heading: "Control Without Closing the Room Off",
      caption: { eyebrow: "Made for hard-working rooms", line: "Kitchens, baths and home offices." },
    },
```

Shades:

```ts
    highlights: [
      { label: "Light control", icon: "sun" },
      { label: "Privacy", icon: "eye" },
      { label: "Energy savings", icon: "leaf" },
      { label: "Desert-ready fabrics", icon: "home" },
    ],
    story: {
      eyebrow: "More than a window covering",
      heading: "A Single Panel That Changes the Room",
      caption: { eyebrow: "Chosen for this valley", line: "The right fabric for every exposure." },
    },
```

Shutters:

```ts
    highlights: [
      { label: "Built to fit", icon: "ruler" },
      { label: "Sun-proof", icon: "sun" },
      { label: "No cords", icon: "shield" },
      { label: "Adds value", icon: "home" },
    ],
    story: {
      eyebrow: "Part of the house",
      heading: "The Treatment That Reads as Architecture",
      caption: { eyebrow: "Fitted to the opening", line: "Framed, finished and built to last." },
    },
```

Outdoor:

```ts
    highlights: [
      { label: "Heat blocking", icon: "thermometer" },
      { label: "Patio comfort", icon: "sofa" },
      { label: "Energy savings", icon: "leaf" },
      { label: "UV protection", icon: "shield" },
    ],
    story: {
      eyebrow: "Shade before the glass",
      heading: "The Patio You Actually Use",
      caption: { eyebrow: "Measured properly", line: "A covered patio, 15–20° cooler." },
    },
```

Motorization:

```ts
    highlights: [
      { label: "App & remote", icon: "phone" },
      { label: "Schedules", icon: "clock" },
      { label: "No wiring", icon: "battery" },
      { label: "High windows", icon: "arrow-up" },
    ],
    story: {
      eyebrow: "No electrician required",
      heading: "Shades That Beat the Sun to the Window",
      caption: { eyebrow: "On schedule", line: "Closes itself every summer afternoon." },
    },
```

Add `storyPhoto` after `image` on three products (alt text copied from `content/gallery.ts`):

Roller Shades:
```ts
    storyPhoto: {
      src: "/gallery/roller-shades-bay-window.webp",
      alt: "Light roller shades lowered in each window of a bay, with gridded transom windows left uncovered above.",
    },
```
Cellular Shades:
```ts
    storyPhoto: {
      src: "/gallery/cellular-shades-top-down-bedroom.webp",
      alt: "Top-down bottom-up cellular shades covering the lower half of two wood-trimmed windows in a bedroom, with sky visible above.",
    },
```
Plantation Shutters:
```ts
    storyPhoto: {
      src: "/gallery/plantation-shutters-bedroom.webp",
      alt: "White plantation shutters with open louvers on two windows in a bedroom with grey walls.",
    },
```

- [ ] **Step 4: Write the helper**

Create `lib/content/page-photos.ts`:

```ts
import type { Photo } from "@/content/products";

/**
 * The photo each slot on a page shows, filled top to bottom (hero, story, cards).
 * A slot whose photo already appeared higher up gets `undefined`, and the page
 * shows the fabric panel there instead: no page ever repeats a photo (spec
 * 2026-10-01 §6).
 */
export function uniquePhotos(slots: (Photo | undefined)[]): (Photo | undefined)[] {
  const seen = new Set<string>();
  return slots.map((photo) => {
    if (!photo || seen.has(photo.src)) return undefined;
    seen.add(photo.src);
    return photo;
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/products.test.ts tests/content/page-photos.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — clean (the new required `Category` fields are set on all five).

- [ ] **Step 6: Commit**

```bash
git add content/products.ts lib/content/page-photos.ts tests/products.test.ts tests/content/page-photos.test.ts
git commit -m "feat: category highlights and story wording, product story photos, no-repeat photo slots"
```

---

### Task 2: Line icons and the fabric panel

**Files:**
- Create: `components/ui/LineIcon.tsx`, `components/treatment/FabricPanel.tsx`
- Test: `tests/treatment/line-icon.test.tsx`, `tests/treatment/fabric-panel.test.tsx`

**Interfaces:**
- Consumes: `HighlightIcon` from Task 1.
- Produces: `export function LineIcon({ name, className }: { name: HighlightIcon; className?: string })`; `export const ICON_PATHS: Record<HighlightIcon, string[]>`; `export function FabricPanel({ label, className }: { label: string; className?: string })`.

- [ ] **Step 1: Write the failing tests**

`tests/treatment/line-icon.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LineIcon, ICON_PATHS } from "@/components/ui/LineIcon";
import { categories, type HighlightIcon } from "@/content/products";

describe("LineIcon", () => {
  it("draws every icon a category uses", () => {
    const used = new Set(categories.flatMap((c) => c.highlights.map((h) => h.icon)));
    for (const name of used) expect(ICON_PATHS[name]?.length ?? 0).toBeGreaterThan(0);
  });

  it("is decorative: hidden from screen readers, stroked in the theme's ink", () => {
    const { container } = render(<LineIcon name={"sun" as HighlightIcon} className="size-7" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("class")).toContain("stroke-champagne-ink");
    expect(svg.getAttribute("class")).toContain("size-7");
    expect(svg.querySelectorAll("path")).toHaveLength(ICON_PATHS.sun.length);
  });
});
```

`tests/treatment/fabric-panel.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FabricPanel } from "@/components/treatment/FabricPanel";

describe("FabricPanel", () => {
  it("is decorative and shows the name in light serif lettering", () => {
    const { container } = render(<FabricPanel label="Solar Shades" className="aspect-4/3" />);
    const panel = container.firstElementChild!;
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel.className).toContain("bg-sand");
    expect(panel.className).toContain("aspect-4/3");
    expect(panel.textContent).toBe("Solar Shades");
    expect(container.querySelector("img")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/treatment`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`components/ui/LineIcon.tsx`:

```tsx
import type { HighlightIcon } from "@/content/products";

/** 24×24 stroke paths, drawn in the same weight as the header's icons. */
export const ICON_PATHS: Record<HighlightIcon, string[]> = {
  sun: ["M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  droplet: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  window: ["M4 3h16v18H4z", "M12 3v18M4 12h16"],
  leaf: ["M5 19c0-8 6-14 15-14 0 9-6 15-14 15", "M5 19l7-7"],
  home: ["M3 11l9-7 9 7", "M5 10v10h14V10", "M10 20v-5h4v5"],
  ruler: ["M3 17L17 3l4 4L7 21z", "M7 13l2 2M10 10l2 2M13 7l2 2"],
  shield: ["M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"],
  thermometer: ["M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"],
  sofa: ["M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3", "M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z", "M5 18v2M19 18v2"],
  phone: ["M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M11 18h2"],
  clock: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M12 7v5l3 2"],
  battery: ["M3 7h15a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z", "M22 11v2M6 10v4M10 10v4"],
  "arrow-up": ["M12 20V4", "M5 11l7-7 7 7"],
};

/** A decorative line icon; the label beside it carries the meaning. */
export function LineIcon({ name, className }: { name: HighlightIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`fill-none stroke-champagne-ink stroke-[1.5] ${className ?? ""}`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
```

`components/treatment/FabricPanel.tsx`:

```tsx
/**
 * Stands in where a page has no real photo of the product yet (spec 2026-10-01 §6):
 * a sand block with a faint woven texture and the name in light serif lettering.
 * Decorative — the card or section beside it already says the name in text.
 */
export function FabricPanel({ label, className }: { label: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-sand bg-[repeating-linear-gradient(45deg,var(--color-rule)_0_1px,transparent_1px_7px),repeating-linear-gradient(-45deg,var(--color-rule)_0_1px,transparent_1px_7px)] p-6 text-center ${className ?? ""}`}
    >
      <span className="heading-serif text-2xl text-taupe">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/treatment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/LineIcon.tsx components/treatment/FabricPanel.tsx tests/treatment
git commit -m "feat: line icons and the fabric panel for pages without a product photo"
```

---

### Task 3: Move the promise row and featured review out of BookingBlock

**Files:**
- Create: `components/booking/PromiseRow.tsx`, `components/booking/FeaturedReview.tsx`
- Modify: `components/booking/BookingBlock.tsx`
- Test: `tests/booking/promise-row.test.tsx`; `tests/booking/booking-block.test.tsx` must pass **unchanged**.

**Interfaces:**
- Produces:
  - `export const FAMILY_LINE: string`, `export const PROMISES: string[]`, `export function PromiseRow({ className, centered = false }: { className?: string; centered?: boolean })` in `PromiseRow.tsx`.
  - `export const FEATURED_REVIEW: PastReview | undefined`, `export function FeaturedReviewCard({ className }: { className?: string })` in `FeaturedReview.tsx`.
  - `BookingBlock.tsx` keeps `export { FAMILY_LINE }` (re-export) and the same props and rendered DOM.

- [ ] **Step 1: Write the failing test**

`tests/booking/promise-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PromiseRow, PROMISES, FAMILY_LINE } from "@/components/booking/PromiseRow";
import { FeaturedReviewCard, FEATURED_REVIEW } from "@/components/booking/FeaturedReview";
import { pastWork } from "@/content/reviews";

describe("PromiseRow", () => {
  it("lists the three promises and the family line", () => {
    render(<PromiseRow />);
    const list = screen.getByRole("list", { name: "What you get" });
    expect(Array.from(list.querySelectorAll("li")).map((li) => li.textContent)).toEqual(PROMISES);
    expect(screen.getByText(FAMILY_LINE)).toBeInTheDocument();
  });

  it("centres both when asked", () => {
    render(<PromiseRow centered />);
    expect(screen.getByRole("list", { name: "What you get" }).className).toContain("justify-center");
    expect(screen.getByText(FAMILY_LINE).className).toContain("text-center");
  });
});

describe("FeaturedReviewCard", () => {
  it("quotes the first spotlight review with stars and the before-Premier label", () => {
    render(<FeaturedReviewCard />);
    expect(FEATURED_REVIEW?.spotlight).toBe(true);
    expect(screen.getByRole("img", { name: "5 out of 5 stars" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(FEATURED_REVIEW!.quote.slice(0, 30)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`From our years with ${pastWork.source}, before we opened Premier Shade Solutions`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read every review" })).toHaveAttribute("href", "/reviews");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/booking/promise-row.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Move the code**

`components/booking/PromiseRow.tsx` — the badge list and family line exactly as they are in `BookingBlock.tsx` today, plus `centered`:

```tsx
import { Reveal } from "@/components/ui/Reveal";

export const FAMILY_LINE =
  "Shade and Josh measure, order and install every job themselves. No call center, no subcontractors.";

/** The badges under the photo: what the consultation is, in three words or fewer each. */
export const PROMISES = ["Free consultation", "Family-run", "No obligation"];

/** The three promise badges and the family line, shared by BookingBlock and TreatmentHero's pages. */
export function PromiseRow({ className, centered = false }: { className?: string; centered?: boolean }) {
  return (
    <Reveal className={`flex flex-col gap-5 ${centered ? "items-center" : ""} ${className ?? ""}`}>
      <ul aria-label="What you get" className={`flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
        {PROMISES.map((promise) => (
          <li
            key={promise}
            className="inline-flex items-center gap-2 border border-champagne/70 bg-ivory/70 px-3 py-1.5 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-none stroke-champagne-ink stroke-[2.5]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {promise}
          </li>
        ))}
      </ul>
      <p className={`text-lg leading-relaxed text-charcoal ${centered ? "max-w-3xl text-center" : ""}`}>{FAMILY_LINE}</p>
    </Reveal>
  );
}
```

`components/booking/FeaturedReview.tsx`:

```tsx
import Link from "next/link";
import { formatReviewDate, Stars } from "@/components/reviews/ReviewCard";
import { Reveal } from "@/components/ui/Reveal";
import { pastReviews, pastWork } from "@/content/reviews";

/** The first About-page spotlight quote; a fixed pick so the page is the same for every visitor. */
export const FEATURED_REVIEW = pastReviews.filter((review) => review.spotlight)[0];

/** One past-work review on a card with stars, labelled as from before Premier Shade Solutions (FTC). */
export function FeaturedReviewCard({ className }: { className?: string }) {
  if (!FEATURED_REVIEW) return null;
  return (
    <Reveal delayMs={150} className={className}>
      <figure className="flex flex-col gap-3 bg-ivory/95 p-5 shadow-xl backdrop-blur-sm">
        <Stars />
        <blockquote className="text-sm leading-relaxed text-charcoal">
          &ldquo;{FEATURED_REVIEW.quote}&rdquo;
        </blockquote>
        <figcaption className="text-xs leading-relaxed text-ink-soft">
          {FEATURED_REVIEW.name} · {formatReviewDate(FEATURED_REVIEW.date)} · About {FEATURED_REVIEW.about}. From
          our years with {pastWork.source}, before we opened Premier Shade Solutions.{" "}
          <Link href="/reviews" className="underline underline-offset-4 hover:text-charcoal">
            Read every review
          </Link>
        </figcaption>
      </figure>
    </Reveal>
  );
}
```

In `components/booking/BookingBlock.tsx`:
- Delete `FAMILY_LINE`, `featured`, `PROMISES` and the now-unused imports (`Link`, `formatReviewDate`, `Stars`, `pastReviews`, `pastWork`; keep `Reveal` only if still used — it is not after the change).
- Add `import { FAMILY_LINE, PromiseRow } from "./PromiseRow";`, `import { FeaturedReviewCard } from "./FeaturedReview";` and `export { FAMILY_LINE };`.
- Replace the `{showReview && featured ? (<Reveal …>…</Reveal>) : null}` block with:

```tsx
            {showReview ? (
              <FeaturedReviewCard className="relative -mt-14 mx-4 sm:mx-8 lg:absolute lg:bottom-8 lg:left-8 lg:m-0 lg:max-w-sm" />
            ) : null}
```

- Replace the `<Reveal className="flex flex-col gap-5 lg:pr-24">…</Reveal>` block with `<PromiseRow className="lg:pr-24" />`.

- [ ] **Step 4: Run to verify nothing moved**

Run: `npx vitest run --maxWorkers=2 tests/booking tests/routes tests/reviews.test.tsx tests/seo`
Expected: PASS — including every existing `booking-block.test.tsx` case, unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/booking tests/booking/promise-row.test.tsx
git commit -m "refactor: promise row and featured review card become shared pieces of BookingBlock"
```

---

### Task 4: Serif headings and the photo hero

**Files:**
- Modify: `app/globals.css` (after the `h1, h2, h3, h4 { … }` rule)
- Create: `components/treatment/TreatmentHero.tsx`
- Test: `tests/treatment/treatment-hero.test.tsx`

**Interfaces:**
- Consumes: `HeroForm` (`components/forms/HeroForm`), `Breadcrumbs`/`Crumb` (`components/product/ProductParts`), `FeaturedReviewCard` (Task 3), `Photo`.
- Produces: `export function TreatmentHero({ photo, trail, eyebrow, title, lead, treatment }: { photo: Photo; trail: Crumb[]; eyebrow: string; title: string; lead: string; treatment: string })` — renders `<section id="book">`.

- [ ] **Step 1: Write the failing test**

`tests/treatment/treatment-hero.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TreatmentHero } from "@/components/treatment/TreatmentHero";
import { consultationPhoto } from "@/content/gallery";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 })));
});
afterEach(() => vi.unstubAllGlobals());

const hero = () =>
  render(
    <TreatmentHero
      photo={consultationPhoto}
      trail={[{ name: "Shades", url: "/shades" }]}
      eyebrow="Soft light, or none at all."
      title="Shades in Las Vegas"
      lead="Roller, solar and cellular shades for Las Vegas homes."
      treatment="Shades"
    />,
  );

describe("TreatmentHero", () => {
  it("is the booking section: one serif h1, eyebrow, lead, breadcrumbs and one photo", () => {
    const { container } = hero();
    const section = container.querySelector("section#book")!;
    expect(section).not.toBeNull();
    const h1 = screen.getByRole("heading", { level: 1, name: "Shades in Las Vegas" });
    expect(h1.className).toContain("heading-serif");
    expect(screen.getByText("Soft light, or none at all.")).toBeInTheDocument();
    expect(screen.getByText(/Roller, solar and cellular shades/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(section.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });

  it("orders title, form, then review card, so a phone reaches the form first", () => {
    const { container } = hero();
    const h1 = container.querySelector("h1")!;
    const form = container.querySelector("form")!;
    const review = container.querySelector("figure")!;
    expect(h1.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(form.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("files the lead as a booking under the page's treatment", async () => {
    hero();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), "Dana Reyes");
    await user.type(screen.getByLabelText(/phone/i), "7025550134");
    await user.type(screen.getByLabelText(/email/i), "dana@example.com");
    await user.click(screen.getByRole("button", { name: /invite us over/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({ source: "booking", treatments: ["Shades"] });
    expect(document.getElementById("book-name")).not.toBeNull();
  });

  it("keeps the photo short on a phone and fills the section from lg up, with the slow zoom", () => {
    const { container } = hero();
    const frame = container.querySelector("section#book img")!.parentElement!;
    expect(frame.className).toContain("aspect-[16/7]");
    expect(frame.className).toContain("lg:absolute");
    expect(container.querySelector("img")!.className).toContain("animate-slow-zoom");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/treatment/treatment-hero.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the heading class**

In `app/globals.css`, directly after the `h1, h2, h3, h4 { … }` block:

```css
/* Category and product pages: big headings in the body serif (spec 2026-10-01 §7).
   Unlayered like the rule above, which a Tailwind utility could not beat. */
.heading-serif {
  font-family: var(--font-body);
  font-weight: 400;
  letter-spacing: -0.015em;
}
```

- [ ] **Step 4: Implement the hero**

`components/treatment/TreatmentHero.tsx`:

```tsx
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { HeroForm } from "@/components/forms/HeroForm";
import { Breadcrumbs, type Crumb } from "@/components/product/ProductParts";
import { FeaturedReviewCard } from "@/components/booking/FeaturedReview";
import type { Photo } from "@/content/products";

/**
 * The top of a category or product page (spec 2026-10-01 §3.1): one large photo
 * with the title on its left, the booking form floating on its right and the
 * featured review overlapping its lower edge. It is the page's #book section.
 * Markup order is title, form, review, so a phone reaches the form right after
 * the title (spec 2026-09-30 §8); the photo is a short band there to keep the
 * Invite Us Over button above a 390×844 fold.
 */
export function TreatmentHero({
  photo,
  trail,
  eyebrow,
  title,
  lead,
  treatment,
}: {
  photo: Photo;
  trail: Crumb[];
  eyebrow: string;
  title: string;
  lead: string;
  /** The category name, sent as the lead's treatment (see HeroForm). */
  treatment: string;
}) {
  return (
    <section id="book" className="relative scroll-mt-20 overflow-hidden bg-sand">
      <div className="relative aspect-[16/7] w-full lg:absolute lg:inset-0 lg:aspect-auto">
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          priority
          sizes="100vw"
          className="animate-slow-zoom object-cover"
        />
      </div>

      <Container className="relative">
        <div className="grid gap-6 py-6 lg:grid-cols-12 lg:gap-8 lg:py-16">
          <div className="flex flex-col gap-4 lg:col-span-6 lg:row-start-1 lg:bg-ivory/85 lg:p-10 lg:backdrop-blur-sm">
            <Breadcrumbs trail={trail} />
            <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
              {eyebrow}
            </p>
            <h1 className="heading-serif text-4xl leading-[1.05] text-charcoal md:text-6xl">{title}</h1>
            <p className="max-w-xl text-lg leading-relaxed text-ink-soft">{lead}</p>
          </div>

          <HeroForm
            idPrefix="book"
            source="booking"
            treatment={treatment}
            className="relative z-10 lg:col-start-9 lg:col-end-13 lg:row-span-2 lg:row-start-1 lg:self-start"
          />

          <FeaturedReviewCard className="lg:col-span-6 lg:row-start-2 lg:max-w-lg" />
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/treatment/treatment-hero.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/treatment/TreatmentHero.tsx tests/treatment/treatment-hero.test.tsx
git commit -m "feat: photo hero with the booking form and review card, serif headings"
```

---

### Task 5: Icon row, story section, photo cards, details band

**Files:**
- Create: `components/treatment/IconRow.tsx`, `components/treatment/StorySection.tsx`, `components/treatment/PhotoCardGrid.tsx`, `components/treatment/DetailsBand.tsx`
- Test: `tests/treatment/sections.test.tsx`

**Interfaces:**
- Consumes: `LineIcon`, `FabricPanel` (Task 2); `Highlight`, `Photo` (Task 1); `Section`, `Eyebrow` (`components/ui/Section`); `ButtonLink` (`components/ui/Button`); `Reveal`.
- Produces:
  - `export function IconRow({ items }: { items: Highlight[] })`
  - `export function StorySection({ eyebrow, heading, paragraphs, photo, panelLabel, caption }: { eyebrow: string; heading: string; paragraphs: string[]; photo?: Photo; panelLabel: string; caption: { eyebrow: string; line: string } })`
  - `export type PhotoCard = { href: string; name: string; tagline: string; photo?: Photo }`; `export function PhotoCardGrid({ heading, cards, flush = false }: { heading: string; cards: PhotoCard[]; flush?: boolean })` — `flush` drops the top padding when the grid follows another ivory section (the category page's story)
  - `export function DetailsBand({ features }: { features: string[] })`

- [ ] **Step 1: Write the failing tests**

`tests/treatment/sections.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { IconRow } from "@/components/treatment/IconRow";
import { StorySection } from "@/components/treatment/StorySection";
import { PhotoCardGrid } from "@/components/treatment/PhotoCardGrid";
import { DetailsBand } from "@/components/treatment/DetailsBand";
import { consultationPhoto } from "@/content/gallery";

describe("IconRow", () => {
  it("lists four labels, each with a decorative icon", () => {
    render(<IconRow items={[{ label: "Light control", icon: "sun" }, { label: "Privacy", icon: "eye" }, { label: "Energy savings", icon: "leaf" }, { label: "Desert-ready fabrics", icon: "home" }]} />);
    const items = within(screen.getByRole("list", { name: "Highlights" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Light control", "Privacy", "Energy savings", "Desert-ready fabrics"]);
    items.forEach((li) => expect(li.querySelector("svg[aria-hidden='true']")).not.toBeNull());
  });
});

describe("StorySection", () => {
  const props = {
    eyebrow: "More than a window covering",
    heading: "A Single Panel That Changes the Room",
    paragraphs: ["First paragraph of the intro.", "Second paragraph of the intro."],
    panelLabel: "Shades",
    caption: { eyebrow: "Chosen for this valley", line: "The right fabric for every exposure." },
  };

  it("shows eyebrow, serif h2, every paragraph, the caption card and Meet the family", () => {
    render(<StorySection {...props} photo={consultationPhoto} />);
    expect(screen.getByText(props.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: props.heading }).className).toContain("heading-serif");
    props.paragraphs.forEach((p) => expect(screen.getByText(p)).toBeInTheDocument());
    expect(screen.getByText(props.caption.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(props.caption.line)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meet the family" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });

  it("shows the fabric panel, and no photo, when there is none", () => {
    const { container } = render(<StorySection {...props} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[aria-hidden='true'].bg-sand")?.textContent).toBe("Shades");
  });
});

describe("PhotoCardGrid", () => {
  it("links each card, with its photo or the fabric panel", () => {
    const { container } = render(
      <PhotoCardGrid
        heading="Explore Shades"
        cards={[
          { href: "/shades/roller-shades", name: "Roller Shades", tagline: "One clean line of fabric.", photo: consultationPhoto },
          { href: "/shades/solar-shades", name: "Solar Shades", tagline: "See out. Keep the heat out." },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Explore Shades" })).toBeInTheDocument();
    const roller = screen.getByRole("link", { name: /Roller Shades/ });
    expect(roller).toHaveAttribute("href", "/shades/roller-shades");
    expect(roller.querySelector("img")).not.toBeNull();
    const solar = screen.getByRole("link", { name: /Solar Shades/ });
    expect(solar.querySelector("img")).toBeNull();
    expect(solar.querySelector("[aria-hidden='true'].bg-sand")).not.toBeNull();
    expect(container.querySelectorAll("h3")).toHaveLength(2);
  });
});

describe("DetailsBand", () => {
  it("lists every feature under a Details heading", () => {
    render(<DetailsBand features={["Cordless lift", "Blackout fabrics"]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Cordless lift", "Blackout fabrics"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/treatment/sections.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`components/treatment/IconRow.tsx`:

```tsx
import { Section } from "@/components/ui/Section";
import { LineIcon } from "@/components/ui/LineIcon";
import type { Highlight } from "@/content/products";

/** Four short reasons, each with a line icon (spec 2026-10-01 §3.3). */
export function IconRow({ items }: { items: Highlight[] }) {
  return (
    <Section tone="ivory" className="!py-10 md:!py-14">
      <ul aria-label="Highlights" className="grid grid-cols-2 gap-px bg-rule md:grid-cols-4">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col items-center gap-3 bg-ivory px-4 py-6 text-center">
            <LineIcon name={item.icon} className="size-8" />
            <span className="font-display text-xs font-medium uppercase tracking-[0.16em] text-charcoal">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

`components/treatment/StorySection.tsx`:

```tsx
import Image from "next/image";
import { Section, Eyebrow } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { FabricPanel } from "./FabricPanel";
import type { Photo } from "@/content/products";

/**
 * Big serif heading and the page's existing paragraphs beside a photo (or the
 * fabric panel) with a small caption card floating on it (spec 2026-10-01 §3.4).
 */
export function StorySection({
  eyebrow,
  heading,
  paragraphs,
  photo,
  panelLabel,
  caption,
}: {
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  photo?: Photo;
  panelLabel: string;
  caption: { eyebrow: string; line: string };
}) {
  return (
    <Section tone="ivory">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-6">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="heading-serif text-4xl leading-[1.1] text-charcoal md:text-5xl">{heading}</h2>
          <div className="flex max-w-[65ch] flex-col gap-5 text-lg leading-relaxed text-ink-soft">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>
          <div>
            <ButtonLink href="/about">Meet the family</ButtonLink>
          </div>
        </div>

        <div className="relative">
          {photo ? (
            <div className="relative aspect-4/5 w-full overflow-hidden bg-sand">
              <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
            </div>
          ) : (
            <FabricPanel label={panelLabel} className="aspect-4/5 w-full" />
          )}
          <Reveal delayMs={150} className="relative -mt-16 ml-auto mr-4 max-w-xs sm:mr-8 lg:absolute lg:bottom-8 lg:right-8 lg:m-0">
            <div className="flex flex-col gap-3 bg-ivory p-6 shadow-xl">
              <Eyebrow>{caption.eyebrow}</Eyebrow>
              <span aria-hidden="true" className="h-px w-8 bg-champagne" />
              <p className="text-base leading-relaxed text-charcoal">{caption.line}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
```

`components/treatment/PhotoCardGrid.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { FabricPanel } from "./FabricPanel";
import type { Photo } from "@/content/products";

export type PhotoCard = { href: string; name: string; tagline: string; photo?: Photo };

/** "Explore {Category}" / "Other {Category}": a photo (or the fabric panel) above each product's name. */
export function PhotoCardGrid({ heading, cards, flush = false }: { heading: string; cards: PhotoCard[]; flush?: boolean }) {
  return (
    <Section tone="ivory" className={flush ? "!pt-0" : undefined}>
      <h2 className="mb-8 font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
        {heading}
      </h2>
      <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.href}>
            <Link href={card.href} className="group flex h-full flex-col gap-4">
              {card.photo ? (
                <div className="relative aspect-4/3 w-full overflow-hidden bg-sand">
                  <Image
                    src={card.photo.src}
                    alt={card.photo.alt}
                    fill
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
              ) : (
                <FabricPanel label={card.name} className="aspect-4/3 w-full" />
              )}
              <h3 className="heading-serif text-2xl text-charcoal">{card.name}</h3>
              <p className="text-sm leading-relaxed text-ink-soft">{card.tagline}</p>
              <span aria-hidden="true" className="mt-auto font-display text-xs uppercase tracking-[0.16em] text-champagne-ink">
                Learn more →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

`components/treatment/DetailsBand.tsx`:

```tsx
import { Section } from "@/components/ui/Section";

/** A product's feature list as a two-column checklist (spec 2026-10-01 §4.5). */
export function DetailsBand({ features }: { features: string[] }) {
  return (
    <Section tone="sand">
      <h2 className="heading-serif mb-8 text-3xl text-charcoal">Details</h2>
      <ul className="grid gap-x-12 gap-y-4 md:grid-cols-2">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-base leading-relaxed text-charcoal">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-1 size-4 shrink-0 fill-none stroke-champagne-ink stroke-[2.5]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/treatment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/treatment tests/treatment/sections.test.tsx
git commit -m "feat: icon row, story section, photo cards and details band"
```

---

### Task 6: Rebuild the category page

**Files:**
- Modify: `app/(site)/[category]/page.tsx` (the default export; metadata and static params unchanged)
- Test: `tests/routes/treatment-pages.test.tsx` (new); `tests/routes/booking-pages.test.tsx`, `tests/seo/*` unchanged and passing.

**Interfaces:**
- Consumes: Tasks 1–5; `ReviewSpotlight` (`components/reviews/ReviewSpotlight`); `pastReviews` (`content/reviews`); `FEATURED_REVIEW` (Task 3); `ConsultationCta` (`components/product/ProductParts`).

- [ ] **Step 1: Write the failing page tests**

`tests/routes/treatment-pages.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CategoryPage from "@/app/(site)/[category]/page";
import CityPage from "@/app/(site)/service-area/[city]/page";
import ReviewsPage from "@/app/(site)/reviews/page";
import { categories } from "@/content/products";
import { consultationPhoto } from "@/content/gallery";
import { FEATURED_REVIEW } from "@/components/booking/FeaturedReview";

const category = (slug: string) => categories.find((c) => c.slug === slug)!;
const renderCategory = async (slug: string) => render(await CategoryPage({ params: Promise.resolve({ category: slug }) }));
const srcs = (root: Element) => Array.from(root.querySelectorAll("img")).map((img) => decodeURIComponent(img.getAttribute("src") ?? ""));

describe("category page redesign", () => {
  it("Shades: serif hero, icon row, story, photo cards, reviews band, closing CTA", async () => {
    const shades = category("shades");
    const { container } = await renderCategory("shades");

    expect(screen.getByRole("heading", { level: 1, name: "Shades in Las Vegas" }).className).toContain("heading-serif");
    expect(screen.getByText(shades.seo.description)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Highlights" })).getAllByRole("listitem").map((li) => li.textContent))
      .toEqual(shades.highlights.map((h) => h.label));
    expect(screen.getByRole("heading", { level: 2, name: shades.story.heading })).toBeInTheDocument();
    expect(screen.getByText(shades.story.caption.line)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meet the family" })).toHaveAttribute("href", "/about");

    expect(screen.getByRole("heading", { level: 2, name: "Explore Shades" })).toBeInTheDocument();
    const roller = screen.getByRole("link", { name: /Roller Shades/ });
    expect(roller).toHaveAttribute("href", "/shades/roller-shades");
    expect(roller.querySelector("img")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Solar Shades/ }).querySelector("img")).toBeNull();

    expect(screen.getByText(/In our clients/)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(FEATURED_REVIEW!.quote.slice(0, 30)))).toHaveLength(1);
    expect(screen.getByRole("link", { name: /invite us over/i })).toHaveAttribute("href", "#book");

    const all = srcs(container);
    expect(new Set(all).size).toBe(all.length);
  });

  it("Motorization: consultation photo in the hero, fabric panel in the story, no Explore grid", async () => {
    const { container } = await renderCategory("motorization");
    expect(srcs(container.querySelector("section#book")!)[0]).toContain(consultationPhoto.src);
    expect(screen.queryByRole("heading", { level: 2, name: /Explore/ })).toBeNull();
    const story = screen.getByRole("heading", { level: 2, name: category("motorization").story.heading }).closest("section")!;
    expect(story.querySelector("img")).toBeNull();
  });

  it("Blinds: product photos already used above become fabric panels on the cards", async () => {
    const { container } = await renderCategory("blinds");
    const cards = screen.getByRole("heading", { level: 2, name: "Explore Blinds" }).closest("section")!;
    expect(cards.querySelectorAll("img")).toHaveLength(0);
    const all = srcs(container);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("pages outside the redesign keep the booking block", () => {
  it("a city page has no serif hero", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: "henderson" }) }));
    expect(container.querySelector("section#book")).not.toBeNull();
    expect(container.querySelector(".heading-serif")).toBeNull();
  });

  it("the reviews page has no serif hero", async () => {
    const { container } = render(await ReviewsPage());
    expect(container.querySelector(".heading-serif")).toBeNull();
  });
});
```

(If `ReviewsPage` is not async, `render(<ReviewsPage />)` instead — check its signature in `app/(site)/reviews/page.tsx` before writing the test.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/routes/treatment-pages.test.tsx`
Expected: FAIL — no "Highlights" list, no serif h1.

- [ ] **Step 3: Rewrite the page body**

In `app/(site)/[category]/page.tsx` replace the imports of `Image`, `Section`, `PageHero`, `ProductCardList`, `BookingBlock` with:

```tsx
import { ConsultationCta } from "@/components/product/ProductParts";
import { TreatmentHero } from "@/components/treatment/TreatmentHero";
import { PromiseRow } from "@/components/booking/PromiseRow";
import { FEATURED_REVIEW } from "@/components/booking/FeaturedReview";
import { IconRow } from "@/components/treatment/IconRow";
import { StorySection } from "@/components/treatment/StorySection";
import { PhotoCardGrid } from "@/components/treatment/PhotoCardGrid";
import { Section } from "@/components/ui/Section";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { pastReviews } from "@/content/reviews";
import { uniquePhotos } from "@/lib/content/page-photos";
```

Replace the component's body after `const trail = …` with:

```tsx
  const [heroPhoto, storyPhoto, ...cardPhotos] = uniquePhotos([
    found.bookingPhoto ?? consultationPhoto,
    found.image,
    ...children.map((product) => product.image),
  ]);

  return (
    <>
      <JsonLd schema={breadcrumbSchema(trail)} />
      <TreatmentHero
        photo={heroPhoto!}
        trail={trail}
        eyebrow={found.tagline}
        title={`${found.name} in Las Vegas`}
        lead={found.seo.description}
        treatment={found.name}
      />
      <Section tone="sand" className="!py-10">
        <PromiseRow centered />
      </Section>
      <IconRow items={found.highlights} />
      <StorySection
        eyebrow={found.story.eyebrow}
        heading={found.story.heading}
        paragraphs={found.intro}
        photo={storyPhoto}
        panelLabel={found.name}
        caption={found.story.caption}
      />
      {children.length > 0 ? (
        <PhotoCardGrid
          flush
          heading={`Explore ${found.name}`}
          cards={children.map((product, index) => ({
            href: `/${found.slug}/${product.slug}`,
            name: product.name,
            tagline: product.tagline,
            photo: cardPhotos[index],
          }))}
        />
      ) : null}
      <ReviewSpotlight reviews={pastReviews.filter((review) => review.spotlight && review !== FEATURED_REVIEW)} />
      <ConsultationCta href="#book" />
    </>
  );
```

Leave `generateStaticParams`, `generateMetadata` and `dynamicParams` untouched.

- [ ] **Step 4: Run the page tests and every guard**

Run: `npx vitest run --maxWorkers=2 tests/routes tests/seo tests/booking tests/home.test.tsx`
Expected: PASS — the new file and the unchanged `booking-pages.test.tsx` (one form, one h1, form before the intro, `section#book` has exactly one img = `bookingPhoto ?? consultationPhoto`, no photo twice) and the SEO/photo guards.

- [ ] **Step 5: Commit**

```bash
git add "app/(site)/[category]/page.tsx" tests/routes/treatment-pages.test.tsx
git commit -m "feat: category pages in the new look — photo hero, icons, story, photo cards, reviews band"
```

---

### Task 7: Rebuild the product page

**Files:**
- Modify: `app/(site)/[category]/[product]/page.tsx` (default export only)
- Test: `tests/routes/treatment-pages.test.tsx` (extend)

**Interfaces:**
- Consumes: Tasks 1–6 components; `getSiblings` (`lib/content/products`); `DetailsBand`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/routes/treatment-pages.test.tsx` (add `import ProductPage from "@/app/(site)/[category]/[product]/page";` and `import { products } from "@/content/products";` at the top):

```tsx
const product = (slug: string) => products.find((p) => p.slug === slug)!;
const renderProduct = async (cat: string, slug: string) =>
  render(await ProductPage({ params: Promise.resolve({ category: cat, product: slug }) }));

describe("product page redesign", () => {
  it("Roller Shades: own photo in the hero, story photo, Best for, details, other shades as cards", async () => {
    const roller = product("roller-shades");
    const { container } = await renderProduct("shades", "roller-shades");

    expect(screen.getByRole("heading", { level: 1, name: "Roller Shades in Las Vegas" }).className).toContain("heading-serif");
    expect(srcs(container.querySelector("section#book")!)[0]).toContain(roller.image!.src);
    expect(screen.getByText(roller.seo.description)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Highlights" })).getAllByRole("listitem").map((li) => li.textContent))
      .toEqual(category("shades").highlights.map((h) => h.label));

    const story = screen.getByRole("heading", { level: 2, name: "Why Roller Shades" }).closest("section")!;
    expect(within(story).getByText("Shades")).toBeInTheDocument();
    expect(srcs(story)).toEqual([roller.storyPhoto!.src].map((s) => expect.stringContaining(s)));
    expect(within(story).getByText("Best for")).toBeInTheDocument();
    expect(within(story).getByText(roller.bestFor)).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeInTheDocument();
    roller.features.forEach((f) => expect(screen.getByText(f)).toBeInTheDocument());

    expect(screen.getByRole("heading", { level: 2, name: "Other Shades" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cellular Shades/ })).toHaveAttribute("href", "/shades/cellular-shades");
    expect(screen.getByText(/In our clients/)).toBeInTheDocument();

    const all = srcs(container);
    expect(new Set(all).size).toBe(all.length);
  });

  it("Solar Shades: consultation photo in the hero and the fabric panel in the story", async () => {
    const { container } = await renderProduct("shades", "solar-shades");
    expect(srcs(container.querySelector("section#book")!)[0]).toContain(consultationPhoto.src);
    const story = screen.getByRole("heading", { level: 2, name: "Why Solar Shades" }).closest("section")!;
    expect(story.querySelector("img")).toBeNull();
    expect(within(story).getByText(product("solar-shades").bestFor)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/routes/treatment-pages.test.tsx`
Expected: the two new product tests FAIL; the category tests still pass.

- [ ] **Step 3: Rewrite the page body**

In `app/(site)/[category]/[product]/page.tsx`, replace the imports of `Link`, `Section` (re-import below), `PageHero`, `BookingBlock` with the same block as Task 6 Step 3 plus `import { DetailsBand } from "@/components/treatment/DetailsBand";` (keep `ConsultationCta`, `JsonLd`, `productSchema`, `breadcrumbSchema`, `consultationPhoto`, `getProduct`, `getCategory`, `getSiblings`). Replace the body after `const trail = …` with:

```tsx
  const [heroPhoto, storyPhoto, ...cardPhotos] = uniquePhotos([
    found.image ?? consultationPhoto,
    found.storyPhoto,
    ...siblings.map((sibling) => sibling.image),
  ]);

  return (
    <>
      <JsonLd schema={productSchema(found)} />
      <JsonLd schema={breadcrumbSchema(trail)} />
      <TreatmentHero
        photo={heroPhoto!}
        trail={trail}
        eyebrow={found.tagline}
        title={`${found.name} in Las Vegas`}
        lead={found.seo.description}
        treatment={parent.name}
      />
      <Section tone="sand" className="!py-10">
        <PromiseRow centered />
      </Section>
      <IconRow items={parent.highlights} />
      <StorySection
        eyebrow={parent.name}
        heading={`Why ${found.name}`}
        paragraphs={found.body}
        photo={storyPhoto}
        panelLabel={found.name}
        caption={{ eyebrow: "Best for", line: found.bestFor }}
      />
      <DetailsBand features={found.features} />
      {siblings.length > 0 ? (
        <PhotoCardGrid
          heading={`Other ${parent.name}`}
          cards={siblings.map((sibling, index) => ({
            href: `/${parent.slug}/${sibling.slug}`,
            name: sibling.name,
            tagline: sibling.tagline,
            photo: cardPhotos[index],
          }))}
        />
      ) : null}
      <ReviewSpotlight reviews={pastReviews.filter((review) => review.spotlight && review !== FEATURED_REVIEW)} />
      <ConsultationCta
        title={`Thinking about ${found.name.toLowerCase()}?`}
        body="We bring samples to your windows, measure every opening, and quote before we leave. No charge and no obligation."
        href="#book"
      />
    </>
  );
```

- [ ] **Step 4: Run the full guard set**

Run: `npx vitest run --maxWorkers=2 tests/routes tests/seo tests/booking tests/treatment tests/products.test.ts`
Expected: PASS. Then the full suite once: `npx vitest run --maxWorkers=4` and reconcile "Test Files N passed" with `git ls-files | grep -cE '\.test\.(ts|tsx|mts)$'`. `npx tsc --noEmit` clean; `npx eslint` on every changed file clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(site)/[category]/[product]/page.tsx" tests/routes/treatment-pages.test.tsx
git commit -m "feat: product pages in the new look — photo hero, story with Best for, details, other products as cards"
```

---

### Task 8: Browser checks and screenshots

**Files:**
- Modify: `e2e/consultation.spec.ts`
- Create: `scripts/screenshot-redesign.mjs`

- [ ] **Step 1: Add the e2e tests**

Append to `e2e/consultation.spec.ts`:

```ts
test("a visitor can book from the photo hero on a category page", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/consultation", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/shades");
  const hero = page.locator("section#book");
  await hero.getByLabel("Name", { exact: true }).fill("Dana Reyes");
  await hero.getByLabel("Phone", { exact: true }).fill("7025550134");
  await hero.getByLabel("Email", { exact: true }).fill("dana@example.com");
  await hero.getByRole("button", { name: /invite us over/i }).click();

  await expect(page).toHaveURL(/\/thank-you$/);
  expect(posted).toMatchObject({ source: "booking", treatments: ["Shades"] });
});

test.describe("on a 390×844 phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ["/shades", "/motorization", "/shades/roller-shades", "/shades/solar-shades"]) {
    test(`${path} shows Invite Us Over without scrolling`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("section#book").getByRole("button", { name: /invite us over/i })).toBeInViewport();
    });
  }
});
```

- [ ] **Step 2: Run the e2e (foreground, production build via the config's webServer)**

Run: `npx playwright test e2e/consultation.spec.ts e2e/navigation.spec.ts --reporter=line`
Expected: every test passes; reconcile passed + failed + skipped + did not run to `--list`'s total. If a phone fold test fails, shorten the phone photo band (`aspect-[16/7]` → `aspect-[16/6]`) or tighten the title block's phone gaps in `TreatmentHero`, re-run Task 4's test and this step.

- [ ] **Step 3: Screenshot script for the owner**

`scripts/screenshot-redesign.mjs`:

```js
// Full-page screenshots of the redesigned pages for the owner's review.
// Usage: BASE=http://localhost:3200 OUT=<dir> node scripts/screenshot-redesign.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? ".";
const PAGES = ["/shades", "/motorization", "/blinds", "/shades/roller-shades", "/shades/solar-shades"];
const SIZES = [["desktop", 1440, 900], ["phone", 390, 844]];

const browser = await chromium.launch();
for (const [name, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    // Scroll through once so scroll-revealed blocks are shown, then back to the top.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${path.slice(1).replaceAll("/", "-")}-${name}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
```

- [ ] **Step 4: Commit**

```bash
git add e2e/consultation.spec.ts scripts/screenshot-redesign.mjs
git commit -m "test: book from a category hero; Invite Us Over above the fold on a phone; screenshot script"
```

- [ ] **Step 5: Controller — show the owner**

Start `npx next dev -p 3200` in the worktree, run the script with `OUT` set to the session scratchpad, view the screenshots, and show them to the owner with the local preview link. Merging `feat/page-redesign` (which contains `feat/family-brand`) into `main` and pushing deploys production — owner's explicit OK first, and confirm `git config user.email` is `whirleyjoshua@gmail.com` before any commit that will be pushed.
