# Premier Shade Solutions Marketing Website — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fast, SEO-optimized marketing website for a Las Vegas window treatment company that converts visitors into booked in-home consultations and writes every lead to a database the future internal order system will read.

**Architecture:** A statically rendered Next.js App Router application. All page content lives in typed TypeScript files under `content/` and is rendered through a small number of reusable templates, so twenty-one product pages and four city pages come from two templates and two data files rather than twenty-five hand-built pages. The only dynamic surface is a single route handler that accepts consultation requests, writes them to Neon Postgres, and sends a notification email.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Neon Postgres (`@neondatabase/serverless`) · Resend · Zod · Vitest · Playwright · Vercel

**Spec:** `docs/superpowers/specs/2026-08-26-marketing-website-design.md`

## Global Constraints

- **Brand palette, exact values, used only as design tokens.** Charcoal `#1E1E1E` · Warm Taupe `#7A7263` · Champagne `#CDB891` · Sand `#E7E1D6` · Ivory `#F7F5F0`. No color literal may appear in a component; every color reads from a token.
- **Champagne is not a text color.** It fails WCAG AA on ivory. Use it for fills, rules, and icons. Text on a champagne button is charcoal, never white.
- **Tagline, verbatim:** `Control the Light. Define the Space.`
- **Business name, verbatim:** `Premier Shade Solutions`
- **Service area:** Las Vegas, Henderson, Summerlin, North Las Vegas. Spring Valley may appear in prose but gets no page.
- **No drapery.** Excluded from launch by decision on 2026-08-26. The content model must support adding it as a data entry with no code change.
- **Phone and email are unknown.** They live only in `content/business.ts` as `PLACEHOLDER_PHONE` / `PLACEHOLDER_EMAIL` and must never be hardcoded anywhere else.
- **Accessibility:** WCAG 2.1 AA. Every interactive element has a visible focus state. Every image has alt text. One `<h1>` per page.
- **TypeScript strict mode on.** No `any`.
- **Every task ends with a commit.**

---

## File Structure

```
premier-shade-solutions/
├─ app/
│  ├─ layout.tsx                    Root layout: fonts, header, footer, base metadata
│  ├─ page.tsx                      Home
│  ├─ globals.css                   Tailwind import + brand tokens as CSS variables
│  ├─ [category]/
│  │  ├─ page.tsx                   Product hub template (blinds, shades, shutters, outdoor, motorization)
│  │  └─ [product]/page.tsx         Product detail template
│  ├─ service-area/[city]/page.tsx  City landing template
│  ├─ gallery/page.tsx
│  ├─ about/page.tsx
│  ├─ contact/page.tsx
│  ├─ privacy/page.tsx
│  ├─ accessibility/page.tsx
│  ├─ sitemap.ts                    Generated from content model
│  ├─ robots.ts
│  └─ api/consultation/route.ts     The only dynamic endpoint
├─ components/
│  ├─ brand/Logo.tsx                SVG mark + lockup, theme-aware
│  ├─ layout/Header.tsx             Sticky, tap-to-call, product nav
│  ├─ layout/Footer.tsx
│  ├─ ui/Button.tsx
│  ├─ ui/Container.tsx
│  ├─ ui/Section.tsx
│  ├─ forms/HeroForm.tsx            3 fields
│  ├─ forms/ConsultationForm.tsx    Full form
│  └─ home/*.tsx                    One file per homepage section
├─ content/
│  ├─ business.ts                   Single source of truth for NAP
│  ├─ products.ts                   Full taxonomy
│  ├─ cities.ts
│  ├─ gallery.ts
│  └─ testimonials.ts
├─ lib/
│  ├─ leads/schema.ts               Zod schemas, shared client + server
│  ├─ leads/db.ts                   Neon insert
│  ├─ leads/email.ts                Resend notification
│  └─ seo/schema.ts                 JSON-LD builders
├─ db/migrations/001_leads.sql
└─ tests/ + e2e/
```

Rationale for the two dynamic segment templates: product and city pages are structurally identical to each other within their group and differ only in data. Building them as templates means adding drapery later, or adding Spring Valley, is a data edit — which is exactly the property the spec asks for.

---

## Task 1: Project scaffold, brand tokens, and typography

**Files:**
- Create: the Next.js app at the repository root
- Create: `app/globals.css`, `app/layout.tsx`
- Create: `.gitignore`, `README.md`
- Test: `tests/tokens.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties `--color-charcoal`, `--color-taupe`, `--color-champagne`, `--color-sand`, `--color-ivory` and Tailwind utilities `bg-charcoal`, `text-taupe`, etc. Font CSS variables `--font-display` and `--font-body`.

- [ ] **Step 1: Initialize git and scaffold**

```bash
cd /c/Users/whirl/pss
git init
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias="@/*" --turbopack --yes
```

If `create-next-app` refuses because the directory is non-empty, scaffold into `.tmp-scaffold/` and move the generated files up, preserving `docs/` and `logofiles/`.

- [ ] **Step 2: Install dependencies**

```bash
npm install zod @neondatabase/serverless resend
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @playwright/test
```

- [ ] **Step 3: Write brand tokens into `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-charcoal: #1E1E1E;
  --color-taupe:    #7A7263;
  --color-champagne:#CDB891;
  --color-sand:     #E7E1D6;
  --color-ivory:    #F7F5F0;

  /* Champagne darkened to pass AA on ivory — use for links and small text only */
  --color-champagne-ink: #8A6D2F;

  --font-display: var(--font-jost), ui-sans-serif, system-ui, sans-serif;
  --font-body:    var(--font-source-serif), Georgia, serif;
}

html { scroll-behavior: smooth; }
body { background: var(--color-ivory); color: var(--color-charcoal); font-family: var(--font-body); }

