# PSS Ops App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the admin installable on iPhones as **PSS Ops**: a home-screen icon that opens full-screen to the Jobs board, sign-in with an emailed 6-digit code, sessions that last 30 days from last use, safe-area layout, a refresh button, an offline screen, and an install guide in Settings.

**Spec:** `docs/superpowers/specs/2026-10-01-pss-ops-app-design.md` (the authority).

## Global Constraints

- Work only in `/Users/jenniferjordan/pss/.claude/worktrees/pss-ops-app` (branch `feat/pss-ops-app`). Confirm `git rev-parse --show-toplevel` before editing.
- The app name is exactly **"PSS Ops"**. Theme and background color: `#1E1E1E`. The manifest lives at `/ops.webmanifest`, with `id` and `start_url` `/admin` and `scope` `/admin`. Only admin pages link the manifest.
- Codes are 6 digits with leading zeros allowed, sent in the same email as the link, on the same `admin_login_tokens` row. 15-minute expiry. **5** wrong tries lock that sign-in. Only the latest unused, unexpired row with a `code_hash` accepts a code. Every failure shows exactly: `That code didn't work. Check it, or request a new one.`
- Store `code_hash = hashToken(`${email}:${code}`)` (from `lib/admin/tokens.ts`). Never store the raw code.
- Sessions: 30 days since last use. Extend when under 29 days are left. Cookie `maxAge` is 400 days.
- Migration **034**. Statements must be safe to re-run. Comments are whole-line only, with no semicolons.
- AGENTS.md: this Next.js version differs from training data. Read the relevant guide in `node_modules/next/dist/docs/` (manifest: `01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`; PWAs: `01-app/02-guides/progressive-web-apps.md`; metadata/viewport API reference) before writing that code.
- Unit tests: `npx vitest run --maxWorkers=2 <files>`. Lint by path. Run `npx tsc --noEmit`, and `npx next typegen` first if needed.
- Commits are authored by whirleyjoshua@gmail.com and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never print a database URL.

---

### Task 1: Sign in with a 6-digit code

**Files:** Create `db/migrations/034_sign_in_code.sql` and `tests/db/migration-034.test.ts`. Modify `lib/admin/login.ts`, `app/admin/sign-in/actions.ts`, `app/admin/sign-in/SignInForm.tsx`. Tests: `tests/admin/login.test.ts`, `tests/admin/sign-in.test.tsx`.

**Interfaces produced:**
- `newSignInCode(): string`, which returns 6 digits.
- `codeHash(email: string, code: string): string`.
- `consumeSignInCode(rawEmail: string, rawCode: string): Promise<string | null>`.
- `verifySignInCodeAction(prev: CodeState, formData: FormData): Promise<CodeState>`, which redirects to `/admin` on success.

- [ ] **Step 1: Migration test, then migration.**
  ```sql
  -- Sign-in by a 6-digit code as well as the link (docs/superpowers/specs/2026-10-01-pss-ops-app-design.md).
  -- The code shares the link's row, so using either one uses both. Safe to re-run.
  -- Whole-line comments only, and no semicolons in comments.

  alter table admin_login_tokens add column if not exists code_hash text;
  alter table admin_login_tokens add column if not exists code_attempts smallint not null default 0;

  alter table admin_login_tokens drop constraint if exists admin_login_tokens_code_attempts_check;
  alter table admin_login_tokens add constraint admin_login_tokens_code_attempts_check check (code_attempts between 0 and 5);
  ```
  The test, following the precedent `tests/db/migration-031.test.ts` or `-030`, checks three things: only re-runnable statements, both columns present, and the 0–5 check.
- [ ] **Step 2: Failing login tests** in `tests/admin/login.test.ts`, following its existing mocks.
  - `newSignInCode()` always matches `/^\d{6}$/` (loop 200 times).
  - `requestSignIn` inserts `code_hash` with `codeHash(email, code)`. The email subject matches `/^Your PSS sign-in code: \d{6}$/`, and the text contains both the code and the link.
  - `consumeSignInCode`:
    - one SQL statement whose text contains `order by created_at desc limit 1`, `code_attempts < 5`, `used_at is null`, `expires_at > now()` and `code_attempts = code_attempts + 1`;
    - parameters include the normalized email and `codeHash(email, code)`;
    - returns the email only when the row returns and `isAllowed` is true;
    - a code that isn't 6 digits after trimming returns null **without querying**.
