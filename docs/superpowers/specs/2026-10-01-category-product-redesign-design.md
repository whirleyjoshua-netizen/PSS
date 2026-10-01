# Category and product page redesign — design

Date: 2026-10-01. Direction approved by the owner (Joshua) in conversation the same day, from an
AI-generated mockup ("Elegant Las Vegas Shades Landing Page"). The mockup is inspiration only:
its photos are AI-made and its review ("Michelle R., Summerlin") is invented, so neither is ever
used. Real photos and real reviews only.

Branch `feat/page-redesign`, built on `feat/family-brand`. The two ship together as one release:
the owner approved family-brand's wording and branding but wants these pages restyled before
anything goes live.

## 1. Scope

- **In:** the 5 category pages (`app/(site)/[category]/page.tsx`) and the 14 product pages
  (`app/(site)/[category]/[product]/page.tsx`).
- **Out (keep family-brand's look and wording):** homepage, city pages, `/reviews`, Meet the
  family, contact, gallery, header, footer.
- **Body copy is not rewritten.** Every tagline, intro and body paragraph, "Best for" line,
  feature list, title and SEO field stays word for word. New wording is limited to §5.

## 2. What stays exactly the same (SEO and ads)

- Page titles, meta descriptions, canonicals, Open Graph, breadcrumb and product JSON-LD.
- Exactly one `<h1>` per page: "{Name} in Las Vegas".
- Every internal link the pages have today (breadcrumbs, the category's product links, sibling
  product links, `#book`).
- The booking form: `HeroForm` with `source: "booking"`, `treatment` = the category name,
  `id="book"` on its section so every "Invite Us Over" link still lands on it.
- Spec 2026-09-30 §8 rules: the form is the first thing after the page title on a phone; every
  page renders at least one `<img>` with non-empty alt; only a photo that truly shows the product
  is used for it; past-work reviews carry the "before we opened Premier Shade Solutions" label and
  stay out of review schema.

## 3. Category page, top to bottom

1. **Photo hero** (one section, replaces `PageHero` + `BookingBlock` on these pages):
   - Full-width photo: the category's `bookingPhoto`, else `consultationPhoto`.
   - Over the photo's left side, on a soft ivory wash for legibility: breadcrumbs, the tagline as
     a small-capitals eyebrow, the serif H1, and the category's `seo.description` as one line.
   - Floating on the right: the booking form card ("Free in-home consultation", "Invite Us
     Over").
   - Overlapping the photo's bottom edge: the featured past-work review card (stars, quote, name,
     date, the "before we opened" label, "Read every review").
   - **Phone order:** photo with title, then the form, then the review card.
   - **As built:** on a phone the photo is a short 32/9 band (16/7 from `sm`), then the title,
     the form and the review card stacked on sand; the H1 is `text-3xl` on a phone. The lead line
     (`seo.description`) is hidden below `sm` so the form's "Invite Us Over" button stays above a
     390×844 fold — the family-brand spec (2026-09-30 §8, every ad page a booking page) outranks
     the lead line; the meta description is unaffected. From `lg` the photo fills the section, the title
     panel sits left, the form right, and the review card sits under the title on the photo.
2. **Promise row:** the three badges (Free consultation · Family-run · No obligation) and the
   family line, centred under the hero.
3. **Icon row:** four line icons with two-or-three-word labels, per category (§5).
4. **Story section:** left — eyebrow, serif H2, the category's existing intro paragraphs, a
   "Meet the family" button linking to `/about`. Right — the category's `image` (else the fabric
   panel, §6) with a small floating caption card (eyebrow + one line, §5).
5. **Explore cards:** "Explore {Name}" grid of the category's products: photo on top (the
   product's `image`, else the fabric panel), name, tagline, "Learn more →". Motorization has no
   products, so it has no grid.
6. **Reviews band:** `ReviewSpotlight` with the spotlight past-work reviews (as on Meet the
   family), minus the one already on the hero card so no quote shows twice.
7. **Closing section:** today's `ConsultationCta`, unchanged.

## 4. Product page, top to bottom

1. **Photo hero:** same component as §3.1. Photo: the product's `image`, else
   `consultationPhoto`. Eyebrow = product tagline; one line = product `seo.description`.
   Breadcrumbs: Home / {Category} / {Product}.
2. **Promise row:** as §3.2.
3. **Icon row:** the parent category's four icons.
4. **Story section:** left — eyebrow = category name, serif H2 "Why {product name}", the
   product's existing body paragraphs, "Meet the family" button. Right — the product's
   `storyPhoto` (new optional field, §6), else the fabric panel; the caption card reads "Best
   for" + the product's existing `bestFor` line.
5. **Details band:** the product's existing `features` as a two-column checklist with small
   check marks, heading "Details".
6. **"Other {Category}" cards:** the sibling products as photo cards (same card as §3.5),
   replacing today's text buttons.
7. **Reviews band:** as §3.6.
8. **Closing section:** today's "Thinking about {product}?" `ConsultationCta`, unchanged.

## 5. New wording (owner to approve in this spec)

