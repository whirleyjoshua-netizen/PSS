# Research brief: blinds-hub (PAGE /blinds)

Research agent, 2026-11-11. Branch `content/2026-11-11-blinds-hub`, cut from origin/main at 59c1aa9.

## Target

- **Queue item:** 2, PAGE `/blinds` (category hub). Item 1 is done: `cellular-shades-energy-las-vegas` is in `content/articles.ts` on main and has branch `origin/content/2026-11-06-cellular-shades-energy-las-vegas`. Item 2 has no `origin/content/*` branch, and the change is not on main: the blinds category in `content/products.ts` still has the H1 "Blinds in Las Vegas", the SEO title "Blinds in Las Vegas, NV | Premier Shade Solutions", and no copy aimed at "custom", "faux wood" or "cordless".
- **Search terms (Keyword Planner, Las Vegas DMA):**
  - "custom blinds las vegas": 320/mo, ranking about 53. This is the primary term.
  - "window blinds las vegas": 50/mo, ranking about 54.
  - "faux wood blinds": 140/mo.
  - "cordless blinds": 70/mo.
- **Page:** `/blinds`. It renders from `app/(site)/[category]/page.tsx` using the `blinds` entry in `categories` (`content/products.ts`). Its children are `/blinds/vertical-blinds` and `/blinds/wood-blinds`. No new routes.
- **Proposed H1:** "Custom Blinds in Las Vegas". The template renders `${heading ?? name} in Las Vegas`, so set `heading: "Custom Blinds"` on the blinds category. Motorization uses the same pattern, with an owner comment explaining it. This is a noun phrase, so it takes no period.
- **SEO title (56 chars, checked):** `Custom Blinds in Las Vegas, NV | Premier Shade Solutions`
- **Meta description (157 chars, checked):** `Custom faux wood, wood and vertical blinds for Las Vegas homes, with cordless lift on wood and faux wood. Free in-home consultation, installed by the owners.`
  - Note: the hero `lead` renders `seo.description`, so this sentence is also the visible line under the H1. It must read well as body copy. `tests/products.test.ts` requires ≤60 / ≤160 characters, the "| Premier Shade Solutions" ending, and "Las Vegas" in the description.
  - "installed by the owners" is already in the current description. Keep it as is, or swap it for the brand-voice line about never handing off.

## Searcher intent (priority order)

1. **"Custom blinds las vegas": who makes and installs custom blinds here, and what does "custom" mean?** The page should say plainly that blinds are measured to each window and installed by us, offered through a free in-home consultation where we bring samples, that the measurement guarantee applies, and that the lead time is in writing. Local results (3 Day Blinds, Bloomin' Blinds, Budget Blinds, Bugsy's) all lead with the free in-home consult, measuring and install. Our gap is personal: Josh measures every window himself, there is no subcontractor, we haul old blinds away free, and we do a walk-through.
2. **Which kind of blind for which window?** Faux wood where the sun hits and where it is wet. Real wood for shaded, formal rooms. Verticals for sliders and wide glass. The current hub only lists the two children. It never helps the visitor choose.
3. **"Faux wood blinds": is faux wood good, and how is it different from real wood?** Warping, fading, cracking, moisture, the look. Repo copy answers this well. The hub should carry a short version and link to `/blinds/wood-blinds`.
4. **"Cordless blinds": can I get blinds without cords, and is that safer for kids and pets?** The repo establishes cordless lift on wood and faux wood blinds only. Use the CPSC's general statement on cordless being safest.
5. **Do blinds help with Las Vegas heat and glare?** Tilt control, and an honest note that exterior screens do more on west walls. Link `/outdoor/solar-screens` and the west-facing guide.
6. **Can blinds be motorized?** Wood and faux wood styles are on the Alta BLISS list. Verticals are NOT on the list.
7. **Upgrading builder blinds.** Repo copy covers this for Henderson and North Las Vegas.
8. **Cost.** Say what drives the price, with no numbers (from the FAQ).
9. **Lead time and care:** 3 to 5 weeks, plus dust care.

## Repo facts we can state

**Blinds category (`content/products.ts`, `categories[0]`)**
- intro: "Blinds give you something no other treatment does: the ability to keep the light and lose the glare. Tilt the slats and an afternoon that was unusable becomes comfortable, without closing the room off or giving up the view."
- intro: "They are also the most practical choice for the rooms that take the hardest use — kitchens, bathrooms, garages, and home offices — because they wipe clean, tolerate humidity, and cost less to cover a lot of glass than most alternatives." (This is a cost comparison with no number. It is allowed under the no-price rule, but do not sharpen it.)
- tagline: "Precise control, slat by slat."
- current seo.description: "Custom vertical, wood, and faux wood blinds for Las Vegas homes. Free in-home consultation, measured and installed by the owners."

