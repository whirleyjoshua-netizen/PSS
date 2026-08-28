# Premier Shade Solutions — Marketing Website Design

**Date:** 2026-08-26
**Status:** Approved for planning
**Scope:** Public marketing website only. The internal order management system is a separate project, specced later.

## 1. Purpose

Premier Shade Solutions is a two-person window treatment company in Las Vegas, Nevada. The website has one job: **generate booked in-home consultations.** It is not an e-commerce site. Every page drives to a consultation request or a phone call.

The secondary job is to establish the SEO footprint. Customers find window treatment companies by searching product + city ("solar shades las vegas", "plantation shutters henderson"). The site's page structure is built around that fact.

## 2. Competitive context

The primary local competitor is Transitions Window Fashions & Shutters (transitionswfs.com), Las Vegas. Their structure — five product categories each with three to six subtype pages, roughly 24 product pages total — is the SEO bar to meet.

Where we differentiate:

- **Story.** They have no owner presence. A local husband-and-wife team who personally measures and installs every job is a real advantage and is free to deploy.
- **City pages.** They have none. Henderson, Summerlin, and North Las Vegas are unclaimed local search ground.
- **Speed.** Their site is heavy. A statically rendered Next.js build wins Core Web Vitals without special effort, and page speed is a ranking factor.

## 3. Brand

Locked from the approved brand board.

| Token | Hex | Use |
|---|---|---|
| Charcoal | `#1E1E1E` | Primary text, dark sections, header |
| Warm Taupe | `#7A7263` | Secondary text, borders, muted UI |
| Champagne | `#CDB891` | Accent only — buttons, rules, small marks |
| Sand | `#E7E1D6` | Section backgrounds, cards |
| Ivory | `#F7F5F0` | Page background |

**Tagline:** Control the Light. Define the Space.

**Typography:** Headings use a wide-tracked geometric sans matching the logo lockup. Body uses a warmer, highly readable companion face so long-form copy does not read as signage. Both from Google Fonts, self-hosted via `next/font`.

**Art direction:** Editorial and restrained. Large photography, generous whitespace, charcoal and ivory carrying the design. Champagne is reserved almost entirely for calls to action so it reads as expensive rather than gold-plated. Light-and-shadow imagery — sunlight through slats — is the central visual motif.

Champagne on ivory does not meet WCAG AA for text. It is used for fills, rules, and icons; text on a champagne button is charcoal, not white.

## 4. Site structure

Five category hubs, each with child product pages, plus supporting pages. Product pages are generated from a single typed content file through one template — not hand-built.

### Product taxonomy

| Hub | Child pages |
|---|---|
| `/blinds` | Aluminum, Vertical, Wood & Faux Wood, Mini |
| `/shades` | Roller, Solar, Cellular (Honeycomb), Roman, Woven Wood, Transitional (Zebra) |
| `/shutters` | Composite, Real Wood, Vinyl |
| `/outdoor` | Patio Roller Shades, Rolling Shutters, Solar Screens |
| `/motorization` | Standalone hub, no children |

Product page URLs are flat and keyword-shaped: `/shades/solar-shades`, `/shutters/plantation-shutters`. Twenty-one product pages total: five hubs plus sixteen children.

Draperies are deliberately excluded from launch. The content model supports adding a `drapery` hub as a data entry when the Alta account is active.

### Supporting pages

| Page | Purpose |
|---|---|
| `/` | Home |
| `/gallery` | Real job photos, filterable by treatment type |
| `/about` | The owners, the local story — highest-converting page for a family business |
| `/contact` | Full consultation form, service area, hours |
| `/service-area/las-vegas`, `/henderson`, `/summerlin`, `/north-las-vegas` | Local SEO landing pages |
| `/privacy`, `/accessibility` | Legal |

City pages share one template and one data file. Each carries genuinely local content — neighborhoods served, sun exposure and heat considerations specific to that area — not spun duplicates, which are penalized.

### Homepage sections, in order

1. Sticky header: logo, nav, tap-to-call phone button
2. Hero: full-bleed photograph, tagline, three-field consultation form (name, phone, email)
3. Trust bar: years in business, jobs completed, Google rating
4. Product categories: five cards linking to hubs
5. Why Premier: three pillars — free in-home consultation, personally installed by the owners, quality vendor lines
6. Gallery strip: six recent jobs linking to `/gallery`
7. Testimonials
8. Meet the owners: photo and short story, linking to `/about`
9. Service area: city list with map
10. Closing CTA band

