# Admin "PSS Operations" Look and Board Conveniences — Design

**Date:** 2026-09-13
**Status:** Approved in conversation, pending spec review
**Scope:** A visual redesign of the owners' admin area at `/admin`, plus three board conveniences: search, "+ Add job" in each column, and a New Job button in the header. It builds on the pipeline board and client panel (`2026-09-13-admin-pipeline-panel-design.md`), which are merged on `main`.

## 1. Purpose

The admin is where the owners spend their day, and it currently looks like a bare form. The goal is for it to look like the owners' own tool: the Premier Shade Solutions logo and palette, a dark sidebar, a warm board, and clear stage colors. It should also make two common actions faster: finding a job, and adding one straight into the stage it's already in.

Success means:
- A job can be found by typing part of its name, phone, email, city or address.
- A job can be added into any stage from that stage's column.
- Every admin screen uses the brand palette and the real logo.
- Nothing that works today stops working.

Two AI-generated mockups inspired the look. They are not a feature list. Nothing here is included only because a mockup showed it (see §10).

## 2. Decisions made in conversation

- **The whole look, with our logo.** Use the real Premier Shade Solutions logo from `components/brand/Logo.tsx`, not the mockups' invented "PSS" artwork.
- **Replaces black and white.** This supersedes the admin's black-and-white theme and the pipeline-panel spec's "black and white" rule. The admin now uses the brand palette plus muted stage colors.
- **Board conveniences:** search, "+ Add job" per column, and a New Job button in the header.
- **Sidebar:** only pages that exist (Jobs, New job, Settings). Sections that aren't built yet are not listed, not even as "coming soon".
- **"+ Add job" starts the job in that column's stage.** The new-job form gains a stage picker that defaults to New lead.
- **Left out:** drag-and-drop between columns, tabs in the client panel, a "…" menu on cards, and the mockups' decorative graphics.

## 3. Approach

**Colors:**
- Remove the `.admin-theme` block in `app/globals.css` that remaps the brand tokens to black and white. The admin then inherits the brand palette from `@theme`: charcoal `#1E1E1E`, taupe `#7A7263`, champagne `#CDB891`, champagne-ink `#766028`, sand `#E7E1D6`, ivory `#F7F5F0`, rule `#DCD6C9` and ink-soft `#5C564C`.
- Keep a slimmer `.admin-theme` class for the admin's system-sans type and a warm off-white page ground.
- Add a small set of new tokens to the same `@theme` block (§4), so the brand file's rule "no component may declare a color literal" still holds.

**Icons:**
- Draw a handful of small inline SVG icons in one module, `components/admin/icons.tsx`, with no new dependency.
- Icons are decorative (`aria-hidden`). Every control keeps a text label.

**Rejected:**
- **An icon package such as `lucide-react`.** It offers more icons but adds a dependency for about ten glyphs.
- **A component kit such as shadcn/ui.** Too heavy for a three-screen tool, and it would replace the shared form components the public site relies on.

## 4. Palette additions

These are added to `@theme` in `app/globals.css`.

| Token | Value | Use |
|---|---|---|
| `--color-sidebar` | `#1E1E1E` (charcoal) | The admin sidebar background, named for its role |
| `--color-sidebar-ink` | `#F7F5F0` | Sidebar text |
| `--color-sidebar-muted` | `#B3AAA0` | Sidebar secondary text (email) |
| `--color-admin-ground` | `#F3F0EA` | The admin page background (warmer than white, lighter than sand) |
| `--color-stage-new` | `#C98A2E` | New lead: amber |
| `--color-stage-contacted` | `#6F8F72` | Contacted: sage |
| `--color-stage-visit` | `#5B8DB8` | Visit booked: sky |
| `--color-stage-quoted` | `#8A6A9E` | Quoted: plum |
| `--color-stage-sold` | `#5E9A5A` | Sold: green |
| `--color-stage-ordered` | `#B07D4F` | Ordered: copper |
| `--color-stage-installed` | `#1E1E1E` | Installed: charcoal |
| `--color-overdue` | `#B3261E` | Overdue text, and the overdue label's border |