**Wood and faux wood (`content/products.ts`, `wood-blinds`)**
- opening: "Faux wood blinds will not warp, fade or crack in direct desert sun, so we put them everywhere the sun actually hits and save real wood blinds for shaded, formal rooms."
- body: "Real basswood is light, takes stain beautifully, and suits a room where the trim and the floor are already doing the talking."
- body: "Faux wood is the more practical sibling and, in this climate, usually the smarter buy. It will not warp, fade, or crack in direct desert sun, and it goes anywhere moisture lives. Modern faux wood is embossed and color-matched well enough that most people cannot tell the difference from across the room."
- body: "The honest guidance we give: use real wood where the window is shaded and the room is formal, and faux wood everywhere the sun actually hits. We have replaced too many sun-bleached real wood blinds on west elevations to recommend otherwise."
- body: "Wood blinds bring the warmth of a shutter at a fraction of the cost, with the slat control a shutter also gives you." (This is a comparison, not a number. It is fine.)
- features: "Real basswood in stains and paints, or faux wood in matched finishes"; "2 inch and 2 1/2 inch slats for a substantial, architectural look"; "Faux wood resists warping, fading, and cracking in direct sun"; "Optional decorative valances and cloth tapes"; "Cordless lift available for homes with children or pets".
- bestFor: "Living rooms, dining rooms, and bedrooms wanting warmth without shutter cost."

**Vertical blinds (`content/products.ts`, `vertical-blinds`)**
- opening: "Vertical blinds are our answer for sliding glass doors: the vanes stack to one side so the door still works as a door, and they tilt to block the low western sun a horizontal blind cannot reach."
- body: "Today's vertical is not the brittle plastic one you remember from a nineties apartment. Fabric-wrapped vanes, faux wood, and PVC in warm neutrals hang straight, move quietly, and look considered rather than budget."
- body: "Because the vanes hang rather than stack, they also shed dust instead of collecting it on every slat — a meaningful maintenance difference on a very large opening."
- features: "Vanes stack left, right, or split to a center opening"; "Fabric, faux wood, and PVC vanes in warm neutral finishes"; "Individual vanes replace easily if one is damaged"; "Collects far less dust than a horizontal blind of the same size".
- bestFor: "Sliding glass doors, patio doors, and windows wider than they are tall."

**Cordless and safety (`content/faq.ts`, "Are motorized shades safe for children and pets?")**
- "Motorized and cordless shades remove the cords a child or a pet could reach. Roller shades come cordless or motorized, cordless lift is available on wood and faux wood blinds and on roman shades, and shutters have no cords at all. If you have little ones or pets at home, tell us at the consult and we will steer every window toward cordless or motorized options."

**Motorization (`content/products.ts`, motorization intro)**
- "We install Alta's BLISS® Automation 2.0 on roller, woven wood, honeycomb, sheer, banded, wood and faux wood styles." Wood and faux wood blinds may be described as motorizable. Vertical blinds may NOT be.
- Category heading comment: "Alta BLISS runs blinds too."

**Durability, care and choosing (`content/faq.ts`)**
- "How long do custom blinds and shades last?": "What shortens it here is sun. Real wood and vinyl on west-facing windows fade and turn brittle fastest, which is why we put faux wood blinds and composite shutters where the sun hits: both hold up to direct sun without warping or cracking."
- "How do I clean and maintain…": "Dust is the main thing in this valley: fine desert dust settles on slats and works its way into headrails. Dust or vacuum with a soft brush regularly… Blinds wipe clean, and vertical blinds shed dust rather than collecting it. … a cracked blind slat takes about fifteen minutes to replace." Guide: `content/guides.ts` slug `replace-a-broken-blind-slat`. The writer confirms the route prefix in the app before linking.
- "How do I choose…": "Kitchens and baths want something that wipes clean, like faux wood. Then the direction each window faces narrows it down. Shade’ walks you through it at your free consultation, with samples in your own light."
- "What is the difference between blinds and shades?": "Blinds are slats or vanes that tilt, so you can keep the light and lose the glare without closing the room off. They wipe clean, which makes them the practical pick for kitchens, baths and home offices."
- "Can I get custom shades for large windows or sliding glass doors?": "Sliding doors are the hardest openings in most Las Vegas homes, and vertical blinds are still the most sensible answer: the vanes stack to one side so the door still works as a door, and they tilt to block the low western sun."
- Cost ("How much do custom window treatments cost?"): "It depends on your windows, so we don't publish a price list. What moves the price: how many windows, how big they are, the product and fabric you choose, how it operates (cordless, chain or motorized) and any extras. Taking your old blinds down is one of those extras, priced per window on your quote; hauling them away is free."
- Measuring: "Josh measures every window himself… If a measurement is off, we remake it and install it again, free. That is our measurement guarantee."
- Process: "We bring samples and help you choose, and Josh measures every window. You get a written quote with your lead time on it. On install day we install, walk through every window with you, clean up, and haul your old blinds away free."

