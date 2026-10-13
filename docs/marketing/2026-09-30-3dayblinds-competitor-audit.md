# Marketing Audit: 3 Day Blinds
**URL:** https://www.3dayblinds.com/
**Date:** 2026-09-30
**Business Type:** Agency/Services with a local-service delivery model (national shop-at-home custom window treatments; the only conversion is a free in-home design consultation)
**Overall Marketing Score: 60/100 (Grade: C)**

**How to read this report.** Every claim is labelled:
- **FACT**: seen today on the cited page or measured from its raw HTML.
- **ASSUMPTION**: an inference or a generic benchmark, not data from 3 Day Blinds.
- **RECOMMENDATION**: advice.

3 Day Blinds' traffic, lead rate, close rate and average ticket are not public. Revenue figures are therefore a formula with named assumptions, not a forecast. No form was submitted and no lead was created during this audit.

---

## Executive Summary

3 Day Blinds scores **60/100 (Grade C)**. It is an old, well-reviewed brand with good SEO content, but its message is generic, its form asks for a lot up front, and its pages are delivered slowly. The weighted score computes to 59.9 and is rounded to 60.

**Biggest strength: reputation and SEO content.** FACT: Trustpilot shows 4.3 on 16,269 reviews with a reply to every negative review, and the BBB rating is A+. The site has 608 city pages, structured data on every template, named expert authors and an `llms.txt` file.

**Biggest gap: the site never says why to choose 3 Day Blinds or what it costs.**
- FACT: the brand name promises speed, but the "made and shipped within 3 business days" claim appears only in the FAQ.
- FACT: there are no prices, price ranges or offers anywhere on the site. A partner site carries "Buy 1, Get 1 50% OFF" while the brand's own pages carry nothing.
- FACT: the booking form requires name, email, phone and street address, plus consent to autodialled marketing calls, before it shows any availability.
- FACT: the homepage badge says 4.7 on 15,067 reviews while Trustpilot itself says 4.3 on 16,269.

**Top 3 actions:**
1. Change the booking form to ask for zip code first, show availability, then collect contact details.
2. Put the 3-business-day claim, the same-day quote and a live offer in the homepage hero and beside the form.
3. Publish a cost guide with typical price ranges and the existing financing example.

**Estimated revenue impact.** Using a third-party traffic estimate and assumed lead, close and ticket values, the recommendations size to roughly **$89,000 per month (conservative) to $1.1 million per month (moderate)**. Every input except traffic is an ASSUMPTION; see the Revenue Impact Summary for the formula. Treat this as an order of magnitude only.

---

## Score Breakdown

| Category | Score | Weight | Weighted Score | Key Finding |
|----------|-------|--------|---------------|-------------|
| Content & Messaging | 56/100 | 25% | 14.0 | The "3 Day" promise is buried in the FAQ and facts contradict across pages |
| Conversion Optimization | 58/100 | 20% | 11.6 | Six required fields and robocall consent before any availability is shown |
| SEO & Discoverability | 69/100 | 20% | 13.8 | Strong schema and 608 city pages, but HTML is uncompressed and uncacheable |
| Competitive Positioning | 52/100 | 15% | 7.8 | No prices, no comparison pages, and the H1 could belong to any competitor |
| Brand & Trust | 71/100 | 10% | 7.1 | Large review base and clear warranty; ownership and leadership undisclosed |
| Growth & Strategy | 56/100 | 10% | 5.6 | Every growth loop ends at one form; no referral, email capture or on-site offer |
| **TOTAL** | | **100%** | **59.9 (60/100)** | |

---

## Quick Wins (This Week)

1. **Fix the Trustpilot badge.**
   - What: make the homepage badge match the live score.
   - Why: FACT, the homepage shows "4.7 out of 5 based on 15,067 reviews"; Trustpilot shows 4.3 on 16,269. A visible mismatch undermines the strongest asset.
   - Impact: protects trust; not sized.
2. **Put the speed claim in the hero.**
   - What: replace the H1 "Custom Window Treatments and Design." with "Custom blinds and shades, made in 3 business days." Subhead: "A local designer brings samples to your home, measures, and gives you a price the same day. We install. You relax." Fine print: "Most blinds and shades; shutters and drapery take longer."
   - Why: FACT, no top-of-funnel page states a lead time.
   - Impact: ASSUMPTION, 1-5% more leads.