:focus-visible { outline: 2px solid var(--color-champagne-ink); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

- [ ] **Step 4: Wire fonts in `app/layout.tsx`**

```tsx
import { Jost, Source_Serif_4 } from "next/font/google";

const jost = Jost({ subsets: ["latin"], weight: ["300","400","500"], variable: "--font-jost", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["400","600"], variable: "--font-source-serif", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jost.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, include: ["tests/**/*.test.{ts,tsx}"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 6: Write the failing token test**

```ts
// tests/tokens.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

describe("brand tokens", () => {
  const palette = {
    charcoal: "#1E1E1E",
    taupe: "#7A7263",
    champagne: "#CDB891",
    sand: "#E7E1D6",
    ivory: "#F7F5F0",
  };

  for (const [name, hex] of Object.entries(palette)) {
    it(`defines --color-${name} as ${hex}`, () => {
      expect(css).toContain(`--color-${name}: ${hex}`);
    });
  }

  it("respects prefers-reduced-motion", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});
```

- [ ] **Step 7: Run the test**

Run: `npm test`
Expected: PASS once Step 3 is in place. If it fails, the hex values were mistyped — fix them, do not change the test.

- [ ] **Step 8: Verify the app builds and commit**

```bash
npm run build
git add -A
git commit -m "feat: scaffold Next.js app with brand tokens and typography"
```

---

## Task 2: Business content and the SVG logo

**Files:**
- Create: `content/business.ts`, `components/brand/Logo.tsx`, `app/icon.svg`
- Test: `tests/business.test.ts`

**Interfaces:**
- Consumes: brand tokens from Task 1
- Produces: `business` object with `{ name, tagline, phone: { display, href, isPlaceholder }, email, address, hours, serviceArea, socials }`; `<Logo variant="lockup" | "mark" | "wordmark" tone="dark" | "light" />`

- [ ] **Step 1: Write `content/business.ts`**

```ts
export const PLACEHOLDER_PHONE = "(702) 000-0000";
export const PLACEHOLDER_EMAIL = "hello@premiershadesolutions.com";

export const business = {
  name: "Premier Shade Solutions",
  tagline: "Control the Light. Define the Space.",
  legalName: "Premier Shade Solutions LLC",
  phone: {
    display: PLACEHOLDER_PHONE,
    href: "tel:+17020000000",
    isPlaceholder: true,
  },
  email: PLACEHOLDER_EMAIL,
  emailIsPlaceholder: true,
  address: {
    locality: "Las Vegas",
    region: "NV",
    country: "US",
    isPlaceholder: true,
  },
  hours: "Monday–Saturday, by appointment",
  serviceArea: ["Las Vegas", "Henderson", "Summerlin", "North Las Vegas"],
  socials: {} as Record<string, string>,
  domain: "https://premiershadesolutions.com",
} as const;
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/business.test.ts
import { describe, it, expect } from "vitest";
import { business } from "@/content/business";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === ".next" || entry === ".git") return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("business content", () => {
  it("uses the exact approved tagline", () => {
    expect(business.tagline).toBe("Control the Light. Define the Space.");
  });

  it("covers the four service-area cities", () => {
    expect(business.serviceArea).toEqual([
      "Las Vegas", "Henderson", "Summerlin", "North Las Vegas",
    ]);
  });

  it("has no phone number hardcoded outside content/business.ts", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => walk(d))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /\(702\)|tel:\+1702/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npm test -- tests/business.test.ts`
Expected: PASS. The third test is a guard that will start failing later if someone hardcodes a phone number — that is its purpose.

- [ ] **Step 4: Build the SVG logo component**

The mark is four parallelograms of decreasing height, sheared to suggest hanging panels seen at an angle, left to right: charcoal, taupe, champagne, sand.

```tsx
// components/brand/Logo.tsx
type Tone = "dark" | "light";
type Variant = "lockup" | "mark" | "wordmark";

const SLATS = [
  { x: 0,  h: 100, light: "#1E1E1E", dark: "#F7F5F0" },
  { x: 26, h: 82,  light: "#7A7263", dark: "#B3AAA0" },
  { x: 52, h: 64,  light: "#CDB891", dark: "#CDB891" },
  { x: 78, h: 46,  light: "#E7E1D6", dark: "#8A8377" },
];

export function Logo({ variant = "lockup", tone = "light", className }: {
  variant?: Variant; tone?: Tone; className?: string;
}) {
  const key = tone === "dark" ? "dark" : "light";
  const ink = tone === "dark" ? "#F7F5F0" : "#1E1E1E";
  const accent = "#CDB891";

  const mark = (
    <g>
      {SLATS.map((s) => (
        <path
          key={s.x}
          d={`M${s.x} ${100 - s.h} L${s.x + 18} ${100 - s.h - 6} L${s.x + 18} ${94} L${s.x} ${100} Z`}
          fill={s[key]}
        />
      ))}
    </g>
  );

  if (variant === "mark") {
    return (
      <svg viewBox="0 0 96 100" className={className} role="img"
           aria-label="Premier Shade Solutions">
        {mark}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 420 100" className={className} role="img"
         aria-label="Premier Shade Solutions">
      {variant === "lockup" && mark}
      <text x={variant === "lockup" ? 118 : 0} y="52"
            fill={ink} fontFamily="var(--font-display)" fontSize="38"
            fontWeight="300" letterSpacing="9">PREMIER</text>
      <text x={variant === "lockup" ? 120 : 2} y="80"
            fill={accent} fontFamily="var(--font-display)" fontSize="15"
            fontWeight="400" letterSpacing="6.5">SHADE SOLUTIONS</text>
    </svg>
  );
}
```

Compare the rendered result against `logofiles/ChatGPT Image Aug 26, 2026, 12_32_40 AM.png` and adjust `SLATS` heights, shear, and letter-spacing until the proportions match. The reference is the source of truth for proportion.

- [ ] **Step 5: Create the favicon**

`app/icon.svg` — the mark alone on a charcoal ground, 32×32 viewBox, same four slats scaled to fit with 3px padding.

- [ ] **Step 6: Commit**

```bash
git add content/business.ts components/brand/Logo.tsx app/icon.svg tests/business.test.ts
git commit -m "feat: add business content model and SVG brand mark"
```

---

## Task 3: Product taxonomy content model

**Files:**
- Create: `content/products.ts`, `lib/content/products.ts`
- Test: `tests/products.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Product = { slug: string; name: string; category: CategorySlug; tagline: string; body: string[]; features: string[]; bestFor: string; image: string; seo: { title: string; description: string } }`
  - `type Category = { slug: CategorySlug; name: string; tagline: string; intro: string[]; image: string; seo: {...} }`
  - `categories: Category[]`, `products: Product[]`
  - `getCategory(slug): Category | undefined`
  - `getProduct(category: string, product: string): Product | undefined`
  - `getProductsIn(category: CategorySlug): Product[]`
  - `allProductPaths(): { category: string; product: string }[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/products.test.ts
import { describe, it, expect } from "vitest";
import { categories, products } from "@/content/products";
import { getCategory, getProduct, getProductsIn, allProductPaths } from "@/lib/content/products";

describe("product taxonomy", () => {
  it("has the five launch categories and no drapery", () => {
    expect(categories.map((c) => c.slug)).toEqual([
      "blinds", "shades", "shutters", "outdoor", "motorization",
    ]);
  });

  it("has sixteen child products", () => {
    expect(products).toHaveLength(16);
  });

  it("gives motorization no children", () => {
    expect(getProductsIn("motorization")).toEqual([]);
  });

  it("uses unique slugs within a category", () => {
    for (const c of categories) {
      const slugs = getProductsIn(c.slug).map((p) => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("gives every product SEO copy mentioning Las Vegas", () => {
    for (const p of products) {
      expect(p.seo.title.length).toBeGreaterThan(10);
      expect(p.seo.title.length).toBeLessThanOrEqual(60);
      expect(p.seo.description).toMatch(/Las Vegas/);
    }
  });

  it("resolves a known product and rejects an unknown one", () => {
    expect(getProduct("shades", "solar-shades")?.name).toBe("Solar Shades");
    expect(getProduct("shades", "nope")).toBeUndefined();
    expect(getCategory("drapery")).toBeUndefined();
  });

  it("produces one static path per child product", () => {
    expect(allProductPaths()).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- tests/products.test.ts`
Expected: FAIL — `Cannot find module '@/content/products'`

- [ ] **Step 3: Write the content model**

Categories in order: `blinds`, `shades`, `shutters`, `outdoor`, `motorization`.

Products, sixteen total:

| Category | Slug | Name |
|---|---|---|
| blinds | `aluminum-blinds` | Aluminum Blinds |
| blinds | `vertical-blinds` | Vertical Blinds |
| blinds | `wood-blinds` | Wood & Faux Wood Blinds |
| blinds | `mini-blinds` | Mini Blinds |
| shades | `roller-shades` | Roller Shades |
| shades | `solar-shades` | Solar Shades |
| shades | `cellular-shades` | Cellular Shades |
| shades | `roman-shades` | Roman Shades |
| shades | `woven-wood-shades` | Woven Wood Shades |
| shades | `transitional-shades` | Transitional Shades |
| shutters | `plantation-shutters` | Plantation Shutters |
| shutters | `composite-shutters` | Composite Shutters |
| shutters | `wood-shutters` | Real Wood Shutters |
| outdoor | `patio-shades` | Patio Roller Shades |
| outdoor | `rolling-shutters` | Rolling Shutters |
| outdoor | `solar-screens` | Solar Screens |

Write genuine copy for each — two or three paragraphs of `body`, three to five `features`, and a one-line `bestFor`. Ground it in the Las Vegas climate: west-facing glass, summer heat load, UV fade on flooring and furniture, dust, and the difference between light filtering and full blackout in a bedroom. Do not write generic manufacturer boilerplate; this copy is what ranks and what convinces.

SEO titles follow `{Product} in Las Vegas, NV | Premier Shade Solutions`, trimmed to 60 characters. Descriptions are one sentence naming the product, the benefit, and the service area.

- [ ] **Step 4: Write the lookup helpers**

```ts
// lib/content/products.ts
import { categories, products, type Category, type CategorySlug, type Product } from "@/content/products";

export const getCategory = (slug: string): Category | undefined =>
  categories.find((c) => c.slug === slug);

export const getProductsIn = (slug: CategorySlug): Product[] =>
  products.filter((p) => p.category === slug);

export const getProduct = (category: string, product: string): Product | undefined =>
  products.find((p) => p.category === category && p.slug === product);

export const allProductPaths = (): { category: string; product: string }[] =>
  products.map((p) => ({ category: p.category, product: p.slug }));
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tests/products.test.ts`
Expected: PASS, all seven cases.

- [ ] **Step 6: Commit**

```bash
git add content/products.ts lib/content/products.ts tests/products.test.ts
git commit -m "feat: add product taxonomy content model with lookup helpers"
```

---

## Task 4: Lead capture — schema, database, and email

This is the only task with real failure modes, so it gets the most test coverage. Build it before any form UI exists.

**Files:**
- Create: `lib/leads/schema.ts`, `lib/leads/db.ts`, `lib/leads/email.ts`, `app/api/consultation/route.ts`, `db/migrations/001_leads.sql`, `.env.example`
- Test: `tests/leads/schema.test.ts`, `tests/leads/route.test.ts`

**Interfaces:**
- Consumes: `business` from Task 2, `categories` from Task 3
- Produces:
  - `consultationSchema` (Zod) and `type ConsultationInput`
  - `insertLead(input: ConsultationInput): Promise<{ id: string }>`
  - `sendLeadNotification(input: ConsultationInput): Promise<void>`
  - `POST /api/consultation` returning `{ ok: true }` (201) or `{ ok: false, error: string }` (400 / 502)

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/leads/schema.test.ts
import { describe, it, expect } from "vitest";
import { consultationSchema } from "@/lib/leads/schema";

const valid = {
  name: "Dana Reyes",
  phone: "702-555-0134",
  email: "dana@example.com",
  city: "Henderson",
  source: "hero" as const,
};

describe("consultationSchema", () => {
  it("accepts the minimum hero payload", () => {
    expect(consultationSchema.safeParse(valid).success).toBe(true);
  });

  it("normalizes a phone number to digits", () => {
    const parsed = consultationSchema.parse({ ...valid, phone: "(702) 555-0134" });
    expect(parsed.phone).toBe("7025550134");
  });

  it("rejects a phone number that is not ten digits", () => {
    expect(consultationSchema.safeParse({ ...valid, phone: "555" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(consultationSchema.safeParse({ ...valid, email: "dana@" }).success).toBe(false);
  });

  it("rejects a city outside the service area", () => {
    expect(consultationSchema.safeParse({ ...valid, city: "Phoenix" }).success).toBe(false);
  });

  it("rejects a submission whose honeypot is filled", () => {
    expect(consultationSchema.safeParse({ ...valid, company: "spam" }).success).toBe(false);
  });

  it("trims whitespace from the name", () => {
    expect(consultationSchema.parse({ ...valid, name: "  Dana  " }).name).toBe("Dana");
  });

  it("accepts the full contact payload", () => {
    const full = {
      ...valid,
      address: "123 Sunset Rd",
      treatments: ["shades", "shutters"],
      windowCount: "6-10",
      notes: "West-facing living room, brutal afternoon sun.",
      source: "contact" as const,
    };
    expect(consultationSchema.safeParse(full).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- tests/leads/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema**

```ts
// lib/leads/schema.ts
import { z } from "zod";
import { business } from "@/content/business";

const cities = business.serviceArea as readonly string[];

export const consultationSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 10, "Please enter a 10-digit phone number"),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address"),
  city: z.string().refine((v) => cities.includes(v), "We serve the Las Vegas valley"),
  address: z.string().trim().max(200).optional(),
  treatments: z.array(z.string()).max(6).optional(),
  windowCount: z.enum(["1-5", "6-10", "11-20", "20+"]).optional(),
  heardVia: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(["hero", "contact"]),
  // Honeypot: real people never see this field, so it must be empty.
  company: z.string().max(0, "Rejected").optional(),
});

export type ConsultationInput = z.infer<typeof consultationSchema>;
```

- [ ] **Step 4: Run the schema test**

Run: `npm test -- tests/leads/schema.test.ts`
Expected: PASS, all eight cases.

- [ ] **Step 5: Write the migration**

```sql
-- db/migrations/001_leads.sql
create extension if not exists "pgcrypto";

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null,
  phone         text not null,
  email         text not null,
  address       text,
  city          text not null,
  treatments    text[] not null default '{}',
  window_count  text,
  heard_via     text,
  notes         text,
  source        text not null,
  status        text not null default 'new'
);

create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_status_idx on leads (status);
```

`status` defaults to `new` and is the column the future order system will advance through its own states. Do not constrain it with an enum yet — that decision belongs to the order system's spec.

- [ ] **Step 6: Write the database and email modules**

```ts
// lib/leads/db.ts
import { neon } from "@neondatabase/serverless";
import type { ConsultationInput } from "./schema";

export async function insertLead(input: ConsultationInput): Promise<{ id: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`
    insert into leads (name, phone, email, address, city, treatments, window_count, heard_via, notes, source)
    values (${input.name}, ${input.phone}, ${input.email}, ${input.address ?? null},
            ${input.city}, ${input.treatments ?? []}, ${input.windowCount ?? null},
            ${input.heardVia ?? null}, ${input.notes ?? null}, ${input.source})
    returning id
  `;
  return { id: row.id as string };
}
```

```ts
// lib/leads/email.ts
import { Resend } from "resend";
import { business } from "@/content/business";
import type { ConsultationInput } from "./schema";

export async function sendLeadNotification(input: ConsultationInput): Promise<void> {
  const to = process.env.LEAD_NOTIFICATION_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) throw new Error("Email not configured");

  const pretty = (p: string) => `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`;

  await new Resend(key).emails.send({
    from: `${business.name} <leads@premiershadesolutions.com>`,
    to,
    replyTo: input.email,
    subject: `New consultation request — ${input.name}, ${input.city}`,
    text: [
      `Name:       ${input.name}`,
      `Phone:      ${pretty(input.phone)}`,
      `Email:      ${input.email}`,
      `City:       ${input.city}`,
      input.address    ? `Address:    ${input.address}` : null,
      input.treatments?.length ? `Interested: ${input.treatments.join(", ")}` : null,
      input.windowCount? `Windows:    ${input.windowCount}` : null,
      input.heardVia   ? `Heard via:  ${input.heardVia}` : null,
      input.notes      ? `\nNotes:\n${input.notes}` : null,
      `\nSubmitted from the ${input.source} form.`,
    ].filter(Boolean).join("\n"),
  });
}
```

- [ ] **Step 7: Write the failing route test**

The route must never lose a lead. If one side fails, the other still runs, and the visitor still sees success.

```ts
// tests/leads/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertLead = vi.fn();
const sendLeadNotification = vi.fn();
vi.mock("@/lib/leads/db", () => ({ insertLead }));
vi.mock("@/lib/leads/email", () => ({ sendLeadNotification }));

const { POST } = await import("@/app/api/consultation/route");

const body = {
  name: "Dana Reyes", phone: "7025550134", email: "dana@example.com",
  city: "Henderson", source: "hero",
};
const req = (b: unknown) =>
  new Request("http://localhost/api/consultation", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  });

beforeEach(() => {
  insertLead.mockReset().mockResolvedValue({ id: "abc" });
  sendLeadNotification.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/consultation", () => {
  it("stores the lead and sends the email on a valid request", async () => {
    const res = await POST(req(body));
    expect(res.status).toBe(201);
    expect(insertLead).toHaveBeenCalledOnce();
    expect(sendLeadNotification).toHaveBeenCalledOnce();
  });

  it("returns 400 with a message when validation fails", async () => {
    const res = await POST(req({ ...body, email: "nope" }));
    expect(res.status).toBe(400);
    expect(insertLead).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("still succeeds when the email fails, because the lead was saved", async () => {
    sendLeadNotification.mockRejectedValue(new Error("Resend down"));
    const res = await POST(req(body));
    expect(res.status).toBe(201);
    expect(insertLead).toHaveBeenCalledOnce();
  });

  it("still succeeds when the database fails, because the email was sent", async () => {
    insertLead.mockRejectedValue(new Error("Neon down"));
    const res = await POST(req(body));
    expect(res.status).toBe(201);
    expect(sendLeadNotification).toHaveBeenCalledOnce();
  });

  it("returns 502 only when both the database and the email fail", async () => {
    insertLead.mockRejectedValue(new Error("Neon down"));
    sendLeadNotification.mockRejectedValue(new Error("Resend down"));
    const res = await POST(req(body));
    expect(res.status).toBe(502);
  });

  it("silently accepts a honeypot submission without storing it", async () => {
    const res = await POST(req({ ...body, company: "spam" }));
    expect(res.status).toBe(201);
    expect(insertLead).not.toHaveBeenCalled();
  });
});
```

Note the last case: a bot that fills the honeypot gets a `201` and no record. Returning an error would tell the bot how to get past the trap.

- [ ] **Step 8: Run it**

Run: `npm test -- tests/leads/route.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 9: Write the route handler**

```ts
// app/api/consultation/route.ts
import { consultationSchema } from "@/lib/leads/schema";
import { insertLead } from "@/lib/leads/db";
import { sendLeadNotification } from "@/lib/leads/email";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  // Honeypot: accept and discard, so the bot learns nothing.
  if (typeof payload === "object" && payload !== null && "company" in payload
      && (payload as { company?: string }).company) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const parsed = consultationSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." },
      { status: 400 },
    );
  }

  const [stored, emailed] = await Promise.allSettled([
    insertLead(parsed.data),
    sendLeadNotification(parsed.data),
  ]);

  if (stored.status === "rejected") console.error("Lead DB write failed", stored.reason);
  if (emailed.status === "rejected") console.error("Lead email failed", emailed.reason);

  if (stored.status === "rejected" && emailed.status === "rejected") {
    return Response.json(
      { ok: false, error: "We could not submit your request. Please call us instead." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 11: Write `.env.example` and commit**

```
DATABASE_URL=
RESEND_API_KEY=
LEAD_NOTIFICATION_EMAIL=
```

```bash
git add lib/leads app/api db/migrations tests/leads .env.example
git commit -m "feat: add consultation lead capture with resilient dual-write"
```

---

## Task 5: Layout shell — header and footer

**Files:**
- Create: `components/ui/Container.tsx`, `components/ui/Section.tsx`, `components/ui/Button.tsx`, `components/layout/Header.tsx`, `components/layout/Footer.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/layout/header.test.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 2), `business` (Task 2), `categories`/`getProductsIn` (Task 3)
- Produces: `<Container>`, `<Section tone="ivory"|"sand"|"charcoal">`, `<Button href variant="primary"|"ghost">`, `<Header />`, `<Footer />`

- [ ] **Step 1: Write the failing header test**

```tsx
// tests/layout/header.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Header } from "@/components/layout/Header";
import { business } from "@/content/business";

describe("Header", () => {
  it("links every product category", () => {
    render(<Header />);
    for (const slug of ["blinds","shades","shutters","outdoor","motorization"]) {
      expect(screen.getByRole("link", { name: new RegExp(slug, "i") })).toBeDefined();
    }
  });

  it("offers a tap-to-call link built from business content", () => {
    render(<Header />);
    const call = screen.getByRole("link", { name: /call/i });
    expect(call.getAttribute("href")).toBe(business.phone.href);
  });

  it("labels the mobile menu button for screen readers", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: /menu/i })).toBeDefined();
  });
});
```

Add `import "@testing-library/jest-dom/vitest";` to a `tests/setup.ts` and register it via `test.setupFiles` in `vitest.config.ts`.

- [ ] **Step 2: Run it**

Run: `npm test -- tests/layout/header.test.tsx`
Expected: FAIL — `Header` not found.

- [ ] **Step 3: Build the primitives**

`Container`: `mx-auto w-full max-w-6xl px-6`.
`Section`: vertical rhythm `py-20 md:py-28` with a `tone` prop mapping to `bg-ivory` / `bg-sand` / `bg-charcoal text-ivory`.
`Button`: `primary` is `bg-champagne text-charcoal` with a charcoal hover; `ghost` is a charcoal outline. Both get `focus-visible` rings and a minimum 44px tap target.

- [ ] **Step 4: Build the header**

Sticky, ivory with a hairline bottom rule that appears on scroll. Left: `<Logo variant="lockup" />` linking home. Center: the five categories, each with a hover and focus dropdown listing `getProductsIn(slug)`. Right: a champagne "Call" button using `business.phone`, plus "Free Consultation" linking to `/contact`.

Below `md`, collapse to a hamburger opening a full-height panel. The panel must be keyboard navigable, close on Escape, and trap focus while open. Category dropdowns must open on focus, not hover alone, or they are unreachable by keyboard.

- [ ] **Step 5: Build the footer**

Charcoal ground, ivory text. Four columns: business identity with the dark-tone logo and tagline; products by category; service area linking the four city pages; contact block with phone, email, hours. Bottom rule with copyright, privacy, and accessibility links.

- [ ] **Step 6: Run the tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add components tests/layout app/layout.tsx
git commit -m "feat: add layout shell with sticky header and footer"
```

---

## Task 6: Consultation forms

**Files:**
- Create: `components/forms/HeroForm.tsx`, `components/forms/ConsultationForm.tsx`, `components/forms/useConsultationForm.ts`
- Test: `tests/forms/consultation-form.test.tsx`

**Interfaces:**
- Consumes: `consultationSchema` (Task 4), `business` (Task 2), `categories` (Task 3)
- Produces: `<HeroForm />`, `<ConsultationForm />`, `useConsultationForm(source: "hero" | "contact")` returning `{ state, errors, submit }` where `state` is `"idle" | "submitting" | "success" | "error"`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/forms/consultation-form.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeroForm } from "@/components/forms/HeroForm";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), { status: 201 })));
});

describe("HeroForm", () => {
  it("shows an accessible error and does not submit when the phone is short", async () => {
    render(<HeroForm />);
    await userEvent.type(screen.getByLabelText(/name/i), "Dana");
    await userEvent.type(screen.getByLabelText(/phone/i), "555");
    await userEvent.type(screen.getByLabelText(/email/i), "dana@example.com");
    await userEvent.click(screen.getByRole("button", { name: /consultation/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/10-digit/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts a valid submission and confirms it", async () => {
    render(<HeroForm />);
    await userEvent.type(screen.getByLabelText(/name/i), "Dana Reyes");
    await userEvent.type(screen.getByLabelText(/phone/i), "7025550134");
    await userEvent.type(screen.getByLabelText(/email/i), "dana@example.com");
    await userEvent.click(screen.getByRole("button", { name: /consultation/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent(/reach out/i);
  });

  it("surfaces the phone number when the server rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "Please call us instead." }), { status: 502 })));
    render(<HeroForm />);
    await userEvent.type(screen.getByLabelText(/name/i), "Dana Reyes");
    await userEvent.type(screen.getByLabelText(/phone/i), "7025550134");
    await userEvent.type(screen.getByLabelText(/email/i), "dana@example.com");
    await userEvent.click(screen.getByRole("button", { name: /consultation/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/call/i);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- tests/forms/consultation-form.test.tsx`
Expected: FAIL — `HeroForm` not found.

- [ ] **Step 3: Write the hook**

Client component. Validates with `consultationSchema` before any network call, so a bad phone number never reaches the server. On success, replaces the form with a confirmation in a `role="status"` region. On failure, renders the server's message in a `role="alert"` region and shows `business.phone` as a fallback path. Disables the submit button while `state === "submitting"` to prevent double posts.

- [ ] **Step 4: Build `HeroForm`**

Three fields — name, phone, email — plus a hidden `city` defaulting to `"Las Vegas"`, a hidden `source` of `"hero"`, and the honeypot. The honeypot input is `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden="true"`, and positioned offscreen — never `display: none`, which some bots detect.

Every input has a real `<label>`, not a placeholder standing in for one. Errors are tied to inputs via `aria-describedby` and `aria-invalid`.

- [ ] **Step 5: Build `ConsultationForm`**

All fields from the spec: name, phone, email, street address, city select from `business.serviceArea`, treatment checkboxes from `categories`, window count select, "how did you hear about us", and notes. `source` is `"contact"`.

- [ ] **Step 6: Run the tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add components/forms tests/forms
git commit -m "feat: add hero and full consultation forms with client validation"
```

---

## Task 7: Homepage

**Files:**
- Create: `components/home/Hero.tsx`, `TrustBar.tsx`, `CategoryGrid.tsx`, `WhyPremier.tsx`, `GalleryStrip.tsx`, `Testimonials.tsx`, `MeetTheOwners.tsx`, `ServiceAreaBlock.tsx`, `ClosingCta.tsx`
- Create: `content/testimonials.ts`, `content/gallery.ts`
- Modify: `app/page.tsx`
- Test: `tests/home.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 5, 6
- Produces: `gallery: GalleryItem[]` where `GalleryItem = { src: string; alt: string; treatment: CategorySlug; city: string }`; `testimonials: Testimonial[]` where `Testimonial = { quote: string; name: string; city: string }`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/home.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/page";
import { business } from "@/content/business";

describe("Home", () => {
  it("has exactly one h1 and it carries the tagline", () => {
    const { container } = render(<Home />);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toContain(business.tagline);
  });

  it("links all five product categories", () => {
    render(<Home />);
    for (const slug of ["blinds","shades","shutters","outdoor","motorization"]) {
      expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === `/${slug}`)).toBe(true);
    }
  });

  it("gives every image alt text", () => {
    const { container } = render(<Home />);
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("alt")).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- tests/home.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Build the sections in spec order**

1. **Hero** — full-bleed photograph of light through slats, charcoal scrim for text contrast, `h1` carrying the tagline, a one-line subhead naming Las Vegas, and `<HeroForm />` in a card to the right on desktop and below the headline on mobile.
2. **TrustBar** — three or four short proofs on sand. Use honest placeholders marked with a `TODO(content)` comment; do not invent a Google rating or a job count.
3. **CategoryGrid** — five cards from `categories`.
4. **WhyPremier** — three pillars: free in-home consultation, installed personally by the owners, quality vendor lines.
5. **GalleryStrip** — six items from `gallery`, linking to `/gallery`.
6. **Testimonials** — from `content/testimonials.ts`. Ship the file with an empty array and a comment; render nothing when empty rather than displaying invented reviews.
7. **MeetTheOwners** — photo, short story, link to `/about`. This is the section the competitor lacks; give it real prominence.
8. **ServiceAreaBlock** — the four cities, each linking to its page.
9. **ClosingCta** — charcoal band, champagne button to `/contact`.

Photography: use the dark render at `logofiles/ChatGPT Image Aug 26, 2026, 12_34_15 AM.png` for the hero until real job photos arrive. Optimize every image through `next/image` with explicit `width`/`height` and `priority` on the hero only.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test && npm run build`
Expected: PASS and a clean build.

```bash
git add app/page.tsx components/home content/gallery.ts content/testimonials.ts tests/home.test.tsx
git commit -m "feat: build homepage"
```

---

## Task 8: Product hub and detail templates

**Files:**
- Create: `app/[category]/page.tsx`, `app/[category]/[product]/page.tsx`
- Test: `tests/routes/products.test.ts`

**Interfaces:**
- Consumes: `getCategory`, `getProduct`, `getProductsIn`, `allProductPaths` (Task 3)
- Produces: 21 statically generated routes

- [ ] **Step 1: Write the failing route test**

```ts
// tests/routes/products.test.ts
import { describe, it, expect } from "vitest";
import { generateStaticParams as categoryParams } from "@/app/[category]/page";
import { generateStaticParams as productParams } from "@/app/[category]/[product]/page";

describe("static params", () => {
  it("generates one route per category", async () => {
    expect(await categoryParams()).toHaveLength(5);
  });

  it("generates one route per child product", async () => {
    expect(await productParams()).toHaveLength(16);
  });

  it("scopes product routes to their own category", async () => {
    const params = await productParams();
    expect(params).toContainEqual({ category: "shades", product: "solar-shades" });
    expect(params).not.toContainEqual({ category: "blinds", product: "solar-shades" });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- tests/routes/products.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Build the hub template**

```tsx
// app/[category]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categories } from "@/content/products";
import { getCategory, getProductsIn } from "@/lib/content/products";

export const dynamicParams = false;

export async function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ category: string }> },
): Promise<Metadata> {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) return {};
  return { title: c.seo.title, description: c.seo.description,
           alternates: { canonical: `/${c.slug}` } };
}

export default async function CategoryPage(
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) notFound();
  const children = getProductsIn(c.slug);
  // hero, intro prose, child product cards (or the motorization long-form body
  // when children is empty), then a closing consultation CTA
}
```

`dynamicParams = false` is what makes an unknown slug a real 404 rather than a runtime render.

- [ ] **Step 4: Build the product detail template**

Same shape, using `allProductPaths()` and `getProduct()`. Page structure: breadcrumb, `h1` with the product name, hero image, `tagline`, `body` paragraphs, a features list, a "best for" callout, a cross-link row of sibling products, and a consultation CTA. Breadcrumbs are real `<nav aria-label="Breadcrumb">` markup, since they also feed `BreadcrumbList` schema in Task 10.

- [ ] **Step 5: Run the tests and commit**

Run: `npm test && npm run build`
Expected: PASS, and the build output lists 21 static product routes.

```bash
git add "app/[category]" tests/routes
git commit -m "feat: add product hub and detail templates"
```

---

## Task 9: City, gallery, about, contact, and legal pages

**Files:**
- Create: `content/cities.ts`, `app/service-area/[city]/page.tsx`, `app/gallery/page.tsx`, `app/about/page.tsx`, `app/contact/page.tsx`, `app/privacy/page.tsx`, `app/accessibility/page.tsx`
- Test: `tests/routes/cities.test.ts`

**Interfaces:**
- Consumes: `business`, `products`, `gallery`, `ConsultationForm`
- Produces: `cities: City[]` where `City = { slug: string; name: string; intro: string[]; neighborhoods: string[]; climateNote: string; seo: { title: string; description: string } }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/routes/cities.test.ts
import { describe, it, expect } from "vitest";
import { cities } from "@/content/cities";

describe("city content", () => {
  it("covers the four service-area cities", () => {
    expect(cities.map((c) => c.name)).toEqual([
      "Las Vegas", "Henderson", "Summerlin", "North Las Vegas",
    ]);
  });

  it("gives each city distinct intro copy", () => {
    const intros = cities.map((c) => c.intro.join(" "));
    expect(new Set(intros).size).toBe(cities.length);
  });

  it("names real neighborhoods for each city", () => {
    for (const c of cities) expect(c.neighborhoods.length).toBeGreaterThanOrEqual(3);
  });
});
```

The second case is the important one. Near-duplicate city pages are treated as doorway pages and are penalized; the test enforces that each page says something true and different.

- [ ] **Step 2: Run it**

Run: `npm test -- tests/routes/cities.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write city content and template**

Each city gets genuinely local copy: named neighborhoods, and a climate note specific to that area — Summerlin's west-facing views into afternoon sun, Henderson's newer construction and larger window openings, North Las Vegas's newer subdivisions, and central Las Vegas's mix of mid-century and new build. Template: `h1` "Window Treatments in {City}, NV", intro, neighborhood list, popular products for that area, gallery items filtered to that city when any exist, and the consultation form.

- [ ] **Step 4: Build the remaining pages**

- **Gallery** — grid from `content/gallery.ts` with client-side filter chips by treatment. Renders an honest empty state until real photos arrive.
- **About** — the owner story. Real prominence: who you are, that you personally measure and install, why you started. Leave a clearly commented `TODO(content)` block for the owners' own words rather than inventing a biography.
- **Contact** — `<ConsultationForm />`, phone, email, hours, service area. No map embed; a third-party iframe would cost more in performance than it returns.
- **Privacy** and **Accessibility** — real, plain-language pages. The accessibility statement names WCAG 2.1 AA as the target and gives a contact path for problems.

- [ ] **Step 5: Run and commit**

Run: `npm test && npm run build`

```bash
git add content/cities.ts app/service-area app/gallery app/about app/contact app/privacy app/accessibility tests/routes/cities.test.ts
git commit -m "feat: add city, gallery, about, contact, and legal pages"
```

---

## Task 10: SEO — metadata, structured data, sitemap

**Files:**
- Create: `lib/seo/schema.ts`, `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/seo/schema.test.ts`, `tests/seo/sitemap.test.ts`

**Interfaces:**
- Consumes: `business`, `categories`, `products`, `cities`
- Produces: `localBusinessSchema()`, `productSchema(product)`, `breadcrumbSchema(trail)` — each returning a JSON-LD object

- [ ] **Step 1: Write the failing tests**

```ts
// tests/seo/schema.test.ts
import { describe, it, expect } from "vitest";
import { localBusinessSchema, productSchema, breadcrumbSchema } from "@/lib/seo/schema";
import { products } from "@/content/products";

describe("structured data", () => {
  it("describes the business with its service area", () => {
    const s = localBusinessSchema();
    expect(s["@type"]).toBe("HomeAndConstructionBusiness");
    expect(s.name).toBe("Premier Shade Solutions");
    expect(s.areaServed).toHaveLength(4);
  });

  it("describes a product", () => {
    const s = productSchema(products[0]);
    expect(s["@type"]).toBe("Product");
    expect(s.name).toBe(products[0].name);
  });

  it("builds an ordered breadcrumb trail", () => {
    const s = breadcrumbSchema([
      { name: "Shades", url: "/shades" },
      { name: "Solar Shades", url: "/shades/solar-shades" },
    ]);
    expect(s.itemListElement[0].position).toBe(1);
    expect(s.itemListElement[1].position).toBe(2);
  });
});
```

```ts
// tests/seo/sitemap.test.ts
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("lists every public route once", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    // 1 home + 5 hubs + 16 products + 4 cities + gallery, about, contact, privacy, accessibility
    expect(urls).toHaveLength(31);
    expect(new Set(urls).size).toBe(31);
  });

  it("uses absolute URLs on the production domain", async () => {
    for (const e of await sitemap()) {
      expect(e.url.startsWith("https://premiershadesolutions.com")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run them**

Run: `npm test -- tests/seo`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the schema builders**

Use `HomeAndConstructionBusiness`, a `LocalBusiness` subtype that fits this trade better than the generic type. Include `name`, `url`, `telephone`, `email`, `areaServed` from `business.serviceArea`, `priceRange`, and `openingHours`. Omit `address` fields entirely while `business.address.isPlaceholder` is true — a wrong address in structured data is worse than none.

- [ ] **Step 4: Write sitemap, robots, and OG image**

`sitemap.ts` derives its list from the content model, so new products appear automatically. `robots.ts` allows everything and points at the sitemap. `app/opengraph-image.tsx` renders a charcoal card with the logo mark and tagline via `next/og`.

- [ ] **Step 5: Add root metadata**

`metadataBase`, a title template of `%s | Premier Shade Solutions`, a default description naming Las Vegas, and the `LocalBusiness` JSON-LD injected once in the root layout.

- [ ] **Step 6: Run and commit**

Run: `npm test && npm run build`

```bash
git add lib/seo app/sitemap.ts app/robots.ts app/opengraph-image.tsx app/layout.tsx tests/seo
git commit -m "feat: add metadata, structured data, sitemap, and OG images"
```

---

## Task 11: End-to-end verification and deploy preview

**Files:**
- Create: `e2e/consultation.spec.ts`, `e2e/navigation.spec.ts`, `playwright.config.ts`
- Test: the whole application

**Interfaces:**
- Consumes: the complete application
- Produces: a verified Vercel preview URL

- [ ] **Step 1: Configure Playwright**

`playwright.config.ts` with `webServer` running `npm run build && npm start`, `baseURL: "http://localhost:3000"`, and projects for Desktop Chrome and Mobile Safari.

- [ ] **Step 2: Write the end-to-end tests**

```ts
// e2e/consultation.spec.ts
import { test, expect } from "@playwright/test";

test("a visitor can request a consultation from the homepage hero", async ({ page }) => {
  await page.route("**/api/consultation", (route) =>
    route.fulfill({ status: 201, json: { ok: true } }));

  await page.goto("/");
  await page.getByLabel(/name/i).fill("Dana Reyes");
  await page.getByLabel(/phone/i).fill("7025550134");
  await page.getByLabel(/email/i).fill("dana@example.com");
  await page.getByRole("button", { name: /consultation/i }).click();

  await expect(page.getByRole("status")).toContainText(/reach out/i);
});

test("the form is reachable and submittable by keyboard alone", async ({ page }) => {
  await page.goto("/contact");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
```

```ts
// e2e/navigation.spec.ts
import { test, expect } from "@playwright/test";

const routes = ["/", "/blinds", "/shades/solar-shades", "/shutters/plantation-shutters",
                "/outdoor/solar-screens", "/motorization", "/service-area/henderson",
                "/gallery", "/about", "/contact"];

for (const route of routes) {
  test(`${route} renders with exactly one h1 and no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("an unknown product slug returns 404", async ({ page }) => {
  const response = await page.goto("/shades/does-not-exist");
  expect(response?.status()).toBe(404);
});
```

- [ ] **Step 3: Run them**

Run: `npx playwright test`
Expected: PASS. Fix any failures in the pages, not in the tests.

- [ ] **Step 4: Provision Neon and run the migration**

```bash
vercel link
vercel integration add neon
vercel env pull .env.local
psql "$DATABASE_URL" -f db/migrations/001_leads.sql
```

- [ ] **Step 5: Verify the real submission path**

With `.env.local` populated, run `npm run dev`, submit the contact form once with real details, and confirm both sides:

```bash
psql "$DATABASE_URL" -c "select id, name, city, source, status, created_at from leads order by created_at desc limit 1;"
```

Expected: one row, `status = 'new'`. Confirm the notification email arrived. **Do not mark this task complete without seeing both.**

- [ ] **Step 6: Deploy a preview and measure**

```bash
vercel deploy
```

Run Lighthouse against the preview URL for `/`, one product page, and `/contact`. Performance and accessibility must each score 95 or above. Check rendering at 375px, 768px, and 1440px. Validate the structured data in Google's Rich Results Test.

- [ ] **Step 7: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: add end-to-end coverage for navigation and lead capture"
```

---

## Deferred to launch day

Not tasks — they need decisions or assets that do not exist yet.

- Point `premiershadesolutions.com` from GoDaddy at Vercel
- Replace `PLACEHOLDER_PHONE` and `PLACEHOLDER_EMAIL` in `content/business.ts`
- Add the real address to `business.address` and re-enable it in `localBusinessSchema()`
- Replace hero and gallery imagery with real job photographs
- Write the owners' story into `/about`
- Add testimonials to `content/testimonials.ts` once customers have left reviews
- Claim the Google Business Profile and cross-link it

---

## Self-Review

**Spec coverage.** Purpose → Task 7. Competitive differentiation via story → Task 7 §7 and Task 9. City pages → Task 9. Brand → Tasks 1, 2. Product taxonomy → Tasks 3, 8. Supporting pages → Task 9. Homepage section order → Task 7. Content model → Tasks 2, 3, 7, 9. Forms → Tasks 4, 6. Failure handling → Task 4 Step 7. Spam handling → Tasks 4, 6. Technical architecture → Tasks 1, 11. SEO → Task 10. Accessibility → Tasks 5, 6, 7, 11. Definition of done → Task 11. No gaps.

**Placeholders.** The only `TODO(content)` markers are in Task 7 §2, Task 7 §6, and Task 9 §4 — each marks a place where inventing content would mean fabricating a customer review, a job count, or a personal biography. Those are deliberate refusals to invent, not unfinished plan steps, and each is listed in "Deferred to launch day."

**Type consistency.** `ConsultationInput` flows unchanged from `lib/leads/schema.ts` through `insertLead` and `sendLeadNotification` in Task 4 to the forms in Task 6. `CategorySlug` is defined in Task 3 and used by `getProductsIn` (Task 3), `GalleryItem` (Task 7), and the templates (Task 8). `getProduct(category, product)` keeps that argument order everywhere. The `source` union `"hero" | "contact"` matches between the schema, the hook, and both forms. The sitemap count of 31 reconciles with 1 + 5 + 16 + 4 + 5.
