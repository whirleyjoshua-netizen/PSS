# Family brand: homepage and "Meet the family" — design

Date: 2026-09-30. Direction approved by the owner (Joshua) in conversation the same day.

## 1. Goal and constraint

Reposition the public site around one idea: **"You let us into your home. We let you into our
family."** The homepage leads with people, then the experience of working with them, then trust,
then products. The About page becomes a real "Meet the family" page.

**Constraint #1 (owner): do not harm SEO.** Every search element the site has today stays, and a
test proves it (§6).

Decisions made with the owner:

- Scope: homepage + About page. Product, category and city pages are untouched.
- New slogan (replaces "Control the Light. Define the Space." everywhere):
  **"You let us into your home. We let you into our family."**
- No "Las Vegas Strong" / "Vegas Strong" anywhere (1 October 2017 association). No "born here"
  claims — the family moved to Las Vegas from Ohio. Local wording stays factual and mild:
  "Family-run window treatments · Las Vegas valley".
- Primary booking button: **"Invite Us Over"**, always paired with a plain line saying it is a
  free in-home consultation. The header keeps "Free Consultation".
- The children appear **only on the About page**, never on the homepage.
  **Changed by the owner 2026-10-01:** the homepage family section shows Josh, Shade and their
  daughter (`owners-family.webp`); the About page shows Josh with both children and Shade with both
  children. The children are still never named.
- Homepage family photo: the consultation shot the owners are taking (Shade with a homeowner,
  samples, a window in view). Until it exists, an install photo stands in; swapping it later is a
  one-line content change.

## 2. What stays exactly the same (SEO inventory, 2026-09-30)

- Root metadata: title "Custom Blinds, Shades & Shutters in Las Vegas | Premier Shade Solutions",
  description, metadataBase, openGraph site fields, robots index/follow.
- One `<h1>` per page.
- Homepage links to all 5 category pages and all 4 `/service-area/{city}` pages, `/gallery`,
  `/about`, `/contact`, `tel:`; the header and footer navigation unchanged.
- `localBusinessSchema()` (HomeAndConstructionBusiness) on every public page — only its `slogan`
  field changes, because it reads `business.tagline`.
- `app/sitemap.ts`, `app/robots.ts`, all category/product/city pages and their metadata,
  breadcrumb and product schema.
- Images via `next/image` with alt text (decorative hero keeps `alt=""`).
- Past-work reviews stay out of Review/AggregateRating schema (FTC rule, `content/reviews.ts`).

## 3. Homepage, top to bottom (`app/(site)/page.tsx`)

The existing components are reused and reordered; copy changes; one section is new.

1. **Hero** (`components/home/Hero.tsx`, `components/forms/HeroForm.tsx`)
   - Eyebrow: "Family-run window treatments · Las Vegas valley"
   - H1: the slogan (still `business.tagline`).
   - Lead: "Shade and Josh measure, order and install every job themselves. No call center, no
     subcontractors."
   - Form heading (h2): "Free in-home consultation" — sub: "We bring the samples, measure every
     window and quote before we leave. No charge, no obligation."
   - Submit button: "Invite Us Over" (pending text stays "Sending…"). Phone link unchanged.
2. **Trust bar** — same three facts, new voice: "Free · In-home consultation and measurement",
   "Family-run · Measured and installed by us, never subcontracted", "4 · Valley cities served".
3. **New: Family section** (`FamilySection`, replaces `MeetTheOwners` on the homepage)
   - Eyebrow: "Who you'll be working with"
   - H2: "When you invite us in, you're inviting in family"
   - Copy: "We're a family-run business here in the Las Vegas valley. When we walk through your
     door, we're not thinking about the sale. We're thinking about how we'd want someone to treat
     our own home. We'll listen, bring the samples, measure everything ourselves and stay with
     you from consultation to installation."
   - Image: consultation shot (stand-in: an install photo from `content/gallery.ts`), meaningful
     alt text, no children.
   - Link: "Meet the family" → `/about`.
4. **What it's like to work with us** (`WhyPremier`, reworded; same three pillars: we come to
   you at no charge / we do the work ourselves / specified for this climate).
5. **Reviews** (`PastWorkReviews`, unchanged).
6. **Products** (`CategoryGrid`, unchanged links; heading kept).
7. **Gallery** (`GalleryStrip`, unchanged).
8. **Service area** (`ServiceAreaBlock`, unchanged, 4 city links).
9. **Closing** (`ClosingCta`): H2 "Invite us over", sub "We'll bring the samples. You bring the
   coffee.", button "Invite Us Over" → `/contact`, plus the phone link.

`Testimonials` stays in place (renders nothing while `content/testimonials.ts` is empty).

## 4. About page → "Meet the family" (`app/(site)/about/page.tsx`)

- Metadata: title "Meet the Family | Premier Shade Solutions"; description "Premier Shade
  Solutions is a family-run window treatment company serving the Las Vegas valley. Shade designs,
  Josh installs, and we handle every job ourselves."; canonical `/about` unchanged.
- H1: "Meet the family". Eyebrow: "Who we are".
- Photos: the pumpkin-carving family photo (`public/brand/family-pumpkin.webp`, from the owner's
  IMG_7127.jpg, GPS stripped, 768 px wide so shown at a modest size) and the existing
  `owners-family.webp` (moved here from the homepage). Alt text describes the family without
  children's names.