**Contrast:**
- Stage colors appear only as a 3px column top edge, a dot, and the icon tint, never as the only carrier of meaning, since every column also has its label.
- Where a stage color is used on text, it must reach WCAG AA 4.5:1 on white. Otherwise it is used only on non-text elements.
- `--color-overdue` on white is about 6.5:1 and may be used as text.
- The implementation verifies each contrast and records the ratios in a comment, as the brand file does for champagne-ink.

## 5. Sidebar (`app/admin/AdminNav.tsx`)

**Desktop (from `md` up):** a fixed-width left column on `--color-sidebar`, containing:
- The logo in `tone="dark"`, lockup variant, with a small wide-tracked "OPERATIONS" label under it in `--color-sidebar-muted`.
- The links Jobs, New job and Settings, each with an icon.
  - The active link gets a soft champagne-tinted background and champagne left edge, and keeps `aria-current="page"`.
  - The active rules are unchanged: a job page counts as Jobs, and `/admin/jobs/new` counts as New job.
- At the bottom, a round badge with the signed-in owner's initials (taken from the part of their email before the @), their email, and Sign out.

**Phones:** the same dark header bar with the logo and a Menu button that reveals the same links, as today's `<details>` does.

## 6. Board page (`app/admin/page.tsx`)

### Header
- A small "PSS OPERATIONS" eyebrow, the "Jobs" heading, and one line of description: "Track every project from lead to installation."
- On the right, today's date in Las Vegas time (for example "Sat, Sep 13, 2026") and "Las Vegas, NV" under it.
- A search box, a "Show lost" / "Hide lost" toggle, and a dark "New Job" button linking to `/admin/jobs/new`.

