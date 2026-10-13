# Marketing Audit: Premier Shade Solutions
**URL:** https://premiershadesolutions.com/
**Date:** 2026-10-13
**Business Type:** Local Business, home service. A family-run window treatment business in the Las Vegas valley. The only conversion is a free in-home consultation.
**Overall Marketing Score: 61/100 (Grade: C)**

**How to read this report.** Every claim is labelled:
- **FACT**: seen today on the live site, or in the live code (`origin/main`), with a file or URL cited.
- **ASSUMPTION**: an inference or a generic benchmark.
- **RECOMMENDATION**: advice.
- **EXPERIMENT**: a test with a decision rule.

No form was submitted and no lead was created during this audit.

**Source note.** FACT: the local `main` checkout is 562 commits behind `origin/main`. Every code citation here was read from `origin/main`, the code that is live. Two analyst findings were stale (a "4–6 weeks" lead time and "no remake guarantee") and have been corrected below. The 3 Day Blinds audit that was previously in this file is now `MARKETING-AUDIT-3DAYBLINDS.md`.

---

## Executive Summary

Premier Shade Solutions scores **61/100 (Grade C)**. That is close to 3 Day Blinds (60), with the opposite profile:
- **PSS has the stronger story.** It is the only site in the Las Vegas set where the customer knows exactly who will turn up.
- **PSS has the weaker proof.** It has no reviews of PSS itself, no licence or insurance shown, no third-party listings beyond Google, and only a small paid-search test bringing traffic (paused on 2026-10-13 while these fixes are made).

**Biggest strength: owner-led promises that answer the industry's top complaints.**
- FACT: the copy names the people. Shade' designs, Josh measures and installs, and the work is "never subcontracted".
- FACT: there is a measurement guarantee (`content/consultation.ts:42,75`): "If a measurement is off, we remake it and install it again, free."
- FACT: lead times are written down (`content/lead-times.ts`), and free temporary shades are offered while you wait.
- FACT: the 3 Day Blinds audit found these exact complaint themes against them: delays, measurement errors and unreturned calls.
- FACT: product and city pages read like a practitioner wrote them, not a template.

**Biggest gap: the best promises are hidden, and nothing proves PSS is real.**
- FACT: the guarantee, written lead times and temporary shades appear on `/consultation/*` and `/holiday`. They are not on the homepage, and `/holiday` is `noindex`.
- FACT: `content/testimonials.ts` is empty. All 44 reviews (4.9 average) are from the owners' Custom Decorators years. They are disclosed honestly, but they are borrowed.
- FACT: no contractor licence, insurance or address appears on the site.
- FACT: no price guidance appears anywhere.
- FACT: phones have no visible booking button.
- FACT: the site promises a call back "within 3 business days".

**Top 3 actions**
1. **Start building proof of PSS itself** (owner action). Ask every completed job for a Google review using the review engine that is already built. Claim Yelp, BBB, Nextdoor and Houzz. Show licence and insurance if they are held.
2. **Rework the homepage** (code, about 1 day). Keep the family H1. Add a subhead that names the products and cities. Move the guarantee, written-lead-time and temporary-shades block up from `/holiday`. Put proof and the live offer inside the form card.
3. **Fix mobile and speed-to-lead** (code plus an owner decision). Add a sticky mobile Call / Invite Us Over bar. Replace "within 3 business days" with a response time the owners can keep, backed by a text alert to both owners.

**Revenue impact.** It is not estimated, because every input is missing (see the Revenue Impact Summary). PSS already stores the data needed to compute it. Inventing a figure would break the house rule.

---

## Score Breakdown

