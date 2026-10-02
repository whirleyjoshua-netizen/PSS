# `/ads-daily`: morning Google Ads review

**Date:** 2026-10-02
**Status:** design approved by the owner, not yet built

## Goal

Every morning, check whether the Search campaign spent its budget and whether its keywords produce consultation requests at or under the target cost per lead (CPL). Grow what works, cut what doesn't, and keep the search terms clean. Claude does the review and proposes changes. The owner approves before anything changes in Google Ads.

## Fixed facts

- Google Ads account 683-934-1456, campaign "Search - Window Treatments LV" (ID 24293240304), $25/day budget as of 2026-10-02. Each run reads the live daily budget instead of assuming it.
- Current bidding (2026-10-02): Maximize clicks with a $9 campaign-wide max CPC limit. Each run reads the live bidding strategy and bids instead of assuming them.
- Target CPL: **$75** for one "Consultation request".
- Max CPC hard ceiling: **$12**.
- The 725-400-5254 number is the owner's old personal line. It must never be attached to an ad.

### Bidding

Under Maximize clicks, Google allows only one campaign-wide max CPC limit, so the per-keyword bid rules (R1, R3) can't be applied. The owner decided to move to Manual CPC:

- **P0 — switch bidding from Maximize clicks to Manual CPC, every active keyword's max CPC set to $9.00 (the current cap).** It is a one-time item, proposed first on every run until it has been approved, applied and verified. Like any other item, it needs the owner's approval. The starting bid is the live campaign max CPC limit read that run ($9.00 as of 2026-10-02); if the live limit differs from $9.00, the P0 item says so and uses the live figure.
- Until P0 is applied: R1 and R3 can't target a keyword. The run states them as "not applicable until P0" and doesn't fire them. R7 applies to the campaign max CPC limit.
- After P0: R1 and R3 change that keyword's max CPC. R7 raises max CPC 15% on every active keyword, never above $12.

## What gets built

1. **`.claude/skills/ads-daily/SKILL.md`**, committed to the repo. It holds the flow and rules below, so every run behaves the same. The owner starts it by typing `/ads-daily`.
2. **`.ads-log/`** at the repo root, added to `.gitignore`. It holds one file per run, `YYYY-MM-DD.md`, always in the owner's main checkout (`~/pss/.ads-log/`), even when the run starts from a worktree. It is never committed, because a push to main deploys production.

Nothing else is built: no API integration, no admin page, no scheduled job.

## Morning flow

1. **Read the log.** Open the last 7 days of `~/pss/.ads-log/` to see what changed recently, so the run doesn't raise the same bid twice in one day or re-propose rejected items without saying so.
2. **Health check**, in the owner's logged-in Chrome (Browser 1, macOS):
   - Yesterday's impressions, clicks and cost vs the live daily budget (Budget column; $25/day as of 2026-10-02).
   - Campaign and ad statuses, disapprovals, and billing or policy banners.
   - If yesterday had 0 impressions, stop and diagnose before proposing anything else (Ad preview with location "Las Vegas, Nevada" city, change history, billing).
3. **Pull numbers** for yesterday, the last 7 days and since launch (custom range Sep 28, 2026 through yesterday). Every range ends yesterday; today's partial day is never used.
   - Per keyword: cost, clicks, impressions, CTR, conversions, cost per conversion, and "Search lost top IS (rank)".
   - Campaign row: cost, clicks, conversions and cost per conversion for yesterday, the last 7 days and since launch. The proposal reports these figures as read, never sums of keyword rows.
   - Campaign: search impression share and "Search lost IS (rank)" for the last 7 days.
   - The campaign's live daily budget (Budget column on the Campaigns page).
   - Campaign cost for each of the last 3 days: Campaigns page, date = last 7 days, Segment → Time → Day.
   - The current bidding strategy, and either the campaign max CPC limit (Maximize clicks) or each active keyword's max CPC (Manual CPC).
   - Search terms report for the last 7 days.
   - Status of the latest conversion upload in Data Manager.
4. **Apply the rules** below.
5. **Propose** one numbered list. P0 comes first while it is outstanding. Each item names the action, the keyword or term, and the numbers behind it.
6. **Wait for approval.** The owner replies "all", "1–5 and 7", "skip 3", or similar. Apply only the approved items. If P0 is approved, apply it before any other item.
7. **Verify.** Reload the affected pages in a fresh tab and confirm each change actually saved. Saves can drop silently when Google shows a "Confirm it's you" prompt. Fill the log's Verified column for each applied item. Report anything that didn't stick.
8. **Write the log** `~/pss/.ads-log/YYYY-MM-DD.md`: the numbers, each proposal, the decision (approved or rejected), and what was verified as applied.