### Search
- The search box is a GET form. Submitting it sets `?q=`.
- `q` combines with `lost` and `job`. All board links (cards, tiles, the lost toggle, the panel's Close) keep `q`, so searching doesn't close the panel and closing the panel doesn't clear the search.
- **Matching:**
  - Case-insensitive substring match on name, email, city and address.
  - On phone, the digits of `q` are matched against the stored 10 digits, so "702 555" finds (702) 555-0134.
  - A blank `q` means no filter. `q` is trimmed and capped at 100 characters.
- Filtering happens in the database query: `listJobs` gains an optional `search` argument and uses `ilike` parameters, never string-built SQL.
- **While searching:**
  - Stage tiles and column counts show the matching counts.
  - A line such as `3 jobs match "reyes" · Clear search` appears under the header.
  - Clear search removes `q`.

### Stage tiles
- A row of seven tiles, one per working stage from New lead to Installed (including Ordered; the mockups showed six only because they had no Ordered stage). Each shows the stage icon, the count and a chevron.
- Each tile is a link to its column (`#stage-<value>`), keeping all board parameters.
- Tiles wrap to two or three per row on narrow screens.
- They replace the plain "Jobs per stage" line.

### Columns
- **Header:** a colored 3px top edge, the stage icon tinted with its stage color, the label and the count.
- **Empty:** a faint icon and "No jobs in this stage".
- **Footer:** "+ Add job", or "+ Add lead" in the New lead column, linking to `/admin/jobs/new?stage=<value>`.
- **Lost:** when shown, the Lost column has a neutral taupe edge and no add button.
- The layout is unchanged: stacked on phones, one horizontal scrolling row from `md` up.

### Cards (`app/admin/JobCard.tsx`)
- White, rounded, with a soft shadow.
- **Contents, top to bottom:**
  1. The name.
  2. The Referral badge, when referred.
  3. A pin icon and the city.
  4. The interests, when set.
  5. A clock icon with "N days in stage".
- **Overdue:** a warm border, plus "· OVERDUE" in `--color-overdue` beside the days. The accessible name still includes "overdue".
- **Selected (panel open):** a champagne outline, with `aria-current="true"` kept.
- Cards still link to the board URL with `job=<id>`, keeping `lost` and `q`.

## 7. New-job form (`app/admin/jobs/new`)

- The page reads `?stage=` and passes it to the form as the default value of a new "Stage" select.
  - The options are the seven working stages. Lost is not offered.
  - An unknown or missing value defaults to New lead.
- `newJobSchema` gains `stage`: an enum of the seven working stages, defaulting to `new`.
- `createJob` inserts that status and writes its `job_events` row as today ("Added by hand"), with `to_status` set to the chosen stage.
  - `stage_changed_at` defaults to now.
  - No other fields change.
- Opened from the sidebar or the header's New Job button (no `stage`), the page heading reads "New job". Opened from a column's add link, it reads "New job · <Stage>", for example "New job · Quoted".

## 8. Client panel, job page and other admin screens

- The panel and the full job page keep their content and behavior.
- They pick up the palette, rounded surfaces and spacing.
- "Move to <next stage>" becomes a full-width dark button with a calendar or arrow icon.
- Sign-in, the link-confirm page, Settings and the measuring screen get the palette automatically through the tokens. They don't need individual redesigns.

## 9. Code layout

- `app/globals.css`: the §4 tokens, and a slimmed `.admin-theme` (system-sans type, `--color-admin-ground` background).
- `components/admin/icons.tsx` (new): inline SVG icons (jobs, plus, settings, sign-out, search, pin, clock, and one per stage). Each is `aria-hidden` and sized with `1em`.
- `lib/admin/stages.ts`: an icon and color-token name per stage, kept next to the existing stage list so they stay in step.
- `lib/admin/links.ts`: `boardHref` gains `q`.
- `lib/admin/jobs.ts`: `listJobs({ includeLost, search })`, and `createJob` accepts `stage`.
- `lib/admin/schema.ts`: `newJobSchema.stage`.
- `app/admin/AdminNav.tsx`, `app/admin/page.tsx`, `app/admin/JobCard.tsx`, `app/admin/JobPanel.tsx`, and `app/admin/jobs/new/*`: restyled and extended as above.
- Admin pages keep calling `requireAdmin()` first.

## 10. Out of scope

- **Drag-and-drop between columns.**
- **Panel tabs, an Edit button for contact details, created and last-activity dates.** These are the panel upgrades that were not chosen.
- **A "…" menu on cards.**
- **Sidebar sections for features that don't exist:** Calendar, Leads, Customers, Estimates, Orders, Installations, Reports.
- **The mockups' decorative background graphics, and a footer tagline.**
- **The public website's design.** It is unchanged.
- **Database schema changes.** None.

## 11. Errors

- A malformed `stage` on the new-job URL falls back to New lead. A malformed `stage` in the submitted form fails validation with "Pick a stage".
- An empty search result shows every column empty, with the "N jobs match" line reading "No jobs match".

## 12. Testing

**Unit (Vitest):**
- `listJobs` search:
  - The SQL uses parameters.
  - Phone digit matching.
  - Blank `q` means no filter.
- `boardHref` with `q`.
- `newJobSchema.stage`:
  - It defaults to `new`.
  - It rejects `lost` and unknown values.
- `createJob` stores and logs the chosen stage.

**Components:**
- The sidebar:
  - It shows the three links with `aria-current`.
  - The initials badge.
- The board:
  - It renders six tiles linking to `#stage-*`.
  - Each column has an add link to `/admin/jobs/new?stage=<value>`, and New lead's reads "+ Add lead".
  - The search form keeps `lost` and `job`, and the "N jobs match" line shows with a Clear link.
- Cards keep their overdue and selected behavior, and all link parameters are preserved.
- The new-job form pre-selects the stage from `?stage=`.
- The existing admin tests are updated for the new markup and keep passing.

**E2E (Playwright, against a production build and a Neon test branch, per the local verification notes):**
- Search for a job by part of its name and by phone digits.
- Add a job from the Quoted column and see it land in Quoted.
- The existing admin journeys keep passing.

**Accessibility:**
- Every icon is decorative.
- Focus rings stay visible on the dark sidebar.
- The contrast ratios from §4 are recorded.