- [ ] **Step 3: Implement in `lib/admin/login.ts`.**
  ```ts
  import { randomInt } from "node:crypto";
  …
  const CODE_TRIES = 5;

  /** Six digits, leading zeros allowed. */
  export const newSignInCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

  /** The code is only ever stored hashed, bound to its address. */
  export const codeHash = (email: string, code: string): string => hashToken(`${email}:${code}`);
  ```
  In `requestSignIn`:
  - generate `const code = newSignInCode()`;
  - insert `code_hash` alongside `token_hash`;
  - set the subject to `` `Your PSS sign-in code: ${code}` ``;
  - set the text to:
    ```ts
    [
      `Your sign-in code is ${code}`,
      "",
      "Type it into PSS Ops, or open this link to sign in on this device:",
      "",
      link,
      "",
      `The code and the link work once and expire in ${LINK_MINUTES} minutes.`,
      "If you did not ask for this, ignore this email.",
    ]
    ```

  Then add:
  ```ts
  /**
   * Signs in with the emailed code. One statement: picks the newest usable sign-in for the address,
   * uses it if the code matches, otherwise counts a wrong try. After CODE_TRIES wrong tries that
   * sign-in no longer accepts a code. `for update` serializes two guesses at the same row.
   */
  export async function consumeSignInCode(rawEmail: string, rawCode: string): Promise<string | null> {
    const email = rawEmail.trim().toLowerCase();
    const code = rawCode.replace(/\s+/g, "");
    if (!email || !/^\d{6}$/.test(code)) return null;
    const hash = codeHash(email, code);
    const rows = await db()`
      with target as (
        select token_hash from admin_login_tokens
        where email = ${email} and used_at is null and expires_at > now()
          and code_hash is not null and code_attempts < ${CODE_TRIES}
        order by created_at desc limit 1
        for update
      ), used as (
        update admin_login_tokens set used_at = now()
        where token_hash = (select token_hash from target) and code_hash = ${hash}
        returning email
      ), missed as (
        update admin_login_tokens set code_attempts = code_attempts + 1
        where token_hash = (select token_hash from target) and code_hash <> ${hash}
      )
      select email from used`;
    const found = rows[0]?.email as string | undefined;
    return found && (await isAllowed(found)) ? found : null;
  }
  ```
  `CODE_TRIES` is used in SQL as a parameter. If the tests pin `code_attempts < 5` literally, cast the parameter as `${CODE_TRIES}::int` and pin `code_attempts < ?::int` instead. Pick one form and keep the test and the code consistent.
- [ ] **Step 4: Action and form.**
  - In `app/admin/sign-in/actions.ts`:
    - `requestSignInAction` now returns `{ status: "sent", email: parsed.data.trim().toLowerCase() }`. Extend `SignInState` with `email?: string`.
    - Add the following. Read `app/admin/auth/actions.ts` for the precedent: `redirect` throws, so it can't sit inside a try/catch.
      ```ts
      export type CodeState = { error?: string };
      const CODE_FAILED = "That code didn't work. Check it, or request a new one.";

      export async function verifySignInCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
        const email = String(formData.get("email") ?? "");
        const code = String(formData.get("code") ?? "");
        const signedIn = await consumeSignInCode(email, code);
        if (!signedIn) return { error: CODE_FAILED };
        await createSession(signedIn);
        redirect("/admin");
      }
      ```
  - `SignInForm.tsx`: when `state.status === "sent"`, keep the existing status paragraph, but say "a sign-in code and link". Below it, render a `CodeForm`, a small client component in the same file or in `CodeForm.tsx` that uses `useActionState(verifySignInCodeAction, {})`. It has:
    - a hidden `email` input;
    - a label "6-digit code";
    - an input `name="code"`, `inputMode="numeric"`, `autoComplete="one-time-code"`, `pattern="\d{6}"`, `maxLength={6}`, `required`;
    - a solid button "Sign in";
    - the error as `role="alert"`;
    - a text button "Use a different email" that resets to the email form. Use the form `key` remount pattern; simplest is a `useState` flag in `SignInForm` that shows the email form again.
- [ ] **Step 5: UI tests** (`tests/admin/sign-in.test.tsx`, following its mocks):
  - after sending, the code input appears with `autocomplete="one-time-code"`, and the hidden email is the normalized address;
  - a failing verify shows the exact error;
  - "Use a different email" shows the email field again.