**Lead time and warranty**
- `content/lead-times.ts`: `{ label: "Blinds", minWeeks: 3, maxWeeks: 5 }`, counted "from the day the client orders". `MOTORIZED_EXTRA_WEEKS = 1`. Build any copy from the constants, not literals, as `products.ts` does with `SHADE_WEEKS`.
- `content/warranty.ts` `WARRANTY.product`: "A limited lifetime manufacturer warranty on blinds, shades and shutters, for as long as you own them." `WARRANTY_LINE` is the short form. Never write "Lifetime Warranty" on its own.

**Local context (`content/cities.ts`)**
- Henderson: "Many new homes in Henderson come with basic builder blinds, often 2-inch faux wood, or a blinds package chosen at the builder's design studio. They work, but they are rarely matched to the room: the same blind on a west-facing great room and a north-facing bedroom. Upgrading is usually about putting the right product on the windows that take the sun, and we quote it room by room…"
- North Las Vegas: "Faux wood blinds are a practical whole-home choice here: they will not warp, fade or crack in direct desert sun". Also: "a lot of homes that were handed over with builder-grade blinds or nothing at all."
- Las Vegas: "Kitchens and bathrooms want something that wipes clean and will not warp, which is faux wood."
- Henderson: "Inside, vertical blinds or a cellular shade on the slider keeps the door working while cutting the glare."

**West sun (`content/articles.ts`, west-facing guide; also `content/faq.ts`)**
- "West-facing glass in the Las Vegas valley takes direct sun from about two in the afternoon until sunset, in the hottest part of the day."

**Brands and experience (`content/articles.ts`, hunter-douglas-alta-norman guide)**
- "We carry three: as an Authorized Hunter Douglas Dealer we offer Hunter Douglas, and we also carry Alta and Norman". Build this from `HD_DEALER` in `content/offer-terms.ts`.
- "Josh has spent more than twenty years in window treatments, installing, building, selling and repairing them." (This is the 20+ years fact. Never name a previous company.)

**Not carried (`tests/products.test.ts`)**
- "no longer carries aluminum or mini blinds". Never mention aluminum or mini blinds as products we sell.

## Web facts

