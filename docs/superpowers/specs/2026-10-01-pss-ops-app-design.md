# PSS Ops — the admin as an iPhone app — design

Date: 2026-10-01 · Branch: `feat/pss-ops-app` · Migration: `034_sign_in_code.sql`

## Goal

The team (owners, Shade, the business phone; all iPhones) installs the admin as a home-screen
app called **PSS Ops** that opens full-screen to the Jobs board. Not the marketing site. No app
store. Push notifications are a later project; email already notifies the team.

## 1. Install

- Admin pages link a web app manifest at **`/ops.webmanifest`** (outside `/admin`, so the sign-in
  redirect in `proxy.ts` never intercepts it). The public site links no manifest.
- Manifest: `id` and `start_url` `/admin`, `scope` `/admin`, `display` `standalone`, `name` and
  `short_name` **"PSS Ops"**, `theme_color` `#1E1E1E` (sidebar), `background_color` `#1E1E1E`,
  icons 192, 512 and a maskable 512.
- iOS tags on admin pages (admin layout metadata): `appleWebApp` capable, title "PSS Ops",
  status bar `black-translucent`; apple-touch-icon 180. Viewport `viewport-fit=cover`,
  theme color `#1E1E1E`.
- Icons: the existing favicon mark (`app/icon.svg`, four panels on charcoal) rendered to PNG by
  `scripts/ops-icons.mjs` (sharp) into `public/ops/` and committed.
- Settings gets an **"Install on your phone"** card: Safari → Share → Add to Home Screen → open
  PSS Ops → sign in with the code from the email.

## 2. Sign in with a code

- The sign-in email carries the existing link **and a 6-digit code**. Subject:
  `Your PSS sign-in code: 123456` (so it shows in the notification and iOS can offer it to fill).
- After "Email me a sign-in link", the sign-in screen shows a **code box** (`autocomplete=one-time-code`,
  numeric) for the same email. A correct code signs this browser/app in and opens the Jobs board.
- Rules: same row as the link (`admin_login_tokens`), so the code expires with it (15 min) and
  using either the link or the code uses both. Only the **latest unused, unexpired** sign-in for that
  email accepts a code. **5 wrong codes** lock that sign-in (`code_attempts`); the person requests
  a new one. Every failure says the same thing: "That code didn't work. Check it, or request a new
  one." The allowlist is re-checked on success, as for the link.
- Storage: `code_hash = sha256(email + ":" + code)` — never the code. Migration 034 adds
  `code_hash text` and `code_attempts smallint not null default 0` with a 0–5 check. The existing
  rate limit (5 emails per address per hour) stays, so at most 25 guesses per hour per address.
- Verification is one SQL statement (pick latest, then use-or-count).

## 3. Staying signed in

- A session now lasts **30 days since last use**: each request that finds a valid session with
  under 29 days left pushes `expires_at` to now + 30 days (one statement; at most one write a day).
- The cookie's own lifetime becomes 400 days, so the database decides expiry, not the phone.
- Removing someone in Settings still deletes their sessions at once (unchanged).

## 4. App feel

- Safe areas: the phone header and the page pad for `env(safe-area-inset-*)`, so nothing sits under
  the notch, status bar or home bar. Desktop is unaffected (insets are 0).
- **Refresh** button in the phone header (standalone iPhone apps have no pull-to-refresh):
  `router.refresh()`. It must not open or close the Menu.
- Files already open with `target="_blank"`, which iOS shows in a sheet with **Done**. Keep it:
  a test pins that every `/admin/files/` link opens that way.
- **Offline:** a tiny service worker (`/ops-sw.js`, registered on admin pages with scope `/admin`, so it also covers the start page `/admin`)
  caches only `/ops-offline.html` and, for page navigations under `/admin` that fail for lack of
  network, shows it ("You're offline. PSS Ops needs a connection." + Try again). It never caches
  admin pages or data.

## 5. Out of scope

Push notifications, offline data, an App Store build, Android specifics.

## 6. Testing

- Unit: code generation format; email text/subject; `consumeSignInCode` SQL text; code form UI
  (shows after sending, error message, posts email+code); session sliding SQL and cookie maxAge;
  manifest JSON; admin layout metadata (manifest, apple tags) and that the root/site layout has none;
  every `/admin/files/` anchor has `target="_blank"`; refresh button calls `router.refresh` and not
  toggles the menu; migration 034 shape.
- Real database (Neon test branch, `scripts/verify-sign-in-code.ts`): right code signs in once;
  reused code fails; wrong code ×5 locks even the right code; an older sign-in's code fails once a
  newer one exists; expired fails; link use kills the code; sliding extends only when < 29 days left.
- E2E (Pixel/iPhone-size project): request a code, set the newest token's code hash to a known
  code via SQL, enter it, land on Jobs; `/ops.webmanifest` serves the fields above; an admin page
  links it; the homepage does not.
- Owner check on a real iPhone: Add to Home Screen, sign in with a code, label reads "PSS Ops".

## 7. Ship

034 applied to production before the push (the new code reads `code_hash`). Prove on a branch twice
first. Commits authored whirleyjoshua@gmail.com.
