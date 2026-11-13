# Draft notes: blinds-hub (PAGE /blinds)

Writer agent, 2026-11-13. Branch `content/2026-11-11-blinds-hub`. Source: `research.md` in this folder.

## What changed

I went with **option B** from the brief: an optional `sections` field on `Category`, rendered under the product cards. A data-only intro rewrite could not answer nine intent questions without turning the story block into a wall of text.

- `content/products.ts`:
  - The blinds category gets `heading: "Custom Blinds"`, so the H1 is "Custom Blinds in Las Vegas". It also gets the brief's SEO title (56 chars) and meta description (157 chars), which is the hero lead.
  - Intro paragraph 1 is kept word for word. Paragraph 2 now opens "Window blinds…", and its comparison clause is unchanged. A new paragraph 3 is a short version of the brief's quick answer.
  - Nine new sections, described below.
  - New `CategorySection` type, an `install(src)` helper (the same one `content/articles.ts` uses) and a `BLIND_WEEKS` constant built from `leadTimes`. `MOTORIZED_EXTRA_WEEKS` is imported, not written as a literal.
  - The pinned highlights, story wording, hero photo and card photos are all unchanged (owner question 6).
- `components/treatment/CategorySections.tsx` (new) renders the sections. Its markup matches the guide sections in `app/(site)/learn/[slug]/page.tsx`: an H2, paragraphs, an optional figure with the gallery caption, then a list of links.
- `app/(site)/[category]/page.tsx` renders `CategorySections` after the card grid. Section photos go through `uniquePhotos` with the hero, story and card photos, so no photo can repeat on the page. Other categories have no `sections` and render as before.
- `content/page-faqs.ts`: the blinds FAQ list is now `[BLINDS_VS_SHADES, SAFE, LAST, BIG_WINDOWS, LEAD_TIME]`. Adding SAFE answers "cordless blinds" with existing FAQ text. The FAQ title becomes "Questions about custom blinds."
- `content/articles.ts`: the west-facing guide's `products` list gains `{ name: "Vertical blinds", href: "/blinds/vertical-blinds" }`. The guide's "Patio slider" paragraph already recommends verticals, so `/blinds/vertical-blinds` now shows the guide under "Buying guides". The brief suggested adding `/blinds` instead. I chose the vertical blinds page because the guide recommends verticals specifically, not blinds in general. The /blinds hub links the guide from its own copy anyway.
- `tests/seo/articles.test.tsx` adds 6 tests: the H1 and every section heading; no cordless or motorized verticals; no price, savings, certification, carried-line, drapery or repair claims; the two install photos with their captions, never the drapery photo and no repeats; every section link resolves to a real page; and the vertical blinds page links back to the west-facing guide.
- No new routes. The sitemap count is unchanged.

## Sections and the research facts behind them

1. **What custom means with us**: the free in-home consult with samples, Josh measuring every window, the measurement guarantee (FAQ measuring and process), the written quote with the lead time (`leadTimes` Blinds 3–5 weeks, from the day of the order), installing ourselves, the walk-through, clean-up and free haul-away (FAQ process), and the brand-voice line "From your first call to the final install, we're family." Then the 20+ years line and "we carry three" with `HD_DEALER` (the hunter-douglas-alta-norman guide), linked to that guide. I left "repairing" out of the years line because we do not do repairs.
2. **Which blind goes on which window**: west glass from about 2pm to sunset (west-facing guide and FAQ), faux wood where the sun hits (wood-blinds opening), kitchens and baths (FAQ "How do I choose" and the wood-blinds body), real wood for shaded, formal rooms, verticals for sliders and windows wider than they are tall (vertical-blinds opening and bestFor), and walking the house at the consult (west-facing guide closing).
3. **Faux wood blinds that stand up to the sun.**: the wood-blinds body and features (no warping, fading or cracking; moisture; the embossed, color-matched look; basswood; replaced sun-bleached real wood on west elevations; 2 and 2 1/2 inch slats; valances and cloth tapes). Photo: `/gallery/faux-wood-blinds-living-room.webp`. Links to `/blinds/wood-blinds`.
4. **Cordless blinds for homes with kids and pets**: cordless lift on wood and faux wood, and "tell us at the consult…" (FAQ SAFE). The CPSC advice is paraphrased, with the source URL in a code comment (web fact 5). BLISS® Automation 2.0 on wood and faux wood, the app, remote, timers and USB-C (motorization intro), "no wiring and no electrician" (Henderson city copy), and `MOTORIZED_EXTRA_WEEKS`. Links to `/motorization`.
5. **Vertical blinds for sliders and wide glass**: the FAQ big-windows answer, plus the vertical-blinds opening, body and features (stacking left, right or split; tilting against low western sun; fabric, faux wood and PVC vanes; shedding dust; replaceable vanes). Photo: `/gallery/vertical-blinds-patio-door-valance.webp`. Links to `/blinds/vertical-blinds`.
6. **Upgrading builder blinds**: Henderson and North Las Vegas wording from `content/cities.ts`, and the FAQ cost answer (removal priced per window, hauling away free). Links to both city pages.
7. **Blinds, heat and the west wall**: PNNL web facts 2, 3 and 4 (source URL in a code comment) and the outdoor intro ("turn away most of the afternoon sun"). It makes no energy-savings claim for blinds. Links to `/outdoor/solar-screens` and the west-facing guide.
8. **What sets the price of custom blinds**: the FAQ cost answer, with no numbers.
9. **Living with blinds in desert dust**: the FAQ clean-and-maintain answer and the 15-minute slat replacement. Links to `/guides/replace-a-broken-blind-slat` (route confirmed: `app/(site)/guides/[slug]`). It offers no repair service.

## Left out, and why

- **Cordless or motorized verticals.** The repo doesn't establish either, and BLISS isn't listed for verticals. A test blocks this.
- **Which maker supplies the blinds, and any trademarked blind names.** The repo doesn't say (owner question 1).
- **Las Vegas sunshine percentage.** The sources conflict (web fact 7). **DOE Energy Saver quote** wasn't verified (web fact 9). **The 104.5°F July normal** was optional, and the page didn't need it.
- **The warranty.** It isn't one of this page's intent questions, and the product pages already carry `WARRANTY_LINE`.
- **"Wholesale blinds", other slat sizes, light-blocking or routeless slats, mount types, colors.** These aren't in the content files (owner questions 4 and 5).
- **Shade’.** The FAQ "choose" answer mentions her. I described the consultation without her so the page doesn't depend on that feature.
- **The gallery photo `faux-wood-blinds-front-window.webp`.** Its caption mentions drapery.
- **The cost line "chain".** The FAQ wording "(cordless, chain or motorized)" is kept as written, because it is the FAQ's generic list of ways a treatment operates. The fact-checker may want to drop "chain" for blinds.

## Owner questions (carried from research.md, still open)

1. Which of our three makers supplies our wood, faux wood and vertical blinds?
2. Do our vertical blinds come cordless (wand-operated)?
3. Is cordless lift standard on our wood and faux wood blinds, or an option? The copy says "available".
4. Should "wholesale blinds" appear on the public page?
5. Do we offer slat sizes other than 2 and 2 1/2 inch, or light-blocking or routeless slats?
6. Do we have Las Vegas blinds install photos? Both section photos are from the owners' earlier work, captioned by treatment only.