- [ ] **Step 6:** Run the tests, then `tests/admin tests/db`, then tsc and eslint. **Test power:** remove `and code_attempts < ${CODE_TRIES}` and the login test must fail. Restore it.
- [ ] **Step 7:** Commit with the message `feat: sign in with a 6-digit code from the email, locked after 5 wrong tries (migration 034)`.

---

### Task 2: Sessions last 30 days since last use

**Files:** Modify `lib/admin/session.ts`. Test: `tests/admin/session.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `createSession` sets the cookie with `maxAge` = 400 days in seconds (34_560_000).
  - `getAdmin` runs ONE statement containing all of:
    - `with s as (select email from admin_sessions where token_hash = ? and expires_at > now())`;
    - `update admin_sessions set expires_at = now() + interval '30 days'`;
    - `expires_at < now() + interval '29 days'`.
  - `getAdmin` still returns null when no row comes back, and when `isAllowed` is false.
  - The SQL lives in an exported `touchSession(tokenHash: string): Promise<string | null>` (returns the session's email or null), which `getAdmin` calls — so Task 5 can prove it on a real branch without mocking cookies.
- [ ] **Step 2: Implement.**
  ```ts
  /** The cookie outlives any session; the database decides when a session ends. */
  const COOKIE_SECONDS = 60 * 60 * 24 * 400;
  ```
  Use `COOKIE_SECONDS` for `maxAge`. The insert still writes `now() + interval '30 days'`. In `getAdmin`:
  ```ts
  const rows = await db()`
    with s as (
      select email from admin_sessions where token_hash = ${hash} and expires_at > now()
    ), bumped as (
      update admin_sessions set expires_at = now() + interval '30 days'
      where token_hash = ${hash} and expires_at > now() and expires_at < now() + interval '29 days'
    )
    select email from s`;
  ```
  Here `hash = hashToken(token)`. Update the doc comments: it is 30 days since last use, with at most one write a day per session.
- [ ] **Step 3:** Run the session tests and `tests/admin`, then tsc. **Test power:** delete the `bumped` CTE and the session test must fail. Restore it.
- [ ] **Step 4:** Commit with the message `feat: admin sessions last 30 days since last use`.

---

### Task 2B: Face ID sign-in (passkeys)

**Spec:** §2b. **Files:** Modify `db/migrations/034_sign_in_code.sql` (append the two tables), `tests/db/migration-034.test.ts`, `lib/admin/admin-access.ts` (`removeAdmin` deletes passkeys), `tests/admin/admin-access.test.ts`, `app/admin/sign-in/SignInForm.tsx`, `app/admin/page.tsx` (the turn-on card), `app/admin/settings/page.tsx`. Create `lib/admin/passkeys.ts` (server: options, verify, store), `app/admin/passkey-actions.ts` (server actions), `app/admin/PasskeySignIn.tsx`, `app/admin/TurnOnFaceId.tsx`, `app/admin/settings/FaceIdSection.tsx`, tests for each. Add dependencies `@simplewebauthn/server@^14` and `@simplewebauthn/browser@^14` (`npm install`, commit package.json + lock).

- [ ] **Step 1: Read the library first.** Read `node_modules/@simplewebauthn/server/` and `.../browser/` type definitions (`*.d.ts`) and README for v14 — function names, option shapes, and return types (e.g. `generateRegistrationOptions`, `verifyRegistrationResponse`, `generateAuthenticationOptions`, `verifyAuthenticationResponse`, `startRegistration`, `startAuthentication`, `browserSupportsWebAuthn`). Do not rely on memory of older versions; record the exact signatures used in the report.
- [ ] **Step 2: Migration (test first).** Append to 034 (re-runnable):
  ```sql
  create table if not exists admin_passkeys (
    id            text primary key,
    email         text not null,
    public_key    bytea not null,
    counter       bigint not null default 0,
    transports    text[] not null default '{}',
    label         text not null,
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz,
    constraint admin_passkeys_email_normalized check (email = lower(btrim(email)))
  );
  create index if not exists admin_passkeys_email_idx on admin_passkeys (email);

  create table if not exists admin_webauthn_challenges (
    id          text primary key,
    challenge   text not null,
    purpose     text not null,
    email       text,
    expires_at  timestamptz not null,
    constraint admin_webauthn_challenges_purpose_check check (purpose in ('register', 'sign-in'))
  );
  ```
  Extend `tests/db/migration-034.test.ts` for both tables and constraints.
- [ ] **Step 3: Store + ceremonies in `lib/admin/passkeys.ts` (`server-only`), mocked-db unit tests first.** Exports:
  - `rpId()` = `new URL(adminOrigin()).hostname`; `expectedOrigin()` = `adminOrigin()`; RP name `"PSS Ops"`.
  - `startRegistration(email)` → options JSON; stores a `register` challenge row (5 min) for that email and returns `{ options, challengeId }`. `excludeCredentials` = that email's existing passkeys. Authenticator selection: `residentKey: "required"`, `userVerification: "required"`, `authenticatorAttachment: "platform"`. User id derived stably from the email (e.g. sha256 bytes) and user name = email, display name = `displayName(email)` from `lib/admin/task-rules.ts`.
  - `finishRegistration(email, challengeId, response, label)` → `boolean`: consumes the challenge in one statement (`delete … where id = ? and purpose = 'register' and email = ? and expires_at > now() returning challenge`), verifies, inserts the credential.
  - `startSignIn()` → `{ options, challengeId }` with empty allow list, `userVerification: "required"`; stores a `sign-in` challenge.
  - `finishSignIn(challengeId, response)` → `string | null` (email): consumes the challenge, loads the credential by id, verifies against stored public key + counter, then in one statement updates counter + `last_used_at`; returns the email only if `isAllowed(email)`.
  - `listPasskeys(email)`, `removePasskey(email, id)` (scoped to the email).
  - `deviceLabel(userAgent)`: "iPhone", "iPad", "Mac", "Android phone", "Windows PC", else "This device".
  - Delete expired challenges opportunistically in `startRegistration`/`startSignIn`.
- [ ] **Step 4: Actions (`app/admin/passkey-actions.ts`).** `beginFaceIdSetup()` (requireAdmin; sets httpOnly cookie `pss_webauthn` = challengeId, 5 min, sameSite lax, secure in production; returns options), `completeFaceIdSetup(response)` (requireAdmin; reads + clears cookie; label from `headers()` user agent; returns `{ ok } | { error }`), `beginFaceIdSignIn()` (no auth), `completeFaceIdSignIn(response)` (no auth; on success `createSession` then `redirect("/admin")`; on failure `{ error: "Face ID sign-in didn't work. Try again, or use the email code." }`), `removeFaceIdDevice(id)` (requireAdmin; scoped to own email). Unit tests with mocks: requireAdmin before input on the admin ones, cookie handling, exact error text.
- [ ] **Step 5: UI.** `PasskeySignIn` (client): renders only if `browserSupportsWebAuthn()`; a solid full-width button "Sign in with Face ID" → begin → `startAuthentication({ optionsJSON })` → complete; shows the error as `role="alert"`; user cancel shows nothing alarming (treat `NotAllowedError` as a quiet reset). `SignInForm` renders `PasskeySignIn` above the email form with a divider "or use your email". `TurnOnFaceId` (client) on the Jobs board top: shown only if WebAuthn is supported and `localStorage.pss_passkey` is not set (wrap storage access in try/catch); button "Turn on Face ID for this phone" → setup; on success set the marker and show "Face ID is on for this phone"; a "Not now" link hides it for this session. `FaceIdSection` in Settings: list (label · added date · last used) with Remove buttons, plus a `TurnOnFaceId`-style button. Component tests with the browser library mocked.
- [ ] **Step 6: `removeAdmin`** gains `passkeys as (delete from admin_passkeys where email in (select email from removed))` in its single statement; extend its test.
- [ ] **Step 7:** Tests (`tests/admin tests/db`), tsc, eslint, `npx next build`. Test power: drop `userVerification: "required"` from sign-in options and a test fails; drop the `isAllowed` check in `finishSignIn` and a test fails; restore.
- [ ] **Step 8:** Commit: `feat: Face ID sign-in for PSS Ops (passkeys), with the email code as backup`.

---

### Task 3: The installable shell

**Files:**
- Create `scripts/ops-icons.mjs`; generated `public/ops/icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`; `app/ops.webmanifest/route.ts`; `app/admin/RefreshButton.tsx`.
- Modify `app/admin/layout.tsx` (metadata, viewport, safe-area padding on `<main>`) and `app/admin/AdminNav.tsx` (phone header: safe-area top padding and RefreshButton).
- Tests: `tests/admin/ops-manifest.test.ts`, `tests/admin/admin-layout-meta.test.ts`, `tests/admin/refresh-button.test.tsx`, `tests/admin/file-links.test.ts`, plus updates to `tests/admin/admin-nav.test.tsx` if needed.

- [ ] **Step 1: Icons.** `scripts/ops-icons.mjs` reads `app/icon.svg` and uses `sharp` (already in node_modules) to write:
  - 180, 192 and 512 PNGs at full bleed;
  - a 512 maskable version with the mark scaled to 80% inside a `#1E1E1E` square, so circle masks don't clip it.

  Run `node scripts/ops-icons.mjs` and commit the PNGs. Check that each PNG has the expected size with `sharp(...).metadata()` and record the sizes in the report. View one with the Read tool and describe it in the report.