3. **Rewrite `/make-appointment`.**
   - What: fill the empty H1 and replace the subhead "Explore a curated collection of pieces that add character and elegance to every corner of your home." with "Free, no-obligation visit. Your designer brings samples, measures every window, and leaves you an exact quote the same day." Add three lines: pick a time, a visit of about 2 hours, a same-day quote.
   - Why: FACT, the page has no trust signals and the 2-hour visit is disclosed only after submit.
4. **Add a trust strip inside the form card.**
   - What: "4.3 on Trustpilot (16,269 reviews) · Free, no obligation · Lifetime warranty on mechanisms", placed above the button on the homepage and `/make-appointment`.
   - Why: FACT, the only copy beside the button is a 120-word autodialler consent block.
   - Impact: ASSUMPTION, 2-10% more form submits (generic benchmark).
5. **Replace the placeholder phone number.**
   - What: render the real number (800-700-1860) as a static `tel:` link and let call tracking overwrite it.
   - Why: FACT, raw HTML shows "(888) 888-8888" and no `tel:` link; JavaScript swaps it in. ASSUMPTION: visitors and crawlers without JavaScript see a fake number.
6. **Fix the form fields.**
   - What: use `type="tel"` and `inputmode="numeric"` on phone, add `autocomplete` to every field, accept formatted phone numbers, and replace the `alert()` pop-up errors with inline messages.
   - Why: FACT, no field has `autocomplete` and errors use native alerts.
7. **Resolve contradicting facts.**
   - "over 40 years" versus "45+ Years" on the same homepage.
   - 15,067 reviews (homepage) versus "47,000+ verified reviews" (`/reviews`, no source named).
   - Warranty phone 800-800-3329 (`/warranty`) versus (800) 700-1860 (FAQ).
   - A testimonial that appears under two names on the homepage (confirm in a browser first).
8. **Turn on HTML compression.**
   - Why: FACT, the homepage HTML is 196,826 bytes with no `Content-Encoding`; the California page is 287,842 bytes.
   - Impact: ASSUMPTION, about 80% fewer bytes per page.
9. **Fix thin titles and duplicate headings.**
   - FACT: titles "Sugar Land" (10 characters) and "Blog" (4 characters); a second H1 "Free In-Home Design Consultation" on the city and blog templates.
10. **Clean the sitemap.**
    - What: remove `/thank-you`, `/rebookappt` and `/mnischeduler/select-time`, mark them `noindex`, and add `<lastmod>`.
    - Why: FACT, all three return 200 with no robots meta and the sitemap has no `lastmod` entries.

## Strategic Recommendations (This Month)

1. **Zip-first, two-step booking form.**
   - Hypothesis: asking only for zip and replying "designers are available near [City]" raises completions, because the ask then matches the "Check Availability" button.
   - Control: the current six-field form. Variant: zip, then name, phone and email, then address on the scheduler step.
   - Metric: scheduled appointments per visitor. Guardrail: appointment show rate.
   - Why: FACT, the form posts to `/Boomi/CreateLead` before any slot is shown, and out-of-area visitors fill everything in before being told there is no consultant.
2. **Publish a cost guide and a "How pricing works" block.**
   - What: typical ranges by product, what drives cost, the same-day quote, and the existing financing example ("For every $1,000 financed at 13.99% APR, 120 monthly payments of $15.52").
   - Why: FACT, `/pricing` and `/cost` return 404 and third-party sites own the "3 Day Blinds cost" searches.
3. **Show the offer on the site.**
   - Why: FACT, the data layer has `OfferTitle = ""` and `DisplayPromoField = "False"`, while the Welcome Wagon partner page carried "Buy 1, Get 1 50% OFF" in 2023.
   - What: run one dated seasonal offer in the hero and form.
4. **Sticky mobile bottom bar** with "Call" and "Book Free Consultation".
   - Why: FACT, the "Free Consultation" header button is hidden on mobile and no fixed bottom bar exists.
5. **Comparison pages** against Budget Blinds, Blinds.com and Hunter Douglas dealers.
   - Why: FACT, none of the 796 sitemap URLs is a competitor comparison.
6. **Plain-English warranty summary** above the legal text: "Mechanisms: covered for life. Cords: 7 years. Fabrics and motors: 5 years."
7. **Review markup and city cross-links.**
   - What: add AggregateRating to city and product pages from first-party reviews, and a "nearby cities" block to city pages.
   - Why: FACT, the Sugar Land page links to no other city.

