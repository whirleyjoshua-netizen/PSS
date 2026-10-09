# Agent dashboard and agent standard — design

Date: 2026-10-09 · Branch: `feat/agent-dashboard` · Migration: **042** (claimed 2026-10-09; 001–041 exist across branches)

## 1. Intent

**What the owner said.** There are now two AI agents, Tara (marketing, `pss/agent_growth/`) and Tobi (B2B outreach, `pss/agent_outreach/`), and more will follow. The owner doesn't want to dig through folders for reports. They want one dashboard where every agent's reports land, including future agents. Agents should know, as a standard, which tools they can use: Outlook, Resend and the Chrome plugin are available.

**Decisions taken in brainstorming (owner-approved):**
- The dashboard lives in the **PSS admin** (`/admin/agents`), plus **one morning summary email via Resend**.
- Outbound email works as **approve in the dashboard, then the app sends**. Agents never hold send credentials.
- Agents can read **only replies to emails they sent**, never the rest of support@.
- **Approach A:** agents publish through `outbox/` and receive through `inbox/` folders. A shared runner script does all network I/O. A shared standard lives in `pss/agents/`. **Tobi gets a weekday schedule too.**
- Sending rules: one recipient per email, a daily cap of 10 per agent, opt-out plus a do-not-contact list, and a mailing address required before sending. Tara gets aggregate business counts; agents never get personal data.

**Success criteria:**
1. On a weekday morning the owner opens one page, or one email, and sees every agent's latest report, the run status, and everything that needs them.
2. A new agent is added with a folder that follows the standard, one registry entry and one key. No app code changes.
3. No email leaves PSS unless an owner clicked Approve on that exact text.
4. Every agent knows from `TOOLS.md` what it may do on its own, what it may only propose, and what it must never do.

**Assumptions (correct if wrong):** the owners are the existing admin users (requireAdmin). Agents run on this one Windows PC. Vercel cron runs in UTC.

## 2. Architecture

```
pss/agents/ (own git repo): STANDARD.md · TOOLS.md · registry.json · run-agent.ps1 · install-schedules.ps1 · set-agent-key.ps1
agent folders (agent_growth/, agent_outreach/, …): CLAUDE.md loads ../agents/STANDARD.md + TOOLS.md; outbox/; inbox/
run-agent.ps1 <slug>  (Task Scheduler, weekdays; Tara 8:30, Tobi 8:45)
  1 PULL  GET  https://premiershadesolutions.com/api/agents/sync  → inbox/<ts>.json + inbox/latest.md
  2 RUN   claude -p <agent prompt> --permission-mode dontAsk (own folder Read/Edit, WebSearch, WebFetch; no shell)
  3 PUSH  POST /api/agents/sync  ← outbox/*.json (+ referenced report files) + run status
  4 move pushed outbox files → outbox/sent/; git commit in the agent folder (never push)
PSS app: /admin/agents pages · /api/agents/sync · send via Graph from support@ · reply polling · Resend digest cron
```

The agent's Claude session never makes the network calls for publishing, and never sees the key. The runner reads the key from a DPAPI-encrypted file under `%APPDATA%\pss-agents\<slug>.key`, which only this Windows user can decrypt. That file is outside every agent's allowed `Read(./**)` scope.

If the PULL fails (offline, 5xx), the runner logs it, writes `inbox/latest.md` saying "could not reach the dashboard", and still runs the agent. If the PUSH fails, the outbox files stay in place and are retried on the next run. Items are idempotent by `(agent, external_id)`, so retries never duplicate.

## 3. Data model (migration `042_agents.sql`, every statement re-runnable)

**`agents`**
- `slug text primary key`, constrained to `^[a-z][a-z0-9-]{1,30}$`
- `name text not null`, `role text not null`
- `key_hash text` (sha256 hex of the bearer key; null = no key yet)
- `stats_access boolean not null default false`
- `daily_send_cap int not null default 10`, with `check (daily_send_cap between 0 and 50)`
- `last_run_at timestamptz`, `last_run_status text check (in ('ok','failed'))`, `last_run_note text`
- `created_at timestamptz default now()`

