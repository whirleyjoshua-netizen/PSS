# Holiday landing page + holiday Search ad — design

Owner, 2026-10-10. The flyer Gemini made (`~/Downloads/Gemini_Generated_Image_.jpeg`) is the look; its redrawn logo is
not used. The raw photo is `~/Desktop/IMG_2082.JPG`, the owner's own install (owner-confirmed), 1536×926.

## Owner decisions

- Ad type: Google **Search (text)** only. No Display, social, or print sizes for now.
- Photo: our own install, so it may also join the gallery. The owner confirmed (2026-10-10) that the client is fine with it on the site and in the gallery.
- Motorized shades count toward the 10% (owner, 2026-10-10).
- The 10% offer covers **3 or more custom shades or blinds on one order. Shutters are excluded.**
- "Book by Nov 15" means **the consult is booked by Nov 15**. The visit itself may be later.
- Approach 1: a new noindex `/holiday` page (not a `/consultation` variant, not an indexed page).

## The page: `/holiday`

Noindex and not in the sitemap, like `/consultation`. It reuses `ConsultationLanding`'s parts and needs no new data.

### Hero, offer window (`holidayOffer` live: Oct 9 – end of Nov 15, Las Vegas time)

- The photo, full-bleed, with a light fade so the text reads, in the flyer's mood.
- Eyebrow: "Holiday special · Las Vegas valley".
- Headline: "Get your home ready for the **Holidays**", with "Holidays" set large in the serif.
- Offer: "10% off 3 or more custom shades or blinds. Book your free consult by Nov 15."
- Small note, built from `content/lead-times.ts` (never typed in): "Shades and blinds take 3–5 weeks from your consult. Shutters take 6–10 weeks and aren't part of the 10%."
- The booking form (`HeroForm` via `TreatmentHero`), on the right on desktop and under the headline on a phone. The fold rule from `/consultation` holds: the submit button is fully visible at 390×844.

### Hero, after the offer (`holidayPromo` live: Nov 16 – Dec 24)

- Headline: "Give your home a fresh look before the family arrives."
- The 10% line and the shutters note are gone. The lead-time note stays.

### Switching

- The page picks its hero from `content/promo.ts` with `isPromoLive`, so it switches on the same instant as the banner.
- It is rendered with `revalidate = 3600`, so it changes within an hour with no redeploy.
- From Dec 25, `/holiday` redirects to `/consultation`, so a stale ad or bookmark never lands on a dead page.
- After expiry the page never shows the 10%. A test pins this for Nov 16 and Dec 25.

### Below the hero

1. A three-icon strip from the flyer: More comfort · Beautiful curb appeal · A space you'll love. It replaces `PromiseRow` on this page.
2. The "What usually goes wrong" cards: `PAINS`, unchanged.
3. `ReviewSpotlight`, as on `/consultation`.
4. "How it works": `STEPS`, unchanged.
5. Questions. Two holiday questions come before the usual `FAQ`:
   - "Will it be installed by Christmas?" Shades and blinds take 3–5 weeks from your consult, shutters 6–10. The sooner we come out, the better your chances. Your lead time is in writing on your quote, and if it lands after the holidays we put up temporary shades for free.
     - The weeks come from `lead-times.ts`.
     - It never promises a date. This matches the banner's "may be after Christmas" line.
   - "What counts toward the 10%?" Three or more custom shades or blinds on one order, motorized included, with your consult booked by Nov 15. Shutters aren't included.
     - This question is shown only while the offer is live.
6. A closing box with the title "Ready for the holidays?" and a link to `#book`.

### Leads

- Leads already record `landing_page` (migration 022), so a holiday lead shows `/holiday` without a migration.
- The plan checks that the admin lead view and the new-lead email show the landing page, so Shade’ knows to apply the 10%.
- The 10% is applied by hand on the quote with the existing quote discount (042).

### Site changes outside the page

- `content/promo.ts`:
  - `holidayOffer.message` becomes "Holiday special: 10% off 3 or more custom shades or blinds. Book by Nov 15."
  - Its `shortMessage` stays "10% off 3+ shades".
  - Both promos change `href` to `/holiday`.
- Gallery: add the photo to `content/gallery.ts`. It is real work, with alt text describing the room.
  - It becomes 1800px WebP at quality 78, under `public/gallery/`.
- Brand voice: add the holiday offer and its wording rules to `docs/marketing/brand-voice.md`.

## The Google holiday ad (not changed in Ads until the owner approves and pays)

Each ad group gets one holiday RSA with its final URL set to `/holiday`. Every line was counted against the limits (headline ≤30, description ≤90).

### Shades, Solar Shades, Motorized, Blinds and Window Treatments

Holiday headlines:
- Holiday Special: 10% Off (24)
- 10% Off 3+ Shades or Blinds (27)
- Book Your Consult by Nov 15 (27)
- Ready for the Holidays? (23)
- Holiday-Ready Windows (21)

They are filled out to 15 with the group's keyword line and approved lines from the second-ads doc.

Descriptions:
- Holiday special: 10% off 3 or more custom shades or blinds. Book your consult by Nov 15. (88)
- Shades and blinds take 3–5 weeks from your consult. Free temporary shades meanwhile. (84)
- From your first call to the final install, we're family. More than customer service. (84)
- Get your home ready for the holidays. Free in-home visit, every window measured. (80)

### Shutters (no 10%)

Headlines:
- Shutters for the Holidays? (26)
- Shutters Take 6–10 Weeks (24)
- Book Early for the Holidays (27)
- The approved shutter lines

Description:
- Shutters take 6–10 weeks, written on your quote. Book early for your best holiday shot. (87)

### Ending on time

- A Google promotion asset: 10% off, end date Nov 15.
- A Google Ads automated rule pauses the 10% RSAs at the end of Nov 15.
- A second holiday RSA per group ("Before the Family Arrives" (25), "Give your home a fresh look before the family arrives. Free in-home consultation." (81)) starts Nov 16.
- A rule pauses everything holiday at the end of Dec 24.
- If auto mode blocks Ads saves, the owner gets click steps.

## Out of scope

- Display, Performance Max, social and print sizes.
- Changing the existing six ads, which is already planned separately.
- Automatic discounts on quotes.

## Tests

- **Content guard:** `/holiday` copy never says "before we leave" or "on the spot", never makes a headcount promise, and always writes "Shade’" with the mark. These are the existing guard tests, extended to the new files.
- **Offer wording:** every mention of the 10% says shades or blinds and is shown only inside `holidayOffer`'s window. A mutation check confirms it: remove the date check and watch the test go red.
- **Dates:** with the clock frozen at Nov 10, Nov 16 and Dec 25, the page shows the offer hero, the family hero, and a redirect.
- **Banner:** both promos link to `/holiday`, and their dates are unchanged.
- **Lead times:** the hero note and FAQ read `lead-times.ts`. A test fails if a week count is typed into the page.
- **e2e at 390×844:** the submit button is fully in view, and the page is noindex.