## Long-Term Initiatives (This Quarter)

1. **Customer referral program.**
   - Business case: FACT, the company already pays $32 per affiliate lead through FlexOffers, so the value of a paid lead is established, and no referral program is visible on the site.
   - Resources: an offer, a tracking link and a post-install ask.
   - ROI: not sized; referral volume is a missing input.
2. **Email capture and nurture.**
   - Business case: FACT, the blog and guides have no email capture.
   - What: a style guide or quiz, then a sequence; plus a past-customer campaign for motorization and cordless upgrades. FACT: the ANSI/WCMA A100.1-2022 cordless standard took effect on 2024-06-01.
3. **Delivery layer rebuild.**
   - What: a CDN in front of the origin server, cacheable cookie-free HTML, a preloaded responsive hero image, and a Core Web Vitals baseline.
   - Why: FACT, pages are served with `Cache-Control: no-cache` and no CDN headers.
4. **Fix the top complaint themes, then market the fix.**
   - Why: FACT, BBB shows 386 complaints closed in three years, up from 315 cited in April 2025; themes are delays without updates, measurement errors and unreturned calls.
   - What: order-status messages and a remake guarantee.
5. **Localise city pages** with local reviews and named consultants, and add trade/designer and light-commercial intake pages.

---

## Detailed Analysis by Category

### Content & Messaging Analysis (56/100)

| Dimension | Score | Key finding |
|---|---|---|
| Headline clarity | 5/10 | The H1 names the category but not the benefit, the in-home model or the speed |
| Value proposition | 5/10 | The unique claim appears only in the FAQ |
| Copy persuasion | 5/10 | Feature-led; the price objection is deferred on every page |
| Social proof | 6/10 | Large volume, conflicting counts |
| Content depth and authority | 7/10 | Long category pages, named authors, dated posts, one original data study |
| CTA effectiveness | 6/10 | Consistent but generic |
| Voice consistency | 5/10 | The blog is sharp; product pages are generic |

**Strengths (FACT)**
- The FAQ states: "Most custom blinds and shades are manufactured and shipped within 3 business days. Specialty products such as shutters, drapery, and specialty shapes may take longer."
- The process line "We Design. We Measure. We Install. You Relax." is memorable and used consistently.
- `/resources/experts` names consultants with tenure, for example "Gary Gilbert ... over 30 years of experience ... with 3 Day Blinds since 2009."
- Blog posts carry bylines and dates, and one post ranks states using FHFA, Census and Google Trends data with a stated method.
- The FAQ promises "a same-day quote".

**Weaknesses (FACT)**
- The hero subhead is "Choose 3 Day Blinds for beautiful window treatments, including custom motorized blinds and shades."
- `/about-us` treats the 3-day idea as history and hedges with "Fast turnaround times on many products".
- Product copy is padded: "Window Shades are essential components of any home's interior design."
- `/shutters` uses jargon: "Acrylonitrile Butadiene Styrene a high-grade recyclable material built with aircraft-inspired technology."
- `/window-shades` has near-duplicate FAQs.
- The warranty is written as legalese with no summary.
- The blog hub shows no authors or dates, and no email capture was found.

### Conversion Optimization Analysis (58/100)

| Dimension | Score | Key finding |
|---|---|---|
| CTA strategy | 6/10 | One goal, three labels ("Free Consultation", "Book Now", "Check Availability") |
| Social proof placement | 7/10 | Strong assets, all below the form |
| Friction | 5/10 | Six required fields before availability |
| Trust signals | 6/10 | The consent block is the only copy by the button |
| Urgency and offer | 3/10 | No offer, no deadline |
| Price-anxiety handling | 4/10 | No ranges; financing is a footer link |

**Conversion path (FACT, from page source)**
1. The header and menu CTAs link to `/make-appointment`; the homepage hero embeds the form.
2. The form has First Name, Last Name, Email, Phone, Street Address and Zip Code required; City and State are hidden and auto-filled.
3. Submit creates the lead, then redirects to one of four outcomes:
   - a time-slot scheduler ("The appointment will last approximately 2 hours");
   - a thank-you page;
   - a limited-coverage page ("will contact you within 48 hours");
   - a no-consultant page that refers to Decorview Blinds with "Save 25% off Select Styles".