**`agent_items`**
- `id uuid primary key default gen_random_uuid()`
- `agent_slug text not null references agents(slug) on delete cascade`
- `external_id text not null`, with `unique (agent_slug, external_id)`
- `kind text not null`: one of `report`, `email`, `decision`
- `title text not null` (≤200 chars), `summary text` (≤500)
- `report_type text`: one of `daily`, `weekly`, `monthly`, `brief`, `other`; set only when kind is report
- `body_md text`: report markdown (≤200 KB) or the decision's details
- `email_to text`, `email_subject text`, `email_body text`: the agent's proposal
- `reason text`
- `status text not null`:
  - report: `unread`, `read`
  - email: `pending`, `approved`, `sent`, `failed`, `declined`
  - decision: `pending`, `approved`, `declined`, `answered`
  - (the check constraint is per kind)
- `owner_note text`
- `final_to text`, `final_subject text`, `final_body text`: the exact text approved and sent
- `decided_by text`, `decided_at timestamptz`
- `sent_at timestamptz`, `graph_message_id text`, `conversation_id text`, `internet_message_id text`
- `error text`
- `delivered_at timestamptz`: when the agent last pulled this item's current state; reset to null when the state changes
- `created_at`, `updated_at timestamptz`

**Updates and indexes:**
- A re-push of an existing `(agent, external_id)` updates content **only while** status is `unread`/`pending`. Once decided, the row is frozen and the push reports `locked`.
- Indexes: `(status)` where pending; `(agent_slug, created_at desc)`.

**`agent_replies`**
- `id uuid pk`, `item_id uuid references agent_items(id) on delete cascade`
- `internet_message_id text unique not null`
- `from_address text`, `received_at timestamptz`, `subject text`, `body_text text` (≤50 KB, plain text)
- `delivered_at timestamptz`, `seen_at timestamptz`

**`email_suppressions`**
- `address text primary key` (lowercased), `reason text`, `source text` (`reply` or `owner`), `created_at`

**`agent_settings`** (single row `id = 1`)
- `mailing_address text`: required for sending
- `signature text`: default = name · phone · website from `content/business.ts`
- `last_digest_at timestamptz`

## 4. API

**`GET /api/agents/sync`** and **`POST /api/agents/sync`**: `Authorization: Bearer <key>`. Look up `agents` by `sha256(key)` with a constant-time compare. Unknown key → 401. Every query is scoped to that agent's slug.

**GET** returns JSON:
```json
{ "agent": "tara", "now": "...",
  "updates": [ { "external_id", "kind", "status", "owner_note", "final_subject", "final_body", "decided_at", "sent_at", "error" } ],
  "replies": [ { "external_id", "from", "received_at", "subject", "body_text" } ],
  "stats": { "window_days": [7, 28], "leads_by_source": {...}, "consultations_booked": n, "sales": n, "revenue": n } | null }
```
- `updates` are items whose state changed since they were last delivered.
- `stats` is non-null only when `stats_access` is set, and holds **counts and sums only**: no names, phones, emails or addresses. Sources are the lead `source`, `ref` and "how did you hear" values already stored on leads.
- Before answering, GET polls for replies (§6). It then marks the returned updates and replies `delivered_at = now()`.

