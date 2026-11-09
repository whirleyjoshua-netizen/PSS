# Fact-check: cellular-shades-energy-las-vegas

Fact-check agent, 2026-11-09. Branch `content/2026-11-06-cellular-shades-energy-las-vegas`. Public path: `/learn/cellular-shades-energy-las-vegas` (new guide, data entry in `content/articles.ts`).

I checked every claim against `content/*.ts` on origin/main, `owner-answers.md` and the web sources, which I opened myself. I did not rely on research.md. Web sources:

- **DOE fact sheet**: DOE/EE-2519, https://www.energy.gov/sites/default/files/2021-12/bto-cellular-shades-factsheet-112221.pdf (downloaded and searched).
- **PNNL**: PNNL-27663 Rev1, https://www.pnnl.gov/main/publications/external/technical_reports/PNNL-27663Rev1.pdf (downloaded and searched).
- **BASC**: https://basc.pnnl.gov/resource-guides/window-attachments-solar-control-and-energy-efficiency (a Building America Solution Center page from DOE, written by PNNL).
- **NV Energy**: the 2018 "Measures to Conserve" bill insert.
- **NWS**: the NWS Las Vegas "Temperature Overview" (NOAA NCEI 1991–2020 normals).
- **DOE AERC news**: https://www.energy.gov/node/4442808.
- **AERC label page**: https://aercenergyrating.org/reading-the-residential-label/.

## Claim table