- [ ] **Step 2: Manifest route (test first).**
  ```ts
  // app/ops.webmanifest/route.ts
  /** The PSS Ops home-screen app. Outside /admin so proxy.ts's sign-in redirect never intercepts it. */
  export function GET() {
    return Response.json(
      {
        id: "/admin",
        name: "PSS Ops",
        short_name: "PSS Ops",
        start_url: "/admin",
        scope: "/admin",
        display: "standalone",
        background_color: "#1E1E1E",
        theme_color: "#1E1E1E",
        icons: [
          { src: "/ops/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/ops/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/ops/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      { headers: { "Content-Type": "application/manifest+json" } },
    );
  }
  ```
  If Next rejects a folder named `ops.webmanifest`, use `app/ops.webmanifest/route.ts` anyway, since route handlers can live in a dotted segment. If the build disagrees, report it. Don't move the manifest under `/admin`. The test calls `GET()` and checks every field plus the content type.
- [ ] **Step 3: Admin layout metadata (test first).** Add the following to `app/admin/layout.tsx`, checked against the metadata and viewport API docs in node_modules:
  ```ts
  export const metadata: Metadata = {
    title: "PSS Jobs",
    robots: { index: false, follow: false },
    manifest: "/ops.webmanifest",
    appleWebApp: { capable: true, title: "PSS Ops", statusBarStyle: "black-translucent" },
    icons: { apple: "/ops/icon-180.png" },
  };
  export const viewport: Viewport = { viewportFit: "cover", themeColor: "#1E1E1E" };
  ```
  The test imports the layout module and checks those exports. A second test asserts that `app/layout.tsx`'s `metadata` has no `manifest` and no `appleWebApp`, so the public site isn't installable as PSS Ops.