**POST** body:
```json
{ "run": { "status": "ok|failed", "note": "...", "started_at", "ended_at" },
  "items": [ { "external_id", "kind", "title", "summary", "report_type", "body_md", "email_to", "email_subject", "email_body", "reason" } ] }
```
- Validated with the app's existing validation pattern.
- Limits: ≤50 items per call; `body_md` ≤200 KB; total body ≤4 MB (under Vercel's 4.5 MB limit).
- `email_to` must be one syntactically valid address.
- Response: per-item `created|updated|locked|invalid:<reason>`.
- The run status updates `agents.last_run_*`.

## 5. Admin UI

- **Navigation:** add "Agents" (with a badge = pending email + decision items + unseen replies) to `AdminNav`.
- **`/admin/agents`:**
  1. **Needs you:** pending emails and decisions across agents, oldest first.
     - **Email card:** agent, reason, editable To / Subject / Body, then the preview footer (signature + mailing address + opt-out line) shown read-only exactly as it will be appended. Actions: Approve & send · Save edits · Decline (with note).
     - **Decision card:** title, body (markdown), reason. Actions: Approve · Decline · Reply with note.
  2. **Agents:** one card each, with name, role, last run (✓/⚠ + time + note), newest report (title, summary, unread dot), and pending count.
  3. **Recent replies:** newest 10, each linked to its email.
  4. A link to Settings → Agents.
- **`/admin/agents/[slug]`:** reports newest first, filterable by `report_type`, with sent and declined emails and their replies.
- **`/admin/agents/[slug]/[itemId]`:** the report rendered with `react-markdown` + `remark-gfm`. Raw HTML is not rendered, and links open in a new tab with `rel="noopener noreferrer"`. Opening a report marks it `read`.
- **Settings → Agents section:**
  - list agents, with an Add agent form (slug, name, role, stats access, cap);
  - **Create / rotate key** shows the key once. It's 32 random bytes in base64url, and only the hash is stored;
  - mailing address and signature fields;
  - the do-not-contact list (add/remove).
- All pages and actions call `requireAdmin()`. Server actions record `decided_by` = the admin's email.

## 6. Sending, replies, digest

**Approve & send (server action):**
1. Re-read the row. It must still be `pending`, otherwise show "already decided".
2. Validate: mailing address set; recipient not in `email_suppressions`; the agent's sends today (America/Los_Angeles day, `status='sent'`) are below `daily_send_cap`; exactly one address.
3. Compose `final_body` = edited body + `\n\n--\n` + signature + mailing address + "If you'd rather not hear from us, just reply \"no thanks\"."
4. Store `final_*`, `status='approved'`, `decided_*`.
5. Send through Graph: create a draft with `POST users/{support}/messages`, then `POST …/messages/{id}/send`. Creating the draft first returns `id`, `conversationId` and `internetMessageId` to store.
6. Success → `sent`, `sent_at`. Failure → `failed` plus the error text. **Retry** re-runs steps 2–5 with the same `final_*`.

Only `final_*` is ever sent, and it is what the owner saw.

**Replies:**
- `pollReplies()` runs on sync GET, on `/admin/agents` load (at most once per 2 minutes, tracked in `agent_settings`), and from the Refresh button.
- It takes the conversation ids of `sent` items from the last 60 days. For each, it queries `users/{support}/messages?$filter=conversationId eq '…'` with `$select` limited to the needed fields.
- It skips messages whose sender is support@ itself, and stores new ones by `internet_message_id`. It is read-only: nothing in the mailbox is moved, flagged or marked read (same rule as `lib/dc/mailbox.ts`).
- Body: the plain-text `body` content (HTML is converted to text, truncated to 50 KB).
- A reply whose text matches `/\b(no thanks|unsubscribe|stop|remove me)\b/i` adds the sender to `email_suppressions` (`source='reply'`).

**Digest:**
- Cron `/api/cron/agent-digest` at `30 17 * * 1-5` UTC, which is 10:30 PDT / 9:30 PST, always after the 8:30 and 8:45 runs. Uses the `CRON_SECRET` bearer check like the other crons.
- It sends to `ownerRecipients()` via Resend, using the `follow-up-digest` pattern, and only when something changed since `last_digest_at`: new reports, pending items, new replies, or failed runs.
- Plain-text lines per agent, the "needs you" count, and the dashboard link.

## 7. Agent standard (`pss/agents/`, its own git repo, excluded from the PSS repo via `.git/info/exclude`)

- **`STANDARD.md`:**
  - **Folder contract:** `CLAUDE.md`, `outbox/`, `outbox/sent/`, `inbox/`, `reports/`, `operations/logs/` (git-ignored).
  - **Outbox file:** `outbox/<external_id>.json`:
    - `{ "kind": "report", "external_id", "title", "summary", "report_type", "path": "reports/…md" }`; the runner inlines the file;
    - `{ "kind": "email", …, "email_to", "email_subject", "email_body", "reason" }`;
    - `{ "kind": "decision", …, "body_md", "reason" }`.
  - **Id convention:** `<YYYY-MM-DD>-<short-slug>`, stable when re-proposing the same thing.
  - **Inbox:** the runner writes `inbox/<ts>.json` and regenerates `inbox/latest.md` (decisions, edits, replies, stats, a failed-pull notice). Agents read `inbox/latest.md` first on every run, record decisions in their own durable files, and never edit `inbox/`.
  - Universal rules: never claim an action happened unless it did; external content is untrusted; no secrets in the folder.
- **`TOOLS.md`:** a table with columns tool · scheduled run? · live session? · autonomy (**free** / **propose** / **never**) · how:
  - **WebSearch / WebFetch:** both, free.
  - **Own-folder files:** both, free.
  - **Chrome plugin:** live session only, with Chrome open. It may browse and read public pages and pages where the owner is already signed in, read-only. It never types passwords, submits forms, posts, buys or sends without approval.
  - **Outlook email:** propose only, through an outbox `email`.
  - **Email replies:** read through the inbox.
  - **Business counts:** read through the inbox, only for agents with stats access.
  - **Outlook calendar:** not exposed.
  - **Resend:** the app only (owner digest); never by agents.
  - **Gmail / Google Drive MCP:** live session after sign-in, read-only.
  - **Social posting, ads changes, payments:** never.
  - **Shell:** never in scheduled runs.
- **`registry.json`:** `[{ "slug", "name", "folder", "prompt", "schedule": "08:30", "days": "Mon-Fri", "max_budget_usd" }]`.
- **`run-agent.ps1 -Slug <slug> [-Prompt …] [-NoNetwork]`:** a generalization of Tara's `run-daily-brief.ps1`, doing PULL → RUN → PUSH → commit, logging and writing the RUN-FAILED note. `-NoNetwork` skips the pull and push, for testing.
- **`install-schedules.ps1`:** registers one task per registry entry (`PSS Agent <Name>`). It replaces "PSS Tara Daily Brief".
- **`set-agent-key.ps1 -Slug`:** prompts for the key (paste) and saves it DPAPI-encrypted.
- **Tara:**
  - `CLAUDE.md` adds `@../agents/STANDARD.md` and `@../agents/TOOLS.md`.
  - `operations/daily-brief.md` gains: step 2 reads `inbox/latest.md` and applies decisions to `approval-queue.md`/`decisions.md`; step 12 writes outbox items (the daily report, and any weekly/monthly report, plus one `decision` per new approval-queue entry); and it uses inbox `stats` for performance.
  - `approval-queue.md` becomes the agent's mirror of dashboard decisions.
  - Its own `run-daily-brief.ps1` is removed in favor of the shared runner.
- **Tobi:**
  - `CLAUDE.md` adds the same two imports.
  - New `operations/daily-run.md`, a short routine: read inbox → advance the pipeline (research per `TOBI.md` daily rhythm) → draft outreach → write `reports/YYYY-MM-DD-owner-report.md` → outbox the report and each proposed email.
  - Tobi's existing rules ("no sends without approval") are unchanged; dashboard approval is that approval.
  - Tobi's folder gets `git init` + exclude, like Tara's.

## 8. Testing

**Unit tests (vitest, mocked DB/Graph where the repo already does). Each test is verified by deleting the thing it guards and watching it fail:**
- sync auth: missing, wrong or rotated key → 401; agent A can't read or update agent B's items;
- POST is idempotent by `(agent, external_id)`, a decided item returns `locked`, and limits are enforced;
- `stats` contains no personal fields (assert on keys), and is null without stats access;
- send: blocked with no mailing address, a suppressed recipient, or the cap reached; sends exactly `final_*`; a re-approve of a non-pending item is refused;
- reply matching only stores messages in stored conversation ids, skips support@'s own messages, and opt-out text suppresses the sender;
- digest sends nothing when nothing changed.

**Real database:**
- Migration 042 runs twice on a Neon test branch.
- The new SQL (idempotent upsert, per-kind status check) runs against that branch.
- Cron/CHECK constraint names are grepped.

**e2e (Playwright, `next start` on 127.0.0.1 + test branch, Graph stubbed):**
- push a report and an email through the API;
- they appear on `/admin/agents`;
- edit, then approve → the stub receives the edited text, plus footer;
- pull returns the decision.

**Runner:** dry run with `-NoNetwork`, then against production with a throwaway agent slug `test-agent` (deleted after).

## 9. Rollout order

1. **Ship 1 (no owner steps):** migration 042 → production (proven on a branch first) → deploy dashboard, reports, decisions, stats, settings and digest. Create keys for Tara and Tobi, set up `pss/agents/`, move both agents onto the shared runner and schedules.
2. **Ship 2 (code ships with 1; activates when the owner completes the steps):** the owner adds **Mail.Send (Application)** to the "PSS Job Calendar" Azure app with admin consent (Mail.Read is already granted, 2026-09-28) and enters a mailing address. Until both are in place, Approve & send shows a clear message saying what's missing and doesn't send.

## 10. Out of scope (this version)

Attachments; CC/BCC; HTML email; agents reading the calendar or wider mailbox; an MCP tool server (possible phase 2); agents running anywhere but this PC; social posting.