| Category | Score | Weight | Weighted Score | Key Finding |
|----------|-------|--------|---------------|-------------|
| Content & Messaging | 68/100 | 25% | 17.0 | Expert, warm copy. The H1 names no product, and the best proof sits on an unindexed page |
| Conversion Optimization | 65/100 | 20% | 13.0 | Only 3 required fields, but no mobile CTA, no proof by the form and a 3-business-day callback |
| SEO & Discoverability | 68/100 | 20% | 13.6 | Clean base. og:image is missing on 23 money pages, the business schema is thin and there is no homepage canonical |
| Competitive Positioning | 48/100 | 15% | 7.2 | The strongest story in the Vegas set, with the weakest third-party proof and no comparison or cost content |
| Brand & Trust | 58/100 | 10% | 5.8 | Honest review framing. No licence, insurance or address, and 0 reviews of PSS itself |
| Growth & Strategy | 48/100 | 10% | 4.8 | A full attribution and referral stack is built, but traffic is tiny: a $25/day Search test, paused 2026-10-13 for these fixes |
| **TOTAL** | | **100%** | **61.4 (61/100)** | |

---

## Quick Wins (This Week)

These are code changes. Each one is small and none needs the owners to spend money.

1. **Name the product and city in the hero, and keep the family H1.**
   - Where: the homepage hero paragraph (`components/home/Hero.tsx`).
   - Copy: "Custom blinds, shades, shutters and solar screens for Las Vegas, Henderson, Summerlin and North Las Vegas. Shade' designs, Josh measures and installs. No call center, no subcontractors."
   - Why: FACT, the H1 "You let us into your home. We let you into our family." passes the warmth test but not the 5-second "what do they sell?" test.
   - Impact: ASSUMPTION, fewer bounces from cold ad traffic.
   - Alternative not taken: the SEO analyst suggested putting the keyword in the H1 itself. The page `<title>` already carries "Custom Blinds, Shades & Shutters in Las Vegas", so the H1 can stay the family line.
2. **Move the objection block onto the homepage permanently.**
   - What: the four `/holiday` cards ("Your lead time, in writing.", measurement guarantee, personal service, "We leave it cleaner."), minus the holiday wording. Place them between the reviews and "What we install".
   - Why: FACT, these answer the top 3 Day Blinds complaint themes, and today only an unindexed page and the consultation pages show them.
3. **Put proof and the offer inside the form card** (`components/forms/HeroForm.tsx`, below the button).
   - Proof line: "4.9 average from 44 client surveys of Josh and Shade's work at Custom Decorators", plus the `PromiseRow` badges.
   - While `holidayOffer` is active, add above the button: "Holiday: 10% off 3+ shades or blinds when you book by Nov 15." Pass the same hidden notes `/holiday` uses, so leads arrive tagged.
4. **Add a sticky mobile booking bar.**
   - What: a new `components/layout/MobileBookBar.tsx` (`fixed inset-x-0 bottom-0 md:hidden`) with two buttons at least 48px tall, "Call" and "Invite Us Over". Hide it on /contact, /thank-you and /project. Render it in `SiteChrome.tsx`.
   - Why: FACT, the header consult button is `hidden md:flex` (`Header.tsx:68-81`) and no bottom bar exists.
5. **Restore social preview images on 23 money pages.**
   - Why: FACT, `openGraph` overrides in four `generateMetadata` functions drop the inherited image:
     - `[category]/page.tsx:39`
     - `[category]/[product]/page.tsx:43`
     - `service-area/[city]/page.tsx:30`
     - `guides/[slug]/page.tsx:29`
   - What: add `images` and set `twitter.card` to `summary_large_image`.
   - This matters every time a quote link or page is texted.
6. **Make the lead-time wording say one thing.**
   - FACT, the site gives three versions:
     - `/holiday` says "from your consult" (`content/holiday.ts:38`).
     - The consultation FAQ says "counted from the day you order" (`content/consultation.ts:71`).
     - The lead-times menu says "Counted from your consult, when you order" (`LeadTimesMenu.tsx:122`).
   - What: pick one. "From the day you order" is the safer promise. **The owners decide.**
7. **SEO hygiene.**
   - Add a homepage canonical (`app/(site)/page.tsx`).
   - Enrich the business schema (`lib/seo/schema.ts:32`) with `@id`, `logo`, `image` and `openingHoursSpecification`.
   - Switch the product `Product` markup (`schema.ts:70`) to `Service`.
   - Add `BreadcrumbList` to the city pages.
   - Give the 404 page its own title.
   - Replace the fixed sitemap date (`app/sitemap.ts:13`).
   - Turn the footer H2s into labels.
   - Do **not** add AggregateRating. FACT: the reviews pre-date the business, and `content/reviews.ts` deliberately keeps them out.
