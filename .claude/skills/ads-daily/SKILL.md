---
name: ads-daily
description: >-
  Morning Google Ads review for Premier Shade Solutions. Use when the owner
  types /ads-daily or asks for the daily ads check. Reads the Search campaign
  in the owner's logged-in Chrome, applies fixed bid / pause / keyword /
  negative-keyword rules against a $75 target cost per lead, proposes a
  numbered list, applies only what the owner approves, verifies the changes
  stuck, and writes a local log to ~/pss/.ads-log/ (never committed).
---

# /ads-daily: morning Google Ads review

Spec: `docs/superpowers/specs/2026-10-02-ads-daily-design.md`. If this file and the spec disagree, stop and tell the owner.

## Fixed facts

- Account 683-934-1456. Campaign "Search - Window Treatments LV", ID 24293240304. Launched Sep 28, 2026. Budget $25/day.
- Bidding as of 2026-10-02: Maximize clicks with a $9 campaign-wide max CPC limit. Don't assume it: read the live bidding strategy and bids every run (Step 2).
- Target cost per lead (CPL): **$75**. A "lead" is a "Consultation request" conversion attributed to the keyword in Ads.
- Max CPC hard ceiling: **$12**.
- Account time zone: Pacific.
- 725-400-5254 is the owner's old personal number. Never attach it to anything.
- Log folder: always `~/pss/.ads-log/` (the main checkout), even when this runs from a worktree.

## Bidding and P0

Maximize clicks allows only one campaign-wide max CPC limit, so R1 and R3 can't target a keyword. The owner decided to move to Manual CPC.

- **P0 — switch bidding from Maximize clicks to Manual CPC, every active keyword's max CPC set to $9.00 (the current cap).** Propose it as the first item on every run until it has been approved, applied and verified (check the live bidding strategy and the log). It needs the owner's approval like any other item.
- While bidding is still Maximize clicks: list R1 and R3 as "not applicable until P0" and don't fire them. R7 applies to the campaign max CPC limit.
- After P0: R1 and R3 change that keyword's max CPC. R7 raises max CPC 15% on every active keyword, never above $12.

## Never, in any run

- Change budget, bidding strategy, locations or ad schedule unless the owner approved that exact numbered item in this run.
- Create or remove campaigns or ad groups.
- Accept terms, enter passwords or payment details, or make payments.
- Apply anything before the owner replies to the proposal.
- Make up a number. If a figure couldn't be read on screen, say so and skip the rules that need it.
- Keep retrying. If a page won't load or a click fails 2–3 times, stop and tell the owner what's missing.
- `git add` or commit anything in `.ads-log/`. A push to main deploys production.

## Step 0: Browser and log

1. Load the claude-in-chrome tools in one ToolSearch call: tabs_context_mcp, tabs_create_mcp, tabs_close_mcp, navigate, computer, find, read_page, get_page_text.
2. If several browsers are connected, ask the owner which one. Use "Browser 1" (macOS) unless told otherwise.
3. Open a new tab. Never reuse an old tab ID.
4. Read the last 7 files in `~/pss/.ads-log/`. Note any bid changes in the last 24 hours and items the owner rejected.

Ads pages reload once after navigating. Wait about 10 seconds and take a screenshot before reading. Every Ads URL takes `?ocid=8525738539`. The date picker sits at the top right. Its menu has Today, Yesterday, Last 7 days, Last 14 days, Last 30 days and Custom.

## Step 1: Health check

On https://ads.google.com/aw/campaigns?ocid=8525738539, with the date set to Yesterday:

- Impressions, clicks and cost vs the $25 budget.
- Campaign status, plus any red or orange banners (billing, policy, terms).
- Ads list (https://ads.google.com/aw/ads?campaignId=24293240304&ocid=8525738539): every ad Eligible? Note any disapproved or limited ads.

**If yesterday had 0 impressions, stop here and diagnose:**
- Change history (https://ads.google.com/aw/changehistory?ocid=8525738539): did anything change?
- Billing (https://ads.google.com/aw/billing/summary?ocid=8525738539): balance, payment problems.
- Ad preview and diagnosis (Tools → Troubleshooting): search "plantation shutters" with location **"Las Vegas, Nevada" (city)**. "Las Vegas Valley" isn't a targeted location and always shows "no keywords matched".

Report the findings to the owner before going on.

## Step 2: Pull numbers

Every range ends yesterday. Never use today's partial day. "Since launch" means Custom, Sep 28, 2026 through yesterday.

- **Keywords** (https://ads.google.com/aw/keywords?campaignId=24293240304&ocid=8525738539), for Yesterday, Last 7 days and Custom from Sep 28, 2026 through yesterday: per keyword Cost, Clicks, Impr., CTR, Conversions, Cost / conv., Search lost top IS (rank). If a column is missing, add it through Columns → Modify columns → Competitive metrics. Adding a column only changes the view; no approval needed.
- **Campaign**, Last 7 days: Search impr. share, Search lost IS (rank), Conversions and Cost / conv. (R8's campaign CPL).
- **Campaign cost per day**: Campaigns page, date = Last 7 days, Segment → Time → Day. Read the cost for each of the last 3 days (R7, R8).
- **Bidding**: the campaign's current bidding strategy (campaign Settings → Bidding). Under Maximize clicks, read the campaign max CPC limit. Under Manual CPC, read each active keyword's Max. CPC on the Keywords page.
- **Search terms** (Insights and reports → Search terms), Last 7 days: each term, its clicks and its cost.
- **Conversion upload** (Tools → Data manager → File upload, or an HTTPS connection): latest run time, status, rows imported, rows with errors.
- **Prerequisites still open?** (a) Does each conversion action have its own upload, or does one connection map everything to "Consultation request"? (b) Is the HTTPS feed connected?

## Step 3: Apply the rules

Ranges: R1, R2, R3 (leads, spend, CPL) and R4 (CTR, impressions) use since launch, Sep 28, 2026 through yesterday. R5 and R6 use the last 7 days. Yesterday and 7-day numbers are for context only.

| # | Condition | Proposal |
|---|---|---|
| R1 | Keyword has ≥ 1 lead at ≤ $75 CPL, and its Search lost top IS (rank) ≥ 20% | Raise its max CPC 15%, never above $12. Skip if its bid already changed in the last 24 hours (see the log). Not applicable until P0 |
| R2 | Keyword spent ≥ $150 since launch with 0 leads | Pause it |
| R3 | Keyword has ≥ 2 leads and CPL > $112 | Lower its max CPC 15%. Not applicable until P0 |
| R4 | Keyword spent < $150 with 0 leads | Leave it. Flag only if CTR < 2% with ≥ 100 impressions |
| R5 | Search term (last 7 days) is DIY, another retailer or brand, a job search, outside the service area, or a product PSS doesn't sell | Negative keyword. Up to 20 per day |
| R6 | Search term got a click, shows buying intent ("near me", "install", "installation", "cost", "price", "quote", or a service-area city name), and isn't already a keyword | New phrase-match keyword in the matching ad group. At most 5 new keywords in any rolling 7 days (count them in the log) |
| R7 | Campaign spent < $20/day on each of the last 3 days, and campaign Search lost IS (rank) (last 7 days) > 30% | Before P0: raise the campaign max CPC limit 15%, never above $12. After P0: raise max CPC 15% on every active keyword, never above $12 |
| R8 | Campaign spent its full budget on each of the last 3 days, and campaign CPL (last 7 days) ≤ $75 | Raise the budget $5/day |

**Prerequisites open?** If either prerequisite from Step 2 is still open, still run R1, R2 and R3, but mark every R1, R2 and R3 item "UNRELIABLE — prerequisites open (lead counts in Ads may be missing or wrong)".

Ad groups: Shutters, Solar Shades, Motorized, Blinds, Shades, Window Treatments, Outdoor (Outdoor has no ad, so don't add keywords there).

Service-area cities: Las Vegas, Henderson, Summerlin, North Las Vegas.

### Negative keyword guardrails

- Never block a product the site sells: blinds, shades, shutters, motorized, solar, outdoor and patio shades, rolling shutters.
- "porch" and "outdoor" are never negatives (the site has an /outdoor category).
- Check every new negative against every active keyword. Drop any that would block one.
- Skip terms already on the campaign's negative list.

## Step 4: Propose

Send one message:

1. A health line: serving or not, yesterday's spend vs $25, any banners.
2. Yesterday / 7-day / since-launch totals: cost, clicks, leads, CPL.
3. A numbered list, one action per item, each with its numbers. While bidding is still Maximize clicks, item 1 is P0. For example:
   `1. P0 — switch bidding from Maximize clicks to Manual CPC, every active keyword's max CPC set to $9.00 (the current cap)`
   `2. R1 — raise "plantation shutters" max CPC $9.00 → $10.35 (1 lead at $31 since launch, losing 42% of top spots to bid) — UNRELIABLE — prerequisites open (lead counts in Ads may be missing or wrong)`
   Mark every R1, R2 and R3 item UNRELIABLE as above while a prerequisite is open. Before P0, say "R1, R3: not applicable until P0" instead of listing them. Group all negatives into one item, listed in full.
4. Prerequisites still open, if any.
5. "Reply 'all', a list like '1–4, 6', or 'skip 3'."

If no rule fires, say so plainly and propose nothing.

## Step 5: Apply the approved items only

- P0: campaign Settings → Bidding → change to Manual CPC, then set every active keyword's Max. CPC to $9.00 on the Keywords page.
- Keyword bids, pauses and new keywords: Keywords page, or the matching ad group.
- Negatives: Audiences, keywords and content → Search keywords → Negative search keywords → add at **campaign** level.
- Every save may trigger "Confirm it's you". If it appears, ask the owner to complete it. Until they do, saves fail silently.
- Write the log file (Step 7 format) before applying the first item, and update its Decision column after each item. If the session ends partway, the log still shows what was applied.

## Step 6: Verify

Open a fresh tab, reload each affected page, and confirm every applied change is actually stored: bidding strategy (P0), new bid amounts, Paused status, keywords present, negatives listed. Fill the log's Verified column for each applied item (yes, or what didn't stick). Report anything that didn't stick, and don't count it as applied.

## Step 7: Log

Write `~/pss/.ads-log/YYYY-MM-DD.md` (today's Pacific date), even when running from a worktree. Never `git add` or commit it:

```markdown
# Ads daily — YYYY-MM-DD

## Health
<serving? spend vs budget, banners>

## Numbers
| Range | Cost | Clicks | Leads | CPL |
|---|---|---|---|---|
| Yesterday | | | | |
| Last 7 days | | | | |
| Since launch | | | | |

## Proposals
| # | Rule | Action | Decision | Verified |
|---|---|---|---|---|

## New keywords added (rolling 7-day count: N/5)

## Prerequisites open
```

Close the tabs you opened. End with a two-line summary to the owner: what changed, and what to watch tomorrow.
