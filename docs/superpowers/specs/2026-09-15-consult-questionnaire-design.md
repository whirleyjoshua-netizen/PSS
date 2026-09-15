# Consultation Questionnaire — Design

**Date:** 2026-09-15
**Status:** Approved in conversation, pending spec review
**Scope:** After a visitor submits the website consultation form, the thank-you page also offers a short, optional questionnaire: exact window count, the treatment types they're interested in (plus motorization), street address, gate code, and a tactful "what finish are you picturing?" question that maps to the owners' budget tiers. Answers attach to the new lead. The owners see them on the job and can fill in anything missing from the call screen or Job details. Builds on the lead call flow (`2026-09-14-lead-call-flow-design.md`, budget tiers) and the job page redesign (Project details card), both live.

## 1. Purpose

Owners waste time when they arrive without knowing the scope, and when customers pick fabrics far outside what they want to spend, which forces several quotes. A two-minute questionnaire, asked while the customer is already engaged, lets the owners bring the right samples (for example Hunter Douglas and premium Alta for a "Luxury" customer) and know the window count and gate code before they go.

Success means:
- A customer who just submitted the form can answer the questionnaire in under two minutes, and it's clearly optional.
- Their answers appear on the lead in the tracker without the owners doing anything.
- Nobody but that customer's browser can add answers to that lead.
- Anything skipped can be filled in by the owners during the call.

## 2. Decisions made in conversation

- **The first consultation form stays as it is** (name, phone, email, address, city, interest, window range, how heard, notes). The questionnaire adds detail on top; owners fill gaps on the phone.
- **Budget is asked as a finish, never money or brands:** "What kind of finish are you picturing?" — **Essential**, **Designer**, **Luxury**, or **Not sure yet**. Behind the scenes these are the existing budget tiers: Essential = Value (Superior Blinds MFG), Designer = Mid-range (Alta), Luxury = Premium (Hunter Douglas and premium Alta fabrics).
- **Treatment types:** Horizontal blinds, Vertical blinds, Shutters, Cellular shades, Roller shades, Roman shades, Sheer horizontal shadings, and "Not sure — show me all the samples", plus a separate optional **Motorized** add-on.
- **Exact window count:** a dropdown 1–30 plus "30+".
- **A later "map" button** (quick tap to navigate to the client) is out of scope here; this questionnaire already collects the full street address and gate code it will use.

## 3. Approach

The consultation API issues a one-time questionnaire key when the lead is saved and stores only its hash on the lead. The key goes to the browser in an httpOnly cookie scoped to `/thank-you`, never in the URL, so it can't leak to analytics or other sites. The thank-you page reads the cookie server-side: a valid, unexpired key shows the questionnaire; otherwise the page is the usual thank-you.

Rejected:
- **A key in the thank-you URL.** Google Analytics and any outbound link would see it.
- **Asking the customer to re-enter their email or phone.** An extra step, and anyone could add answers to someone else's lead.
- **Emailing the questionnaire.** Most people never open it.

## 4. The key