8. **Apply the house punctuation rule to headlines.**
   - FACT, these headlines lack a period: "Every treatment, measured for your windows", "Installed by the two of us", "Serving the Las Vegas valley", "Specified for this climate", "Repair & care guides".
   - FACT: "Get your home ready for the Holidays" also has a stray capital H.
   - Use the bare button label "Invite Us Over" everywhere, including the header's "Free Consultation" (`Header.tsx:79`, `MobileMenu.tsx:138`).
9. **Show the Google Business Profile.**
   - What: a visible "See us on Google" link in the footer and on /reviews, and a "Leave a review" link on /contact.
   - Why: FACT, the Maps CID appears only inside JSON-LD.
10. **Close the tracking gaps before Ads restart.**
    - Fire a direct Ads `conversion` event beside `trackLead` and `trackPhoneClick`.
    - Track `mailto:` clicks (`lib/analytics/events.ts`).
    - Confirm `generate_lead` is a Primary conversion in Google Ads.

## Strategic Recommendations (This Month)

1. **Build reviews and listings for PSS itself** (owner action, no spend).
   - Send the built review request (`lib/reviews/send.ts`) after every completed job. It needs `GOOGLE_REVIEW_URL` set.
   - Ask past PSS customers directly. Never offer an incentive for a review.
   - Claim Yelp, BBB, Nextdoor and Houzz.
   - Once there are 5 or more Google reviews, show a "Since opening Premier Shade" strip above the Custom Decorators surveys.
   - Retire the weakest survey quotes from rotation: one-liners, and "What a great employee you have", which undercuts the owner story.
   - Target: 25 or more Google reviews before the spring heat season.
2. **Show licence, insurance and a warranty summary** (owner must confirm the facts first).
   - What: a trust strip on the homepage, the consultation pages and the footer. Include the NV contractor licence number if held, "Licensed & insured" if true, and a plain warranty line. FACT: today the only warranty line is "Backed by strong manufacturer warranties" (`content/products.ts:497`).
   - **Never publish a licence or warranty term that isn't real.** The licence question also gates the builder and multifamily work Tobi researched.
3. **Make the response promise faster and keep it.**
   - FACT, "within 3 business days" appears in:
     - `thank-you/page.tsx:28`
     - `thank-you/all-set/page.tsx:37`
     - `contact/page.tsx:87`
     - `lib/leads/email.ts:98`
   - FACT: owner alerts are email-only (`app/api/consultation/route.ts`).
   - What: choose a time the owners can actually meet, for example "the same business day". Add an SMS or push alert to both owners.
   - Metric: median time to first contact (the contact log already records it), and the lead-to-booked rate.
4. **Publish price ranges.**
   - What: a "What it costs in Las Vegas" page, a FAQ entry in `content/consultation.ts`, and one line per category page.
   - Why: FACT, none of the 5 local competitors shows prices.
   - Figures must come from real PSS data, the average `leads.sold_cents` by product. Never invent them.
   - **EXPERIMENT:**
     - Metric: lead-to-sold close rate, 60 days before vs after.
     - Guardrail: lead volume.
     - Decision: keep it if the close rate rises and lead volume falls less than 20%.
5. **Re-enable Google Search after the quick wins ship** (campaign "Search - Window Treatments LV" was live at $25/day and was paused on 2026-10-13) (APPROVAL ITEM: account payment and about $750 a month).
   - Spend: $25 a day.
   - Structure: 5 ad groups (shutters, solar, cellular, motorized, blinds), each pointed at its `/consultation/<category>` page, with negatives (diy, online, cheap, repair).
   - Add the holiday 10% as a callout until Nov 15.
   - Import the 3 offline conversions.
   - Kill rule: pause and review search terms if about $750 over 30 days books no consultation.
   - Do this after quick wins 1–4, so paid clicks land on the improved page.