1. **Blinds manage glare and heat by tilting. General.** PNNL Building America Solution Center, "Window Attachments: Solar Control and Energy Efficiency", https://basc.pnnl.gov/resource-guides/window-attachments-solar-control-and-energy-efficiency. Quotes: "Louvers allow views while blocking direct sun." Also: "In contrast, shades, blinds, shutters, and similar attachments give occupants the ability to open, close, and adjust".
2. **East and west glass matters most in hot climates. General, but it fits the valley.** Same PNNL page: "In hotter climates, highly effective shading of east- and west-facing surfaces is of primary importance." Also: "Providing shading for east-, south-, and west-facing windows in the summertime is valuable in nearly any U.S. climate."
3. **Interior blinds are less effective than exterior shading. General.** Same PNNL page: "They can be less effective at reducing heat gain than comparable exterior shading systems because they do not block direct sunlight until after it has already passed through the window." Also: "Exterior window attachments block solar heat before it reaches the window." Use this to point west-wall heat to `/outdoor/solar-screens`, in line with the outdoor intro already on the site.
4. **Interior attachments can supplement exterior shading. General.** Same page: "They can supplement exterior shading approaches to improve performance and flexibility throughout the day or year".
5. **Cordless is the safest option with young children. General (federal).** U.S. CPSC, "Go Cordless", https://www.cpsc.gov/gocordless. Quotes: "The safest option when young children are present is to go cordless." Also: "Cordless window coverings are the only option to eliminate the strangulation hazard." And: "Children have strangled to death on the cords of window blinds, shades, draperies and other window coverings". (The word "draperies" is in the source quote. Do not repeat it in our copy.)
6. **CPSC consumer advice. General.** CPSC news release, 2022-11-02, https://www.cpsc.gov/Newsroom/News-Releases/2023/CPSC-Approves-New-Federal-Safety-Standard-for-Custom-Window-Coverings-to-Prevent-Deaths-and-Serious-Injuries-from-Strangulation-Window-Covering-Cords-Now-Deemed-a-Substantial-Product-Hazard. Quote: "CPSC urges consumers to choose cordless window coverings, which are the safest option for children." Use only the advice sentence. Do not cite the rule itself (see Do NOT claim).
7. **How sunny Las Vegas is. Las Vegas-specific. Optional, and needs re-verification.** Several summaries of the NWS Las Vegas climate paper and NOAA Comparative Climatic Data give about 85% of possible sunshine a year, but one NOAA-based ranking gives 84%. Sources: https://repository.library.noaa.gov/view/noaa/14743 (NWS Las Vegas climate technical memo; I did not fetch the full text) and https://www.currentresults.com/Weather-Extremes/US/sunniest-cities.php (which says 84%). The numbers conflict and come from an older instrument record, so **do not use a figure**. If needed, write "one of the sunniest cities in the country" only after the fact-checker confirms a primary source.
8. **Summer heat. Las Vegas-specific. Verified in last week's brief.** NWS Las Vegas, "Temperature Overview" (NOAA NCEI 1991–2020 normals), https://www.weather.gov/media/vef/Temperature%20Overview.pdf. July normal average high "104.5". Optional for this page.
9. **DOE Energy Saver on blinds. General, NOT verified.** https://www.energy.gov/energysaver/energy-efficient-window-attachments. A search snippet says vertical and horizontal blinds "are effective at reducing summer heat gain", but the page returned 404 to both WebFetch and curl from this container, so I could not see the exact quote. **Do not use it unless the fact-checker can fetch and quote it.** The PNNL facts above cover the same point.
10. **Faux wood vs real wood. General, retailer sources only.** Retailer blogs agree that real wood can swell or warp with moisture and that faux wood (PVC or composite) handles humid rooms. One example is https://blog.selectblinds.com/pros-and-cons-faux-wood-vs-wood-blinds. These are competitor or retailer marketing, so I did not quote them. **Use the repo's own wording**, which already covers this from installer experience. Some retailer sources say faux wood fades in harsh sun. Our repo says the opposite for desert sun, and the repo is the owner's ruling.

**Competitor angles (for gaps only, not copied):** The local results are 3 Day Blinds, Bloomin' Blinds (Henderson, which says "family-owned"), Budget Blinds Summerlin and Bugsy's, plus Norman's retailer locator. They lead with a free consult, measuring, install and a limited lifetime warranty. Gaps we can fill with repo facts: a window-by-window recommendation (faux wood on the sun side, real wood shaded, verticals on sliders), the owner measuring every window with a remake guarantee, a written lead time, hauling old blinds away free, the builder-blind upgrade story, and an honest pointer to exterior screens for west-wall heat.

## Do NOT claim