| Category | Icons (label · icon) | Story eyebrow | Story H2 | Caption card |
|---|---|---|---|---|
| Blinds | Glare control · sun; Privacy · eye; Wipe clean · droplet; Wide glass · window | Keep the light, lose the glare | Control Without Closing the Room Off | Made for hard-working rooms — Kitchens, baths and home offices. |
| Shades | Light control · sun; Privacy · eye; Energy savings · leaf; Desert-ready fabrics · home | More than a window covering | A Single Panel That Changes the Room | Chosen for this valley — The right fabric for every exposure. |
| Shutters | Built to fit · ruler; Sun-proof · sun; No cords · shield; Adds value · home | Part of the house | The Treatment That Reads as Architecture | Fitted to the opening — Framed, finished and built to last. |
| Outdoor Shading | Heat blocking · thermometer; Patio comfort · sofa; Energy savings · leaf; UV protection · shield | Shade before the glass | The Patio You Actually Use | Measured properly — A covered patio, 15–20° cooler. |
| Motorization | App & remote · phone; Schedules · clock; No wiring · battery; High windows · arrow-up | No electrician required | Shades That Beat the Sun to the Window | On schedule — Closes itself every summer afternoon. |

Every label restates something the page's existing copy already says (e.g. "Wipe clean" from
the Blinds intro, "15–20° cooler" from the Outdoor intro).

## 6. Photos

- **Rule kept:** a photo is only ever shown for the product it truly depicts.
- **Fabric panel:** where a card or story slot has no real photo, a sand-coloured block with a
  faint woven texture and the product or category name in light serif lettering. It is
  decorative (`aria-hidden`); the card's text carries the name. Swapping in a photo later is a
  one-line content change.
- **Never the same photo twice on one page.** Products gain an optional `storyPhoto`, set only
  where the gallery has a second, different photo of that product:
  - Roller Shades: `/gallery/roller-shades-bay-window.webp`
  - Cellular Shades: `/gallery/cellular-shades-top-down-bedroom.webp`
  - Plantation Shutters: `/gallery/plantation-shutters-bedroom.webp`
  Every other product's story slot shows the fabric panel.
- **Page order decides a repeat.** Slots fill top to bottom (hero, story, cards); a slot whose
  photo already appeared higher on the page shows the fabric panel instead. Only Blinds is
  affected today: its hero and story photos are also its two products' photos, so both Blinds
  cards show the panel until two more blinds photos exist.
- **Today's photo slots, unchanged:** category hero = `bookingPhoto` (Blinds, Shades, Shutters)
  else `consultationPhoto` (Outdoor, Motorization); category story = `image` (Blinds, Shades,
  Shutters) else the panel.

## 7. Look

- **Headings:** H1 and story H2s in Source Serif 4 (already loaded as the body font, weight
  400) at display sizes with slightly tightened tracking — no new font file and no change to the
  font download. A `.heading-serif` class in `app/globals.css`, unlayered and declared after the
  `h1, h2, h3, h4` rule, because that rule is unlayered and would beat a Tailwind utility.
  Menus, buttons, eyebrows and small labels keep Jost.
- **Colours:** the existing ivory, sand, champagne and charcoal tokens. No new colours.
- **Icons:** a small inline-SVG set in the existing stroke style (`components/ui/LineIcon.tsx`),
  decorative, `aria-hidden`.
- **Motion:** the existing slow zoom on the hero photo and `Reveal` on scroll, both respecting
  reduced motion.
- **As built:** `.heading-serif` is also on the product page's "Details" H2 and on the card H3s
  (Explore / Other cards), as in the mockup.

## 8. Components

New, in `components/treatment/` (used only by category and product pages):

- `TreatmentHero` — photo, title block, booking form, review card (§3.1).
- `PromiseRow` — badges + family line (moved from `BookingBlock`; `BookingBlock` imports it, so
  city and reviews pages render exactly as before).
- `IconRow` — four icons + labels.
- `StorySection` — text column + photo-or-panel with caption card.
- `PhotoCard` / `PhotoCardGrid` — the Explore / Other cards.
- `FabricPanel` — the no-photo stand-in.
- `DetailsBand` — the product checklist.

**As built:** `PromiseRow` and `FeaturedReviewCard` live in `components/booking/`, not
`components/treatment/`, because `BookingBlock` owns them (city and reviews pages use them through
it); `TreatmentHero` and the category and product pages import them from there.

Content: `content/products.ts` gains `highlights` (4 × {label, icon}), `story` ({eyebrow,
heading, caption: {eyebrow, line}}) on categories, and optional `storyPhoto` on products.

## 9. Testing

- Unit tests for each new component, and page tests for one category with products (Shades), one
  without (Motorization), one product with `storyPhoto` (Roller Shades) and one with no photo at
  all (Solar Shades): one h1, breadcrumbs, the form with `source="booking"` and the right
  treatment, the review label, icon labels, story text, cards and their links, reviews band.
- The existing SEO guard and "every sitemap page has an image with alt" tests keep passing
  unchanged; add a test that no category or product page shows the same image `src` twice.
- A test that city pages and `/reviews` still render `BookingBlock` unchanged.
- E2E: the consultation spec submits the form from a category and a product page; a phone-size
  check that the form comes before the review card.
- Screenshots of Shades, Motorization, Roller Shades and Solar Shades at desktop and phone size,
  shown to the owner before shipping.

## 10. Out of scope

- Restyling the homepage, city, reviews and Meet the family pages (owner may ask later).
- New photography (the panels wait for it).
- Per-product icon rows.
- Rewriting body copy.
