# Job Page Redesign — Design

**Date:** 2026-09-14
**Status:** Approved in conversation, pending spec review
**Scope:** Rebuild the admin job page (`/admin/jobs/<id>`) from one long form into a job record: a fixed header with actions and a stage stepper, then four tabs (Overview, Measurements, Files, Activity). The Overview answers "what is happening with this job and what's next" at a glance. Layout only. It uses the data PSS already stores and needs no migration. It builds on the lead call flow (`2026-09-14-lead-call-flow-design.md`) and must land after it.

## 1. Purpose

Today the page stacks every section in a single column: contact lines, a stage form, the portal invite, a full details form, reviews, referrals, files, activity. Finding the next step means reading the whole thing. The redesign keeps every existing capability but moves it:

- **Up top, always visible:** who the customer is, where the job stands, and the actions you take most.
- **In the Overview:** the next step, the money and the status of each part of the job.
- **In their own tabs:** the full details (measurements, files, activity).

Success means:
- Opening a job shows its stage, next step and money without scrolling on a laptop.
- Every action available on today's page is still reachable, in at most two clicks.
- The board's side panel (`JobPanel`) is unchanged.

## 2. Decisions made in conversation

- **Layout first.** Itemized quotes, vendor orders and install crews or checklists are separate future projects. This one adds no tables.
- **Four tabs:** Overview, Measurements, Files, Activity. Quote, Order and Installation tabs come later with those projects. Until then, their fields live on the Overview.
- **Stepper shows the 7 existing stages.** There is no "Closed" stage. A lost job shows a banner and a greyed stepper. Set stage and Mark lost move into a "More" (•••) menu.
- **Stage-aware Next action card.** It uses only actions that exist today, and stages still move the way they do today.
- **Current PSS admin theme.** The existing tokens (charcoal, ivory, champagne, `rule`, `stage-*`) and the dark sidebar stay. The mockup's green is not used, and its extra sidebar links (Customers, Estimates, and so on) are not added.
- **Portal invite, review request, referral link and referrals list stay on the Overview.** They sit in a row below the cards and appear at the same stages as today.
- **Tabs are a `?tab=` search param, rendered on the server** (see §3).

## 3. Approach

The page stays one server component at `app/admin/jobs/[id]/page.tsx`. It reads `searchParams.tab` and renders the header plus only the chosen tab. Tabs are plain `<Link>`s to `?tab=…`. This matches how the board already uses `?job=`. Links can be shared, Back works, and no client state is added.

Rejected:
- **Tabs that switch in the browser.** Every tab would render on each load, and a tab can't be linked to.
- **A route per tab** (`/jobs/<id>/measurements`). The header would need a shared layout, which would also wrap the existing `/measure` and `/call` pages.

`parseJobTab(value)` returns `"overview" | "measurements" | "files" | "activity"`. A missing or unknown value falls back to `"overview"`. A second param, `edit=details`, puts the Overview into edit mode (§6).

## 4. Header (on every tab)

`JobHeader.tsx`, a server component:

- **"← All jobs"** link, as today.
- **Name** (`h1`) and a stage chip (the stage label, with the stage's `STAGE_STYLE` icon in its tint).
- **Details line:** city · "Created <date>" · "<n> days in stage".
  - "Days in stage" comes from `stage_changed_at`. It reads "Today" for zero days and "1 day" for one.
  - Dates use the Las Vegas helpers in `lib/admin/time.ts`.
- **Action row.** It wraps on narrow screens:
  - **Call:** the call flow's `CallButton`, moved here unchanged from under the `h1`.
  - **Text:** `sms:+1<phone>`.
  - **Email:** `mailto:`. Hidden when the job has no email.
  - **Schedule:** links to `?tab=overview&edit=details#visitAt`, which opens the details form at the visit date.
  - **More (•••):** a `<details>` dropdown, so no client JS. It holds the "Set stage" select and the "Mark lost" form from `StageControls`.
- **Stage stepper** (`StageStepper.tsx`):
  - The 7 `STAGES` in order.
  - Stages before the current one show a check, and the current stage is filled with its stage color. Later stages are hollow.
  - It is `<ol>` with `aria-current="step"` on the current stage.
  - On phones it scrolls horizontally, and labels shorten to icons, with the current stage's label kept.
- **Lost jobs:** the stepper is greyed out. Above it, a banner reads "Lost — <reason>". Reopening is done by Set stage in the More menu, as today.
- **Tab bar** (`JobTabs.tsx`): links with `aria-current="page"` on the active tab. Measurements and Files show a count.

`StageControls` gets an optional prop to render only some of its three parts (move button, set-stage select, mark-lost form). The default renders all three, so `JobPanel` is unaffected. The job page uses the move button in the Next action card, and the select and lost form in the More menu.

## 5. Overview tab

A 3-column grid on wide screens, 1 column on phones. Cards are ivory with a `rule` border, in the existing section-heading style.

**Row 1**
- **Customer.** Phone (a `tel:` link), email, and the address (a maps link). Below a rule: heard about us, came in via, and referred by (a link to the referrer's job, when there is one).
- **Project details.** Interested in (treatment chips), windows, budget (from the call flow's `budgetTier`), brands and notes. It has an Edit link (§6).
- **Next action.** See §7.

**Row 2: Money.** Four figures: Quote, Sold, Deposit, Balance. Balance is sold minus deposit and is shown only when sold is set. With no quote and no sale, the strip collapses to "No quote yet", with an "Add quote" link to edit mode. It has an Edit link.

**Row 3: Status cards.** Each shows the value when set, or an empty line and one button when not:
- **Visit.** The visit date and time, or "No visit booked" with a "Book visit" button (to `edit=details#visitAt`).
- **Measurements.** The count, with the last updated time. The button is "Add measurement" (to `/admin/jobs/<id>/measure`), plus "View all" (to `?tab=measurements`) when there are any.
- **Order.** The order date, or "Not ordered". The button is "Set order date" (to edit mode).
- **Install.** The install date, or "Not scheduled". The button is "Set install date" (to edit mode).

**Row 4: Customer** (only the parts that apply, following today's rules):
- Customer project page (`InviteSection`), unchanged.
- Review request (`ReviewSection`) and referral link (`ReferralSection`), shown at Sold or later.
- Referrals (`ReferralsList`), shown when there are any.

**Row 5**
- **Recent activity.** The 5 newest events, drawn by the shared `EventList`, plus an "All activity" link and an "Add note" link (to `?tab=activity`).
- **Files and photos.** The 6 newest photos as thumbnails, using the same image source `JobFiles` uses, plus a count of documents. It has a "Files" link. With no files, it shows "No files yet" and an "Upload" link to `?tab=files`.

## 6. Editing details

There is still one form and one save action, so the calendar session's hook on `saveDetails` and the call flow's budget field keep working untouched.

- `?edit=details` renders `DetailsForm` as a full-width card in place of rows 2 and 3.
- The card has a "Done" link back to `?tab=overview`. Saving behaves as today.
- `DetailsForm`'s visit input already has `id="visitAt"`, so the `#visitAt` anchor lands on it with no change to the form.
- Nothing else in the form changes.

## 7. Next action

`lib/admin/next-action.ts` exports a pure `nextAction(job, { measurementCount })`. It returns `{ title, detail, cta: { label, href } | "call" } | null`. The card shows the title, the detail line and one primary button. Below the button, when there is a next stage, it shows today's "Move to <next stage>" button (`StageControls` move part). So an owner can still move the stage by hand after the task is done, and nothing changes stage on its own.

| Stage | Title | Button |
|---|---|---|
| New lead | Call the customer | Call (the `CallButton`) |
| Contacted | Book the consultation | Book visit → `edit=details#visitAt` |
| Visit booked, no measurements | Measure the windows | Add measurement → `/measure` |
| Visit booked, measured | Send the quote | Enter quote → `edit=details` |
| Quoted | Follow up and close | Enter sold amount → `edit=details` |
| Sold | Order the product | Set order date → `edit=details` |
| Ordered | Schedule the install | Set install date → `edit=details` |
| Installed, balance > 0 | Collect the balance | Record payment → `edit=details` |
| Installed, no balance | Job complete | none |
| Lost | (no card; the banner covers it) | |

"Balance > 0" means sold is set and sold minus deposit is greater than 0.

## 8. Other tabs

- **Measurements.** Today's measurements, shown as a table with columns Window/room, Width, Height, Depth, Mount, Notes and Photo. Sizes use the existing eighths formatting. Each row links to `measure/<windowId>`. An "Add measurement" button sits above the table. It shows the same empty state as today. On phones the table scrolls horizontally inside its own container.
- **Files.** `JobFiles`, unchanged (upload, add photo, share toggle, delete).
- **Activity.**
  - `NoteForm` sits on top.
  - Below it, the full timeline is grouped by Las Vegas day ("Today", "Yesterday", "Sep 11"). Each group shows the time, the actor and the event.
  - Stage events render as "From → To" chips.
  - The event rendering moves from `page.tsx` into `EventList.tsx`, and the Overview uses the same component.

## 9. Files touched

- **New:**
  - Components in `app/admin/jobs/[id]/`: `JobHeader.tsx`, `StageStepper.tsx`, `JobTabs.tsx`, `NextActionCard.tsx`, `OverviewTab.tsx`, `MeasurementsTab.tsx`, `ActivityTab.tsx`, `EventList.tsx`, `MoneyStrip.tsx`
  - `app/admin/jobs/[id]/tabs.ts` (`parseJobTab`)
  - `lib/admin/next-action.ts`
- **Changed:**
  - `page.tsx`: rewritten as header plus tab switch
  - `StageControls.tsx`: optional parts prop
  - `lib/admin/time.ts`: a `dayLabel` helper and "days in stage"
- **Not touched:**
  - `lib/admin/stages.ts`, including `STAGE_STYLE`, which the calendar session is extending
  - `app/admin/jobs/actions.ts`
  - `JobPanel.tsx`
  - `AdminNav.tsx`
  - the schema and migrations

## 10. Data loading

The page loads the same data as today, in parallel: job, events, referrals, referrer, measurements and files. Every tab's header needs the counts and the Overview needs a slice of everything, so there is no per-tab loading. `requireAdmin()` and `notFound()` stay first.

## 11. Testing

- **Unit** (`tests/admin/next-action.test.ts`): every row of the §7 table, including a measured versus unmeasured visit, a balance of 0 versus more than 0, and lost returning null.
- **Unit** (`tests/admin/job-tabs.test.ts`): `parseJobTab` for each tab, for a missing value and for garbage.
- **Component:**
  - `StageStepper`: done, current and upcoming states, `aria-current`, lost greyed out.
  - `MoneyStrip`: the "No quote yet" collapse, and the balance maths.
  - `EventList`: day grouping, using a fixed clock.
  - `StageControls` parts prop: the default still renders all three parts.
- **Page:** `tests/admin/job-page.test.tsx` updated.
  - Each tab renders its content.
  - `edit=details` shows the form.
  - The Email button is hidden without an email.
  - The call flow's budget line appears in Project details.
- **E2E:** `e2e/admin.spec.ts` flows updated for the new locations (note → Activity tab, measure → Measurements tab). They run against `next start` on 127.0.0.1 with the Neon test branch.

## 12. Order and coordination

1. The call flow (branch `callflow`) merges first. This work branches from main after that.
2. The calendar work (branch `calendar`) doesn't touch these files. The only shared file is `actions.ts`, which this work doesn't change. Whichever of the two merges second rebases.
3. Before merging, message both sessions and run the full Vitest suite and the admin e2e test.