- **Any price, price range, "affordable", "budget", or savings percentage or dollar figure.** The repo's "cost less to cover a lot of glass than most alternatives" and "at a fraction of the cost" are existing comparisons. Do not add new ones.
- **Cordless on vertical blinds.** The repo only says "cordless lift is available on wood and faux wood blinds". Verticals use a wand or cord in the general market, but nothing in the repo says which. Ask the owner.
- **Motorized vertical blinds.** BLISS is not listed for vertical styles.
- **"Cordless blinds are certified safe", "child-safe certified", "meets the federal standard", "required by law".** The CPSC's 2022 custom-window-covering rule was challenged in court, and I could not confirm whether it is in force. Also, the owner-feedback log in `docs/marketing/brand-voice.md` says "Cordless is a true claim (no safety certification claims)." Cite only the CPSC's advice that cordless is safest.
- **Energy savings from blinds** ("lower your bill", "cut cooling costs"). The repo makes no energy claim for blinds, and interior blinds are weaker than exterior shading (PNNL). Say they control glare and direct sun, and send heat questions to solar screens.
- **Which brands make our blinds**, or any trademarked blind name (for example, Hunter Douglas product names). The repo never says which of the three makers supplies blinds. You may say only "we carry Hunter Douglas, Alta and Norman" in general.
- **Aluminum or mini blinds**, which are no longer carried.
- **"Wholesale blinds"**. This appears only in `docs/marketing/brand-voice.md`, not in the content files. Ask the owner.
- **Repairs.** brand-voice.md says "We do NOT do repairs." Linking the DIY slat guide is fine, but never offer repair service.
- **Inside or outside mount, specific colors, slat sizes other than 2 and 2 1/2 inch, routeless or privacy slats, or "light blocking" options.** None of these are in the repo.
- **Drapery.** Don't use the gallery photo `faux-wood-blinds-front-window.webp`, because its alt and caption mention "cream curtains" and "drapery panels". Don't repeat "draperies" from the CPSC quote.
- **Presenting gallery photos as Las Vegas jobs.** The `content/gallery.ts` header says: "Most of these are the owners' own work from their years in Ohio, before Premier Shade Solutions". Captions describe the treatment, never a valley location. The "Installs" or "our work" framing is fine.
- **"Best", "#1", "top-rated blinds in Las Vegas", "exclusive", "Hunter Douglas Las Vegas".**

## Owner questions

1. Which of our three makers do we order blinds from (wood, faux wood, vertical)? Naming the line would help the "custom blinds" page, but we must not guess.
2. Do vertical blinds come cordless (wand-operated) in what we sell? This would let us answer "cordless blinds" for sliders too.
3. Is cordless lift standard on our wood and faux wood blinds, or an option? The repo says "available".
4. brand-voice.md lists "Wholesale blinds are available" and "cordless blinds" as products. Should either appear on the public /blinds page? If so, add the fact to `content/products.ts` first.
5. Do we offer anything beyond 2 and 2 1/2 inch slats, or light-blocking or routeless slats? Owner-confirmed options would strengthen the faux-wood section.
6. Can the writer change the pinned redesign wording for blinds (highlights, story eyebrow and heading, caption) in `tests/products.test.ts`? Spec 2026-10-01 §5 pins it. This brief recommends **leaving it unchanged** and adding a section instead.
7. Do we have any real Las Vegas blinds install photos to add to `content/gallery.ts`? All four blinds gallery photos are from the earlier Ohio work.

## Proposed outline

**Constraint:** the category template (`app/(site)/[category]/page.tsx`) renders, in order: hero (H1 from `heading`, lead from `seo.description`), PromiseRow, IconRow (`highlights`), StorySection (`intro` paragraphs plus `story`), the product card grid, the PageFaq (`content/page-faqs.ts`), MoreReading (guides whose `products` include `/blinds`) and reviews. The `Category` type has no free-form sections field. Two options:
- **A (smallest, recommended to try first):** a data-only change. Set `heading`, `seo`, and rewrite `intro` into 3 to 4 paragraphs that cover the outline below. Update the FAQ list.
- **B (fuller):** add an optional `sections?: { heading: string; body: string }[]` field to `Category`, rendered after the card grid. This mirrors the `local` sections that city pages already render in `app/(site)/service-area/[city]/page.tsx` (reuse that markup or component). Only blinds uses it for now. This is framework code, so read `node_modules/next/dist/docs` first, and add a test that the blinds page renders the section headings. No new routes.

Sections (option B headings; for option A, the same content goes in the intro paragraphs):

