# Admin access from Settings — design

## Goal

The owners can give a new team member admin sign-in, or take it away, from the Settings page — no Vercel setting, no redeploy, no developer. First use: add alia.whirley9@gmail.com.

## What stays the same

- `ADMIN_EMAILS` (Vercel) keeps its three addresses and becomes the list of **owners**. Owners cannot be removed from the page, so no click on the site can lock the owners out.
- Sign-in stays a one-time emailed link. A non-allowed address still gets the same "check your email" screen and no email, so the form never reveals who has access.
- `getAdmin` still re-checks access on every request, so a removed person is out on their next page load.
- Everyone with access has full admin, including this section. No roles.
- The Team list (names for job assignment) stays separate. Adding a Team member never grants sign-in, and adding an admin never adds a Team member.

## Data — migration 025_admin_access.sql

024 is claimed by the dc-quote-import branch.

```sql
create table if not exists admin_access (
  email      text primary key,
  added_by   text not null,
  created_at timestamptz not null default now(),
  constraint admin_access_email_normalized check (email = lower(btrim(email)) and email like '%_@_%')
);
```

Safe to re-run. No seed rows: owners live only in `ADMIN_EMAILS`.

## Access check — lib/admin/allowlist.ts

- `isOwner(email, raw = process.env.ADMIN_EMAILS)`: the current synchronous env check, renamed. `parseAllowlist` unchanged.
- `isAllowed(email): Promise<boolean>`: normalizes, returns true for an owner without touching the database, otherwise `select 1 from admin_access where email = $1`.
- The three callers await it: `requestSignIn` (before creating a token), `consumeSignIn` (before returning the email), `getAdmin` (every request).
- A database error in the check propagates as today's session query would; it never falls back to "allowed".

## Settings section — "Admin access"

Placed directly after Team on `/admin/settings`.

- **Owners**: each owner address, labeled "Owner", no Remove button.
- **Added**: each `admin_access` row, oldest first, with "added by {email} on {date}" and a Remove button. The signed-in admin's own row has no Remove button ("That's you").
- **Add form**: one email field and an "Give access" button. Uses the existing `site.email` validation, then trims and lowercases.

Outcomes of Add (each shown in the form, the field keeps its value on error):
- Invalid address → the schema's message.
- An owner → "That address is already an owner."
- Already added → "That address already has access." (`insert … on conflict do nothing returning email` — no row back means it existed.)
- Added → "Access given to {email}." plus the welcome-email result below.

## Welcome email

After the row is inserted, send via Resend (same `from` and `ADMIN_BASE_URL` origin as the sign-in email):

- Subject: "You have access to the PSS admin"
- Body: who added them, the link `{origin}/admin/sign-in`, and "Sign in with this email address."

The email is sent inline (not `after()`), so the result shown matches what happened:
- Sent → "Access given to {email}. We emailed them the sign-in link."
- Missing `RESEND_API_KEY` or a Resend error → access is still given; the message says "Access given to {email}, but the welcome email could not be sent. Tell them to sign in at {origin}/admin/sign-in." and the error is logged.

## Remove

One statement (a single data-modifying CTE, per the atomic-writes rule): delete the `admin_access` row, delete that email's `admin_sessions` rows, and delete its unused `admin_login_tokens`. Removing an owner address or your own address is refused server-side as well as hidden in the UI. Unknown address → no-op.

Both actions call `requireAdmin()` first and `revalidatePath("/admin/settings")` after.

## Testing

- Unit (`tests/admin/allowlist.test.ts`, `session.test.ts`, `login.test.ts`): owner allowed without a DB call; added address allowed; unknown refused; mixed case and spaces normalized; callers now await the check.
- Actions: add validates, rejects owners and duplicates, reports the email result truthfully (sent / not configured / Resend error); remove refuses owners and self, and clears sessions.
- Power check: delete the `admin_access` lookup in `isAllowed` and confirm the added-admin tests go red.
- Migration and the new SQL run twice on a Neon test branch, including the check constraint rejecting `'Alia@X.com'`.
- e2e (Playwright, `next start` on 127.0.0.1): owner adds an address → it appears; that address signs in and reaches /admin; owner removes it → its next page load goes to sign-in.

## Rollout

Prove migration 025 on a branch, apply it to production (`ep-cold-term`), then merge to main (which deploys). After the deploy, the owner adds alia.whirley9@gmail.com from Settings. `ADMIN_EMAILS` is not touched.
