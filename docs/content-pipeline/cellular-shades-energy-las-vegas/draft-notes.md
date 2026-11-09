# Draft notes: cellular-shades-energy-las-vegas

Writer agent, 2026-11-06. Branch `content/2026-11-06-cellular-shades-energy-las-vegas`.

## What I wrote

One new `Article` in `content/articles.ts`: `/learn/cellular-shades-energy-las-vegas`. It has 8 sections and 2 install photos, and it uses the brief's H1, SEO title (60 chars), meta description (153 chars) and crumb. `published` and `updated` are both 2026-11-09, the coming Monday. The products listed are cellular shades, solar screens, solar shades and motorization, all existing hrefs. `articlesFor()` adds the "More reading" link back from `/shades/cellular-shades`, and a test covers it.

The tests:
- `tests/seo/sitemap.test.ts`: the URL count goes from 38 to 39, and the comment is updated.
- `tests/seo/articles.test.tsx`: a new block checks:
  - the two photos and the link back from the product page;
  - no savings figure, R-value, AERC, low-e, drapes or Hunter Douglas product name;
  - side channels appear only as "blackout roller shade with side channels";
  - the 70–90% figure appears only next to exterior solar screens;
  - there is no "best for Las Vegas heat" claim.
- The full suite passes (403 files, 5149 tests), and `tsc --noEmit` and eslint on the changed files are clean.

## Section → research facts

| Section | Repo facts | Web facts (research.md numbering) |
|---|---|---|
| Quick answer | products.ts opening; faq.ts best-for-heat (screens) | 1, 7 (qualitative) |
| Not just a winter product | products.ts "slows heat coming in, not just heat leaking out"; features "winter heat loss" | 3 (colder climates caveat), 6 (heating-season focus), 4 (solar heat gain), 1 (summer benefit, no %), 11 (July ~104°F), 12 (Dec/Jan lows ~40°F) |
| How the honeycomb works (photo: cellular-shades-sitting-room) | products.ts body, "highest-performing energy product in the category" (written as "among shades", keeping the scope), tagline "The insulating one", features single/double/triple, double-cell on single-pane/aluminum | 3 (air between shade and glass), 5 (blinds give little insulation; double-cell beat vinyl blinds) |
| The windows where they matter most | cities.ts Las Vegas (single-pane aluminum; newer glass → solar shade/shutter conversation); articles.ts west guide (2 p.m. to sunset) | 8 (east/west primary in hot climates), 1 (large west/south windows) |
| Room by room (photo: cellular-shades-top-down-bedroom) | products.ts bestFor bedrooms, light-filtering/blackout cell fabrics, top-down bottom-up for front bedrooms and street-side baths, compact stack vs roman/roller; faq.ts blackout roller + side channels, motorization for high glass; cities.ts Henderson slider (cellular or vertical blinds); faq.ts solar shade keeps the view; links the day-sleepers guide by name | — |
| They only help when they're down. | faq.ts "close themselves at 2pm"; products.ts BLISS® Automation 2.0 (honeycomb listed), timers by clock or sunrise/sunset, USB-C; faq.ts "we won't promise you a number" | 2 (uncovered west/south windows lose most of the benefit, no %), 10 (NV Energy guidance, "drapes" left out), 9 (close by day; automation works when the home is empty) |
| Cellular inside, solar screen outside | faq.ts screens "roughly 70–90%", "most economical way to treat a whole west or south wall" (existing site claim, screens only) | 7 (exterior blocks heat before the glass; harder to reflect back out) |
| Living with them in the desert dust | faq.ts care answer; cordless cellular reset (content/guides.ts) | — |
| Choosing yours at the window | west guide (walk the house, samples in your own light); "Josh measures every window himself, backed by our measurement guarantee"; we install ourselves; brands line; cities.ts Henderson neighborhoods (Green Valley, MacDonald Highlands); service area incl. Pahrump and Mesquite | — |

## Left out, and why

- **All savings figures** (25%, 5%) and **R-values**: owner rule and the brief's "Do NOT claim" list. I used the PNNL finding qualitatively only ("most of the summer benefit disappeared").
- **Inline links to other guides**: `app/(site)/learn/[slug]/page.tsx` renders paragraphs as plain text. The guides are named in the copy instead: day sleepers, west-facing windows, solar screens vs. solar shades, and the cordless reset guide. Adding inline links would need a renderer change. That is framework work and out of scope for a data-only guide.
- **Henderson city page link**: not possible for the same reason, and the products list only takes product or category hrefs.
- **A default cell construction** (e.g. "we always use double-cell on west glass"): not in the repo (owner question 1). The copy says we recommend it window by window.
- **"Cordless" as standard**: only the reset-guide mention ("a cordless cellular shade").
- **Lead times and warranty**: optional per the brief; left out to keep the guide on topic.
- **Light-colored or reflective cell backing, AERC labels, low-e, UV or fading percentages**: not in the repo.
- **A sample install story**: owner question 7 is unanswered.
- **"Motorize so many"**: an earlier draft line implied how often we motorize cellular shades. It was cut because the repo doesn't say.

## Owner questions (carried from research.md, still open)

1. Which cell constructions do you stock and recommend? Is double-cell the default on west and south glass?
2. Are cellular shades cordless by default, or is cordless an option?
3. Do any lines you carry have an AERC label?
4. Is blackout cellular good enough for a day sleeper? (The copy currently steers day sleepers to a blackout roller with side channels.)
5. **The copy names MacDonald Highlands and Green Valley** as Henderson neighborhoods we work in. They come from the `content/cities.ts` neighborhood list, and no job is named. Confirm, or the fact-checker should cut them.
6. Do you recommend light or reflective cell fabrics facing the glass?
7. Is there a typical install you'd like described?

## For the fact-checker

- Figures in the copy: "about 104°F" (NWS July normal max, 104.5), "lows around 40°F" (NWS Dec 39.6 and Jan 40.5 normal minimums), "roughly 70–90%" (existing faq.ts screens claim), and "2pm" (faq.ts).
- The Department of Energy and PNNL attributions map to web facts 1–9. NV Energy maps to fact 10.
