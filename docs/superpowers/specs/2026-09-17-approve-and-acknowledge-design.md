# Approve the Quote, Acknowledge the Installation — Design

**Date:** 2026-09-17
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:** Phase 2 of the customer project page. A customer can approve their quote, which moves the job to Sold; and once installed, say whether they are happy — which either completes the job or opens a service request.

This is the deferred half of `2026-09-16-customer-project-page-design.md`, which promised: *"Phase 2, specced separately: 'Approve quote' (moves the job to Sold and emails the owners) and 'Acknowledge installation'."*

## 1. Purpose

**The problem.** A customer reads their quote and then has to phone or email to say yes. The owners find out when they happen to check. At the other end, a job sits at Installed indefinitely because nobody closes it, and the owners have no idea whether the customer is actually pleased.

**The fix.** Two buttons in the status banner, each appearing only at the moment it makes sense.

**Success means:**
- A customer can accept a quote the moment they have read it, and the owners know immediately.
- The owners can say, months later, exactly who approved what and when.
- An unhappy customer produces an actionable service request, not a complaint nobody logged.
- **A customer who has just said "something is wrong" is never asked for a public review.**

## 2. Decisions made in conversation

- **Approve is an acceptance, not a nudge.** It records who approved, when, and which document they were looking at.
- **No customer-side undo.** If it is tapped by mistake, the customer calls and an owner moves the job back. A visible "unapprove" turns a commitment into a toggle.
- **Acknowledging has two answers.** Happy completes the job. Not happy opens a service request through the flow already built.
- **Not happy mutes the review email** until the owners have put it right.

## 3. What already exists, and is reused

Verified in the codebase rather than assumed:

- `setStage(id, to, actor, reason?)` writes the status change **and** its `job_events` row in one statement, taking `actor` as a plain string. So a customer-driven move is recorded honestly as the customer's own email — not disguised as an owner's click.
- `requireCustomer()` and the ownership pattern from the message and service-request paths: re-derive the caller's jobs from the session, refuse an id that is not theirs, answer identically to a job that does not exist.
- The service request form at `/project/<jobId>/service`, its email to the owners, and the job it creates.
- `setReviewOptOut(id, optOut, actor)` and its toggle in the job's Review section — the owners' existing control for muting the review request.
- `INSTALLED_STATUSES = ["installed","completed"]`, so completing a job keeps it eligible for the review email; and `PORTAL_STATUSES` includes `completed`, so the customer's page keeps working after they acknowledge.

**No migration.** An approval is a `stage` event with a body, not a new event kind, so nothing widens the `job_events_kind_check` constraint. `setStage` gains an optional body parameter — it already accepts `reason`, used only for Lost.

## 4. Approve the quote

**When it appears.** In the status banner's action slot, when the job's portal status is `quoted` **and a Quote document is shared with the customer**. No shared quote, no button: approving something they cannot read is not consent.

**What the customer sees.** The banner already offers **Review quote**. Beside it:

> **Approve this quote** — reveals: "Approving tells us to go ahead and order. We will email you to arrange the details." and a confirm button.

A `<details>` reveal, then a confirm — the same shape as the delete confirmation on the admin side, for the same reason: one tap should not commit money.

**What it does**, in one action:

1. `requireCustomer()`, then refuse a job id not among the caller's own.
2. Refuse unless the status is `quoted` and a shared Quote document exists.
3. `setStage(jobId, "sold", customerEmail, body)` where the body names the approved document: `Approved "Quote - Living room.pdf" from their project page`. One statement, so the move and its record cannot come apart.
4. Email both owners: who approved, which job, which document, and a link to it.
5. Revalidate `/project` and `/project/<jobId>`.

**What the owners see afterwards.** The job's timeline reads: *status quoted → sold, by john@example.com, "Approved …"*. Six months later that sentence answers the question on its own.

**Idempotency.** `setStage` only writes when the status actually changes (`where … and status <> ${to}`), so a double submission moves nothing and records nothing twice. A second approval returns the same success the first did.

## 5. Acknowledge the installation

**When it appears.** When the portal status is `installed`. Not on `completed` — once acknowledged, the question is answered.

**What the customer sees.** Two clearly different actions, not one button with a tick:

> **Is everything how you wanted it?**
> [ Yes, everything looks great ] [ Something is not right ]

**"Yes, everything looks great"**:
1. Ownership check as above; refuse unless the status is `installed`.
2. `setStage(jobId, "completed", customerEmail, "Confirmed the installation from their project page")`.
3. Email the owners.
4. The banner afterwards reads as complete, with no further action.

**"Something is not right"** links to the existing service request form at `/project/<jobId>/service`, carrying nothing new — the customer picks the window and describes the fault exactly as they would at any other time. On submission, in addition to today's behaviour:

- **The job's review request is muted**: `setReviewOptOut(parentJobId, true, customerEmail)`.
- The owners' notification says plainly that this came from an installation acknowledgement, so they know the customer told them something is wrong rather than reporting an unrelated fault months later.
- **The job does NOT move to `completed`.** It stays `installed` until the owners resolve it.

**Why muting matters.** The review cron emails installed customers within 14 days, skipping only jobs where `reviewRequestedAt` is set or `reviewOptOut` is ticked. Without this, a customer who reports a fault would be asked days later to leave a public review. The mute is reversible from the Review section the owners already have — untick it after the service visit and the ask goes out at a moment when the answer is likely to be a good one.

## 6. The security boundary

All three actions are customer write paths, so they follow the rules established for messages and service requests:

- `requireCustomer()` first; a job id not among the caller's jobs is refused **identically to one that does not exist**, before any database handle.
- The status precondition is checked server-side, never trusted from the page.
- `toProject()` is unchanged; no new field reaches `ProjectSummary`. The banner decides what to show from `steps` and the shared documents it already loads.
- **A customer can move a job only along the two transitions named here** — `quoted → sold` and `installed → completed`. Any other target is refused. The action never takes a status from the request.

## 7. Error handling

- A job in the wrong status: the action refuses and the page re-renders with the current state. This is what a stale tab produces, and it is not an error worth alarming anyone about.
- Email failure must not undo the stage change: the move is recorded first, the email sent after, and a failure logged — the same rule as the message path.
- Every form works with JavaScript off: `<details>` reveals and plain `<form>` posts.
- A job deleted between page load and submission refuses the same way a foreign id does.

## 8. Testing

**Unit**
- Each action refuses a job the customer does not own, writing nothing — asserted by the absence of any database statement, not only by the return value.
- Approve refuses when the status is not `quoted`, and when no Quote document is shared.
- Approve writes `sold` with the **customer's email as actor** and a body naming the document.
- Approve twice moves the job once.
- Acknowledge-happy writes `completed`; acknowledge-unhappy does **not** change the status and **does** set the review opt-out.
- The banner shows Approve only with a shared quote, and the acknowledgement only at `installed`.

**End-to-end (Neon test branch)**
- A customer approves a quote; the job reads Sold on the board, and its timeline names the customer.
- A customer confirms an installation; the job reads Completed.
- A customer reports a fault; a service job appears, the original stays `installed`, and the review opt-out is set.
- **The release gate:** a customer approving must not move any other job. Prove it by weakening the id match and watching the test fail before trusting it.

## 9. Out of scope

- Any customer-side undo.
- Approving anything other than a quote.
- Partial approval, changes requested, or comments on a quote — those are a phone call.
- Money on the customer's page. Approving references a document; it never displays a price.
- Automatically un-muting the review request. The owners untick it when the work is right, which is a judgment only they can make.