1. **H1 "Custom Blinds in Las Vegas"** with the hero lead (meta description). The hero photo stays the existing `bookingPhoto` (Alta stock, `altaPhotos.woodBlindsKitchen`). That is allowed under the owner rule in `content/stock-photos.ts`. Don't add new stock photos.
2. **Story / intro (existing heading "Control Without Closing the Room Off", pinned).** Keep paragraph 1 (keep the light, lose the glare). Revise paragraph 2 to say "window blinds" once, naturally. Add a paragraph on what "custom" means here: Josh measures every window himself under the measurement guarantee, blinds are built to those numbers, we install them ourselves, and the lead time is on the quote (3 to 5 weeks, from `leadTimes`).
3. **"Which blind goes on which window"** (noun phrase, no period). Faux wood on any window the sun hits, and in kitchens and baths. Real wood for shaded, formal rooms. Verticals for sliders and windows wider than they are tall. Mention that the west glass takes sun from about 2pm to sunset. Photo: none (the card grid follows), or put the gallery photo `/gallery/sheer-vertical-patio-slider.webp` with the slider line.
4. **"Faux wood blinds that stand up to the sun."** (A sentence, so it takes a period.) Covers no warping, fading or cracking, moisture, the embossed look, 2 and 2 1/2 inch slats, and the optional valances and cloth tapes. Link `/blinds/wood-blinds`. Photo: `/gallery/faux-wood-blinds-living-room.webp`.
5. **"Cordless blinds for homes with kids and pets."** (No verb, so no period. If it is written as "Go cordless if you have kids or pets." it takes one.) Covers cordless lift on wood and faux wood, the CPSC advice quote as general context, "tell us at the consult and we will steer every window toward cordless or motorized options," and motorized wood and faux wood on Alta BLISS® Automation 2.0 (app, remote, sunrise and sunset timers). Link `/motorization`. Never say verticals are cordless or motorized.
6. **"Vertical blinds for sliders and wide glass"** covers stacking left, right or split, tilting against the low western sun, fabric, faux wood and PVC vanes, shedding dust, and vanes that replace individually. Photo: `/gallery/vertical-blinds-patio-door-valance.webp` (a swag valance is fine, since it is not drapery). If section 3 uses the sheer slider photo, use this one here, so no photo repeats.
7. **"Upgrading builder blinds"** covers the builder 2-inch faux wood story (Henderson and North Las Vegas wording), putting the right product on the sun-side windows, quoting room by room, and hauling old blinds away free (removal is priced per window on the quote, so say "hauling away is free" exactly).
8. **"Blinds, heat and the west wall"** is an honest pointer. Blinds control glare and direct sun. For heat on a west or south wall, exterior solar screens stop the sun before the glass (PNNL fact 3, plus the existing outdoor intro). Link `/outdoor/solar-screens` and `/learn/west-facing-windows-las-vegas`.
9. **Product cards** (existing grid, "Explore Blinds"): `/blinds/vertical-blinds`, `/blinds/wood-blinds`. Card photos stay the products' existing images.
10. **FAQ** (`PAGE_FAQS.blinds` in `content/page-faqs.ts`). Proposed: `[BLINDS_VS_SHADES, SAFE, LAST, BIG_WINDOWS, LEAD_TIME]`. Adding `SAFE` answers "cordless blinds" with existing FAQ text. Optionally swap in `CLEAN` for dust. Every question must already exist in `content/faq.ts`, and the PageFaq title is generated from `heading`, so it becomes "Questions about custom blinds." Check that it reads well.
11. **MoreReading:** currently only the Hunter Douglas/Alta/Norman guide lists `/blinds`. Optionally add `{ name: "Blinds", href: "/blinds" }` to the `products` of `west-facing-windows-las-vegas` **only if** that guide's body really recommends blinds. It does ("Patio slider: vertical blinds…"). That adds a "Buying guides" link with no new copy.

**Internal links to place in copy:** `/blinds/wood-blinds`, `/blinds/vertical-blinds`, `/motorization`, `/outdoor/solar-screens`, `/learn/west-facing-windows-las-vegas`, `/learn/hunter-douglas-alta-norman-las-vegas` (from a "we carry" line), the slat-replacement guide (confirm the route), `/service-area/henderson`, and `/service-area/north-las-vegas` (builder blinds).

**Product/category hrefs (existing):** `/blinds`, `/blinds/wood-blinds`, `/blinds/vertical-blinds`, `/motorization`, `/outdoor/solar-screens`.

**Tests the writer must keep green:** `tests/products.test.ts` (SEO lengths, pinned blinds highlights and story, 14 products), `tests/seo/page-faqs.test.tsx`, `tests/seo/page-metadata.test.ts`, `tests/seo/page-openings.test.tsx`, `tests/content/hd-compliance.test.tsx` (if a brand is mentioned), `tests/routes/treatment-pages.test.tsx`, and `tests/content/page-photos.test.ts` (no repeated photo). The sitemap count does **not** change, because this adds no new URL.

## Quick answer draft

For the intro or lead paragraph, not a separate box (category pages have no quick-answer slot):

"Custom blinds are measured to each of your windows and built to those numbers. Josh measures every window himself, and we install every blind ourselves. In this valley we put faux wood on any window the sun hits, because it won't warp, fade or crack, and we save real wood for shaded, formal rooms and vertical blinds for sliding doors. Cordless lift is available on wood and faux wood blinds, so there is no cord at the window."
