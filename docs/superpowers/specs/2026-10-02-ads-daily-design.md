# `/ads-daily`: morning Google Ads review

**Date:** 2026-10-02
**Status:** design approved by the owner, not yet built

## Goal

Every morning, check whether the Search campaign spent its budget and whether its keywords produce consultation requests at or under the target cost per lead (CPL). Grow what works, cut what doesn't, and keep the search terms clean. Claude does the review and proposes changes. The owner approves before anything changes in Google Ads.

## Fixed facts

- Google Ads account 683-934-1456, campaign "Search - Window Treatments LV" (ID 24293240304), $25/day budget, Maximize clicks with a $9 max CPC cap.
- Target CPL: **$75** for one "Consultation request".
- Max CPC hard ceiling: **$12**.
- The 725-400-5254 number is the owner's old personal line. It must never be attached to an ad.

## What gets built

1. **`.claude/skills/ads-daily/SKILL.md`**, committed to the repo. It holds the flow and rules below, so every run behaves the same. The owner starts it by typing `/ads-daily`.
2. **`.ads-log/`** at the repo root, added to `.gitignore`. It holds one file per run, `YYYY-MM-DD.md`, in the owner's main checkout (`~/pss/.ads-log/`). It is never committed, because a push to main deploys production.

Nothing else is built: no API integration, no admin page, no scheduled job.

## Morning flow

1. **Read the log.** Open the last 7 days of `.ads-log/` to see what changed recently, so the run doesn't raise the same bid twice in one day or re-propose rejected items without saying so.
2. **Health check**, in the owner's logged-in Chrome (Browser 1, macOS):
   - Yesterday's impressions, clicks and cost vs the $25 budget.
   - Campaign and ad statuses, disapprovals, and billing or policy banners.
   - If yesterday had 0 impressions, stop and diagnose before proposing anything else (Ad preview with location "Las Vegas, Nevada" city, change history, billing).
3. **Pull numbers** for yesterday, the last 7 days and since launch (Sep 28, 2026):
   - Per keyword: cost, clicks, CTR, conversions, cost per conversion, and "Search lost top IS (rank)".
   - Campaign: search impression share and "Search lost IS (rank)".
   - Search terms report for the last 7 days.
   - Status of the latest conversion upload in Data Manager.
4. **Apply the rules** below.
5. **Propose** one numbered list. Each item names the action, the keyword or term, and the numbers behind it.
6. **Wait for approval.** The owner replies "all", "1–5 and 7", "skip 3", or similar. Apply only the approved items.
7. **Verify.** Reload the affected pages in a fresh tab and confirm each change actually saved. Saves can drop silently when Google shows a "Confirm it's you" prompt. Report anything that didn't stick.
8. **Write the log** `.ads-log/YYYY-MM-DD.md`: the numbers, each proposal, the decision (approved or rejected), and what was verified as applied.

## Rules

A "lead" means a "Consultation request" conversion attributed to the keyword in Ads.

| # | Condition | Proposal |
|---|---|---|
| R1 | Keyword has ≥ 1 lead at ≤ $75 CPL, and its "Search lost top IS (rank)" ≥ 20% | Raise its max CPC 15%, never above $12, at most once per day per keyword |
| R2 | Keyword spent ≥ $150 since launch with 0 leads | Pause it |
| R3 | Keyword has ≥ 2 leads and CPL > $112 | Lower its max CPC 15% |
| R4 | Keyword spent < $150 with 0 leads | Leave it. Flag it only if CTR < 2% with ≥ 100 impressions |
| R5 | Search term (last 7 days) is DIY, another retailer or brand, a job search, outside the service area, or a product PSS doesn't sell | Propose as a negative keyword, up to 20 per day |
| R6 | Search term got a click, shows buying intent ("near me", "install", "installation", "cost", "price", "quote", a service-area city name), and isn't already a keyword | Propose as a phrase-match keyword in the matching ad group. At most 5 new keywords per rolling 7 days |
| R7 | Campaign spent < $20/day for 3 days in a row, and campaign "Search lost IS (rank)" > 30% | Propose raising the campaign max CPC cap 15%, never above $12 |
| R8 | Campaign spent its full budget for 3 days in a row, and campaign CPL ≤ $75 | Propose a budget increase of $5/day |

### Negatives guardrails

- Never add a negative that blocks a product the site sells: blinds, shades, shutters, motorized, solar, outdoor and patio shades, rolling shutters.
- "porch" and "outdoor" are not negatives, because the site has an /outdoor category.
- Check each new negative against every active keyword. A negative that blocks an active keyword is dropped from the proposal.

## Never, in any run

- Change budget, bidding strategy, locations or schedule without the owner's explicit approval of that numbered item.
- Create or remove campaigns or ad groups.
- Attach the 725-400-5254 number to anything.
- Accept terms, enter passwords or payment details, or make payments.

## Prerequisites (done by the owner, once)

1. **Split the conversion uploads.** The current Data Manager file-upload connection maps every row to "Consultation request". Each conversion action needs its own filter or connection, so that "Appointment booked" and "Sale" rows aren't counted as consultations.
2. **Connect the HTTPS conversion feed** (`/api/ads/conversions.csv`) in Data Manager, so uploads run without manual files. The owner enters the feed password; Claude doesn't type passwords into sites.

Until both are done, keywords will rarely show leads in Ads, and R1, R2's lead check and R3 can't fire correctly. Each run states whether the prerequisites are still open.

## Error handling

- If the Ads UI doesn't load or a click fails 2–3 times, stop and tell the owner what's missing rather than guessing numbers.
- Numbers in the proposal come only from what the run read on screen. If a figure couldn't be read, the proposal says so and skips the rules that need it.
- If a session ends partway through, the log records what was applied up to that point.

## Testing

Before the first live run, do a dry run: produce the proposal for real numbers, apply nothing, and have the owner check that every rule fired (or didn't) as expected.
