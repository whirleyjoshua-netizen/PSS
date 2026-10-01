# Family Brand and Booking Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the public site around the family ("You let us into your home. We let you into our family."), turn every page an ad lands on into a booking page with the short form near the top, and give every public page at least one real photo.

**Architecture:** One new server component, `BookingBlock`, wraps the existing three-field `HeroForm` with a photo, the family line and one labelled past-work review. It goes directly under the page hero on category and product pages, replaces the long form on city pages and the bottom CTA on the reviews page. Photos come from a typed `Photo` on products and categories plus one shared stand-in, `consultationPhoto`. The homepage and About page are reworded and reordered as the spec describes. Guard tests prove the SEO inventory is unchanged and that every sitemap page shows a photo.

**Tech Stack:** Next.js (App Router, read `node_modules/next/dist/docs/` before touching framework APIs), React server components, Tailwind, `next/image`, zod, vitest + Testing Library, Playwright, sharp.

**Spec:** `docs/superpowers/specs/2026-09-30-family-brand-design.md` (§1–§7 family brand, §8 booking block and photos). Read both before starting.

## Global Constraints

- Work only in `C:\Users\whirl\pss\.claude\worktrees\family-brand` on branch `feat/family-brand`. Before the first edit run `git rev-parse --show-toplevel` and confirm it prints that path. Run `npm ci` once, since a fresh worktree has no `node_modules`.
- Slogan, verbatim: `You let us into your home. We let you into our family.`
- Never write "Las Vegas Strong" or "Vegas Strong". Never claim the family was born in Las Vegas. Local wording: `Family-run window treatments · Las Vegas valley`.
- Primary button text: `Invite Us Over`, always with a plain line saying it is a free in-home consultation. The header keeps `Free Consultation`.
- Children appear only on the About page. `public/brand/owners-family.webp` and `public/brand/family-pumpkin.webp` may be referenced from `app/(site)/about/page.tsx` and nowhere else.
- SEO is constraint #1. Root title/description, one `<h1>` per page, every internal link, canonical URLs, `localBusinessSchema`, sitemap and robots stay as they are. Category, product and city body copy is not edited.
- Past-work reviews must say they come from the owners' years before Premier Shade Solutions, and never go into Review/AggregateRating schema (`content/reviews.ts`).
- A photo is only ever used for a product it truly shows (spec §8). Every `<img>` that is not decorative has meaningful alt text.
- Tests: `npx vitest run <files> --maxWorkers=2`. Full suite: `npx vitest run --maxWorkers=2`. Types: `npx next typegen` then `npx tsc --noEmit`. Lint: `npx eslint`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01R5SC2tqrNYQrLNKFkYmUCV
  ```
- Do not deploy and do not push. A push to main deploys production; the owner approves the release.

## Review Focus

1. **Two forms on one page share field ids.** If the homepage hero and a booking block ever render together, duplicate `id="hero-name"` breaks label clicks and accessibility. Expected: every form instance on a page uses distinct ids. Pinned in Task 1 (`idPrefix`) and Task 4 (product page has exactly one `form`).
2. **A city visitor's lead is recorded as Las Vegas.** The short form's hidden city defaults to Las Vegas. Expected: the Henderson page's form submits `city: "Henderson"`. Pinned in Task 5.
3. **An ad visitor on a phone has to scroll past the product essay to find the form.** Expected: the form comes before the first body paragraph in document order on every category and product page. Pinned in Task 4.
4. **A photo shown for a product it does not show** (for example the lake-view sheer roller on Solar Shades). Expected: only the 7 photos named in spec §8 are used for products and categories. Every product photo is one of our own gallery photos with the same alt text. Pinned in Task 2.
5. **A past-work review shown without its "before Premier Shade" label** in the new block. Expected: the booking block always says where the quote came from. Pinned in Task 3.

---

## File map

| File | Change |
|---|---|
| `lib/leads/schema.ts` | `LEAD_SOURCES` gains `"booking"`, exports `LeadSource` |
| `lib/analytics/events.ts` | `trackLead` takes `LeadSource` |
| `components/forms/useConsultationForm.ts` | takes `LeadSource` |
| `components/forms/HeroForm.tsx` | props `idPrefix`, `source`, `city`; new heading, sub, button |
| `components/forms/ConsultationForm.tsx` | button `Invite Us Over` + plain line |
| `components/product/ProductParts.tsx` | `ConsultationCta` button `Invite Us Over` + plain line |
| `content/products.ts` | `Photo` type, `Product.image`, Blinds category image, 6 product images |
| `content/gallery.ts` | uses `Photo`, exports `consultationPhoto` |
| `components/booking/BookingBlock.tsx` | new |
| `app/(site)/[category]/page.tsx`, `app/(site)/[category]/[product]/page.tsx` | booking block under the hero |
| `app/(site)/service-area/[city]/page.tsx` | long form → booking block with city |
| `app/(site)/reviews/page.tsx` | bottom CTA → booking block |
| `app/(site)/contact/page.tsx` | consultation photo in the aside |
| `content/business.ts` | tagline → slogan |
| `app/(site)/opengraph-image.tsx` | alt text |
| `components/home/Hero.tsx`, `components/home/Sections.tsx`, `app/(site)/page.tsx` | homepage per spec §3 |
| `public/brand/family-pumpkin.webp` | new, from `C:\Users\whirl\Downloads\IMG_7127.jpg` |
| `app/(site)/about/page.tsx` | Meet the family per spec §4 |
| tests | see each task |
| `e2e/consultation.spec.ts` | button names |

---

### Task 1: Lead source "booking" and the "Invite Us Over" wording on every public form

**Files:**
- Modify: `lib/leads/schema.ts:41`, `lib/analytics/events.ts:23`, `components/forms/useConsultationForm.ts:18`, `components/forms/HeroForm.tsx`, `components/forms/ConsultationForm.tsx:171-175`, `components/product/ProductParts.tsx` (`ConsultationCta`)
- Test: `tests/forms/consultation-form.test.tsx`, `tests/home.test.tsx`, `e2e/consultation.spec.ts`, new `tests/leads/lead-source.test.ts`

**Interfaces:**
- Produces: `export const LEAD_SOURCES = ["hero", "contact", "booking"] as const; export type LeadSource = (typeof LEAD_SOURCES)[number];` in `lib/leads/schema.ts`.
- Produces: `HeroForm({ className?, idPrefix = "hero", source = "hero", city = business.serviceArea[0] }: { className?: string; idPrefix?: string; source?: LeadSource; city?: ServiceCity })` where `export type ServiceCity = (typeof business.serviceArea)[number];` is exported from `content/business.ts`.
- Produces: the button accessible name `Invite Us Over` on HeroForm, ConsultationForm and ConsultationCta.

- [ ] **Step 1: Write the failing tests**

Create `tests/leads/lead-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { consultationSchema, LEAD_SOURCES } from "@/lib/leads/schema";