**Other findings**
- FACT: the zip field already checks coverage (`IsCovered`) but the result is never used.
- FACT: the only discount on the site is shown to visitors the company cannot serve.
- FACT: address autocomplete, invisible reCAPTCHA and a honeypot are in place, and VWO is installed for testing.
- FACT: `/promotions`, `/specials`, `/special-offers`, `/pricing` and `/cost` return 404.
- Not assessed: the rendered mobile layout, live time slots and confirmation messages.

### SEO & Discoverability Analysis (69/100)

| Dimension | Score | Key finding |
|---|---|---|
| On-page structure | 74 | Good titles and canonicals on 5 of 7 pages; no `og:image` |
| Crawlability and indexation | 72 | Clean 796-URL sitemap; funnel pages indexable |
| Performance indicators | 45 | Uncompressed, uncacheable HTML; no CDN headers |
| Mobile readiness | 78 | Viewport and responsive framework; no `srcset` |
| Structured data | 82 | Rich JSON-LD on every template; no AggregateRating |
| Architecture and internal linking | 70 | City pages do not link to each other |
| Accessibility basics | 65 | All fields labelled; no skip link or `<main>` |
| Security and redirects | 66 | HSTS present; http to https is a 302 |
| AI/LLM discoverability | 88 | `llms.txt` exists; AI crawlers allowed |

**Sitemap (FACT):** 796 URLs.

| Section | URLs |
|---|---|
| Service areas (1 hub, 26 state-level, 608 city) | 635 |
| Resources (53 blog posts and index, 17 guides, 7 other) | 78 |
| Window shades | 13 |
| Curtains and drapes | 8 |
| Blinds | 7 |
| Room inspiration | 7 |
| Everything else | 48 |

**Performance (FACT)**
- 14 external scripts and 15-28 inline scripts per page.
- Three render-blocking head scripts, including a third-party `seo-fixer.writesonic.com` script.
- The hero is a 288,736-byte CSS background image with no preload.
- Time to first byte was 0.19-0.51 seconds on single samples.
- Core Web Vitals were **not measured**: the PageSpeed Insights API returned a quota error.

**Images (FACT, homepage):** 117 images, 85 WebP and 32 PNG; 45 have empty alt text including product tiles; none has `srcset`.

**Schema (FACT):** Organization, WebSite, Service, BreadcrumbList, FAQPage, LocalBusiness on city pages and BlogPosting on posts. Missing: AggregateRating, Product, and `datePublished` on blog posts. FAQPage is emitted twice on two pages.

**Unresolved:** the `/service-areas` page was read as listing 31 states plus DC, while the sitemap holds 25 states plus DC.

### Competitive Positioning Analysis (52/100)

| Sub-score | Score | Key finding |
|---|---|---|
| Positioning clarity | 5/10 | Category is clear, differentiation is not |
| Pricing competitiveness | 3/10 | No prices; third parties place it above Budget Blinds |
| Feature messaging | 6/10 | Warranty, same-day proposal and in-house installers are buried |
| Market awareness | 3/10 | No comparison or alternatives pages |
| Content authority | 6/10 | About 78 resource pages, none on cost |
| Third-party reputation | 8/10 | Largest review base in the set |

**Reputation (FACT, with sources)**

