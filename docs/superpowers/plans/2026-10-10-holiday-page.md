# Holiday Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a noindex `/holiday` ad landing page that shows the 10% offer through Nov 15, switches to the "before the family arrives" message Nov 16 – Dec 24, then redirects to `/consultation`. Point the holiday banner at it.

**Architecture:**
- `content/holiday.ts` decides the stage from the dates in `content/promo.ts` (`isPromoLive`) and holds the page copy. Lead-time weeks come from `content/lead-times.ts`.
- The page is a server component with `export const revalidate = 60` (ISR, no Cache Components in this app), so it switches without a redeploy.
- The pains, steps and FAQ sections are lifted out of `ConsultationLanding` so both landing pages share them.
- Holiday leads arrive with `source: "holiday"`. While the offer is live they also carry a hidden note naming the 10%, so the lead email and admin show it. `leads.source` is plain text with no CHECK constraint (001_leads.sql), so no migration is needed.

**Tech Stack:** Next.js 16.3.3 (App Router, no cacheComponents), React, Tailwind, Vitest + Testing Library, Playwright, sharp.

## Global Constraints

- **Offer wording:**
  - "10% off 3 or more custom shades or blinds". Motorized counts; shutters are excluded.
  - "Book by Nov 15" means the consult is **booked** by Nov 15.
- **No promise that the quote comes "before we leave" or "on the spot".** No headcount promises ("two people", "same faces"). Always write "Shade’", with the mark.
- **No install-date promise.** Lead times always come from `content/lead-times.ts` and are never typed into copy.
- `/holiday` is `robots: { index: false, follow: true }` and is never in the sitemap.
- The phone fold holds: at 390×844 the "Invite Us Over" button inside `section#book` is fully in view.
- Git author is whirleyjoshua@gmail.com. Run Vitest as `npx vitest run --maxWorkers=2`. Commit before any mutation check.
- No push or deploy without the owner's OK. No Google Ads changes.

---

### Task 1: Lead source "holiday" and a hidden notes field on HeroForm

**Files:**
- Modify: `lib/leads/schema.ts:10`
- Modify: `components/forms/HeroForm.tsx`
- Test: `tests/leads/holiday-source.test.tsx` (create)

**Interfaces:**
- Produces:
  - `LeadSource` now includes `"holiday"`.
  - `HeroForm` has a new optional prop `notes?: string`, rendered as `<input type="hidden" name="notes">`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { consultationSchema } from "@/lib/leads/schema";
import { HeroForm } from "@/components/forms/HeroForm";

const lead = { name: "Dana Reyes", phone: "7025550134", email: "dana@example.com", city: "Las Vegas" };