Footer carries address, phone, email, hours, service area links, product links, socials, and legal links.

## 5. Data and content model

Content lives in typed TypeScript files under `content/`, not a database and not a CMS:

- `content/business.ts` — name, phone, email, address, hours, socials. **Single source of truth.** Phone and email ship as clearly marked placeholders and are swapped in one edit.
- `content/products.ts` — the full taxonomy: hubs, children, copy, features, benefits, images, SEO metadata.
- `content/cities.ts` — service area pages.
- `content/gallery.ts` — job photos with treatment-type tags.
- `content/testimonials.ts`

Adding a product or a gallery photo is a data edit, never a code edit. This layer is deliberately shaped so a CMS can replace it later without touching page components.

## 6. The consultation form

Two entry points, one destination.

**Hero form (short):** name, phone, email. Three fields, no scrolling, on every page's hero.

**Contact page form (full):** name, phone, email, street address, city (dropdown of service area), treatments of interest (checkboxes), approximate number of windows, how they heard about us, free-text notes.

**On submit, two things happen:**

1. A formatted notification email is sent to the business.
2. The lead is written to a **Neon Postgres** database, provisioned through the Vercel Marketplace.

The database write is the load-bearing decision. The website does not need it to function today, but the internal order system is the same Next.js application with login-protected routes reading the same database. Every lead collected from launch day forward is already in the system when the order tool ships — a lead becomes a quote becomes an order with nobody retyping an address. This is the reason the site is a real application rather than a page builder.

**Leads table:** id, created_at, name, phone, email, address, city, treatments (array), window_count, source, notes, status (default `new`).

**Spam handling:** a honeypot field plus Vercel BotID. No CAPTCHA — CAPTCHAs cost real leads at this volume.

**Failure handling:** if the email send fails, the database write still succeeds and the user still sees success — the lead is not lost. If the database write fails, the email still sends and the error is logged. The user only sees an error if both fail, and the form then surfaces the phone number as a fallback.

## 7. Technical architecture

- **Next.js App Router**, TypeScript, statically rendered except the form route handler
- **Tailwind CSS** with the brand palette as design tokens
- **Vercel** hosting, Fluid Compute for the form endpoint
- **Neon Postgres** via Vercel Marketplace (free tier is far beyond sufficient)
- **Resend** or equivalent for transactional email
- `next/image` for all photography; `next/font` for self-hosted type
- Domain `premiershadesolutions.com`, registered at GoDaddy, pointed at Vercel at launch — DNS is unchanged until we cut over

### SEO requirements

- Per-page title and description from the content files
- `LocalBusiness` JSON-LD schema with address, hours, service area, and geo coordinates
- `Product` schema on product pages
- `sitemap.xml` and `robots.txt` generated from the content model
- Open Graph images per page
- Semantic heading hierarchy, one `h1` per page

## 8. Accessibility

WCAG 2.1 AA. Keyboard navigable throughout, visible focus states, labeled form fields with errors announced to screen readers, alt text on every image, 4.5:1 contrast on all text. An `/accessibility` statement page ships with the site, as competitors carry.

## 9. Out of scope for launch

Online ordering or pricing, a customer login, a CMS admin panel, a blog, live chat, Spanish translation, and the internal order management system. Each is additive and none require rework of what is built here.

## 10. Definition of done

- All 21 product pages, 4 city pages, and supporting pages render correctly
- Consultation form submits end to end and writes a verified row to the database
- Notification email received in a real inbox
- Lighthouse >= 95 performance and >= 95 accessibility on home, a product page, and contact
- Correct rendering at 375px, 768px, and 1440px
- Structured data validates in Google's Rich Results Test
- Reviewed running on a Vercel preview URL before the domain is pointed

## 11. Open items

These do not block the build. All are single-line edits in `content/business.ts`.

- Business phone number
- Business email address
- Physical or mailing address for `LocalBusiness` schema
- Business hours
- Final logo files (SVG preferred)
- Job photographs for the gallery
- Google Business Profile — should be claimed in parallel; it drives more local traffic than the website itself