6. **Add comparison pages.**
   - Pages: "Premier Shade vs 3 Day Blinds", "Owner-installed vs a franchise", and "Premier Shade vs a big-box install".
   - Why: FACT, no competitor in the set has comparison pages.
   - Cite competitor facts only with sources, from `MARKETING-AUDIT-3DAYBLINDS.md` and the competitor profiles below.
7. **Lighten the /contact form.**
   - Mark every non-required field "(optional)", or fold those fields behind "Add details (optional)". The thank-you questionnaire already collects them.
   - Add per-field errors with `aria-invalid`.
   - Stop filing every homepage lead as Las Vegas (`HeroForm.tsx:26,53`). `lib/leads/zip-city.ts` already exists.

## Long-Term Initiatives (This Quarter)

1. **Desert-heat campaign and content cluster, March to June.**
   - Six guides, starting with:
     - "Solar screens vs solar shades in Las Vegas"
     - "West-facing windows"
     - "Shutters at 115°F: composite vs wood"
     - "Motorizing high windows"
   - Plus a "Beat the heat" offer page.
   - Why: FACT, Budget Blinds Summerlin already blogs on this. ASSUMPTION: local demand peaks with the heat.
   - Offer and spend are APPROVAL ITEMS.
2. **Past-customer upsell and referral.**
   - What: a message 60–90 days after install offering motorization or a "next room". Reuse the review-email pattern and the built $100 referral codes (`lib/referrals/codes.ts`).
   - Offer and send cadence are APPROVAL ITEMS.
3. **One B2B lane: interior designers.**
   - What: start 5 designer conversations with a trade-referral fee.
   - Why: Tobi's pipeline rates designers as the highest-probability lane.
   - Every send needs the owners' approval. Builder and multifamily work waits on the licence and insurance gate.
4. **Door-hanger and yard-sign test in 2 new-build communities** (EXPERIMENT; APPROVAL ITEM for print).
   - What: use the existing `?ref=door` and `?ref=yard` QR codes.
   - Kill rule: fewer than 2 consults per 500 door hangers.
5. **Orphaned-customer page.** A "Service and repairs for 3 Day Blinds and Next Day Blinds products in Las Vegas" page.

---

## Detailed Analysis by Category

### Content & Messaging Analysis (68/100)

| Dimension | Score | Key finding |
|---|---|---|
| Headline clarity | 6/10 | The H1 is warm but names no product. Only the small eyebrow does |
| Value proposition | 7/10 | "The owners do everything" is clear and different from competitors |
| Copy persuasion | 7/10 | /holiday handles objections superbly. The homepage barely does |
| Social proof | 6/10 | Honest and compliant, but borrowed and often generic |
| Content depth and authority | 7/10 | Expert product and city pages. Only 2 guides and no cost content |
| Voice consistency | 7/10 | Strong family voice, with lead-time wording and punctuation slips |
| CTA copy | 8/10 | "Invite Us Over" is distinctive. Capitalisation varies |

**Strengths (FACT)**
- `/shades/solar-shades`: "The number that matters is openness factor… it is exactly the decision people get wrong buying online."
- City pages are local, not boilerplate. Henderson: "more Henderson jobs end up motorized than anywhere else we work." Summerlin covers west glass and HOA rules.
- `/holiday` names the real fears ("It took forever." / "They measured wrong." / "Once they had my money, they disappeared.") and answers each one.
- The review framing is honest everywhere: "Every review below is from our years installing and designing for Custom Decorators… before we opened Premier Shade Solutions."

**Weaknesses (FACT)**
- The hero subhead is generic ("Just personalized, streamlined service").
- The same hero paragraph is pasted on every product and city page.
- Many survey quotes are one-liners. The newest review is from Dec 2024.
- No warranty line beyond the manufacturer mention.

### Conversion Optimization Analysis (65/100)