| # | Claim (copy) | Source (quote) | Verdict |
|---|---|---|---|
| 1 | SEO title is 60 chars; description is 153 chars; title and crumb are fine | measured | VERIFIED |
| 2 | QA: honeycomb traps still air against the glass and slows the afternoon heat coming in | products.ts: "Cellular shades trap a layer of still air against the glass, so on a single-pane window or an older aluminum frame they slow the afternoon heat coming in" | VERIFIED |
| 3 | QA: helps most on west- and south-facing windows; they only help when they're down | PNNL: "this savings decreases considerably if the larger view windows of a home remain uncovered during the day, particularly if these are west- or south-facing windows." | VERIFIED |
| 4 | QA and §6: an exterior solar screen stops heat before it reaches the glass | BASC: "Exterior window attachments block solar heat before it reaches the window."; faq.ts: "Stop the sun before it reaches the glass if you can." | VERIFIED |
| 5 | The DOE fact sheet says the trapped air is particularly beneficial in colder climates | DOE fact sheet: "They trap air within each cell, as well as between the shade and the window, which is particularly beneficial in colder climates." | VERIFIED |
| 6 | The experiments behind it focused on the heating season | DOE fact sheet: "The experiments focused on the energy benefits of cellular shades during the heating season" | VERIFIED |
| 7 | "July afternoons average about 104°F **at the airport**" | NWS: July normal average maximum is 104.5 (1991–2020). The document does not mention the airport. | FIXED: "the normal July high is about 104°F" |
| 8 | Insulation slows heat coming in, not just heat leaking out | products.ts: "it slows heat coming in, not just heat leaking out" | VERIFIED |
| 9 | The fact sheet says they reduce unwanted solar heat gain | DOE fact sheet: "reduce unwanted solar heat gain" | VERIFIED |
| 10 | "A Department of Energy study at PNNL found real benefit in the summer cooling season" | PNNL: "High-efficiency cellular shades have significant energy-saving potential during the summer cooling season" | FIXED: now says "PNNL, a Department of Energy lab, found real energy-saving potential", matching the source wording. The 25% figure stays out. |
| 11 | December and January nights average lows around 40°F | NWS: Dec normal average minimum 39.6, Jan 40.5 | VERIFIED |
| 12 | The same shade keeps winter nights from pulling warmth out | products.ts feature: "Measurably reduces summer heat gain and winter heat loss" | VERIFIED |
| 13 | Hot-weather research is thinner than cold-weather research | DOE fact sheet: "research is needed to fully explore control strategies and benefits in the cooling season" | VERIFIED |
| 14 | Pleated cells; also called honeycomb; still air between the shade and the window; genuine insulation | products.ts body; DOE fact sheet (claim 5) | VERIFIED |
| 15 | "Highest-performing energy product among shades" | products.ts: "the highest-performing energy product in the category" (cellular sits in the shades category) | VERIFIED (kept scoped to shades) |
| 16 | "We call it the insulating one" | products.ts tagline: "The insulating one." | VERIFIED |
| 17 | Single, double and triple cell, for increasing insulation | products.ts: "Single, double, and triple cell constructions for increasing insulation" | VERIFIED |
| 18 | Double cell on single-pane or older aluminum frames makes a measurable difference | products.ts, same sentence | VERIFIED |
| 19 | "We recommend it window by window rather than one for the whole house" | Not sourced. Owner answer #1 says we recommend double cell. | FIXED/ADDED: "What we usually recommend is double cell, with 1½-inch cells rather than ¾-inch ones." (owner answer #1) |
| 20 | "Department of Energy research found blinds block some sun but don't provide much insulation"; "this is **the** real upgrade" | DOE fact sheet: "Although blinds block some solar radiation, they do not provide much insulation." | FIXED: attributed to the fact sheet; "the" softened to "a" |
| 21 | In the PNNL tests, double-cell beat typical vinyl blinds in every case | PNNL: "In all cases and operational scenarios, double-cell cellular shades out-performed the typical vinyl Venetian blinds" | FIXED (wording now "every case and scenario they tested") |
| 22 | NEW: some cellular shades we carry have an AERC rating; AERC is independent and DOE helped set it up; the label has Cool and Warm Climate ratings; Warm is the one for Las Vegas; there is a product search | Owner answer #3. DOE: "Hunter Douglas, received the first-ever energy performance rating from the Attachments Energy Rating Council (AERC) for its cellular shades"; "DOE's Building Technologies Office (BTO), LBNL, and WCMA helped establish the AERC"; "AERC provides unbiased, third-party certifications". AERC: "all AERC certified products take their main product rating from the 'Cool Climate' rating and the 'Warm Climate' rating"; "The 'Warm Climate' rating indicates your potential energy savings ... when it's warmer outside". aercenergyrating.org: "The AERC Certified Product Search allows you to browse through the current window attachment products". | ADDED (owner answer #3). No Alta or Norman claim and no HD product name. |
| 23 | "In older parts of **the valley**, single-pane in aluminum frames; cellular slows heat more than anything else we sell" | cities.ts (Las Vegas): "In older parts of the city we are often working with single-pane glass in aluminum frames, where an insulating cellular shade slows the heat coming through the glass more than anything else we sell." | FIXED: "older parts of Las Vegas", matching the source's scope |
| 24 | West glass takes direct sun from about two until sunset | articles.ts (west guide): the same sentence | VERIFIED |
| 25 | Building America: in hot climates, shading east- and west-facing **windows** is of primary importance | BASC: "In hotter climates, highly effective shading of east- and west-facing surfaces is of primary importance." | FIXED: "hotter climates ... surfaces" |
| 26 | "PNNL found the large west and south windows decided most of the summer result" | PNNL: claim 3, plus "when the high-heat-gain windows (i.e., large windows on west and south sides of a home) are left uncovered, the HVAC savings were only around 5%" | FIXED: "singled out the large west and south windows" (the claim no longer goes further than the source) |
| 27 | Newer construction: bigger, better glass; the problem shifts **from heat** to glare and UV; a solar shade or shutter conversation | cities.ts: "the problem shifts from heat loss to glare and UV — which is a solar shade or a shutter conversation instead" | FIXED: "from heat loss" |
| 28 | Bedrooms are where they earn their keep; light-filtering and blackout cell fabrics | products.ts bestFor: "Bedrooms, older windows..."; features: "Light filtering and blackout cell fabrics" | VERIFIED |
| 29 | Front-facing bedroom, top-down bottom-up | cities.ts: "For street-facing bedrooms we often make it top-down bottom-up"; products.ts: "the setup we specify constantly for front-facing bedrooms and street-side bathrooms" | VERIFIED |
| 30 | Day sleepers: "Blackout cell fabric makes a bedroom darker, but ... a blackout roller shade with side channels does that job best" | Owner answer #4 (ruling B): cellular is a "strong option"; the roller with side channels stays "the most reliable setup"; Josh's reasons are that cellular blocks heat and leaves smaller side gaps. faq.ts: "a blackout roller shade with side channels, which close the light gaps at the edges" | FIXED/ADDED: "a blackout cellular shade is a strong option: it blocks heat as well as light, and it leaves smaller light gaps at the sides than an ordinary shade. The most reliable setup for a truly dark room is still a blackout roller shade with side channels" |
| 31 | Street-side bathrooms, top-down bottom-up | products.ts (claim 29) | VERIFIED |
| 32 | Stacks remarkably small: a fraction of the space of a roman or roller; keeps the glass usable | products.ts: same sentence | VERIFIED |
| 33 | Glass too high to reach gets motorized | faq.ts: "motorization handles glass too high to reach" | VERIFIED |
| 34 | Sliders: cellular keeps the door working while cutting the glare; "vertical blinds are **the other** good answer" | cities.ts (Henderson): "vertical blinds or a cellular shade on the slider keeps the door working while cutting the glare"; faq.ts: "vertical blinds are still the most sensible answer" | FIXED: verticals are now "still the most sensible answer on most sliding doors" and cellular is "another good one", so the copy no longer contradicts the FAQ |
| 35 | For the view, choose a solar shade: it cuts heat and glare while you still see out | faq.ts: "solar shades cut heat and glare while keeping the view" | VERIFIED |
| 36 | PNNL: with the large west and south windows uncovered, most of the summer benefit disappeared | PNNL (claims 3 and 26). Qualitative only, with no % in the copy. | VERIFIED |
| 37 | A shade raised at 3 p.m. on a west window isn't doing much about the heat | follows from claims 24 and 36 | VERIFIED (illustration) |
| 38 | "NV Energy's own conservation advice": block sunlight in the cooling season, let it in during the heating season, cover windows tightly at night | NV Energy insert: "Use shades or drapes to: (a) Block sunlight from entering a building in the cooling season; (b) Allow sunlight to enter ... during the heating season; and (c) Cover windows tightly at night during the heating season." | FIXED: "NV Energy's list of conservation measures" (the insert is a regulatory list, not advice NV Energy wrote). "Drapes" is left out. |
| 39 | Honeycomb is on the BLISS® Automation 2.0 list; clock or sunrise/sunset timers; USB-C overnight recharge | products.ts: "We install Alta's BLISS® Automation 2.0 on roller, woven wood, honeycomb, ...". "Set timers by the clock or by your local sunrise and sunset. Each motor recharges overnight with a USB-C cable" | VERIFIED (BLISS list rule passes) |
| 40 | "DOE guidance: automated window coverings **keep saving** energy even when the home is empty" | BASC: "Operation of window attachments can be automated to optimize energy savings even when the home is empty." | FIXED: "can be automated to save energy even when the home is empty" |
| 41 | A motorized shade can close itself at 2pm every summer afternoon | faq.ts: same | VERIFIED |
| 42 | Savings depend on your windows and which way they face; we won't promise a number | faq.ts: "How much you save depends on your windows and which way they face, so we won't promise you a number." | VERIFIED |
| 43 | Any inside shade works on heat already through the glass; it's harder to reflect heat back out than to block it | BASC: "It is more difficult to reflect heat and light back out a window than to simply block it before it reaches the window." | VERIFIED |
| 44 | Exterior solar screen: roughly 70–90% of the sun's heat; the most economical way to treat a whole west or south wall | faq.ts: same | VERIFIED (screens only; existing site claim) |
| 45 | "Inside that screen, a cellular shade adds its insulation **and gives you privacy at night**" | No source for cellular night privacy | FIXED: the privacy clause is cut |
| 46 | Dust settles and gets into headrails; soft brush; check the maker's care instructions before anything wet | faq.ts care answer | VERIFIED |
| 47 | NEW: cordless is an option on every cellular shade we sell | Owner answer #2 | ADDED |
| 48 | A drifting cordless cellular shade usually needs a two-minute reset; our guide shows how | faq.ts: "a two-minute reset usually fixes it"; guides.ts `cordless-cellular-shade-wont-stay-up` (live; only the /guides index redirects) | VERIFIED |
| 49 | Fabrics look different in your own light than in a showroom; free consultation; we walk the house; we bring samples | articles.ts (roman guide and west guide): same sentences | VERIFIED |
| 50 | We carry Hunter Douglas, Alta and Norman | owner rule; articles.ts brands guide | VERIFIED |
| 51 | Josh measures every window himself, backed by the measurement guarantee; we install every shade ourselves | articles.ts: same | VERIFIED |
| 52 | Whole valley; central Las Vegas single-pane; Henderson's Green Valley and MacDonald Highlands; plus Pahrump and Mesquite | cities.ts neighborhoods; business.ts travelArea; owner answer #5 | VERIFIED |

