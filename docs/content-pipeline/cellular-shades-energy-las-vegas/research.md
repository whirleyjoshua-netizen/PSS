# Research brief: cellular-shades-energy-las-vegas

Research agent, 2026-11-06. Branch `content/2026-11-06-cellular-shades-energy-las-vegas`, cut from origin/main at c6f1108.

## Target

- **Queue item:** 1, GUIDE "Cellular shades and energy in Las Vegas". Not on main (no such slug in `content/articles.ts`) and no existing `origin/content/*` branch, so it is this week's item.
- **Search terms:**
  - "cellular shades": 140/mo (Keyword Planner, Las Vegas DMA).
  - "macdonald highlands nv cellular shades": Search Console, position 15. MacDonald Highlands is in the Henderson neighborhood list in `content/cities.ts`. One mention in context is enough; see Owner questions.
  - Supporting phrases people use: "honeycomb shades", "do cellular shades keep heat out", "single vs double cell".
- **Route:** `/learn/cellular-shades-energy-las-vegas` (data entry in `content/articles.ts`; no new route).
- **Product page it supports:** `/shades/cellular-shades`. `articlesFor()` will add the "More reading" link back automatically once the guide lists that href.
- **Proposed H1 (`title`):** "Cellular shades in Las Vegas: how the honeycomb handles the heat"
- **SEO title (60 chars, checked):** `Cellular Shades for Las Vegas Heat | Premier Shade Solutions`
- **Meta description (153 chars, checked):** `Do cellular shades keep a Las Vegas home cooler? How the honeycomb works in summer, which windows it helps most, and when to pair it with a solar screen.`
- **crumb:** "Cellular shades and energy"
- **Sitemap test:** adding this guide raises the URL count in `tests/seo/sitemap.test.ts` by one. The writer updates both the number and its comment.

## Searcher intent (priority order)

1. Do cellular shades actually help in a hot climate, or only in cold ones? This is the doubt to answer first. Most of what people read online is about winter heat loss.
2. How do they work? Air trapped in the cells, and between the shade and the glass.
3. Which windows benefit most? Single-pane and older aluminum frames, plus the west and south glass that takes the afternoon sun.
4. Single, double or triple cell: what is the difference, and which do I need?
5. Do I have to keep them closed? How should I use them in summer, and can they close themselves?
6. Cellular shade or solar shade or solar screen: which should I choose, and when do I use both?
7. Can I keep daylight and privacy, and can I get a dark bedroom? (Top-down bottom-up, light-filtering vs. blackout.)
8. Will they hold up to Vegas dust, and how do I clean them?
9. How much will I save? Answer honestly that it depends on the windows and which way they face, with no number. This follows the existing FAQ.

## Repo facts we can state

Each fact gives the file and the exact sentence it comes from.

**What it is and how it insulates**
- `content/products.ts` (cellular-shades body): "Cellular shades, sometimes called honeycomb, are built from pleated cells that trap a layer of still air against the glass. That trapped air is genuine insulation, and it is the reason this is the highest-performing energy product in the category."
- `content/products.ts`: "In a Las Vegas summer that insulation works in the direction people forget: it slows heat coming in, not just heat leaking out. On a single-pane window or an older aluminum frame, a double-cell shade makes a measurable difference in how hard the air conditioning has to work in the afternoon."
- `content/products.ts` (opening): "Cellular shades trap a layer of still air against the glass, so on a single-pane window or an older aluminum frame they slow the afternoon heat coming in and give your air conditioning a break."
- `content/products.ts` (tagline): "The insulating one."

**Options**
- `content/products.ts` features: "Single, double, and triple cell constructions for increasing insulation"; "Measurably reduces summer heat gain and winter heat loss"; "Top-down bottom-up operation for privacy with daylight"; "Compact stack keeps tall windows usable"; "Light filtering and blackout cell fabrics".
- `content/products.ts` bestFor: "Bedrooms, older windows, and any home where the summer power bill is a concern."
- `content/products.ts`: "They also stack remarkably small. A cellular shade raised to the top of a tall window takes up a fraction of the space a comparable roman or roller would, which keeps the glass usable. Top-down bottom-up operation lets you drop the top for daylight while keeping the lower half private — the setup we specify constantly for front-facing bedrooms and street-side bathrooms."