- [ ] **Step 4: Safe areas.**
  - Phone header: the `<details className="admin-sidebar … md:hidden">` gets `pt-[env(safe-area-inset-top)]`.
  - `<main>` in the signed-in layout gets `pb-[max(1.5rem,env(safe-area-inset-bottom))]`, replacing its bottom padding.
  - The signed-out `<main>` gets `pt-[max(1.5rem,env(safe-area-inset-top))]`.
  - Keep the existing horizontal padding. Check Tailwind 4 generates these arbitrary values by grepping the build CSS after `next build`, or trust Tailwind's arbitrary-value support and say so.
- [ ] **Step 5: Refresh button (test first).**
  ```tsx
  "use client";
  import { useRouter } from "next/navigation";
  import { useTransition } from "react";

  /** Home-screen iPhone apps have no pull-to-refresh; this re-fetches the page's server data. */
  export function RefreshButton() {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
      <button
        type="button"
        aria-label="Refresh"
        disabled={pending}
        onClick={(event) => {
          // Inside the Menu's <summary>: refreshing must not open or close the menu.
          event.preventDefault();
          event.stopPropagation();
          start(() => router.refresh());
        }}
        className="min-h-11 px-3 text-sm text-sidebar-muted"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
    );
  }
  ```
  Put it in the phone header's `<summary>`, between the logo and "Menu": `<span className="flex items-center gap-1"><RefreshButton /><span …>Menu</span></span>`.

  The test mocks `next/navigation`'s `useRouter` with a `refresh` spy and renders it inside `<details><summary>`. It asserts that clicking calls `refresh` once and the details stays closed (`open` is false).