## Rule checks

- **Prices and savings:** none in the copy. The 25% and 5% figures are kept out, and so are R-values. Pass.
- **Brands and trademarks:** no "authorized", "exclusive" or "Lifetime Warranty", and no HD product names. BLISS® is the existing repo wording. Pass.
- **BLISS motorization:** only honeycomb is promised, and honeycomb is on the list. Pass.
- **Drapes and curtains, old phone number:** none. Pass.
- **Punctuation:** "They only help when they're down." is a sentence and ends with a period. The other headings are noun phrases and stay bare. Pass.
- **Photos:** `/gallery/cellular-shades-sitting-room.webp` and `/gallery/cellular-shades-top-down-bedroom.webp` are both in content/gallery.ts and in public/gallery. Pass.
- **Product hrefs:** /shades/cellular-shades, /outdoor/solar-screens, /shades/solar-shades and /motorization all exist (the routes are covered by the test suite). Pass.
- **Duplication:** no existing /learn guide covers cellular shades and energy. The guides on main are solar screens vs. shades, day sleepers, brands, west-facing and roman. Pass.
- **Contradictions:**
  - Sliders (claim 34) and day sleepers (claim 30) are fixed so they agree with the FAQ and the day-sleepers guide.
  - The day-sleepers guide on main already says "Cellular shades also come in blackout fabrics, and their trapped air adds insulation", which is consistent with this guide.