**FAQ wording to stay consistent with**
- `content/faq.ts` (Do cellular shades help with energy efficiency?): "Yes. Their honeycomb cells trap a layer of still air against the glass, and that air is real insulation. In a Las Vegas summer it slows heat coming in, not just heat leaking out. On single-pane windows or older aluminum frames, a double-cell shade makes a measurable difference in how hard your air conditioning works in the afternoon. How much you save depends on your windows and which way they face, so we won't promise you a number."
- `content/faq.ts` (best for Las Vegas heat): "Stop the sun before it reaches the glass if you can. Exterior solar screens turn away roughly 70–90% of the sun's heat, and they are the most economical way to treat a whole west or south wall. Inside, solar shades cut heat and glare while keeping the view, cellular shades insulate, and composite shutters won't warp or yellow in direct sun. Motorized shades can close themselves at 2pm every summer afternoon, whether or not anyone is home."
- `content/faq.ts` (blocking sunlight): "For a truly dark room, a blackout roller shade with side channels, which close the light gaps at the edges. ... Cellular shades come in blackout fabrics too."
- `content/faq.ts` (privacy): "Top-down bottom-up cellular shades lower from the top for daylight while the bottom half stays private, which we use constantly for front bedrooms and street-side bathrooms."
- `content/faq.ts` (large windows): "Cellular shades stack small, which keeps tall windows usable, and motorization handles glass too high to reach."
- `content/faq.ts` (care): "Dust is the main thing in this valley: fine desert dust settles on slats and works its way into headrails. Dust or vacuum with a soft brush regularly, and check the maker's care instructions before using anything wet on fabric. ... If a cordless cellular shade starts drifting down, a two-minute reset usually fixes it". The reset guide is at `/guides/cordless-cellular-shade-wont-stay-up` (`content/guides.ts`); the writer confirms the route prefix in the app before linking.

**Local context**
- `content/cities.ts` (Las Vegas): "In older parts of the city we are often working with single-pane glass in aluminum frames, where an insulating cellular shade slows the heat coming through the glass more than anything else we sell. In newer construction the glass is bigger and better, and the problem shifts from heat loss to glare and UV — which is a solar shade or a shutter conversation instead."
- `content/cities.ts` (Las Vegas local): "For street-facing bedrooms we often make it top-down bottom-up, so the top lets daylight in while the bottom half stays private."
- `content/cities.ts` (North Las Vegas): "Inside, a cellular shade's trapped air slows the heat coming through, and a solar shade cuts the glare while keeping your view".
- `content/cities.ts` (Henderson): neighborhoods list includes "MacDonald Highlands". The sliders section says: "Inside, vertical blinds or a cellular shade on the slider keeps the door working while cutting the glare."
- `content/articles.ts` (west-facing guide): "West-facing glass in the Las Vegas valley takes direct sun from about two in the afternoon until sunset, in the hottest part of the day."