- [ ] **Step 6: Files open in a sheet (pin it).** `tests/admin/file-links.test.ts` globs `app/admin/**/*.tsx` with `readdirSync` recursive and finds every `href={`/admin/files/` occurrence. Within the same JSX opening tag it requires `target="_blank"`. Parse loosely: take the substring from the `<a` that precedes the href to the next `>`. Today's 9 occurrences must all pass. Prove it has teeth by deleting one `target="_blank"` temporarily.
- [ ] **Step 7:** Run the new tests, `tests/admin`, tsc, eslint, and `npx next build`. Confirm the build lists `/ops.webmanifest`.
- [ ] **Step 8:** Commit with the message `feat: PSS Ops is installable from the admin — manifest, icons, iOS tags, safe areas, refresh`.

---

### Task 4: Offline screen and the install guide

**Files:**
- Create `public/ops-sw.js`, `public/ops-offline.html`, `app/admin/RegisterOpsWorker.tsx` and `app/admin/settings/InstallSection.tsx`.
- Modify `app/admin/layout.tsx` (render `<RegisterOpsWorker />` once, in both the signed-in and signed-out branches) and `app/admin/settings/page.tsx` (render `<InstallSection />` at the top).
- Tests: `tests/admin/ops-sw.test.ts`, `tests/admin/install-section.test.tsx`.

- [ ] **Step 1: Service worker (test first).** The test loads `public/ops-sw.js` into a fake `self` with `vm`. It stubs `caches`, `fetch` and `addEventListener` capture, and asserts:
  - (a) install caches exactly `["/ops-offline.html"]`;
  - (b) a navigate request to `/admin/x` whose `fetch` rejects responds with the cached offline page;
  - (c) a navigate request that succeeds passes the network response through;
  - (d) non-navigate requests and navigations outside `/admin/` are not handled (no `respondWith`).
  ```js
  // public/ops-sw.js
  // PSS Ops: shows a "you're offline" page when an admin page can't load. Caches nothing else.
  const CACHE = "pss-ops-offline-v1";
  const OFFLINE = "/ops-offline.html";

  self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE])).then(() => self.skipWaiting()));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.mode !== "navigate" || !new URL(request.url).pathname.startsWith("/admin")) return;
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
  });
  ```
- [ ] **Step 2: Offline page.** `public/ops-offline.html` is a self-contained page: inline CSS, `#1E1E1E` background, `#F7F5F0` text, `viewport-fit=cover`, and the title "PSS Ops". It shows "You're offline", "PSS Ops needs a connection. Check your signal and try again.", and a button that runs `location.reload()`. There are no external requests.
- [ ] **Step 3: Register.** `RegisterOpsWorker` is a client component. In a `useEffect`, if `"serviceWorker" in navigator`, it calls `navigator.serviceWorker.register("/ops-sw.js", { scope: "/admin" })` and swallows errors with `console.warn`. It renders null. Test it with a stubbed `navigator.serviceWorker`, asserting the URL and scope.
- [ ] **Step 4: Install guide (test first).** `InstallSection` is a server component: a section with the heading "Install on your phone", styled like the other Settings sections (read `TeamSection.tsx` for the card style). It contains:
  - an ordered list:
    1. "On the iPhone, open premiershadesolutions.com/admin in Safari."
    2. "Tap the Share button, then Add to Home Screen, then Add."
    3. "Open PSS Ops from the home screen."
    4. "Enter your email, then type the 6-digit code from the email."
  - the note: "You stay signed in while you use it at least once every 30 days."

  The test checks the heading and each step's text.
- [ ] **Step 5:** Run the tests, `tests/admin`, tsc, eslint and `npx next build`.
- [ ] **Step 6:** Commit with the message `feat: PSS Ops shows an offline screen; Settings explains how to install it`.

---

### Task 5: Prove the sign-in SQL on a real Neon branch

**Files:** Create `scripts/verify-sign-in-code.ts` and `scripts/verify-sign-in-code.config.mts`. Copy the safety block and the style of `scripts/verify-contacted.ts`. Set `ADMIN_EMAILS` to the script's own owner address so `isAllowed` passes.

The controller supplies a branch already migrated through 034.