| Dimension | Score | Key finding |
|---|---|---|
| CTA strategy and placement | 6/10 | Clear on desktop. No consult CTA on phones |
| Form friction | 8/10 | The hero form has 3 fields with correct types and autocomplete. /contact shows 10 fields, none marked optional |
| Trust and price anxiety by the form | 5/10 | No proof beside the hero form. No price guidance |
| Offer and urgency | 7/10 | A real, dated offer, but never on the main forms |
| Post-submit and speed-to-lead | 5/10 | A 3-business-day callback, email-only owner alert, no self-scheduling |
| Conversion tracking | 8/10 | Form submits and tel: taps are tracked, gclid offline upload works. No direct Ads tag, mailto untracked |

**Conversion path (FACT, `origin/main`)**
1. The header shows "Call" and "Free Consultation" on desktop only. On phones, the CTA is in the menu (`Header.tsx:68-81`, `MobileMenu.tsx:134-138`).
2. Hero order: holiday line, eyebrow, H1, family lines, Call button, then HeroForm (`Hero.tsx:41-70`). On a phone the form is far down the page.
3. HeroForm asks for name, phone and email (`HeroForm.tsx:57-87`). It is reused on product, city, review and holiday pages.
4. Submitting POSTs to `/api/consultation`. The database insert and owner email run in parallel, then a customer confirmation is sent.
5. `generate_lead` fires, then the visitor goes to `/thank-you`: "Expect a call within 3 business days."
6. Tracking: GA4 `G-HP83GW86YX` plus the Ads config `AW-18438614507`. tel: taps are counted as `phone_click`, and booked and sold offline conversions are exported (`lib/leads/conversions.ts`).

**Versus 3 Day Blinds (FACT):** PSS asks for 3 required fields against their 6 plus autodialler consent. 3 Day Blinds shows appointment availability right away, while PSS promises a callback within 3 days.

**EXPERIMENT: proof in the hero form**
- Control: the current HeroForm.
- Variant: the same form plus the 4.9 proof line and promise badges.
- Metric: booked consultations per homepage session.
- Guardrails: junk-lead share and form error rate.
- Split: 50/50 with a Vercel flag.
- ASSUMPTION: traffic is low, so the test needs 6 weeks or more. Run it after Ads restart.

### SEO & Discoverability Analysis (68/100)

| Dimension | Score | Key finding |
|---|---|---|
| Titles and descriptions | 8/10 | 31 unique, local titles. The homepage title is 71 characters, and 3 titles drop the brand |
| Headings | 7/10 | One H1 per page. The footer labels are H2s |
| Canonicals and indexing | 8/10 | The homepage has no canonical. /holiday is correctly `noindex` |
| Crawl, sitemap and redirects | 8/10 | 308 redirects throughout. Every non-guide lastmod is fixed at 2026-08-31 |
| Structured data | 5/10 | The business schema has no address, hours, logo or `@id`. `Product` markup has no offers, and city pages have no BreadcrumbList |
| Social cards | 4/10 | og:image on 8 of 31 URLs. None on category, product, city or guide pages |
| Internal linking | 8/10 | Every money page is linked from the nav and footer. City pages are about 335–393 words |
| Performance | 7/10 | 294 KB of HTML, 24 KB with brotli. The hero image is preloaded and scripts are async. **Core Web Vitals not measured** (PageSpeed Insights returned 429) |
| Local and GBP signals | 5/10 | The phone matches the schema. The GBP link is only in JSON-LD, and no address or map is shown |
| Accessibility basics | 9/10 | Skip link, `<main>`, alt text and 44px buttons all in place |

### Competitive Positioning Analysis (48/100)

| Sub-score | Score | Key finding |
|---|---|---|
| Positioning clarity | 7/10 | The only site where you know who turns up. The H1 has no product or city |
| Pricing visibility | 4/10 | No prices. No competitor shows them either, so this is parity and an opening |
| Feature messaging | 7/10 | Written lead times, remake guarantee and temporary shades exist, but are not on the homepage |
| Market awareness | 1/10 | No comparison, alternatives or "franchise vs owner" content |
| Content authority | 3/10 | 2 guides. Budget Blinds Summerlin ranks with Vegas heat blog posts |
| Third-party reputation | 2/10 | The Google Business Profile exists (rating not visible). No Yelp, BBB, Nextdoor or Houzz found |