const base = { name: "Dana Reyes", phone: "7025550134", email: "dana@example.com", city: "Henderson" };

describe("lead sources", () => {
  it("accepts a lead from the booking block", () => {
    const parsed = consultationSchema.safeParse({ ...base, source: "booking" });
    expect(parsed.success).toBe(true);
  });

  it("still refuses an unknown source", () => {
    expect(consultationSchema.safeParse({ ...base, source: "popup" }).success).toBe(false);
  });

  it("lists exactly the three public forms", () => {
    expect(LEAD_SOURCES).toEqual(["hero", "contact", "booking"]);
  });
});
```

In `tests/forms/consultation-form.test.tsx`, replace every `{ name: /consultation/i }` button query with `{ name: /invite us over/i }`, then add inside `describe("HeroForm", ...)`:

```tsx
  it("submits the booking source and the city it was given, with its own field ids", async () => {
    const user = userEvent.setup();
    render(<HeroForm idPrefix="book" source="booking" city="Henderson" />);

    expect(document.getElementById("book-name")).not.toBeNull();
    expect(document.getElementById("hero-name")).toBeNull();

    await fillHero(user);
    await user.click(screen.getByRole("button", { name: /invite us over/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.source).toBe("booking");
    expect(body.city).toBe("Henderson");
  });

  it("says plainly that the button books a free in-home consultation", () => {
    render(<HeroForm />);
    expect(screen.getByRole("heading", { name: /free in-home consultation/i })).toBeInTheDocument();
    expect(screen.getByText(/no charge, no obligation/i)).toBeInTheDocument();
  });
```

Add a `describe("ConsultationForm", ...)` case (or extend the existing one):

```tsx
  it("labels its submit Invite Us Over with the free consultation line beside it", () => {
    render(<ConsultationForm />);
    expect(screen.getByRole("button", { name: /invite us over/i })).toBeInTheDocument();
    expect(screen.getByText(/free in-home consultation\. no charge, no obligation\./i)).toBeInTheDocument();
  });
```

In `tests/home.test.tsx` change `/request consultation/i` to `/invite us over/i`.

In `e2e/consultation.spec.ts` change `/request consultation/i` (lines 22, 72, 91 and any other) and `/request free consultation/i` (line 51) to `/invite us over/i`.

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

Run: `npx vitest run tests/leads/lead-source.test.ts tests/forms/consultation-form.test.tsx tests/home.test.tsx --maxWorkers=2`
Expected: FAIL. `LEAD_SOURCES` is not exported, `source: "booking"` is rejected, and no button is named "Invite Us Over".

- [ ] **Step 3: Implement**

`lib/leads/schema.ts`: above `consultationSchema` add

```ts
/** Every public form that creates a lead. The lead email and the admin show which one. */
export const LEAD_SOURCES = ["hero", "contact", "booking"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
```

and change line 41 to `source: z.enum(LEAD_SOURCES),`.

`content/business.ts`: after `export type Business = typeof business;` add

```ts
export type ServiceCity = (typeof business.serviceArea)[number];
```

`lib/analytics/events.ts`: `import type { LeadSource } from "@/lib/leads/schema";` and
`export const trackLead = (form: LeadSource) => send(EVENTS.lead, { form });`

`components/forms/useConsultationForm.ts`: `import type { LeadSource } from "@/lib/leads/schema";` (merge into the existing schema import) and change the signature to `export function useConsultationForm(source: LeadSource) {`.

`components/forms/HeroForm.tsx` becomes:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { business, type ServiceCity } from "@/content/business";
import type { LeadSource } from "@/lib/leads/schema";
import { useConsultationForm } from "./useConsultationForm";
import { FormMessage, Honeypot, TextField } from "./Field";

/**
 * Three fields, no scrolling. Detail is collected on the phone call — every
 * extra field here costs conversions, and we already have enough to call back.
 *
 * Used by the homepage hero and by the booking block on product, category,
 * city and reviews pages. `idPrefix` keeps field ids unique if two ever share
 * a page; `city` is the page's city so a Henderson lead is not filed as Las Vegas.
 */
export function HeroForm({
  className,
  idPrefix = "hero",
  source = "hero",
  city = business.serviceArea[0],
}: {
  className?: string;
  idPrefix?: string;
  source?: LeadSource;
  city?: ServiceCity;
}) {
  const { state, error, submit } = useConsultationForm(source);

  return (
    <div className={`bg-ivory p-6 shadow-xl sm:p-8 ${className ?? ""}`}>
      <h2 className="font-display text-xl font-light tracking-tight text-charcoal">
        Free in-home consultation
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        We bring the samples, measure every window and quote before we leave. No
        charge, no obligation.
      </p>

      <form onSubmit={submit} noValidate className="relative mt-6 flex flex-col gap-4">
        <Honeypot />
        <input type="hidden" name="city" value={city} readOnly />

        <TextField id={`${idPrefix}-name`} name="name" label="Name" autoComplete="name" required />
        <TextField
          id={`${idPrefix}-phone`}
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
        />
        <TextField
          id={`${idPrefix}-email`}
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
        />

        <FormMessage
          state={state}
          error={error}
          phone={business.phone}
          successTitle="Request received"
          successBody="We will reach out shortly to schedule your in-home consultation."
        />

        {state !== "success" ? (
          <Button type="submit" disabled={state === "submitting"} className="w-full">
            {state === "submitting" ? "Sending…" : "Invite Us Over"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
```

(`Honeypot` has no `id`, only `name="company"`, so it needs no prefix.)

`components/forms/ConsultationForm.tsx`, replace the submit block at the end of the form:

```tsx
      {state !== "success" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
          <Button type="submit" disabled={state === "submitting"} className="w-full sm:w-auto">
            {state === "submitting" ? "Sending…" : "Invite Us Over"}
          </Button>
          <p className="text-sm text-ink-soft">Free in-home consultation. No charge, no obligation.</p>
        </div>
      ) : null}
```

`components/product/ProductParts.tsx` `ConsultationCta`: replace the button row `<div className="flex flex-wrap gap-4">…</div>` with this, so the button says `Invite Us Over` and the plain line always sits under it:

```tsx
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            <ButtonLink href="/contact">Invite Us Over</ButtonLink>
            <a
              href={business.phone.href}
              className="inline-flex min-h-11 items-center whitespace-nowrap border border-ivory/40 px-6 py-3 font-display text-sm uppercase tracking-[0.14em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
            >
              {business.phone.display}
            </a>
          </div>
          <p className="text-sm text-sand/75">Free in-home consultation. No charge, no obligation.</p>
        </div>
```


- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/leads tests/forms tests/home.test.tsx tests/api --maxWorkers=2`
Expected: PASS. `tests/api` proves the route handler still accepts hero and contact.

- [ ] **Step 5: Prove the tests have power**

Temporarily change `LEAD_SOURCES` back to `["hero", "contact"]`. The booking-source tests must fail. Temporarily hard-code `value={business.serviceArea[0]}` in HeroForm. The Henderson test must fail. Restore both.

- [ ] **Step 6: Commit**

```bash
git add lib/leads/schema.ts lib/analytics/events.ts content/business.ts components/forms components/product/ProductParts.tsx tests/leads/lead-source.test.ts tests/forms/consultation-form.test.tsx tests/home.test.tsx e2e/consultation.spec.ts
git commit -m "feat: every public form says Invite Us Over beside a plain free-consultation line; the short form takes a source, a city and its own ids"
```

---

### Task 2: Photos in the content model

**Files:**
- Modify: `content/products.ts` (types at lines 28–48, Blinds category, 6 products), `content/gallery.ts`
- Test: new `tests/content/photos.test.ts`

**Interfaces:**
- Produces: `export type Photo = { src: string; alt: string };` in `content/products.ts`. `Category.image?: Photo` and `Product.image?: Photo`.
- Produces: `export const consultationPhoto: Photo` in `content/gallery.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/content/photos.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { categories, products } from "@/content/products";
import { consultationPhoto, gallery } from "@/content/gallery";

const onDisk = (src: string) => existsSync(path.join(process.cwd(), "public", src));

/** Spec §8: only photos that truly show the product. Changing this list is an owner decision. */
const PRODUCT_PHOTOS: Record<string, string> = {
  "vertical-blinds": "/gallery/sheer-vertical-patio-slider.webp",
  "wood-blinds": "/gallery/faux-wood-blinds-living-room.webp",
  "roller-shades": "/gallery/roller-shades-bay-window.webp",
  "cellular-shades": "/gallery/cellular-shades-great-room.webp",
  "transitional-shades": "/gallery/transitional-shades-slider-wall.webp",
  "plantation-shutters": "/gallery/plantation-shutters-dining-room.webp",
};

describe("photos in the content model", () => {
  it("gives exactly the approved products a photo", () => {
    const withPhoto = Object.fromEntries(
      products.filter((product) => product.image).map((product) => [product.slug, product.image!.src]),
    );
    expect(withPhoto).toEqual(PRODUCT_PHOTOS);
  });

  it("uses only our own gallery photos for products, with the gallery's reviewed alt text", () => {
    for (const product of products) {
      if (!product.image) continue;
      const match = gallery.find((item) => item.src === product.image!.src);
      expect(match, product.slug).toBeDefined();
      expect(product.image.alt).toBe(match!.alt);
    }
  });

  it("gives Blinds the faux wood photo beside its intro", () => {
    expect(categories.find((category) => category.slug === "blinds")?.image?.src).toBe(
      "/gallery/faux-wood-blinds-living-room.webp",
    );
  });

  it("points every photo at a real file with real alt text", () => {
    const photos = [
      consultationPhoto,
      ...categories.flatMap((category) => (category.image ? [category.image] : [])),
      ...products.flatMap((product) => (product.image ? [product.image] : [])),
    ];
    for (const photo of photos) {
      expect(onDisk(photo.src), photo.src).toBe(true);
      expect(photo.alt.trim().length, photo.src).toBeGreaterThan(20);
    }
  });

  it("never uses a family photo as the consultation stand-in", () => {
    expect(consultationPhoto.src).not.toMatch(/^\/brand\//);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/content/photos.test.ts --maxWorkers=2`
Expected: FAIL. `consultationPhoto` is not exported, and no product has `image`.

- [ ] **Step 3: Implement**

In `content/products.ts` above `export type Category` add

```ts
/** One of our own job photos. Alt text describes the treatment and the room. */
export type Photo = { src: string; alt: string };
```

change `image?: { src: string; alt: string };` in `Category` to `image?: Photo;`, and in `Product`, after `bestFor: string;`, add

```ts
  /**
   * A photo of our own install that truly shows this product (spec §8). Leave it
   * unset rather than borrow a photo of something similar; the booking block
   * then shows the consultation photo.
   */
  image?: Photo;
```

Add to the Blinds category, after `intro`:

```ts
    image: {
      src: "/gallery/faux-wood-blinds-living-room.webp",
      alt: "White faux wood blinds with wide slats on two windows above a grey sofa with patterned pillows.",
    },
```

Add `image` to each product, after its `bestFor` line, with alt text copied from `content/gallery.ts`:

```ts
// vertical-blinds
    image: {
      src: "/gallery/sheer-vertical-patio-slider.webp",
      alt: "Floor-to-ceiling sheer vertical blinds drawn across a patio slider in a living room, with the backyard visible through the fabric vanes.",
    },
// wood-blinds
    image: {
      src: "/gallery/faux-wood-blinds-living-room.webp",
      alt: "White faux wood blinds with wide slats on two windows above a grey sofa with patterned pillows.",
    },
// roller-shades
    image: {
      src: "/gallery/roller-shades-bay-window.webp",
      alt: "Light roller shades lowered in each window of a bay, with gridded transom windows left uncovered above.",
    },
// cellular-shades
    image: {
      src: "/gallery/cellular-shades-great-room.webp",
      alt: "White cellular shades lowered across two rows of windows in a vaulted great room with exposed wood beams and a stone fireplace.",
    },
// transitional-shades
    image: {
      src: "/gallery/transitional-shades-slider-wall.webp",
      alt: "Charcoal transitional sheer shades raised across a four-panel glass slider wall in a living room, with a river and balcony seating visible beyond.",
    },
// plantation-shutters
    image: {
      src: "/gallery/plantation-shutters-dining-room.webp",
      alt: "White plantation shutters on three windows in a dining room with blue walls and industrial pendant lights over the table.",
    },
```

(The `// slug` comments only show where each block goes. Do not paste them.)

In `content/gallery.ts` change the import to `import type { CategorySlug, Photo } from "./products";`, change `export type GalleryItem = { src: string; alt: string; treatment: CategorySlug; caption?: string; };` to `export type GalleryItem = Photo & { treatment: CategorySlug; caption?: string };`, and append:

```ts
/**
 * The photo beside every booking form and the homepage family section.
 *
 * A stand-in: the owners are taking a consultation photo (Shade with a
 * homeowner, samples, a window in view). When it exists, put it in
 * public/gallery/ and change this one constant. It must never be a photo
 * with the children in it; they appear only on the About page.
 */
export const consultationPhoto: Photo = {
  src: "/gallery/shades-open-living-room.webp",
  alt: "Light window shades on every window and on a pair of French doors in an open-plan living room with a large sectional sofa.",
};
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/content tests/products.test.ts tests/routes --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Prove power**

Point `wood-blinds`' `image.src` at `/gallery/plantation-shutters-bath.webp`. Two tests must fail: the approved list and the alt match. Restore it.

- [ ] **Step 6: Commit**

```bash
git add content/products.ts content/gallery.ts tests/content/photos.test.ts
git commit -m "feat: products and Blinds carry our own install photos where one truly shows them; a shared consultation photo stands in elsewhere"
```

---

### Task 3: The booking block

**Files:**
- Create: `components/booking/BookingBlock.tsx`
- Test: `tests/booking/booking-block.test.tsx`

**Interfaces:**
- Consumes: `HeroForm` props from Task 1, `Photo` and `consultationPhoto` from Task 2.
- Produces: `BookingBlock({ photo, city?, heading? }: { photo: Photo; city?: ServiceCity; heading?: string })`, rendered as `<section id="book">`. It also produces `export const FAMILY_LINE: string`.

- [ ] **Step 1: Write the failing test**

Create `tests/booking/booking-block.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingBlock, FAMILY_LINE } from "@/components/booking/BookingBlock";
import { consultationPhoto } from "@/content/gallery";

describe("BookingBlock", () => {
  it("puts the short form, the photo and the family line together", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} />);

    expect(screen.getByRole("button", { name: /invite us over/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
    expect(screen.getByText(FAMILY_LINE)).toBeInTheDocument();
    expect(container.querySelector("section#book")).not.toBeNull();
    expect(document.getElementById("book-name")).not.toBeNull();
  });

  it("says the review is from the owners' work before Premier Shade and links every review", () => {
    render(<BookingBlock photo={consultationPhoto} />);
    const quote = screen.getByRole("figure");

    expect(within(quote).getByText(/before we opened premier shade solutions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read every review/i })).toHaveAttribute("href", "/reviews");
  });

  it("files the lead under the page's city and the booking source", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} city="Summerlin" />);
    expect(container.querySelector('input[name="city"]')).toHaveValue("Summerlin");
  });

  it("shows a section heading only when the page gives one", () => {
    const { rerender } = render(<BookingBlock photo={consultationPhoto} />);
    expect(screen.queryByRole("heading", { level: 2, name: /in henderson/i })).toBeNull();

    rerender(<BookingBlock photo={consultationPhoto} heading="Book a free consultation in Henderson" />);
    expect(screen.getByRole("heading", { level: 2, name: "Book a free consultation in Henderson" })).toBeInTheDocument();
  });

  it("puts the form first on a phone", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} />);
    const form = container.querySelector("form")!;
    const image = container.querySelector("img")!;
    expect(form.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/booking --maxWorkers=2`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement**

Create `components/booking/BookingBlock.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { HeroForm } from "@/components/forms/HeroForm";
import { formatReviewDate } from "@/components/reviews/ReviewCard";
import type { ServiceCity } from "@/content/business";
import type { Photo } from "@/content/products";
import { pastReviews, pastWork } from "@/content/reviews";

export const FAMILY_LINE =
  "Shade and Josh measure, order and install every job themselves. No call center, no subcontractors.";

/** The first About-page spotlight quote; a fixed pick so the page is the same for every visitor. */
const featured = pastReviews.filter((review) => review.spotlight)[0];

/**
 * The short booking form with a photo, the family line and one past-work review.
 * It sits directly under the hero on every page an ad can land on (spec §8), so
 * on a phone the form is the first thing after the page title. The form comes
 * first in the markup and moves to the right on wide screens.
 */
export function BookingBlock({
  photo,
  city,
  heading,
}: {
  photo: Photo;
  city?: ServiceCity;
  heading?: string;
}) {
  return (
    <Section tone="sand" id="book">
      {heading ? (
        <h2 className="mb-10 text-3xl font-light tracking-tight text-charcoal">{heading}</h2>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-16">
        <HeroForm idPrefix="book" source="booking" city={city} className="lg:order-2" />

        <div className="flex flex-col gap-6 lg:order-1">
          <div className="relative aspect-4/3 w-full overflow-hidden bg-ivory">
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 1024px) 40rem, 100vw"
              className="object-cover"
            />
          </div>

          <p className="text-lg leading-relaxed text-charcoal">{FAMILY_LINE}</p>

          {featured ? (
            <figure className="flex flex-col gap-3 border-l-2 border-champagne pl-5">
              <blockquote className="text-ink-soft">&ldquo;{featured.quote}&rdquo;</blockquote>
              <figcaption className="text-xs text-ink-soft">
                {featured.name} · {formatReviewDate(featured.date)} · About {featured.about}. From
                our years with {pastWork.source}, before we opened Premier Shade Solutions.{" "}
                <Link href="/reviews" className="underline underline-offset-4 hover:text-charcoal">
                  Read every review
                </Link>
              </figcaption>
            </figure>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
```

If `ReviewCard.tsx` is a client module (`"use client"`), importing `formatReviewDate` from it into a server component still works, because it is a plain function. If the build objects, move `formatReviewDate` into `content/reviews.ts` and re-export it from `ReviewCard.tsx`.

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/booking tests/reviews.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Prove power**

Delete the "From our years with…" sentence. The labelling test must fail. Swap the markup order so the photo comes before the form. The phone-order test must fail. Restore both.

- [ ] **Step 6: Commit**

```bash
git add components/booking tests/booking
git commit -m "feat: a booking block — the short form, a photo, the family line and one labelled past-work review"
```

---

### Task 4: Category and product pages become booking pages

**Files:**
- Modify: `app/(site)/[category]/page.tsx`, `app/(site)/[category]/[product]/page.tsx`
- Test: new `tests/routes/booking-pages.test.tsx`

**Interfaces:**
- Consumes: `BookingBlock` (Task 3), `consultationPhoto` and `Product.image` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `tests/routes/booking-pages.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CategoryPage from "@/app/(site)/[category]/page";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import { categories, products } from "@/content/products";
import { consultationPhoto } from "@/content/gallery";

const imageSrcs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img")).map((img) => decodeURIComponent(img.getAttribute("src") ?? ""));

async function renderCategory(slug: string) {
  return render(await CategoryPage({ params: Promise.resolve({ category: slug }) }));
}
async function renderProduct(category: string, product: string) {
  return render(await ProductPage({ params: Promise.resolve({ category, product }) }));
}

/** On a phone the form must come before the essay, or the ad visitor never sees it. */
function expectFormBeforeCopy(container: HTMLElement, firstParagraph: string) {
  const form = container.querySelector("form");
  const copy = Array.from(container.querySelectorAll("p")).find((p) => p.textContent === firstParagraph);
  expect(form).not.toBeNull();
  expect(copy).toBeDefined();
  expect(form!.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe.each(categories.map((category) => [category.slug, category] as const))("/%s", (slug, category) => {
  it("has the booking form above the intro, once, with one h1", async () => {
    const { container } = await renderCategory(slug);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expectFormBeforeCopy(container, category.intro[0]);
  });

  it("shows the consultation photo in the booking block", async () => {
    const { container } = await renderCategory(slug);
    expect(imageSrcs(container).some((src) => src.includes(consultationPhoto.src))).toBe(true);
  });
});

describe.each(products.map((product) => [`${product.category}/${product.slug}`, product] as const))(
  "/%s",
  (_path, product) => {
    it("has the booking form above the body, once, with one h1", async () => {
      const { container } = await renderProduct(product.category, product.slug);
      expect(container.querySelectorAll("form")).toHaveLength(1);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expectFormBeforeCopy(container, product.body[0]);
    });

    it("shows its own photo, or the consultation photo when it has none", async () => {
      const { container } = await renderProduct(product.category, product.slug);
      const expected = product.image?.src ?? consultationPhoto.src;
      expect(imageSrcs(container).some((src) => src.includes(expected))).toBe(true);
    });
  },
);
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/routes/booking-pages.test.tsx --maxWorkers=2`
Expected: FAIL. There is no form on these pages.

- [ ] **Step 3: Implement**

`app/(site)/[category]/page.tsx`: add the imports `import { BookingBlock } from "@/components/booking/BookingBlock";` and `import { consultationPhoto } from "@/content/gallery";`. Directly after the `<PageHero … />` element, insert:

```tsx
      <BookingBlock photo={consultationPhoto} />
```

`app/(site)/[category]/[product]/page.tsx`: add the same two imports. Directly after `<PageHero … />`, insert:

```tsx
      <BookingBlock photo={found.image ?? consultationPhoto} />
```

Leave the bottom `ConsultationCta` on both pages. It still serves visitors who want the long form or a call.

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/routes tests/seo --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Prove power**

Move `<BookingBlock …/>` below the intro `Section` on the category page. Every category's "above the intro" test must fail. Restore it.

- [ ] **Step 6: Commit**

```bash
git add "app/(site)/[category]" tests/routes/booking-pages.test.tsx
git commit -m "feat: every category and product page opens with the booking form and a photo, before the copy"
```

---

### Task 5: City, reviews and contact pages

**Files:**
- Modify: `app/(site)/service-area/[city]/page.tsx`, `app/(site)/reviews/page.tsx`, `app/(site)/contact/page.tsx`
- Test: new `tests/routes/booking-other-pages.test.tsx`

**Interfaces:**
- Consumes: `BookingBlock`, `consultationPhoto`, `ServiceCity`.

- [ ] **Step 1: Write the failing test**

Create `tests/routes/booking-other-pages.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CityPage from "@/app/(site)/service-area/[city]/page";
import ReviewsPage from "@/app/(site)/reviews/page";
import ContactPage from "@/app/(site)/contact/page";
import { cities } from "@/content/cities";
import { consultationPhoto } from "@/content/gallery";

describe.each(cities.map((city) => [city.slug, city] as const))("/service-area/%s", (slug, city) => {
  it("books with the short form, filed under this city, under its own heading", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: slug }) }));

    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector('input[name="city"]')).toHaveValue(city.name);
    expect(
      screen.getByRole("heading", { level: 2, name: `Book a free consultation in ${city.name}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });
});

describe("/reviews", () => {
  it("ends with the booking block instead of a link away", () => {
    const { container } = render(<ReviewsPage />);
    expect(container.querySelector("section#book form")).not.toBeNull();
  });
});

describe("/contact", () => {
  it("shows the consultation photo beside the form", () => {
    render(<ContactPage />);
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/routes/booking-other-pages.test.tsx --maxWorkers=2`
Expected: FAIL. The city pages have the long form with the Las Vegas default city, and there is no image.

- [ ] **Step 3: Implement**

City page: remove the `ConsultationForm` import and add `import { BookingBlock } from "@/components/booking/BookingBlock";`, `import { consultationPhoto } from "@/content/gallery";` and `import type { ServiceCity } from "@/content/business";`. Replace the whole `<Section tone="ivory">` that holds "Book a free consultation in {found.name}" and `<ConsultationForm />` with:

```tsx
      <BookingBlock
        photo={consultationPhoto}
        city={found.name as ServiceCity}
        heading={`Book a free consultation in ${found.name}`}
      />
```

`tests/routes/cities.test.ts` already proves the city names equal `business.serviceArea`, which is what makes the cast safe.

Reviews page: replace the `ConsultationCta` import with `import { BookingBlock } from "@/components/booking/BookingBlock";` plus `import { consultationPhoto } from "@/content/gallery";`, keep `PageHero` imported, and replace `<ConsultationCta />` with `<BookingBlock photo={consultationPhoto} />`.

Contact page: add `import Image from "next/image";` and `import { consultationPhoto } from "@/content/gallery";`. As the first child of the `<aside>`, insert:

```tsx
            <div className="relative aspect-4/3 w-full overflow-hidden bg-sand">
              <Image
                src={consultationPhoto.src}
                alt={consultationPhoto.alt}
                fill
                sizes="(min-width: 1024px) 22rem, 100vw"
                className="object-cover"
              />
            </div>
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/routes tests/reviews.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Prove power**

Remove `city={…}` from the city page. All 3 non–Las Vegas cities must fail. Restore it.

- [ ] **Step 6: Commit**

```bash
git add "app/(site)/service-area" "app/(site)/reviews" "app/(site)/contact" tests/routes/booking-other-pages.test.tsx
git commit -m "feat: city pages book with the short form under their own city; reviews end with the booking block; contact shows a photo"
```

---

### Task 6: Homepage family redesign and the new slogan

**Files:**
- Modify: `content/business.ts:13`, `app/(site)/opengraph-image.tsx:4`, `components/home/Hero.tsx`, `components/home/Sections.tsx`, `app/(site)/page.tsx`
- Test: `tests/business.test.ts`, `tests/home.test.tsx`

**Interfaces:**
- Consumes: `consultationPhoto` (Task 2).
- Produces: `FamilySection()` in `components/home/Sections.tsx`. `MeetTheOwners` is deleted.

- [ ] **Step 1: Write the failing tests**

`tests/business.test.ts` line 17:

```ts
    expect(business.tagline).toBe("You let us into your home. We let you into our family.");
```

and add to that describe:

```ts
  it("never uses the Vegas Strong phrase anywhere in the content", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const dirs = ["content", "components", "app/(site)"];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
      );
    for (const file of dirs.flatMap(walk).filter((f) => /\.(ts|tsx)$/.test(f))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/vegas strong/i);
    }
  });
```

`tests/home.test.tsx`, add:

```tsx
  it("leads with the family: eyebrow, family section and its link to Meet the family", () => {
    render(<Home />);
    expect(screen.getByText("Family-run window treatments · Las Vegas valley")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /when you invite us in, you're inviting in family/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /meet the family/i })).toHaveAttribute("href", "/about");
  });

  it("never shows the children on the homepage", () => {
    const { container } = render(<Home />);
    for (const img of container.querySelectorAll("img")) {
      expect(decodeURIComponent(img.getAttribute("src") ?? "")).not.toMatch(/owners-family|family-pumpkin/);
    }
  });

  it("closes with Invite us over and the coffee line", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 2, name: /^invite us over$/i })).toBeInTheDocument();
    expect(screen.getByText(/you bring the coffee/i)).toBeInTheDocument();
  });

  it("orders the sections people, experience, trust, then products", () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? "";
    const at = (s: string) => text.indexOf(s);
    expect(at("inviting in family")).toBeLessThan(at("What it's like to work with us"));
    expect(at("What it's like to work with us")).toBeLessThan(at("Here is what our clients said"));
    expect(at("Here is what our clients said")).toBeLessThan(at("Every treatment, measured for your windows"));
  });
```

The heading text uses a curly apostrophe (`&rsquo;`). Write the test regexes with `[’']` in place of `'` (for example `/you[’']re inviting in family/i`), and use `What it’s like to work with us` in the order test if the source uses `&rsquo;`.

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/business.test.ts tests/home.test.tsx --maxWorkers=2`
Expected: FAIL on the tagline, the family section and the closing heading.

- [ ] **Step 3: Implement**

`content/business.ts` line 13: `tagline: "You let us into your home. We let you into our family.",`

`app/(site)/opengraph-image.tsx` line 4: `export const alt = "Premier Shade Solutions — You let us into your home. We let you into our family.";`

`components/home/Hero.tsx`: change the eyebrow text to `Family-run window treatments · Las Vegas valley`. Change the lead paragraph to:

```tsx
            <p className="max-w-xl text-lg text-sand/80">
              Shade and Josh measure, order and install every job themselves. No
              call center, no subcontractors.
            </p>
```

The H1 stays `{business.tagline}`, and HeroForm defaults already carry the form copy from Task 1.

`components/home/Sections.tsx`:
- `PROMISES` becomes:

```ts
const PROMISES = [
  { figure: "Free", label: "In-home consultation and measurement" },
  { figure: "Family-run", label: "Measured and installed by us, never subcontracted" },
  { figure: "4", label: "Valley cities served" },
];
```

- `PILLARS[1].title` becomes `"We do the work ourselves"`. In `WhyPremier`, the `SectionHeading` becomes `eyebrow="Working with us"` and `title="What it’s like to work with us"` (typographic apostrophe). The pillar bodies are unchanged.
- Delete `MeetTheOwners` and add in its place:

```tsx
/* ---------------------------------------------------------------- family */

export function FamilySection() {
  return (
    <Section tone="ivory">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="relative mx-auto aspect-4/3 w-full overflow-hidden bg-sand">
          <Image
            src={consultationPhoto.src}
            alt={consultationPhoto.alt}
            fill
            sizes="(min-width: 1024px) 36rem, 100vw"
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-5">
          <Eyebrow>Who you&rsquo;ll be working with</Eyebrow>
          <h2 className="text-3xl font-light tracking-tight text-charcoal md:text-4xl">
            When you invite us in, you&rsquo;re inviting in family
          </h2>
          <p className="text-ink-soft">
            We&rsquo;re a family-run business here in the Las Vegas valley. When we
            walk through your door, we&rsquo;re not thinking about the sale.
            We&rsquo;re thinking about how we&rsquo;d want someone to treat our own
            home. We&rsquo;ll listen, bring the samples, measure everything
            ourselves and stay with you from consultation to installation.
          </p>
          <div className="pt-2">
            <ButtonLink href="/about" variant="outline">
              Meet the family
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}
```

  Change the gallery import to `import { consultationPhoto, gallery } from "@/content/gallery";`.
- `ClosingCta`: the H2 text becomes `Invite us over`, the paragraph becomes `We&rsquo;ll bring the samples. You bring the coffee.`, and the button becomes `<ButtonLink href="/contact">Invite Us Over</ButtonLink>`. Under the button row add `<p className="text-sm text-sand/75">Free in-home consultation. No charge, no obligation.</p>`, wrapping the row and the line in `<div className="flex flex-col gap-3">` as in Task 1's `ConsultationCta`.

`app/(site)/page.tsx`:

```tsx
import { Hero } from "@/components/home/Hero";
import {
  TrustBar,
  CategoryGrid,
  WhyPremier,
  GalleryStrip,
  Testimonials,
  FamilySection,
  ServiceAreaBlock,
  ClosingCta,
} from "@/components/home/Sections";
import { PastWorkReviews } from "@/components/reviews/PastWorkReviews";

/** People, then the experience, then trust, then products (family brand spec §3). */
export default function Home() {
  return (
    <>
      <Hero />
      <TrustBar />
      <FamilySection />
      <WhyPremier />
      <Testimonials />
      <PastWorkReviews />
      <CategoryGrid />
      <GalleryStrip />
      <ServiceAreaBlock />
      <ClosingCta />
    </>
  );
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/business.test.ts tests/home.test.tsx tests/reviews.test.tsx tests/seo tests/layout --maxWorkers=2`
Expected: PASS. If the reviews test looks for "A husband-and-wife shop" or `MeetTheOwners` wording, update it to the new copy without weakening what it guards.

- [ ] **Step 5: Prove power**

Put `MeetTheOwners`' old image (`/brand/owners-family.webp`) into `FamilySection`. The children test must fail. Restore it.

- [ ] **Step 6: Commit**

```bash
git add content/business.ts "app/(site)/opengraph-image.tsx" components/home "app/(site)/page.tsx" tests/business.test.ts tests/home.test.tsx
git commit -m "feat: the homepage leads with the family — new slogan, family section, Invite us over close; no children on the homepage"
```

---

### Task 7: About becomes "Meet the family"

**Files:**
- Create: `public/brand/family-pumpkin.webp`
- Modify: `app/(site)/about/page.tsx`, `components/product/ProductParts.tsx` (no change if Task 1 is done)
- Test: new `tests/routes/about.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/routes/about.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AboutPage, { metadata } from "@/app/(site)/about/page";

describe("/about — Meet the family", () => {
  it("is titled Meet the family with one h1 and the same canonical", () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Meet the family");
    expect(metadata.title).toBe("Meet the Family | Premier Shade Solutions");
    expect(metadata.alternates?.canonical).toBe("/about");
  });

  it("tells the story in its four parts", () => {
    render(<AboutPage />);
    for (const lead of [
      "It started with Josh’s dad.",
      "Shade found the design side.",
      "Now it’s our family’s business.",
      "You let us into your home. We let you into our family.",
    ]) {
      expect(screen.getByText(lead)).toBeInTheDocument();
    }
  });

  it("shows both family photos with alt text and never names the children", () => {
    const { container } = render(<AboutPage />);
    const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
      decodeURIComponent(img.getAttribute("src") ?? ""),
    );
    expect(srcs.some((src) => src.includes("/brand/family-pumpkin.webp"))).toBe(true);
    expect(srcs.some((src) => src.includes("/brand/owners-family.webp"))).toBe(true);
    for (const img of container.querySelectorAll("img")) {
      expect((img.getAttribute("alt") ?? "").length).toBeGreaterThan(20);
    }
  });

  it("books with Invite Us Over", () => {
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: /invite us over/i })).toHaveAttribute("href", "/contact");
  });
});
```

Match the apostrophes in the test strings to the ones in the source (`’` in the page via `&rsquo;`).

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/routes/about.test.tsx --maxWorkers=2`
Expected: FAIL on the title and the photos.

- [ ] **Step 3: Convert the family photo, with location data removed**

Run from the worktree root:

```bash
node -e "const s=require('sharp');(async()=>{const i=await s('C:/Users/whirl/Downloads/IMG_7127.jpg').rotate().resize({width:768,withoutEnlargement:true}).webp({quality:80}).toFile('public/brand/family-pumpkin.webp');console.log(i);const m=await s('public/brand/family-pumpkin.webp').metadata();console.log('exif:',!!m.exif,'xmp:',!!m.xmp)})()"
```

Expected: a 768-px-wide file and `exif: false xmp: false`. If either is `true`, stop. The photo carries the family's home location.

- [ ] **Step 4: Implement the page**

Replace `app/(site)/about/page.tsx` from the top through the end of the story `Section`. Keep `ReviewSpotlight`, "How a job goes" and `ConsultationCta` below it unchanged.

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { pastReviews } from "@/content/reviews";

export const metadata: Metadata = {
  title: "Meet the Family | Premier Shade Solutions",
  description:
    "Premier Shade Solutions is a family-run window treatment company serving the Las Vegas valley. Shade designs, Josh installs, and we handle every job ourselves.",
  alternates: { canonical: "/about" },
};

/** The only page the children appear on (family brand spec §1). */
export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Who we are"
        title="Meet the family"
        trail={[{ name: "About", url: "/about" }]}
      />

      <Section tone="ivory">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,64ch)_minmax(0,24rem)] lg:gap-16">
          <div className="flex flex-col gap-6 text-lg leading-relaxed text-ink-soft">
            <p>
              <strong className="font-medium text-charcoal">It started with Josh&rsquo;s dad.</strong>{" "}
              He installed window treatments across Los Angeles, and Josh grew up on those jobs —
              learning to measure, mount and finish a window before most kids had a summer job. His
              dad has since passed, and a lot of how we work comes straight from him: do it right, do
              it yourself, and stand behind it.
            </p>
            <p>
              <strong className="font-medium text-charcoal">Shade found the design side.</strong>{" "}
              With Josh&rsquo;s encouragement she started designing, and she fell in love with it —
              not just the fabrics and the finishes, but the people: sitting down in someone&rsquo;s
              home, listening, and helping them get it exactly right. She became a top designer,
              first in Ohio and now here in Las Vegas.
            </p>
            <p>
              <strong className="font-medium text-charcoal">Now it&rsquo;s our family&rsquo;s business.</strong>{" "}
              Shade designs, Josh installs, and our kids are growing up around it the way Josh did.
              When you invite us into your home, you&rsquo;re working with us — not a call center,
              not a rotating crew.
            </p>
            <p className="font-display text-2xl font-light text-charcoal">
              You let us into your home. We let you into our family.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="relative aspect-4/3 w-full overflow-hidden bg-sand">
              <Image
                src="/brand/family-pumpkin.webp"
                alt="Shade and Josh sitting on the floor at home with their two young children, carving a big pumpkin together"
                fill
                sizes="(min-width: 1024px) 24rem, 100vw"
                className="object-cover"
              />
            </div>
            <div className="relative aspect-4/5 w-full overflow-hidden bg-sand">
              <Image
                src="/brand/owners-family.webp"
                alt="Josh and Shade standing outside in the sun, Josh holding their young daughter"
                fill
                sizes="(min-width: 1024px) 24rem, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </Section>
```

The story's `<strong>` lead and the rest of its paragraph are separate text nodes, so `getByText("It started with Josh’s dad.")` matches the `<strong>`. The page no longer uses `business`; remove that import if nothing else needs it. The bottom `ConsultationCta` already says `Invite Us Over` from Task 1.

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run tests/routes/about.test.tsx tests/reviews.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/brand/family-pumpkin.webp "app/(site)/about/page.tsx" tests/routes/about.test.tsx
git commit -m "feat: About becomes Meet the family — the story, both family photos, location data stripped"
```

---

### Task 8: SEO guard, every-page-has-a-photo guard, e2e and build

**Files:**
- Create: `tests/seo/seo-guard.test.tsx`, `tests/seo/every-page-has-a-photo.test.tsx`
- Modify: `e2e/consultation.spec.ts` (add a booking-block flow)

- [ ] **Step 1: Write the guard tests**

`tests/seo/every-page-has-a-photo.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import sitemap from "@/app/sitemap";
import Home from "@/app/(site)/page";
import CategoryPage from "@/app/(site)/[category]/page";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import CityPage from "@/app/(site)/service-area/[city]/page";
import ContactPage from "@/app/(site)/contact/page";
import AboutPage from "@/app/(site)/about/page";
import GalleryPage from "@/app/(site)/gallery/page";
import ReviewsPage from "@/app/(site)/reviews/page";
import { categories, products } from "@/content/products";
import { cities } from "@/content/cities";

/** Legal text. The owner decides whether these get a photo (spec §8). */
const EXEMPT = ["/privacy", "/accessibility"];

const PAGES: [string, () => ReactElement | Promise<ReactElement>][] = [
  ["/", () => <Home />],
  ...categories.map((c) => [`/${c.slug}`, () => CategoryPage({ params: Promise.resolve({ category: c.slug }) })] as [string, () => Promise<ReactElement>]),
  ...products.map((p) => [`/${p.category}/${p.slug}`, () => ProductPage({ params: Promise.resolve({ category: p.category, product: p.slug }) })] as [string, () => Promise<ReactElement>]),
  ...cities.map((c) => [`/service-area/${c.slug}`, () => CityPage({ params: Promise.resolve({ city: c.slug }) })] as [string, () => Promise<ReactElement>]),
  ["/contact", () => <ContactPage />],
  ["/about", () => <AboutPage />],
  ["/gallery", () => <GalleryPage />],
  ["/reviews", () => <ReviewsPage />],
];

describe("every page has at least one photo", () => {
  it("checks every page in the sitemap, so a new page cannot slip through", () => {
    const inSitemap = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .filter((path) => !EXEMPT.includes(path));
    expect([...inSitemap].sort()).toEqual(PAGES.map(([path]) => path).sort());
  });

  it.each(PAGES)("%s shows a photo with alt text", async (_path, make) => {
    const { container } = render(await make());
    const described = Array.from(container.querySelectorAll("img")).filter(
      (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
    );
    expect(described.length).toBeGreaterThan(0);
  });
});
```

`tests/seo/seo-guard.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { metadata as rootMetadata } from "@/app/layout";
import Home from "@/app/(site)/page";
import AboutPage from "@/app/(site)/about/page";
import { localBusinessSchema } from "@/lib/seo/schema";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { cities } from "@/content/cities";

const hrefs = (container: HTMLElement) =>
  new Set(Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href")));

describe("SEO inventory survives the family redesign (spec §2)", () => {
  it("keeps the root title and description", () => {
    const title = rootMetadata.title as { default: string };
    expect(title.default).toBe("Custom Blinds, Shades & Shutters in Las Vegas | Premier Shade Solutions");
    expect(rootMetadata.description).toBeTruthy();
  });

  it("keeps every homepage internal link", () => {
    const links = hrefs(render(<Home />).container);
    for (const path of [
      ...categories.map((c) => `/${c.slug}`),
      ...cities.map((c) => `/service-area/${c.slug}`),
      "/gallery",
      "/about",
      "/contact",
      "/reviews",
      business.phone.href,
    ]) {
      expect(links.has(path), path).toBe(true);
    }
  });

  it("keeps exactly one h1 on the homepage and About", () => {
    expect(render(<Home />).container.querySelectorAll("h1")).toHaveLength(1);
    expect(render(<AboutPage />).container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("keeps the LocalBusiness essentials, with the new slogan", () => {
    const schema = localBusinessSchema() as Record<string, unknown>;
    expect(schema.name).toBe(business.name);
    expect(schema.telephone).toBe(business.phone.display);
    expect(schema.areaServed).toHaveLength(business.serviceArea.length);
    expect(schema.sameAs).toBeDefined();
    expect(schema.slogan).toBe("You let us into your home. We let you into our family.");
  });
});
```

Before relying on it, check `rootMetadata.description` against `app/layout.tsx` and replace `toBeTruthy()` with the exact string from that file. Check how `localBusinessSchema` is called and typed in `lib/seo/schema.ts`, and adjust the call if it takes arguments.

Add to `e2e/consultation.spec.ts`, using the file's existing route-mock pattern:

```ts
test("a visitor can book from the booking block on a product page", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/consultation", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/motorization");
  const block = page.locator("section#book");
  await block.getByLabel("Name").fill("Dana Reyes");
  await block.getByLabel("Phone").fill("7025550134");
  await block.getByLabel("Email").fill("dana@example.com");
  await block.getByRole("button", { name: /invite us over/i }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/thank you/i);
  expect(posted).toMatchObject({ source: "booking" });
});
```

- [ ] **Step 2: Run the guards**

Run: `npx vitest run tests/seo --maxWorkers=2`
Expected: PASS. If a page in the sitemap has no photo, fix the page, not the test.

- [ ] **Step 3: Prove power**

Remove `<BookingBlock …/>` from the product page. The photo guard must fail for the products without their own photo (for example `/outdoor/patio-shades`). Add a fake `{ url: business.domain + "/new-page" }` to the sitemap. The coverage test must fail. Restore both.

- [ ] **Step 4: Full verification**

Run each command and read its output before moving on:

```bash
npx vitest run --maxWorkers=2
npx next typegen && npx tsc --noEmit
npx eslint
npx next build
```

Expected: everything passes, and the build lists the same static routes as before (5 categories, 14 products, 4 cities).

Then run the e2e suite against `next start` on 127.0.0.1, as `pss-local-verification-quirks` describes, with the database pointed at a Neon test branch, never production. Run at least `e2e/consultation.spec.ts` and `e2e/navigation.spec.ts`. Expected: PASS.

- [ ] **Step 5: Look at it**

With `next start` running, open `/motorization`, `/shutters/plantation-shutters`, `/` and `/about` at 390 px width and at desktop width. Save the screenshots in the scratchpad. On a phone, the form must be the first thing after the page title. Report anything that looks wrong rather than calling it done.

- [ ] **Step 6: Commit**

```bash
git add tests/seo e2e/consultation.spec.ts
git commit -m "test: guards — the SEO inventory is unchanged and every sitemap page shows a photo; e2e books from a product page"
```

---

## After the plan (owner, not code)

- Release: merge to main and push, which deploys production. Then check live that the title, description, one h1 and the link set on `/` are unchanged, and that `/motorization` shows the form under the hero.
- Upload the conversion for the one ad lead and connect the Data Manager feed, so the booking block's leads are counted in Google Ads.
- Photograph a consultation (it replaces `consultationPhoto`) and, when possible, motorized shades, outdoor shades, roman, woven wood, solar shades and composite/wood shutters. Each new photo then becomes a one-line `image` addition.