describe("holiday leads", () => {
  it("accepts 'holiday' as a lead source", () => {
    expect(consultationSchema.safeParse({ ...lead, source: "holiday" }).success).toBe(true);
  });

  it("sends a page's note as a hidden notes field", () => {
    const { container } = render(<HeroForm source="holiday" notes="Holiday special" />);
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"][name="notes"]')?.value).toBe("Holiday special");
  });

  it("sends no notes field when the page has none", () => {
    const { container } = render(<HeroForm />);
    expect(container.querySelector('input[name="notes"]')).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/leads/holiday-source.test.tsx --maxWorkers=2`. Expected: the first two tests FAIL.

- [ ] **Step 3: Implement**
  - In `lib/leads/schema.ts`: `export const LEAD_SOURCES = ["hero", "contact", "booking", "holiday"] as const;`
  - In `HeroForm`:
    - Add `notes?: string` to props and destructure it.
    - After the treatments hidden input, add `{notes ? <input type="hidden" name="notes" value={notes} readOnly /> : null}`.
    - Add one line to the doc comment: `` `notes` rides along as the lead's notes (the holiday page names its offer there). ``

- [ ] **Step 4:** Rerun the test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/leads/schema.ts components/forms/HeroForm.tsx tests/leads/holiday-source.test.tsx
git commit -m "feat(leads): 'holiday' lead source and a hidden notes field on HeroForm"
```

### Task 2: Share the landing sections

**Files:**
- Create: `components/consultation/LandingSections.tsx`
- Modify: `components/consultation/ConsultationLanding.tsx`
- Test: `tests/routes/consultation-landing.test.tsx` (unchanged; must stay green)

**Interfaces:**
- Produces:
  - `PainsSection()`
  - `HowItWorks()`
  - `QuestionsSection({ faq }: { faq: { q: string; a: string }[] })`

- [ ] **Step 1:** Move three JSX blocks from `ConsultationLanding` into `LandingSections.tsx`, verbatim:
  - The `<Section tone="ivory">` pains block becomes `PainsSection`.
  - The "How it works" `<Section tone="sand">` becomes `HowItWorks`.
  - The "Common questions" section becomes `QuestionsSection`, with `FAQ.map` replaced by `faq.map`.
  - The imports (`Section`, `Reveal`, `PAINS`, `STEPS`) move with them.

- [ ] **Step 2:** In `ConsultationLanding`, render `<PainsSection />`, `<HowItWorks />` and `<QuestionsSection faq={FAQ} />` in their old places.

- [ ] **Step 3:** Run `npx vitest run tests/routes/consultation-landing.test.tsx --maxWorkers=2`. Expected: PASS, unchanged.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(consultation): pains, steps and questions sections are shared components"
```

### Task 3: The holiday photo joins the gallery

**Files:**
- Copy: `~/Desktop/IMG_2082.JPG` → `Images/IMG_2082.JPG` (gitignored source)
- Modify: `scripts/gallery-webp.mjs` (add the mapping)
- Create: `public/gallery/cellular-shades-holiday-great-room.webp`
- Modify: `content/gallery.ts`
- Test: `tests/content/photos.test.ts`

**Interfaces:**
- Produces: `export const holidayPhoto: GalleryItem` in `content/gallery.ts`. It is also the first item of `gallery`.

- [ ] **Step 1: Write the failing test.** Append to `tests/content/photos.test.ts`:

```ts
it("puts the owner's holiday install in the gallery and uses it as the holiday photo (owner 2026-10-10)", async () => {
  const { holidayPhoto } = await import("@/content/gallery");
  expect(holidayPhoto.src).toBe("/gallery/cellular-shades-holiday-great-room.webp");
  expect(gallery).toContainEqual(holidayPhoto);
  expect(onDisk(holidayPhoto.src)).toBe(true);
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.

- [ ] **Step 3: Implement**
  - Add `"IMG_2082.JPG": "cellular-shades-holiday-great-room",` to `PHOTOS`.
  - Run `node scripts/gallery-webp.mjs`. It writes 1536×926 WebP; EXIF and GPS are stripped.
  - In `content/gallery.ts`:

```ts
/** The owner's own holiday install (owner 2026-10-10: the client is fine with it on the site). The /holiday hero. */
export const holidayPhoto: GalleryItem = {
  src: "/gallery/cellular-shades-holiday-great-room.webp",
  alt: "White cellular shades lowered partway across a tall wall of windows in a great room decorated for Christmas, with a flocked tree by a stone fireplace and a dining table set in green plaid.",
  treatment: "shades",
  caption: "Cellular shades on a two-story window wall — they soften the light for the holidays and keep the upper glass open to the trees.",
};
```

  and make `holidayPhoto` the first entry of `gallery`.

- [ ] **Step 4:** Run `npx vitest run tests/content --maxWorkers=2`. Expected: PASS.

- [ ] **Step 5: Commit** the script, the webp, `gallery.ts` and the test: "feat(gallery): the owner's holiday great-room install".

### Task 4: Holiday content and stage

**Files:**
- Create: `content/holiday.ts`
- Test: `tests/content/holiday.test.ts`

**Interfaces:**
- Produces:
  - `type HolidayStage = "offer" | "family" | "over"`
  - `holidayStage(now: Date): HolidayStage`
  - `HOLIDAY_OFFER_LINE: string`
  - `HOLIDAY_LEAD_NOTE: string`
  - `holidayLeadTimes(stage: "offer" | "family"): string`
  - `holidayFaq(stage: "offer" | "family"): { q: string; a: string }[]`
  - `HOLIDAY_ICONS: { label: string; icon: "home" | "sparkle" | "heart" }[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { HOLIDAY_OFFER_LINE, holidayFaq, holidayLeadTimes, holidayStage } from "@/content/holiday";
import { leadTimes } from "@/content/lead-times";

const at = (iso: string) => new Date(iso);
const weeks = (label: string) => {
  const t = leadTimes.find((l) => l.label === label)!;
  return `${t.minWeeks}–${t.maxWeeks} weeks`;
};

describe("holiday stage follows the banner's dates", () => {
  it("is the offer through the end of Nov 15 in Las Vegas", () => {
    expect(holidayStage(at("2026-10-10T12:00:00-07:00"))).toBe("offer");
    expect(holidayStage(at("2026-11-15T23:59:00-08:00"))).toBe("offer");
  });
  it("is the family message from Nov 16 through Dec 24", () => {
    expect(holidayStage(at("2026-11-16T00:00:00-08:00"))).toBe("family");
    expect(holidayStage(at("2026-12-24T23:59:00-08:00"))).toBe("family");
  });
  it("is over from Dec 25", () => {
    expect(holidayStage(at("2026-12-25T00:00:00-08:00"))).toBe("over");
  });
});

describe("holiday copy", () => {
  it("states the owner's offer: shades or blinds, consult booked by Nov 15", () => {
    expect(HOLIDAY_OFFER_LINE).toBe("10% off 3 or more custom shades or blinds. Book your free consult by Nov 15.");
  });
  it("takes its weeks from lead-times.ts and promises no date", () => {
    for (const text of [holidayLeadTimes("offer"), holidayFaq("offer")[0]!.a]) {
      expect(text).toContain(weeks("Shades"));
      expect(text).toContain(weeks("Shutters"));
      expect(text).not.toMatch(/guarantee|before Christmas|in time for/i);
    }
  });
  it("says shutters aren't part of the 10% only while the offer runs", () => {
    expect(holidayLeadTimes("offer")).toMatch(/Shutters aren't part of the 10%/);
    expect(holidayLeadTimes("family")).not.toMatch(/10%/);
  });
  it("drops the 10% question once the offer ends", () => {
    expect(holidayFaq("offer").map((f) => f.q)).toEqual(["Will it be installed by Christmas?", "What counts toward the 10%?"]);
    expect(holidayFaq("family").map((f) => f.q)).toEqual(["Will it be installed by Christmas?"]);
    expect(holidayFaq("offer")[1]!.a).toMatch(/shades or blinds.*motorized included.*Shutters aren't included/);
  });
});
```

- [ ] **Step 2:** Run it. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `content/holiday.ts`:

```ts
import { isPromoLive } from "@/lib/promo";
import { leadTimeSummary } from "@/lib/lead-times";
import { leadTimes } from "./lead-times";
import { holidayOffer, holidayPromo } from "./promo";

/**
 * The /holiday ad landing page (spec 2026-10-10). It follows the banner's dates in content/promo.ts: the 10% offer
 * while `holidayOffer` runs, the "before the family arrives" message while `holidayPromo` runs, then the page
 * redirects to /consultation. Owner 2026-10-10: the 10% covers 3+ custom shades or blinds, motorized included,
 * shutters excluded, with the consult booked by Nov 15.
 */
export type HolidayStage = "offer" | "family" | "over";

export function holidayStage(now: Date): HolidayStage {
  if (isPromoLive(holidayOffer, now)) return "offer";
  if (isPromoLive(holidayPromo, now)) return "family";
  return "over";
}

export const HOLIDAY_OFFER_LINE = "10% off 3 or more custom shades or blinds. Book your free consult by Nov 15.";

/** Rides along on an offer-window lead as its notes, so Shade’ knows to take the 10% off the quote. */
export const HOLIDAY_LEAD_NOTE = "Holiday special: 10% off 3+ custom shades or blinds (consult booked by Nov 15).";

const weeks = (label: string) => {
  const leadTime = leadTimes.find((l) => l.label === label)!;
  return `${leadTime.minWeeks}–${leadTime.maxWeeks} weeks`;
};

export function holidayLeadTimes(stage: "offer" | "family"): string {
  const line = `From your consult: ${leadTimeSummary(leadTimes)}.`;
  return stage === "offer" ? `${line} Shutters aren't part of the 10%.` : line;
}

export function holidayFaq(stage: "offer" | "family"): { q: string; a: string }[] {
  const christmas = {
    q: "Will it be installed by Christmas?",
    a: `Shades and blinds take ${weeks("Shades")} from your consult, and shutters ${weeks("Shutters")}. The sooner we come out, the better your chances. Your lead time is in writing on your quote, and if it lands after the holidays we put up temporary shades for free.`,
  };
  const tenOff = {
    q: "What counts toward the 10%?",
    a: "Three or more custom shades or blinds on one order, motorized included, with your consult booked by Nov 15. Shutters aren't included.",
  };
  return stage === "offer" ? [christmas, tenOff] : [christmas];
}

/** The three promises from the owner's holiday flyer. */
export const HOLIDAY_ICONS = [
  { label: "More comfort", icon: "home" },
  { label: "Beautiful curb appeal", icon: "sparkle" },
  { label: "A space you'll love", icon: "heart" },
] as const;
```

- [ ] **Step 4:** Rerun. Expected: PASS.
- [ ] **Step 5: Commit** "feat(holiday): holiday stage and copy, dated from the banner".

### Task 5: The /holiday page

**Files:**
- Create: `components/holiday/HolidayHero.tsx`
- Create: `components/holiday/HolidayLanding.tsx`
- Create: `app/(site)/holiday/page.tsx`
- Test: `tests/routes/holiday.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `HolidayLanding({ stage }: { stage: "offer" | "family" })`, and the default page export plus `metadata` and `revalidate`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", async (orig) => ({ ...(await orig<object>()), redirect }));

const page = async () => (await import("@/app/(site)/holiday/page")).default;
const atTime = (iso: string) => vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date(iso));
afterEach(() => vi.useRealTimers());

describe("/holiday", () => {
  it("is kept out of search, out of the sitemap, and rebuilt every minute", async () => {
    const mod = await import("@/app/(site)/holiday/page");
    expect(mod.metadata.robots).toEqual({ index: false, follow: true });
    expect(mod.revalidate).toBe(60);
    const sitemap = (await import("@/app/sitemap")).default;
    expect(sitemap().some((e) => e.url.endsWith("/holiday"))).toBe(false);
  });

  it("shows the 10% offer on Nov 10, with one form that files a holiday lead noting the offer", async () => {
    atTime("2026-11-10T12:00:00-08:00");
    const Page = await page();
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Get your home ready for the\s*Holidays/);
    expect(screen.getByText("10% off 3 or more custom shades or blinds. Book your free consult by Nov 15.")).toBeInTheDocument();
    expect(screen.getByText("What counts toward the 10%?")).toBeInTheDocument();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector<HTMLInputElement>('input[name="notes"]')?.value).toMatch(/10%/);
    for (const label of ["More comfort", "Beautiful curb appeal", "A space you'll love"]) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("drops every 10% mention on Nov 16 and shows the family message", async () => {
    atTime("2026-11-16T09:00:00-08:00");
    const Page = await page();
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Give your home a fresh look before the family arrives.");
    expect(container.textContent).not.toMatch(/10%/);
    expect(container.querySelector('input[name="notes"]')).toBeNull();
  });

  it("redirects to /consultation from Dec 25", async () => {
    atTime("2026-12-25T08:00:00-08:00");
    const Page = await page();
    expect(() => render(<Page />)).toThrow("redirect:/consultation");
  });
});
```

- [ ] **Step 2:** Run it. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `components/holiday/HolidayHero.tsx`.** It follows `TreatmentHero`'s layout, so the phone fold holds.

```tsx
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { HeroForm } from "@/components/forms/HeroForm";
import { HOLIDAY_LEAD_NOTE, HOLIDAY_OFFER_LINE, holidayLeadTimes } from "@/content/holiday";
import type { Photo } from "@/content/products";

/**
 * The top of /holiday, in the mood of the owner's holiday flyer: the photo, a light wash, "Holidays" set large.
 * It is the page's #book section, laid out like TreatmentHero so Invite Us Over stays above a 390×844 fold
 * (e2e/consultation.spec.ts). The offer line shows at every width; the lead-time note from sm up.
 */
export function HolidayHero({ stage, photo }: { stage: "offer" | "family"; photo: Photo }) {
  return (
    <section id="book" className="relative scroll-mt-20 overflow-hidden bg-sand">
      <div className="relative aspect-[32/9] w-full overflow-hidden sm:aspect-[16/7] lg:absolute lg:inset-0 lg:aspect-auto">
        <Image src={photo.src} alt={photo.alt} fill priority sizes="100vw" className="animate-slow-zoom object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ivory/50 via-ivory/10 to-transparent" aria-hidden="true" />
      </div>

      <Container className="relative">
        <div className="grid gap-4 pb-6 pt-4 sm:gap-6 sm:pt-6 lg:grid-cols-12 lg:gap-8 lg:py-16">
          <div className="flex flex-col gap-3 sm:gap-4 lg:col-span-6 lg:row-start-1 lg:bg-ivory/85 lg:p-10 lg:backdrop-blur-sm">
            <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
              {stage === "offer" ? "Holiday special · Las Vegas valley" : "The holidays · Las Vegas valley"}
            </p>
            {stage === "offer" ? (
              <h1 className="text-charcoal">
                <span className="block font-display text-sm font-medium uppercase tracking-[0.24em] sm:text-base">
                  Get your home ready for the
                </span>{" "}
                <span className="heading-serif block text-5xl leading-none sm:text-6xl md:text-7xl">Holidays</span>
              </h1>
            ) : (
              <h1 className="heading-serif text-3xl leading-[1.05] text-charcoal sm:text-4xl md:text-6xl">
                Give your home a fresh look before the family arrives.
              </h1>
            )}
            {stage === "offer" ? (
              <p className="font-display text-base font-medium text-charcoal sm:text-lg">{HOLIDAY_OFFER_LINE}</p>
            ) : null}
            <p className="hidden max-w-xl leading-relaxed text-ink-soft sm:block">{holidayLeadTimes(stage)}</p>
          </div>

          <HeroForm
            idPrefix="book"
            source="holiday"
            notes={stage === "offer" ? HOLIDAY_LEAD_NOTE : undefined}
            introOnPhone={false}
            className="relative z-10 lg:col-start-9 lg:col-end-13 lg:row-start-1 lg:self-start"
          />
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: Implement `components/holiday/HolidayLanding.tsx`**

```tsx
import { ConsultationCta } from "@/components/product/ProductParts";
import { HowItWorks, PainsSection, QuestionsSection } from "@/components/consultation/LandingSections";
import { spotlightReviewsExceptFeatured } from "@/components/booking/FeaturedReview";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { Section } from "@/components/ui/Section";
import { FAQ } from "@/content/consultation";
import { holidayPhoto } from "@/content/gallery";
import { HOLIDAY_ICONS, holidayFaq } from "@/content/holiday";
import { HolidayHero } from "./HolidayHero";

const ICONS = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  sparkle: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
};

/** The holiday ad landing page (spec 2026-10-10): the flyer's look up top, then the proven /consultation sections. */
export function HolidayLanding({ stage }: { stage: "offer" | "family" }) {
  return (
    <>
      <HolidayHero stage={stage} photo={holidayPhoto} />

      <Section tone="sand" className="!py-10">
        <ul className="grid grid-cols-3 divide-x divide-rule text-center">
          {HOLIDAY_ICONS.map(({ label, icon }) => (
            <li key={label} className="flex flex-col items-center gap-2 px-2">
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-champagne-ink stroke-[1.5]" aria-hidden="true">
                {ICONS[icon]}
              </svg>
              <span className="font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal sm:text-sm">{label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <PainsSection />
      <ReviewSpotlight reviews={spotlightReviewsExceptFeatured} />
      <HowItWorks />
      <QuestionsSection faq={[...holidayFaq(stage), ...FAQ]} />

      <ConsultationCta
        href="#book"
        title="Ready for the holidays?"
        body="Samples in your own light, every window measured by the owner, and a written quote with your lead time on it."
      />
    </>
  );
}
```

- [ ] **Step 5: Implement `app/(site)/holiday/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HolidayLanding } from "@/components/holiday/HolidayLanding";
import { holidayStage } from "@/content/holiday";

/**
 * The holiday ad landing page (spec 2026-10-10). Kept out of search like /consultation. It is rebuilt at most a
 * minute after a request, so it follows the banner's dates without a redeploy; after Dec 24 it hands off to
 * /consultation so a stale ad never lands on a dead page.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Holiday Special | Premier Shade Solutions",
  description: "Get your Las Vegas home ready for the holidays. Free in-home consultation, every window measured and guaranteed.",
  robots: { index: false, follow: true },
};

export default function HolidayPage() {
  const stage = holidayStage(new Date());
  if (stage === "over") redirect("/consultation");
  return <HolidayLanding stage={stage} />;
}
```

- [ ] **Step 6:** Run `npx vitest run tests/routes/holiday.test.tsx tests/routes/consultation-landing.test.tsx --maxWorkers=2`. Expected: PASS.
- [ ] **Step 7: Commit**, then mutation-check: make `holidayStage` always return `"offer"` and confirm the Nov 16 and Dec 25 tests go red. Restore with `git checkout -- content/holiday.ts`.

### Task 6: The banner says "shades or blinds" and links to /holiday

**Files:**
- Modify: `content/promo.ts`
- Modify: `tests/layout/promo.test.ts:40,54-55`
- Modify: `tests/layout/promo-banner.test.tsx:30,81,171`
- Modify: `tests/content/consultation-claims.test.ts`

- [ ] **Step 1: Update the tests first**
  - Expect `href` `"/holiday"` for both promos.
  - Expect the message `/10% off 3 or more custom shades or blinds\. Book by Nov 15\./`.
  - Add a guard to `consultation-claims.test.ts`:

```ts
/** Owner 2026-10-10: the 10% covers shades or blinds; copy that says only "shades" under-sells it. */
describe("the holiday 10% names shades or blinds", () => {
  it("never says '10% off 3 or more custom shades' without 'or blinds'", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const offenders = ["app", "components", "content", "lib"]
      .flatMap(files)
      .filter((f) => /10% off 3 or more custom shades(?! or blinds)/i.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement**
  - Set `holidayOffer.message = "Holiday special: 10% off 3 or more custom shades or blinds. Book by Nov 15."`.
  - Set `href: "/holiday"` on both promos.
  - Update the offer's comment to the owner's 2026-10-10 terms.
- [ ] **Step 4:** Rerun. Expected: PASS. **Commit** "feat(promo): the holiday banner names shades or blinds and links to /holiday".

### Task 7: e2e, brand voice, full suite

**Files:**
- Modify: `e2e/consultation.spec.ts`
- Modify: `docs/marketing/brand-voice.md`

- [ ] **Step 1:**
  - Add `"/holiday"` to the 390×844 phone list (line ~170).
  - Add this test:

```ts
test("the holiday page files a holiday lead that names the offer", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/consultation", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.goto("/holiday");
  await page.getByLabel("Name", { exact: true }).fill("Dana Reyes");
  await page.getByLabel("Phone", { exact: true }).fill("7025550134");
  await page.getByLabel("Email", { exact: true }).fill("dana@example.com");
  await page.locator("section#book").getByRole("button", { name: /invite us over/i }).click();
  await expect(page).toHaveURL(/\/thank-you$/);
  expect(submitted).toMatchObject({ source: "holiday", notes: expect.stringMatching(/10%/) });
});
```

  This test is date-dependent: it holds through Nov 15, the life of the offer. Note that in a comment.
- [ ] **Step 2:** Add a "Holiday offer (2026)" entry to `brand-voice.md`. It covers the offer wording, "consult booked by Nov 15", shutters excluded, motorized included, and no install-date promise.
- [ ] **Step 3:** Run `npm run build`, then `npx next start -H 127.0.0.1 -p 3123`. Run the consultation e2e with `E2E_PORT=3123`, then `npx vitest run --maxWorkers=2`. Expected: all green.
- [ ] **Step 4: Commit.** Show the owner the page locally. Wait for approval before pushing.

### Task 8: Holiday ad lines for the doc

- [ ] Add a "Holiday ads" section to the Claude Doc "Google Ads Headlines – Second Ads" (claude.ai/artifact/WekrjQ3GngXGxaT8H5LgsV):
  - The full 15 headlines and 4 descriptions per ad group, counted.
  - Final URL `/holiday`.
  - The promotion asset (10% off, ends Nov 15).
  - The Nov 16 "before the family arrives" set.
  - The pause rules.
- Nothing is entered in Google Ads.