**Motorization (honeycomb is on Alta's BLISS list)**
- `content/products.ts` (motorization): "We install Alta's BLISS® Automation 2.0 on roller, woven wood, honeycomb, sheer, banded, wood and faux wood styles. ... Set timers by the clock or by your local sunrise and sunset. Each motor recharges overnight with a USB-C cable".

**Brands, service, warranty and lead time**
- Brands: "we carry Hunter Douglas, Alta and Norman" (owner rule; `content/articles.ts` brands guide).
- Consultation and measuring, from `content/articles.ts`: "Josh measures every window himself, backed by our measurement guarantee"; "At your free consultation we ... bring ... samples to hold up in your own light."
- Warranty: use `WARRANTY` / `WARRANTY_LINE` from `content/warranty.ts` only if needed. A limited lifetime manufacturer warranty, never "Lifetime Warranty".
- Lead time: shades take 3–5 weeks from the order (`content/lead-times.ts`), and motorized products take about 1 week more. This is optional for this guide.

## Web facts (with sources)

These are general facts, not Las Vegas-specific unless marked. Keep all savings percentages out of the copy (owner rule); they are recorded here only so the writer and fact-checker understand the evidence.

1. **Cellular shades help in summer, not only winter. This is general and the key fact.** PNNL Lab Homes study (DOE), PNNL-27663 Rev1, https://www.pnnl.gov/main/publications/external/technical_reports/PNNL-27663Rev1.pdf. Quote: "High-efficiency cellular shades have significant energy-saving potential during the summer cooling season (25% HVAC savings), but this savings decreases considerably if the larger view windows of a home remain uncovered during the day, particularly if these are west- or south-facing windows." Usable in the copy: shades help in summer, but only on windows where they are actually down during the day, especially big west and south glass. The 25% figure must NOT be used.
2. **Leaving the hot windows open erases most of the benefit. General.** Same report: "when the high-heat-gain windows (i.e., large windows on west and south sides of a home) are left uncovered, the HVAC savings were only around 5%." Use qualitatively only. This supports the "let a schedule close them" section.
3. **How they work. General.** DOE / ORNL fact sheet "Interior Cellular Shades Boost Home Energy Performance" (DOE/EE-2519, October 2021), https://www.energy.gov/sites/default/files/2021-12/bto-cellular-shades-factsheet-112221.pdf. Quote: "They trap air within each cell, as well as between the shade and the window, which is particularly beneficial in colder climates." Note the honest caveat: the strongest evidence is for cold weather. The guide should say plainly that the benefit is smaller and depends on use in a hot climate, and not overstate it.
4. **They reduce solar heat gain as well as heat loss. General.** Same fact sheet: "they also reduce nighttime heat loss through windows, minimize cold drafts near windows, and reduce unwanted solar heat gain."
5. **They outperform the typical vinyl blind. General.** Same fact sheet: "Although blinds block some solar radiation, they do not provide much insulation. Simulations by the Lawrence Berkeley National Laboratory (LBNL) show that cellular shade coverings achieve higher energy savings than all other types of shading devices." PNNL also: "In all cases and operational scenarios, double-cell cellular shades out-performed the typical vinyl Venetian blinds". This works for an "upgrading builder blinds" angle without numbers.
6. **The research is weaker on cooling. General, and an honesty note.** Fact sheet: "The experiments focused on the energy benefits of cellular shades during the heating season; research is needed to fully explore control strategies and benefits in the cooling season."
7. **Exterior shading beats interior for heat gain. General.** PNNL Building America Solution Center, "Window Attachments: Solar Control and Energy Efficiency", https://basc.pnnl.gov/resource-guides/window-attachments-solar-control-and-energy-efficiency. Quotes: "Exterior window attachments block solar heat before it reaches the window." Also: "It is more difficult to reflect heat and light back out a window than to simply block it before it reaches the window." This supports pairing cellular shades with exterior solar screens on the hardest walls, and matches the existing site position.
8. **East and west glass matters most in hot climates. General, applies to Las Vegas.** Same BASC page: "In hotter climates, highly effective shading of east- and west-facing surfaces is of primary importance."
9. **Close them during the day in summer. General.** Same BASC page: "The optimal strategy for operating window attachments for cooling energy savings is to simply close them during the day". Also: "Operation of window attachments can be automated to optimize energy savings even when the home is empty."
10. **The local utility says the same. Nevada-specific.** NV Energy, "Measures to Conserve" bill insert (2018), https://www.nvenergy.com/publish/content/dam/nvenergy/bill_inserts/2018/03_mar/Measures-to-Conserve-2018NVE_%201_24.pdf. Quote: "Use shades or drapes to: (a) Block sunlight from entering a building in the cooling season; (b) Allow sunlight to enter a building during the heating season; and (c) Cover windows tightly at night during the heating season." Cite it as NV Energy guidance. Do not repeat the word "drapes" in our copy (no drapes rule); paraphrase as "shades".
11. **How hot it gets. Las Vegas-specific.** National Weather Service Las Vegas, "Temperature Overview" (NOAA NCEI 1991–2020 normals), https://www.weather.gov/media/vef/Temperature%20Overview.pdf. July normal average maximum is "104.5", August is "102.8" and June is "99.4". The doc says: "Normals are from 1991-2020 and provided by NOAA's National Centers for Environmental Information (NCEI)." Usable as "July afternoons average about 104°F at the airport." It is a weather figure, not a savings figure, so it is allowed with this citation.
12. **Winter matters too. Las Vegas-specific.** The same NWS doc gives a December normal average minimum of "39.6" and January "40.5". This supports "the same shade that slows summer heat keeps winter nights from pulling heat out through the glass". The repo agrees ("winter heat loss" in features).
13. **Independent energy ratings exist. General; do not imply our products carry one.** Fact sheet: "Look for the AERC energy improvement label on certified products to find information on the energy rating of a particular product in your climate zone". See Owner questions.

**Competitor angles (gaps only; nothing copied).** National retailer pages on "cellular shades for summer heat" and "single vs double cell" (e.g. 3dayblinds.com, selectblinds.com, budgetblinds.com franchise blogs) lean on unverified vendor percentages and R-values. None that I found answers the honest question: these shades are best known for winter, so what do they do in a 104°F desert summer? None addresses single-pane aluminum frames in older valley homes, and none connects the shade to the west and south afternoon sun and a schedule. That is the gap: a local, honest, number-free answer.

## Do NOT claim

- **Any savings figure.** No 25%, 15%, 13.3%, 5–9%, "up to 40% more insulation", dollar amounts or "pays for itself". Owner rule, plus the existing FAQ line "we won't promise you a number".
- **R-values for any cell type** (vendor numbers like 2.0–4.0 are unverified and product-specific).
- **"Blocks X% of solar heat" for cellular shades.** DOE sources conflict (60% vs. 80%), and the figures come from the cold-climate test context.
- **That our cellular shades are AERC-rated or have low-e cells.** The repo does not say so.
- **Side channels or tracks for cellular shades.** The repo only states side channels for blackout roller shades. Blackout cellular fabric exists, but do not promise a "truly dark" cellular room. Point day sleepers to the day-sleepers guide.
- **Cordless as standard on every cellular shade.** The repo mentions "a cordless cellular shade" in the care FAQ and the reset guide only. "Cordless options" is the safe wording.
- **Specific Hunter Douglas product names** (e.g. the fact sheet's photo credit names a Hunter Douglas honeycomb line). No HD trademarks in this guide. The DOE fact sheet's HD photo and marketing copy are not to be used.
- **That cellular shades beat solar screens on heat.** The repo and BASC both say exterior wins. Also not "the best treatment for Las Vegas heat" overall. The repo says "highest-performing energy product in the category" (shades), and that wording should stay scoped.
- **Any claim about fading or UV-blocking percentages for cellular fabrics** (not in repo).
- **Prices, cost ranges, rebates or NV Energy incentives** (none sourced, and no prices ever).
- **"Hunter Douglas Las Vegas", "authorized" for Alta or Norman, "exclusive", "Lifetime Warranty", drapes or curtains, or the old phone number.**
- **Naming a MacDonald Highlands client or job.** The repo only lists the neighborhood.

## Owner questions

1. Which cell constructions do you actually stock and recommend for the valley? Do you default to double-cell on west and south glass? (The repo says "single, double, and triple" exist, and the double-cell recommendation is for single-pane frames.)
2. Are all the cellular shades you sell cordless by default, or is cordless an option?
3. Do any of the cellular lines you carry carry an AERC energy rating label? If so, can we mention looking for it?
4. Is blackout cellular good enough for a day sleeper's bedroom, or do you always steer them to a blackout roller with side channels?
5. May the guide name MacDonald Highlands (and other Henderson neighborhoods) as places you install cellular shades? Have you done cellular work there? The Search Console query suggests demand.
6. Do you recommend light-colored or reflective-backed cell fabrics facing the glass for summer? (A common industry claim, but not in the repo and not sourced here.)
7. Any typical install you would like described, such as a single-pane older home in central Las Vegas fitted with top-down bottom-up cellular shades?

## Proposed outline

Sections follow the `ArticleSection` shape: heading, paragraphs and an optional `photo` via `install(src)`. Headings that are sentences end with a period; noun-phrase headings stay bare.

1. **"Cellular shades aren't just a winter product"** (noun phrase or sentence; the writer chooses and punctuates accordingly). Most advice about cellular shades is written for cold climates. In Las Vegas the same trapped air works the other way and slows heat coming in (repo). Cite web facts 3 and 1 qualitatively: DOE research found real summer benefit, with conditions.
2. **"How the honeycomb works"**. Pleated cells trap still air against the glass, and air between the shade and the window adds to it (repo plus web fact 3). Single, double and triple cell give increasing insulation (repo). Photo: `/gallery/cellular-shades-sitting-room.webp` (caption already says the cells "hold heat off the glass through the afternoon").
3. **"The windows where they matter most"**. Single-pane glass in older aluminum frames, common in older Las Vegas neighborhoods (repo, cities.ts). Then the west and south glass that takes direct sun from about 2 p.m. to sunset (repo, west guide; BASC fact 8). Newer, bigger glass is often a solar-shade conversation instead (repo).
4. **"They only work when they're down"**. PNNL found most of the summer benefit disappears if the big west and south windows stay uncovered (fact 2, no numbers). NV Energy says to block sunlight in the cooling season (fact 10). Close them for the afternoon; in winter, open the sunny ones by day and close them at night (fact 10 b/c; repo "winter heat loss"). Photo: `/gallery/cellular-shades-nook-motorized.webp`.
5. **"Let a schedule close them"**. Honeycomb is on Alta's BLISS list. Timers by clock or by local sunrise and sunset, USB-C recharge (repo). BASC: automation saves energy even when the home is empty (fact 9). Tall glass: they stack small and motorization reaches glass nobody can (repo). Do not reuse `/gallery/cellular-shades-great-room-motorized.webp`; the west guide uses it.
6. **"Cellular inside, solar screen outside"**. Be honest: exterior shading stops heat before the glass (BASC fact 7; repo 70–90% screens line, which is an existing site claim tied to screens only). On the hardest west wall, use a screen outside and a cellular or solar shade inside. When you want the view, a solar shade beats a cellular (repo). Link `/learn/solar-screens-vs-solar-shades` and `/learn/west-facing-windows-las-vegas`.
7. **"Daylight, privacy and dark bedrooms"**. Top-down bottom-up for street-facing bedrooms and baths (repo). Light-filtering vs. blackout cell fabrics (repo). For someone who sleeps days, link `/learn/blackout-shades-for-day-sleepers` (that guide already says cellular comes in blackout and its trapped air helps a hot west bedroom). Photo: `/gallery/cellular-shades-top-down-bedroom.webp`.
8. **"Living with them in the desert dust"**. Short section. Dust or vacuum with a soft brush, and check the maker's care instructions before anything wet (repo FAQ). A cordless shade that drifts down usually needs a two-minute reset; link the reset guide.
9. **"What they'll save you"** (or "Will they lower my power bill?", which as a question ends with "?"). Honest: it depends on your windows and which way they face, so we won't promise a number (repo FAQ verbatim idea). What drives the result, without numbers: single- vs dual-pane glass, orientation, cell construction, and whether the shades are actually down in the afternoon.
10. **"Choosing yours at the window"**. Free consultation, samples in your own light, Josh measures every window himself with the measurement guarantee, and we install ourselves (repo). We carry Hunter Douglas, Alta and Norman. We serve the whole valley, Henderson included (optionally MacDonald Highlands, pending owner question 5), plus Pahrump and Mesquite. Optional photo: `/gallery/cellular-shades-tall-windows.webp`.

**Internal links:** `/shades/cellular-shades`, `/outdoor/solar-screens`, `/shades/solar-shades`, `/motorization`, `/learn/west-facing-windows-las-vegas`, `/learn/solar-screens-vs-solar-shades`, `/learn/blackout-shades-for-day-sleepers`, the cordless cellular reset guide, and `/service-area/henderson` (confirm the route in the app).

**`products` list (existing hrefs only):**
- `{ name: "Cellular shades", href: "/shades/cellular-shades" }`
- `{ name: "Solar screens", href: "/outdoor/solar-screens" }`
- `{ name: "Solar shades", href: "/shades/solar-shades" }`
- `{ name: "Motorization", href: "/motorization" }`

**Other photos available** (all from `content/gallery.ts`): `/gallery/cellular-shades-great-room.webp`, `/gallery/cellular-shades-fireplace-wall.webp`, `/gallery/cellular-shades-entry-sidelights.webp`, `/gallery/cellular-shades-kitchen-door.webp` (slider, for the Henderson-style patio door point). Avoid `/gallery/cellular-shades-holiday-great-room.webp` (the /holiday hero).

## Quick answer draft

Yes, and not only in winter. A cellular shade's honeycomb traps still air against the glass, and in a Las Vegas summer that layer slows the afternoon heat coming in, most of all on single-pane glass in older aluminum frames and on west- and south-facing windows. They help only when they're down, so set them on a schedule. On the hottest walls, pair them with an exterior solar screen, which stops the heat before it reaches the glass.