## Rules

A "lead" means a "Consultation request" conversion attributed to the keyword in Ads.

Date ranges: R1, R2 and R3 (leads, spend, CPL) and R4 (CTR, impressions) use since launch, Sep 28, 2026 through yesterday. R5 and R6 use the last 7 days through yesterday. Yesterday and 7-day numbers are reported for context only.

CPL is undefined when conversions = 0. A "—" or $0 in Cost / conv. is never read as ≤ $75, and R1, R3 and R8 don't fire on an undefined CPL.

If P0 and R7 are approved in the same run, P0 is applied first, and R7 is then applied in its after-P0 form: every active keyword's max CPC raised 15% from the P0 starting bid, never above $12. When R7 is proposed in the same run as an outstanding P0, the R7 item shows both forms, e.g. "campaign limit $9.00 → $10.35, or every keyword $9.00 → $10.35 if P0 is approved".

| # | Condition | Proposal |
|---|---|---|
| R1 | Keyword has ≥ 1 lead at ≤ $75 CPL, and its "Search lost top IS (rank)" ≥ 20% | Raise its max CPC 15%, never above $12, at most once per day per keyword. Not applicable until P0 |
| R2 | Keyword spent ≥ $150 since launch with 0 leads | Pause it |
| R3 | Keyword has ≥ 2 leads and CPL > $112 | Lower its max CPC 15%. Not applicable until P0 |
| R4 | Keyword spent < $150 with 0 leads | Leave it. Flag it only if CTR < 2% with ≥ 100 impressions |
| R5 | Search term (last 7 days) is DIY, another retailer or brand, a job search, outside the service area, or a product PSS doesn't sell | Propose as a negative keyword, up to 20 per day |
| R6 | Search term got a click, shows buying intent ("near me", "install", "installation", "cost", "price", "quote", a service-area city name), and isn't already a keyword | Propose as a phrase-match keyword in the matching ad group. The keyword is the core product phrase of the search term, not the full query (e.g. "bypass shutters for sliding glass doors near me" → "bypass shutters"); show the original term in the item. At most 5 new keywords per rolling 7 days |
| R7 | Campaign spent < $20/day on each of the last 3 days, and campaign "Search lost IS (rank)" (last 7 days) > 30% | Before P0: propose raising the campaign max CPC limit 15%, never above $12. After P0, or when P0 is approved in the same run: propose raising max CPC 15% on every active keyword, never above $12 |
| R8 | Campaign cost ≥ the live daily budget ($25 as of 2026-10-02) on each of the last 3 days, and campaign CPL (last 7 days) ≤ $75 | Propose a budget increase of $5/day |

### Negatives guardrails

- Never add a negative that blocks a product the site sells: blinds, shades, shutters, motorized, solar, outdoor and patio shades, rolling shutters.
- "porch" and "outdoor" are not negatives, because the site has an /outdoor category.
- Check each new negative against every active keyword. A negative that blocks an active keyword is dropped from the proposal.

## Never, in any run

- Change budget, bidding strategy, locations or schedule without the owner's explicit approval of that numbered item.
- Create or remove campaigns or ad groups.
- Attach the 725-400-5254 number to anything.
- `git add` or commit anything in `.ads-log/`.
- Accept terms, enter passwords or payment details, or make payments.

## Prerequisites (done by the owner, once)

1. **Split the conversion uploads.** The current Data Manager file-upload connection maps every row to "Consultation request". Each conversion action needs its own filter or connection, so that "Appointment booked" and "Sale" rows aren't counted as consultations.
2. **Connect the HTTPS conversion feed** (`/api/ads/conversions.csv`) in Data Manager, so uploads run without manual files. The owner enters the feed password; Claude doesn't type passwords into sites.

Until both are done, keywords will rarely show leads in Ads, and R1, R2's lead check and R3 can't fire correctly. Each run states whether the prerequisites are still open. While either one is open, the rules still run, but every R1, R2 and R3 item in the proposal is marked "UNRELIABLE — prerequisites open (lead counts in Ads may be missing or wrong)" so the owner knows.

## Error handling

- If the Ads UI doesn't load or a click fails 2–3 times, stop and tell the owner what's missing rather than guessing numbers.
- Numbers in the proposal come only from what the run read on screen. If a figure couldn't be read, the proposal says so and skips the rules that need it.
- If a session ends partway through, the log records what was applied up to that point.

## Testing

Before the first live run, do a dry run: produce the proposal for real numbers, apply nothing, and have the owner check that every rule fired (or didn't) as expected.