| Source | Figure |
|---|---|
| [Trustpilot](https://www.trustpilot.com/review/3dayblinds.com) | 4.3 on 16,269 reviews; 75% five-star, 5% one-star; claimed profile |
| [BBB](https://www.bbb.org/us/ca/irvine/profile/venetian-blind-dealers/3-day-blinds-1126-31035) | A+, accredited since 2015, 386 complaints closed in 3 years |
| ConsumerAffairs | 4.6 on 1,900+ reviews, second-hand via [Prudent Reviews](https://prudentreviews.com/3-day-blinds-review/); the page itself returned 403 |
| [Budget Blinds on Trustpilot](https://www.trustpilot.com/review/budgetblinds.com) | 3.9 on 154 reviews |
| [Blinds.com on Trustpilot](https://www.trustpilot.com/review/www.blinds.com) | 4.3 on 3,455 reviews |

Not found: Google, Yelp and Reddit figures.

**Pricing**
- FACT: one reviewer's quote for roller shades on four windows put 3 Day Blinds "20% higher than Budget Blinds" ([Prudent Reviews](https://prudentreviews.com/3-day-blinds-vs-budget-blinds/), a single data point).
- FACT: Blinds.com publishes prices ("Up to 45% Off Sitewide", cellular shades from $30.09).
- Per-window figures seen on content-farm pages are unreliable and are not used here.

**Growth by absorption**
- FACT: `/smithandnoble` says "Smith & Noble U.S. operations have joined forces with 3 Day Blinds".
- FACT: `/next-day-blinds-customers` says Next Day Blinds "has permanently closed" and its staff joined.
- ASSUMPTION: the company grows partly by absorbing exiting shop-at-home brands and their search traffic.

**Warranty comparison (FACT):** 3 Day Blinds covers mechanisms for life, cords for 7 years, fabrics and motors for 5 years and installation for 1 year, for the original buyer only. Budget Blinds advertises a five-year "No-Questions-Asked" one-time replacement.

### Brand & Trust Analysis (71/100)

| Dimension | Score | Key finding |
|---|---|---|
| Brand consistency | 8/10 | One process message and five stated values |
| Trust architecture | 7/10 | Tiered warranty; no named leadership |
| Authority signals | 6/10 | Named experts; USA TODAY Most Trusted Brands 2026 |
| Social-proof depth | 7/10 | Large volume, unreconciled counts |
| Transparency | 5/10 | Ownership, price and lead time all unstated |

**Transparency gaps**
- **Ownership.** FACT: [CB Insights](https://www.cbinsights.com/investor/3-day-blinds) states 3 Day Blinds was acquired by Hunter Douglas on 2019-12-04. The site does not mention it. Not confirmed from a primary source.
- **Headquarters.** Unresolved: the site lists Irvine, CA; CB Insights lists Anaheim.
- **The name.** FACT: "3 business days" is a manufacture-and-ship claim, not an installed-by date. A third-party review puts total time at a week or more.

### Growth & Strategy Analysis (56/100)

| Dimension | Score | Key finding |
|---|---|---|
| Pricing strategy | 5/10 | Quote in home only; financing via GreenSky |
| Acquisition channels | 6/10 | Affiliate, new-mover mail, blog, social, HomeAdvisor |
| Retention and expansion | 4/10 | No newsletter, referral or repeat-customer offer seen |
| Geographic leverage | 6/10 | 608 city pages of near-boilerplate |
| Market timing | 7/10 | Cordless regulation and motorization are tailwinds |

**Channels (FACT)**
- Affiliate program at $32 per lead with a 30-day cookie ([FlexOffers](https://www.flexoffers.com/affiliate-programs/3-day-blinds-affiliate-program)).
- A new-mover partnership of five-plus years carrying a BOGO offer ([Welcome Wagon](https://welcomewagon.com/blog/wagon-news/business-spotlight/business-spotlight-3-day-blinds/), dated 2023-12-01).
- Paid search was not verified.

**Financing (FACT):** 12 months no interest, then 17.99-24.99% APR; or 120 months at 13.99% fixed.

**Market (third-party estimate):** North America window coverings at USD 5.3B in 2024, projected to 10.6B by 2034 ([GM Insights](https://www.gminsights.com/industry-analysis/north-america-window-coverings-market)).

---

## Competitor Comparison

Scores are out of 10, from each homepage as fetched today. The Shade Store was in maintenance mode and is replaced by Hunter Douglas.

| Factor | 3 Day Blinds | Budget Blinds | Blinds.com | Hunter Douglas |
|--------|----------|-------------|-------------|-------------|
| Headline Clarity | 6 | 7 | 8 | 4 |
| Value Prop Strength | 5 | 7 | 8 | 7 |
| Trust Signals | 8 | 6 | 7 | 7 |
| CTA Effectiveness | 7 | 7 | 8 | 6 |
| Pricing Clarity | 2 | 2 | 9 | 1 |
| Content Depth | 6 | 6 | 6 | 6 |

- Headline: the 3 Day Blinds H1 is a category label; Budget Blinds leads with "local"; Blinds.com says what and for whom.
- Trust: 3 Day Blinds has the largest review base, less a point for the badge mismatch.
- Pricing: only Blinds.com shows prices.

---

## Revenue Impact Summary

**Formula:** extra monthly revenue = visits × baseline lead rate × relative lift × lead-to-appointment rate × close rate × average ticket.

| Input | Conservative | Moderate | Aggressive | Status |
|---|---|---|---|---|
| Monthly visits | 81,500 | 122,600 | 159,000 | Third-party estimate for Jun-Aug 2025 ([Semrush](https://pt.semrush.com/website/3dayblinds.com/overview)); no 2026 figure found |
| Baseline visit-to-lead rate | 2% | 3% | 4% | ASSUMPTION, input missing |
| Lead-to-appointment-held rate | 50% | 60% | 70% | ASSUMPTION, input missing |
| In-home close rate | 30% | 40% | 45% | ASSUMPTION, no sourced figure found |
| Average ticket | $2,500 | $3,500 | $4,500 | ASSUMPTION, no credible source found |
| **Baseline leads per month** | 1,630 | 3,678 | 6,360 | Derived |
| **Revenue per lead** | $375 | $840 | $1,418 | Derived |

The only sourced anchor is the $32 affiliate payout per lead, which is a floor on what the company pays for a lead, not its value.

| Recommendation | Relative lift (cons / mod / aggr) | Est. Monthly Impact (moderate) | Conservative to aggressive | Confidence | Timeline |
|---------------|---|-------------------|---|------------|----------|
| Zip-first two-step form | 5% / 10% / 20% | $309,000 | $31,000 to $1.8M | Medium | 3-4 weeks |
| On-site dated offer | 3% / 8% / 15% | $247,000 | $18,000 to $1.35M | Low | 2-4 weeks |
| Trust strip and appointment-page copy | 2% / 5% / 10% | $154,000 | $12,000 to $902,000 | Medium | 1 week |
| Cost guide and pricing block | 2% / 5% / 10% | $154,000 | $12,000 to $902,000 | Low | 3-4 weeks |
| Mobile bottom bar and static phone link | 1% / 3% / 6% | $93,000 | $6,000 to $541,000 | Low | 1-2 weeks |
| 3-day claim in the hero | 1% / 3% / 5% | $93,000 | $6,000 to $451,000 | Low | 1 week |
| HTML compression and CDN | 0.5% / 2% / 4% | $62,000 | $3,000 to $361,000 | Low | 1-8 weeks |
| Referral program, email nurture | not sized | not sized | | Input missing | 1-3 months |
| **Total Potential** | 14.5% / 36% / 70% | **$1,112,000/mo** | **$89,000 to $6.3M/mo** | | |

- All lift percentages are ASSUMPTIONS from generic conversion benchmarks, not site data.
- The lifts overlap, so the totals overstate what would be achieved together.
- The aggressive column multiplies four optimistic assumptions and should not be quoted.

---

## Next Steps

1. Test the zip-first booking form, measured on scheduled appointments per visitor.
2. Put the 3-business-day claim, the same-day quote and a corrected Trustpilot figure in the hero and beside the form.
3. Publish the cost guide with price ranges and the financing example.

**Follow-up commands:** `/market funnel` for the booking flow, `/market copy` for the hero and appointment page, `/market competitors` for Budget Blinds and Blinds.com.

---

## Appendix: Openings for a Local Independent Dealer

These are RECOMMENDATIONS for a dealer competing with 3 Day Blinds for consultations. They have not been checked against what PSS already does. Nothing here has been launched or published.

1. **Publish price ranges.** No in-home competitor in the set does; a "what a typical 8-window home costs" page targets cost searches that content farms hold today.
2. **State a real install window per product and send status updates.** Delays without communication are the top complaint against 3 Day Blinds.
3. **One accountable person.** "The person who measures is the person who answers the phone", against call-centre handoffs.
4. **A remake guarantee** for measurement errors, which recur in the complaints.
5. **Pages for orphaned customers**: service and repairs for Smith & Noble, Next Day Blinds and 3 Day Blinds products.
6. **A "[Dealer] vs 3 Day Blinds" page** and a "3 Day Blinds alternative in [city]" page; 3 Day Blinds has no comparison pages of its own.
7. **A warranty that transfers or covers damage**, since theirs is original-buyer-only and excludes pet damage.
8. **A short first step on the consult form.** Their form demands a street address and autodialler consent before showing availability.

## Audit Limits

- Most pages were read through a summarising fetch tool, so verbatim quotes should be spot-checked in a browser before being republished.
- Core Web Vitals, the rendered mobile layout, the post-submit scheduler, and Google, Yelp and Reddit reviews were not assessed.
- No `COMPETITOR-REPORT.md` or `BRAND-VOICE.md` existed to incorporate.

*Generated by AI Marketing Suite — `/market audit`*