- On a successful lead insert, `app/api/consultation/route.ts` creates a key (32 random bytes, base64url), stores `sha256(key)` in `leads.questionnaire_token_hash` and `now() + 24 hours` in `leads.questionnaire_expires_at` as part of the same insert, and sets a cookie on the response: name `pss_q`, value the key, `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/thank-you"`, `maxAge` 24 hours.
- If the lead insert failed (the route's existing "email still went out" path), no key and no cookie — the thank-you page shows no questionnaire.
- The key works for 24 hours and can be used repeatedly in that window (the customer can change their answers). After that it's ignored.
- A lookup is one query: the lead whose `questionnaire_token_hash` matches and whose `questionnaire_expires_at` is in the future.
- The key only ever lets its holder read the questionnaire's own current answers and update those questionnaire fields on that one lead. It shows nothing else about the lead (not name, phone, email or notes).

## 5. The questionnaire (customer side)

On `/thank-you`, below the existing "what happens next" steps, a card titled **"Help us come prepared"** with "Optional · about 2 minutes":

- **How many windows?** Select: "—", 1 … 30, "30+". If the first form had a range, a hint shows "You said 6-10 earlier."
- **What are you interested in?** Checkboxes: Horizontal blinds, Vertical blinds, Shutters, Cellular shades, Roller shades, Roman shades, Sheer horizontal shadings, Not sure — show me all the samples. A separate checkbox: **Motorized** (control with a remote or app).
- **Street address** — prefilled with what they gave, if anything.
- **Gate or community code** (optional).
- **What kind of finish are you picturing?** Radios with one-line descriptions:
  - Essential — clean, durable, great value
  - Designer — more fabrics and colors, upgraded features
  - Luxury — top-tier fabrics and premium brands
  - Not sure yet
- **Save** → "Thanks — we'll come prepared." The form stays editable for the 24 hours; reopening the page shows their saved answers.
- Nothing is required. An empty submit saves nothing and just says thanks.
- Validation errors (e.g. a gate code over 40 characters) show next to the form and keep what was typed.

The page keeps `robots: noindex`.

## 6. Data

Migration `db/migrations/010_questionnaire.sql` (idempotent, `migrate.mjs` rules):
- `leads.window_count_exact smallint` with a check `1 <= window_count_exact <= 31` (31 means "30+").
- `leads.treatment_types text[] not null default '{}'` with a check that every element is one of the eight keys below.
- `leads.motorized boolean not null default false`.
- `leads.gate_code text` with a check `char_length(gate_code) <= 40`.
- `leads.questionnaire_token_hash text` (unique index where not null) and `leads.questionnaire_expires_at timestamptz`.

Treatment type keys (one module, `lib/leads/treatment-types.ts`, with labels): `horizontal_blinds`, `vertical_blinds`, `shutters`, `cellular_shades`, `roller_shades`, `roman_shades`, `sheer_shadings`, `not_sure`.

Finish → budget tier (`lib/leads/finish.ts`): `essential` → `value`, `designer` → `mid`, `luxury` → `premium`, `not_sure` → no change (leaves `budget_tier` as it is).

The existing `treatments` (website category interest) and `window_count` (range) columns are untouched and keep being shown.

`Job` gains optional `windowCountExact?`, `treatmentTypes?`, `motorized?`, `gateCode?`; `JOB_COLUMNS`/`toJob` include them. The token columns are never selected into `Job`.

## 7. Saving answers

A server action (`app/(site)/thank-you/actions.ts`) reads the `pss_q` cookie (never a form field), finds the lead by the key's hash, validates the answers with zod, and in one statement updates `window_count_exact`, `treatment_types`, `motorized`, `gate_code`, `address` (only when provided) and `budget_tier` (only for essential/designer/luxury), and writes one `kind = 'note'` event:

`Customer added details: 12 windows · Cellular shades, Shutters · Motorized · Luxury`

(parts left out when empty; the gate code is never written into the event). The stage doesn't change. An expired or missing key returns "This form has expired — call us and we'll take it from here" and saves nothing.

## 8. Owner side

- **Project details card** (job page Overview, from the redesign): shows Exact windows ("12", or "30+"), Treatment types, Motorized (Yes/No), Gate code, and the tier as "Luxury → Premium" when set by a customer or just the tier label otherwise. The website-form interest and window range stay visible for comparison.
- **Call screen:** the Interest checkboxes become the eight treatment types plus Motorized; the Windows radios become the exact count select (with "Not sure"); a Gate code field is added. Saving the call writes `treatment_types`, `motorized`, `window_count_exact` and `gate_code` instead of `treatments`/`window_count`. The call summary line uses the new labels ("Call: talked, no visit yet · Cellular shades, Shutters · 12 windows · Mid-range").
- **Job details form:** gains Exact windows, Treatment types, Motorized and Gate code, so the owners can correct anything at any time. (Coordinate with the parallel `leftovers` branch, which also edits DetailsForm, saveDetails, updateDetails and detailsSchema.)
- The gate code is never included in any email and never shown on customer pages (`lib/portal/access.ts` `toProject()` stays unchanged).

## 9. Error handling

- Lead insert failed: no cookie, no questionnaire; the page is the normal thank-you.
- Cookie missing, wrong or expired: normal thank-you (on load); on save, the expired message above.
- Validation errors: inline message, typed values kept.
- A second form submission from the same browser replaces the cookie with the new lead's key (the newest lead is the one being described).

## 10. Testing

Unit (Vitest, mocked db):
- Key: issued only on a successful insert; only the hash stored; cookie attributes (httpOnly, path `/thank-you`, 24 h, sameSite lax, secure in production); no cookie when the insert fails.
- Lookup: valid key finds the lead; wrong key, expired key and missing cookie find nothing.
- Schema: each field's limits (1–31 windows, the eight keys, gate code ≤ 40, finish values), empty submit, unknown values rejected.
- Finish mapping and the event line (no gate code in it).
- Action: reads only the cookie, saves only questionnaire fields, never changes the stage, expired message.
- Thank-you page renders the questionnaire only with a valid cookie, prefilled with saved answers.
- Owner side: Project details shows every field; the call screen saves the new fields and its summary uses the new labels; Job details saves them.
- Migration 010 parses under `migrate.mjs` rules.

End-to-end (Neon test branch, production build, desktop): submit the consultation form → the thank-you page shows the questionnaire → answer everything → "Thanks — we'll come prepared" → sign in as an owner → the job's Project details shows the answers and the event line. A second browser without the cookie sees no questionnaire.

## 11. Out of scope

The map/navigation button; photos or uploads from customers; changing the first form; texting the questionnaire; showing prices; customer accounts; asking the questionnaire again after 24 hours (owners fill gaps on the phone).
