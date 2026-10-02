# Holiday promo banner — design

Approved by the owner 2026-10-02.

## Goal

Get visitors thinking about the holidays before they normally would, and book a free consult early enough
that custom orders (4–6 weeks) arrive before family visits. Mood first, no hard deadline yet.

## Copy (owner picked option 3)

- Desktop: "The holidays are coming. Give your home a fresh look before the family arrives." + "Free in-home consult →"
- Phone: "Holiday-ready before the family arrives." + "Free consult →"

## Behaviour

- A thin champagne strip with charcoal text, above the sticky header, on every public page. It scrolls away; the
  header stays sticky as before.
- The whole message links to `/contact`.
- Not shown on `/project/*` (existing customers) or `/thank-you/*` (just asked for a consult). The admin area and
  PSS Ops have their own chrome, so they never see it.
- An × button closes it. The close is remembered in `localStorage` under a key built from the promo's `id`, so a
  new promo (new `id`) shows again to people who closed this one.
- Live from 2026-10-01 00:00 to the end of Dec 24 (2026-12-25 00:00 Las Vegas time, PST, -08:00).
- A click on the message sends the GA4 event `promo_click` with `{ promo: id, page: pathname }`.

## No flicker, no layout shift

Public pages are prerendered, so the server cannot know about a visitor's close, and a build can outlive the end
date. An inline script, rendered just before the banner, runs before first paint: if the visitor closed this
promo, or the time is outside the window, it appends `<style>[data-promo="<id>"]{display:none}</style>` to
`<head>`. It injects a style, never an attribute on React-owned elements, so hydration stays clean (React 19 skips
foreign nodes in `<head>`). A blocked `localStorage` falls back to showing the banner.

The server also renders nothing when a build happens outside the window.

## Units

- `content/promo.ts` — the promo as data: id, both messages, CTA labels, href, startsAt, endsAt.
- `lib/promo.ts` — pure: `isPromoLive(promo, now)`, `promoStorageKey(promo)`, `promoHideScript(promo)`.
- `components/layout/PromoBanner.tsx` — server: returns null outside the window, else the script + the client banner.
- `components/layout/PromoBannerClient.tsx` — client: hides on excluded paths, close button, click tracking.
- `lib/analytics/events.ts` — adds `EVENTS.promo` and `trackPromoClick`.
- `components/layout/SiteChrome.tsx` — renders `<PromoBanner />` after the skip link, before `<Header />`.

## Testing

- Unit: window boundaries (start inclusive, end exclusive); hide script run in jsdom hides when closed, when
  expired, when not yet started, and shows otherwise or when storage throws; a different id is not hidden.
- Component: links to `/contact`, close button stores the key and removes the banner, tracking fires, nothing on
  `/project` or `/thank-you`, server banner renders nothing after the end date.
- Each guard is deleted once to watch its test go red.
- Browser check against `next start`: phone and desktop width, no shift on load, close survives reload.

No migration. Deploy by push to main.

## Revisions (owner, 2026-10-02)

- Look: option B, classic Christmas red (`holiday-red`) with green and gold trim, a faint snowfall, and snowflakes
  beside the message on wider screens. Tokens and contrast notes live in `app/globals.css`; the strip's focus ring
  is `holiday-snow` (8.53:1) because champagne-ink is 1.49:1 on the red.
- Phone message shortened to "Holiday-ready? Free consult →" so the band stays one line with the new button.
- **Lead times ▾** sits left of the ×. Its panel lists blinds and shades 3–5 weeks, shutters 6–10 weeks (the
  starter terms' §8 numbers, in `content/lead-times.ts`), each with "installed around" dates counted from today in
  Las Vegas: the client orders at the consult. Dates are computed only when the panel opens, so prerendered HTML
  never carries stale dates. Windows ending after Dec 24 say "may be after Christmas". Escape, an outside tap or
  the button closes it; opening it sends GA4 `lead_times_open`.
- The customer project page's production estimate is now built from the same numbers, replacing "4–6 weeks".
