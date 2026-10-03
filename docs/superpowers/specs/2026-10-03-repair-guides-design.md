# Repair & care guides — design

Date: 2026-10-03
Status: approved in brainstorming, awaiting spec review

## Why

Organic search. Instead of a blog, the site publishes illustrated how-to guides
for the problems people actually search ("cordless cellular shade won't stay
up", "fix a broken blind slat"). Every guide ends with a bridge from "fix it" to
a free in-home measure.

Evidence from the competitor check (2026-10-03):

- Budget Blinds' post is the top result for "how to fix a broken blind slat". It
  dates from January 2020, has no diagrams or step photos, and ends with a
  consult CTA. A guide with a diagram for each step is the clear improvement.
- For "cellular shade won't stay up", Budget Blinds is absent; small sites
  (fixmyblinds.com, blinds.com) rank. Newer product problems are open ground.
- Budget Blinds' seasonal/decor posts don't appear to rank. We write none.

## Success

- The first release puts two guides live at `/guides/<slug>` (cellular reset, broken slat),
  listed at `/guides` and in the sitemap. The motorized guide follows once the owner
  names the motor brand (see "First three guides").
- Search Console shows impressions for the guides within 8–12 weeks.
- Analytics can tell how many consult clicks came from guides.

## Page layout (approved mockup, local only: `.superpowers/brainstorm/49201-1791065536/content/guide-page-layout.html`)

Top to bottom, single column on phones:

1. Breadcrumb: Home › Guides › <topic>.
2. H1 phrased as the search ("Cordless cellular shade won't stay up? Reset it in 4 steps").
3. Meta line: time needed, tools needed, "Updated <Mon YYYY>", "Written by our installers".
4. **Quick answer** box: the whole fix in one or two sentences (white card, champagne left border).
5. **Step cards** (option C): one card per step. Looping SVG diagram on top, then
   "Step N" (with "· side view" when the diagram is a side view), the step
   title (h3) and its paragraph.
6. **Why it happens**: one short paragraph. Las Vegas specifics where true (dust,
   heat, UV), matching the voice of `content/products.ts`.
7. **"Still dropping?" box**: charcoal card, a headline, a sentence, the primary
   button "Book a free in-home measure" → `/contact`, and the phone button using
   `business.phone` (never a literal; `tests/business.test.ts` enforces this).
8. **Common questions**: native `<details>`/`<summary>`, first one open.
9. **Other guides**: links to the guide's `related` slugs.

Computer width: same order; step cards two across; the booking box is also pinned
in the right margin (`position: sticky`). The in-flow box at step 7 stays.

## Content model — `content/guides.ts`

Follows `content/products.ts`: the file is the single source; pages, sitemap and
index read from it; adding a guide is an edit to this file only.

```ts
export type DiagramId =
  | "cellular-lower" | "cellular-pull-45" | "cellular-tug" | "cellular-raise"
  | "slat-plugs" | "slat-cord-up" | "slat-swap" | "slat-reknot";
// Motorized ids are added with that guide.

export type GuideStep = {
  title: string;
  body: string;          // plain text, one paragraph
  diagram: DiagramId;
  sideView?: boolean;    // adds "· side view" to the step label
};

export type Guide = {
  slug: string;                 // URL segment
  category: CategorySlug;       // reuses products.ts; drives the breadcrumb
  title: string;                // H1
  seo: Seo;                     // reuses products.ts type
  minutes: number;
  tools: string;                // "No tools" or a short list
  updated: string;              // ISO date; shown as "Updated Oct 2026"
  quickAnswer: string;
  steps: GuideStep[];           // 3–8
  why: string;
  cta: { eyebrow: string; headline: string; body: string };
  faq: { q: string; a: string }[];   // 2–5
  related: string[];            // other guide slugs
};

export const guides: Guide[];
export function guideBySlug(slug: string): Guide | undefined;
```

## Routes

- `app/(site)/guides/page.tsx`: index. Lists every guide as a card (title,
  quick answer trimmed, minutes), grouped by category.
- `app/(site)/guides/[slug]/page.tsx`: the template. `generateStaticParams` from
  `guides`; `generateMetadata` from `guide.seo` with canonical URL;
  `notFound()` for an unknown slug.
- `/guides` is a static segment, so it takes precedence over the existing
  `app/(site)/[category]` dynamic route. A test asserts no category slug is
  `"guides"`.
- Before writing route code, read the relevant guides in
  `node_modules/next/dist/docs/` (AGENTS.md): params are async in this version.

## Diagrams — `components/guides/diagrams/`

- One React component per `DiagramId`, inline SVG, `viewBox="0 0 200 200"`,
  colors only from the brand tokens (`globals.css` forbids color literals in
  components). Shared parts (window, headrail, pleated fabric, bottom rail,
  wall, labels) live in `parts.tsx` so guides reuse them.
- A `Diagram` component maps `DiagramId` → component. An unknown id is a type
  error, not a runtime fallback.
- Animations are CSS keyframes in a `guides` block of `globals.css`
  (or a co-located CSS module), looping, 2.5–3.5 s.
- Each SVG has `role="img"` and an `aria-label` describing the action
  ("Bottom rail pulled out from the window at a 45 degree angle").
- **Reduced motion:** `globals.css` already collapses every animation to 0.01 ms,
  one iteration. Without `fill-mode`, the element falls back to its un-animated
  styles, so each diagram's **base (non-animated) styles must be the
  instructive end state** (shade lowered, rail at 45°, shade raised). The end
  pose is written as SVG attributes on the moving shapes (e.g.
  `transform="rotate(-45 62 24)"`); the CSS keyframes animate *from* the start
  pose *to* that end pose. A test renders each diagram and asserts the moving
  shape's end-pose attribute is present.
- No animation library, no video, no images. Zero added JS for diagrams
  (server components).

The pleat pattern needs an SVG `id`. Two diagrams on a page must not collide:
use React `useId()` for pattern ids.

## SEO

- JSON-LD via `components/seo/JsonLd.tsx`: `Article` (headline, dateModified =
  `updated`, author/publisher = the business from `content/business.ts`) and
  `BreadcrumbList`. No `HowTo` or `FAQPage` markup: Google stopped showing both
  for ordinary sites in 2023.
- `app/sitemap.ts`: add `/guides` and every guide, `lastModified` = `updated`.
- Footer: add a "Guides" link to `/guides`.
- Internal links: each guide's `related`; product pages are not changed in
  this release.

## Analytics

- New event `guide_cta_click` in `lib/analytics/events.ts`
  (`trackGuideCta(slug, kind: "book" | "call")`), sent from the booking and call buttons.
  The call button keeps the existing `phone_click` behaviour too.
- Leads from people who read a guide already carry the landing page through
  `AttributionCapture`; nothing new there.

## First three guides

Drafts written by Claude, **checked by the owner before going live** (a wrong
repair step costs trust). Step outlines:

1. **cordless-cellular-shade-wont-stay-up** (shades): lower fully; pull the
   bottom rail toward you at 45° (side view); three short tugs (side view);
   raise and release halfway. CTA "Still dropping?".
2. **replace-a-broken-blind-slat** (blinds): lower and close the blind; pop the
   bottom-rail plugs; untie the lift cord and pull it up past the broken slat;
   slide the broken slat out of the ladder and a spare (or bottom slat) in;
   rethread, re-knot, replace plugs. Diagrams: rail plugs, cord pulled up,
   slat slide out/in, re-knot. CTA "More than a couple cracked?".
3. **motorized-shade-not-responding** (motorization): check the power (charge
   or batteries); check the remote battery and channel; re-pair the remote;
   reset limits only if the owner's brand allows it at home. Diagrams: charge
   port, remote channel, pairing. CTA "Still not moving?".
   **Owner input needed:** which motor brand(s) PSS installs, because pairing
   steps differ by brand. Until then this guide stays out of the release.

## Testing

- Unit (`vitest`):
  - every guide has 3–8 steps, 2–5 FAQs, a valid `updated` date, a known
    category, and `related` slugs that exist and aren't itself;
  - slugs are unique and none equals a category slug or "guides";
  - every `DiagramId` used has a component (type-level plus a runtime map check);
  - the sitemap contains `/guides` and each guide URL;
  - no component under `components/guides` contains a color literal or a phone
    number literal.
- Render: each guide page renders its H1, quick answer, one SVG per step, the
  booking link to `/contact`, and the JSON-LD script.
- Mutation check (per memory "test power"): delete a step's diagram mapping and
  a guide's sitemap entry and confirm the tests go red.
- Manual: look at each guide on an iPhone-width viewport and with reduced
  motion turned on.

## Out of scope

- Search, comments, author pages, a CMS.
- Video or photography.
- Guides beyond the first three. Next topics come from Keyword Planner data.
- Changing product pages to link into guides.