- Story (draft for the owner to edit before release):

  > **It started with Josh's dad.** He installed window treatments across Los Angeles, and Josh
  > grew up on those jobs — learning to measure, mount and finish a window before most kids had a
  > summer job. His dad has since passed, and a lot of how we work comes straight from him: do it
  > right, do it yourself, and stand behind it.
  >
  > **Shade found the design side.** With Josh's encouragement she started designing, and she fell
  > in love with it — not just the fabrics and the finishes, but the people: sitting down in
  > someone's home, listening, and helping them get it exactly right. She became a top
  > designer, first in Ohio and now here in Las Vegas.
  >
  > **Now it's our family's business.** Shade designs, Josh installs, and our kids are growing up
  > around it the way Josh did. When you invite us into your home, you're working with us — not a
  > call center, not a rotating crew.
  >
  > **You let us into your home. We let you into our family.**

  (Owner approved "top designer" on 2026-09-30. The 4.9-from-44-surveys past-work figure stays
  where it already is.)
- Then the existing `ReviewSpotlight`, "How a job goes" steps and `ConsultationCta` (button text
  "Invite Us Over").

## 5. Site-wide effects

- `content/business.ts` `tagline` → the new slogan. This flows to the homepage H1, the footer
  (`Footer.tsx:17`), the OG image (`app/(site)/opengraph-image.tsx`, alt updated to match) and
  the schema `slogan`.
- `ConsultationCta` and any other "Request Consultation" submit buttons on public forms become
  "Invite Us Over" with the plain "free in-home consultation" line beside them. The header's
  "Free Consultation" link is unchanged.
- Conversion tracking is unchanged: `generate_lead` still fires on form submit; ad-click
  attribution untouched.

## 6. Testing and SEO proof

- Update `tests/home.test.tsx` and `tests/business.test.ts` for the new tagline and button text;
  keep every existing structural assertion (one h1, category and city links, alt text, contact
  and `tel:` links).
- New SEO guard test: renders the homepage and the About page and asserts the full set of
  internal links from today's inventory, exactly one h1, the unchanged root title/description,
  and that the LocalBusiness schema keeps name, telephone, areaServed and sameAs.
- About page test: H1, story sections, both family photos with alt text, canonical `/about`.
- No children's photo on the homepage (asserted by image `src`).
- `next build`, then compare the live homepage after deploy: same title, description, one h1,
  same link set.

## 7. Out of scope

- Product, category and city page copy.
- Removing the family images from Google Ads (owner undecided; separate from the site).
- A/B testing the button wording.
- New photography beyond swapping in the consultation shot when it arrives.

## 8. Addendum (2026-09-30): every ad page is a booking page, every page has a photo

Why: Google Ads review the same day. FACT: 34 all-time clicks; the Search campaign's 17 produced
1 lead (via /motorization). FACT: paid-search visitors engaged 19% of sessions for 20 s on average,
against 59% and 1 m 50 s for organic. FACT: the ad landing pages (category and product pages) have
no form, no photo (20 public pages render zero `<img>`), no reviews and no offer; "Book a
consultation" sends visitors to the long /contact form. Owner decisions in conversation:
"make each ad page also a book a consultation page" and "each page should have at least 1 image".

Scope added to this spec (§7's "Product, category and city page copy" stays out of scope; the
body copy of those pages is not edited, only blocks are added around it):

- **Booking block** (`BookingBlock`) placed directly under the page hero on all 5 category pages
  and all 14 product pages, so it is the first thing an ad visitor sees on a phone. Contents:
  - The existing three-field form (name, phone, email), with heading "Free in-home consultation",
    the sub line from §3.1 and the "Invite Us Over" button. On phones the form comes first.
  - One photo, the family line "Shade and Josh measure, order and install every job themselves.
    No call center, no subcontractors." and one spotlight past-work review, labelled as from the
    owners' years before Premier Shade Solutions (FTC rule in `content/reviews.ts`), linking to
    `/reviews`.
  - Leads from it carry `source: "booking"`, so the owner and the lead email can tell them apart
    from the homepage hero and the contact page.
- **City pages:** the long consultation form section is replaced by the booking block with the
  city pre-filled; its "Book a free consultation in {city}" H2 stays (SEO).
- **Reviews page:** the booking block replaces the bottom `ConsultationCta`.
- **Contact page:** the consultation photo sits at the top of the aside.
- **Photos.** Only a photo that truly shows the product is ever used for it:
  - Products gain an optional `image`, set for Vertical Blinds (sheer verticals), Wood & Faux
    Wood Blinds, Roller Shades, Cellular Shades, Transitional Shades and Plantation Shutters. A
    product's booking block shows its own photo, else the shared consultation photo.
  - The Blinds category gains the faux wood photo beside its intro, as Shades and Shutters already
    have. Category booking blocks always show the consultation photo, so a category photo is never
    shown twice.
  - `consultationPhoto` is the same stand-in as §3.3: an install photo until the owners'
    consultation shot exists.
  - Solar Shades, Composite and Real Wood Shutters, Roman, Woven Wood, every Outdoor page and
    Motorization show the consultation photo until the owners photograph those products.
- **Rule, enforced by a test:** every page in the sitemap renders at least one `<img>` with
  non-empty alt text, except `/privacy` and `/accessibility` (legal text, owner to confirm).
- The header already stays visible on phones with a call icon, so no extra sticky call bar is
  added.