- [ ] **Step 1: Checks.** Insert token rows directly, mirroring `requestSignIn`'s insert with a known code via `codeHash`:
  1. The right code returns the email, and the row's `used_at` is set.
  2. The same code again returns null.
  3. On a fresh row, 5 wrong codes leave `code_attempts` at 5, and then the RIGHT code returns null.
  4. With two rows, the older row's code returns null and the newer row's code works.
  5. A row with `expires_at` in the past fails.
  6. A row used through `consumeSignIn` (the link) makes its code fail.
  7. A raw update setting `code_attempts = 6` throws `admin_login_tokens_code_attempts_check`.
  8. Session sliding via `touchSession(hash)` from `lib/admin/session.ts`: a session expiring in 2 days comes back with its email and its `expires_at` now about 30 days out; a session already 30 days out is unchanged (compare `expires_at::text` before and after); an expired session returns null.
  9. Re-run `034_sign_in_code.sql`'s statements and confirm they succeed.
  10. Passkey store SQL (no real authenticator needed): insert an `admin_passkeys` row and challenge rows directly; challenge consumption deletes exactly once (second consume returns nothing), expired challenge is not consumed, `register` challenge cannot be consumed as `sign-in`; `removeAdmin` for an added admin deletes their passkeys; `removePasskey` cannot delete another email's passkey.

  Cleanup removes tokens and sessions for the script's own address.
- [ ] **Step 2:** Run it twice.
- [ ] **Step 3: Watch it fail.**
  - Remove `and code_attempts < ${CODE_TRIES}`: step 3 must fail.
  - Remove `order by created_at desc limit 1`: step 4 must fail. Without the limit, the subquery returns several rows; that is an error, which counts as a fail at step 4.
  - Remove `bumped`: step 8 must fail.

  Restore each one and confirm `git diff --stat lib/` is empty.
- [ ] **Step 4:** Commit with the message `test: verify code sign-in and sliding sessions against a real branch`.

---

### Task 6: End-to-end

**Files:** Modify `e2e/admin-mobile.spec.ts` (phone project).

- [ ] **Step 1: Add the tests.**
  - **"signs in with the emailed code":**
    1. Go to `/admin/sign-in`, fill the email `e2e-mobile@example.com`, and click "Email me a sign-in link".
    2. Poll the DB (up to 10 seconds) for the newest `admin_login_tokens` row for that email created after the click.
    3. `update` its `code_hash` to `sha256("e2e-mobile@example.com:123456")` hex, the same as `hashToken`. Check `lib/admin/tokens.ts` for the exact hash.
    4. Fill "6-digit code" with `123456`, click "Sign in", and expect the "Jobs" heading.
  - **"the app manifest and iOS tags are on admin pages only":**
    - request `/ops.webmanifest` and assert `name`, `start_url`, `display`;
    - load `/admin/sign-in` and assert `link[rel="manifest"]` has href `/ops.webmanifest` and `meta[name="apple-mobile-web-app-title"]` has content `PSS Ops`;
    - load `/` and assert there is no `link[rel="manifest"]`.
  - **"Face ID sign-in with a virtual authenticator"** (desktop Chromium project, if feasible): WebAuthn needs a domain RP ID, so run this test against `http://localhost:<port>` (not 127.0.0.1) with `ADMIN_BASE_URL` matching, using CDP `WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator` (`protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true`). Sign in by code, turn on Face ID, sign out, then "Sign in with Face ID" lands on Jobs. If the config makes a localhost run impractical, say so and rely on Task 5's SQL proof plus unit tests — do not fake it.
  - **"refresh keeps the menu closed":** signed in, click "Refresh", and assert the Menu's links are not visible.
- [ ] **Step 2:** Run it in the FOREGROUND on the phone project with the controller's branch. If port 3100 is busy, use `E2E_PORT=3110`. Reconcile the totals.
- [ ] **Step 3:** Falsify one assertion, confirm where it fails, then restore it.
- [ ] **Step 4:** Commit with the message `test: e2e for PSS Ops sign-in by code and the app manifest`.

---

### Task 7: Ship (controller; the owner approves production)

- Full suite, tsc and build, then a final whole-branch review and one fix wave.
- Production migration 034 before the push, following the `pss-production-migrations` memory and `stale-worktrees-must-not-migrate-prod`.
- Fast-forward main, run the tests, push, and curl `/ops.webmanifest`.
- Clean up, and record a memory. Give the owner the iPhone install steps.