**Competitor profiles (FACT unless marked)**
- **Budget Blinds Summerlin/Las Vegas** ([site](https://www.budgetblinds.com/summerlin/))
  - Headline: "UPGRADE YOUR WINDOWS NOW". Offer: "30% Off Window Treatments".
  - "No-Questions-Asked Warranty" (5 years). "Locally Owned, Nationally Backed".
  - Strongest local blog content in the set.
- **3 Day Blinds Henderson/N. Las Vegas** ([Henderson page](https://www.3dayblinds.com/service-areas/nevada/henderson))
  - "45+ years" and a lifetime warranty badge. No offer or prices.
  - Trustpilot 4.3 on 16,269 reviews. BBB complaint themes: delays, measuring errors, unreturned calls.
- **Sunburst Shutters Las Vegas** ([site](https://www.sunburstshutters.com/las-vegas))
  - "In Las Vegas since 1978". Installs "with all of our own people". Award badges.
  - The only competitor already claiming no subcontractors. PSS's sharper claim is "the owners themselves".
- **Bloomin' Blinds Henderson** ([site](https://www.bloominblinds.com/henderson/))
  - "Service is delivered by your local owner". Same-day temporary paper shades.
- **Solar-screen specialists:** SUNOUT ("39 years") and Affordable Solar Screens (Google 5.0 on 25). Lowe's installs through "independent installers".

**Openings PSS can own (RECOMMENDATION)**
1. "The person who measures is the person who drills."
2. Published Las Vegas price ranges. No competitor has them.
3. A one-visit desert-heat plan: solar screens plus interior shades, and composite over wood in direct sun.
4. One accountable phone number with proactive status updates.
5. Don't compete on speed against "3 days". Sell a written date plus updates.

### Brand & Trust Analysis (58/100)

| Dimension | Score | Key finding |
|---|---|---|
| Brand consistency | 8/10 | One source for name, phone and address (`content/business.ts`). Family voice everywhere |
| Trust architecture | 5/10 | Strong remake guarantee. No licence, insurance or bonding shown, and no address (`address.isPlaceholder: true`) |
| Authority signals | 3/10 | 2 guides. No press, memberships or manufacturer-dealer badges |
| Social-proof depth | 5/10 | Honest framing, FTC-aware schema handling, 0 PSS-era reviews |
| Transparency | 8/10 | Owners named and pictured, lead times published, no prices |

### Growth & Strategy Analysis (48/100)

| Dimension | Score | Key finding |
|---|---|---|
| Pricing strategy | 4/10 | No public ranges. Good-better-best tiers exist only internally (`budget_tier`) |
| Acquisition channels | 4/10 | One $25/day Search campaign (paused 2026-10-13 for these fixes). Organic means 4 city pages and 2 guides |
| Retention and expansion | 6/10 | Review and referral engine built. No past-customer upsell |
| Geographic and seasonal leverage | 6/10 | A self-expiring holiday offer. No heat-season plan |
| B2B | 4/10 | Tobi's research exists. Builder and multifamily work is gated on licence and insurance |

**What is built vs what is live (FACT)**

| Capability | Evidence | Live? |
|---|---|---|
| Ad-click attribution (gclid, UTM, landing page) | `db/migrations/022_ad_attribution.sql`, `lib/leads/attribution.ts` | Yes. Ads paused 2026-10-13 |
| Offline conversions (booked, sold) | `lib/leads/conversions.ts` | Built. Useful once Ads run |
| Review request + $100 referral | `lib/reviews/send.ts`, `lib/referrals/codes.ts:7` | Built. Volume sent unknown |
| Print QR `?ref=` attribution | `lib/leads/referral.ts`, `qr-codes/` | Built. Whether print is out is unknown |
| Holiday landing and banner | `app/(site)/holiday/page.tsx`, `content/promo.ts` | Live until Nov 15, then a family message to Dec 24 |
| Per-category consultation pages | `app/(site)/consultation/[category]/page.tsx` | Live. These are the Ads landing pages |
| Business metrics for agents | `lib/agents/stats.ts` | Live. Tara reads them |

---

## Competitor Comparison

Each score is out of 10, from each homepage as fetched today. They are ASSUMPTIONS, the analyst's judgement.

| Factor | Premier Shade | Budget Blinds | 3 Day Blinds | Sunburst Shutters |
|--------|---|---|---|---|
| Headline Clarity | 5 | 4 | 6 | 6 |
| Value Prop Strength | 8 | 6 | 6 | 8 |
| Trust Signals | 5 | 6 | 7 | 8 |
| CTA Effectiveness | 7 | 7 | 6 | 6 |
| Pricing Clarity | 3 | 4 | 2 | 2 |
| Content Depth | 3 | 8 | 7 | 5 |
| **Total /60** | **31** | **35** | **34** | **35** |

PSS has the best story and the least proof. Closing the trust-signal and content gaps is worth more than any copy polish.

---

## Revenue Impact Summary

**No dollar figure is given.** Every input is missing. A number built on generic benchmarks would look precise and mean nothing, and the house rule is never to invent data. PSS already stores every input. The owners can read them in these places:

| Input | Where the real value lives |
|---|---|
| Monthly visits by page and source | GA4 property `G-HP83GW86YX`; Vercel Analytics |
| Visit-to-lead rate | GA4 `generate_lead` ÷ sessions; the `leads` table by `source` and `landing_page` |
| Lead-to-booked rate | `consultations_booked` ÷ leads in `lib/agents/stats.ts` (/admin/agents) |
| Close rate | sales ÷ consultations booked, same source |
| Average ticket | revenue ÷ sales in `lib/agents/stats.ts`, or the average `leads.sold_cents` for Sold-or-later jobs |
| Gross margin per job | HD / Direct Connect cost vs `sold_cents` |
| Cost per click and spend | Google Ads account (paused) |

**Formula:** extra monthly profit = visits × lead rate × relative lift × booked rate × close rate × average ticket × margin. Compare it with spend to get the north star, the **cost to acquire a paying customer**.

**Relative lift by recommendation (ASSUMPTION, generic benchmarks, overlapping)**

| Recommendation | Relative lift in leads (cons / mod) | Confidence | Timeline |
|---|---|---|---|
| Reviews and listings for PSS itself | not sized: it lifts every channel | Medium | 1–3 months |
| Homepage subhead + objection block + proof in form | 5% / 15% | Medium | 1 week |
| Sticky mobile bar | 3% / 8% | Medium | 1–2 days |
| Faster response promise + SMS alert | lifts booked rate, not leads | Medium | 1 week |
| Price ranges | may lower volume and raise close rate | Low | 2–3 weeks |
| Ads restart | all new traffic; sized by spend ÷ cost per lead | Low until data | 30-day test |

---

## Owner Decisions and Approvals Needed

Nothing below is done without your OK.

1. Is a Nevada contractor licence held, what is its number, and is there insurance? Only real facts get published.
2. Price ranges per product, from your own sold jobs.
3. A response time you can always keep, to replace "within 3 business days".
4. Lead-time wording: "from your consult" or "from the day you order"?
5. Warranty terms to state on the site.
6. Google Ads: payment plus about $750 a month (APPROVAL ITEM).
7. Print test, heat-season offer, upsell offer and designer referral fee (each an APPROVAL ITEM).
8. Whether to mention that Custom Decorators is now part of Hunter Douglas (confirm it is accurate and allowed).

---

## Next Steps

1. Start the Google review asks today, and claim Yelp, BBB, Nextdoor and Houzz.
2. Ship the homepage and mobile quick wins (1–5) before Ads restart.
3. Answer the 8 owner decisions above. Most of the remaining work waits on them.

**Follow-up commands:** `/market copy` for the homepage and objection block, `/market funnel` for the lead-to-booked flow, `/market seo` for the desert-heat content cluster.

## Audit Limits

- Core Web Vitals were not measured (PageSpeed Insights returned 429).
- PSS's Google Business Profile rating and review count could not be seen.
- Competitor pages were read through a summarising fetch tool. Spot-check quotes before republishing.
- No conversion data was read. The database was not queried.

*Generated by AI Marketing Suite — `/market audit`*