- **Owner answers:**
  - #6 (no reflective backing) and #7 (no install walkthrough): nothing in the copy, so nothing to remove.
  - #5: the neighborhoods are confirmed.

## Tightening

- "this is the real upgrade" is now "this is a real upgrade".
- No other hype was found. The voice is plain and the copy stays within its sources.

## Tests

- `tests/seo/articles.test.tsx`:
  - AERC is no longer banned, because owner answer #3 allows it.
  - "reflective" is now banned (owner answer #6).
  - A new test pins the owner-answer copy, keeps AERC claims off Alta and Norman, and keeps the roller with side channels as the most reliable day-sleeper setup.
- `npx vitest run --maxWorkers=2`: 403 files, 5150 tests, all passing.
- `npx next typegen && npx tsc --noEmit`: clean.
- eslint on the changed files: clean.

## Counts

52 claims:

| Verdict | Count |
|---|---|
| VERIFIED | 36 |
| FIXED | 14 (2 of them, #19 and #30, also bring in owner answers) |
| ADDED | 2 (#22 AERC, #47 cordless; the double cell 1½" line came in through FIXED #19) |
| REMOVED | 0 claims (one clause, the night privacy in #45, was cut inside a FIXED claim) |
| OWNER QUESTION | 0 |

## Owner questions

None are open. Owner answers #1–7 are all resolved, and nothing is marked PENDING. For Josh to eyeball on the preview:

- The new AERC paragraph in "How the honeycomb works", which says some of the cellular shades we carry have an AERC rating.
- The day-sleeper wording in "Room by room".
