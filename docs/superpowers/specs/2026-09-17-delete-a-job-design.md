# Deleting a Job — Design

**Date:** 2026-09-17
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:** An owner can permanently delete a job from the job page's "More actions" menu. The row and everything that belongs to it go, including the files in Blob storage.

## 1. Purpose

**The problem.** Nothing in the app deletes a job. A duplicate, a test case, a wrong-number lead or a job entered against the wrong customer stays on the board forever. "Mark lost" hides it from the working columns but the record remains, which is right for a real lost job and wrong for one that should never have existed.

**The fix.** A Delete item in the job page's `•••` menu that removes the job completely.

**Success means:**
- An owner can remove a junk job in a few taps, from the page they are already on.
- Nothing survives it: no rows, no orphaned files in storage, no cost.
- It is hard to do by accident, and impossible to do to the wrong job without seeing that job's name first.

## 2. Decisions made in conversation

- **Hard delete, not archive.** The owner asked to "completely delete"; the record is destroyed, not hidden. "Mark lost" remains for the case where the history matters.
- **A job with a service request attached is refused**, not cascaded. A service call is separate work that may already be scheduled; deleting it silently is how someone ends up driving to a house whose job no longer exists. The owner deletes the service job first if they mean to.
- **Blobs are removed.** Leaving a customer's quotes and photos in storage after their job is deleted costs money and keeps paperwork nobody can reach.
- **The confirmation names the customer.** Two taps is what a single file gets. A job carries its quote, measurements, photos and whole history, so the owner must see whose job they are destroying before it happens.

## 3. What a job owns

Verified against the migrations. Most of it cleans itself up:

| Table | Behaviour | Note |
|---|---|---|
| `job_events` | `on delete cascade` | the whole history |
| `job_files` | `on delete cascade` | rows only — **the blobs do not cascade** |
| `window_measurements` | `on delete cascade` | |
| `appointments` | `on delete cascade` | and `route_stops` cascade from those |
| `job_calendar_events` (007) | `on delete cascade` | rows only — **the Outlook event does not cascade**, see below |
| `install_quotes` (018) | `on delete cascade` | |
| `leads.referred_by` | `on delete set null` | a referred friend keeps their record |
| `leads.parent_job_id` | **no rule — refuses** | this is what blocks a job with a service child |

**Three things the database does not handle:**

1. **The Blob objects** — `job_files` rows cascade, the stored bytes do not.
2. **The Outlook calendar event** — `job_calendar_events` cascades too, and its `event_id` is the only record anywhere of which event on the owners' shared mailbox belongs to this job. Once the row is gone no cron can find the orphan, because every branch of `reconcileTargets` joins `leads`. So a job deleted with a confirmed appointment would leave a phantom install on the calendar forever — the exact harm this spec warns about. The event ids are read before the delete for the same reason as the pathnames.
3. **The customer's portal access** — covered below.

*(This section originally claimed only two. The whole-branch review found the calendar event and was right; the correction is recorded rather than quietly overwritten.)*

## 4. Behaviour

`deleteJob(id, actor)` in `lib/admin/jobs.ts`:

1. `requireAdmin()` first, as every admin action does.
2. Refuse if the job has any child: `select id from leads where parent_job_id = $1`. Returns a named outcome so the UI can say *"This job has a service request against it. Delete that first."* — never a raw database error.
3. Read the job's file pathnames (`blob_pathname`) **and its Outlook event ids** (`job_calendar_events.event_id`) **before** deleting the row, because both tables cascade away with it and afterwards nothing records which objects or which calendar events belonged to the job.
4. `delete from leads where id = $1` — one statement; the cascades do the rest.
5. Remove each blob, after the row is gone, each in its own try/catch. **A blob that fails to delete must not fail the operation or roll anything back**: the job is already gone, and an unreachable orphaned file is a smaller problem than a half-deleted job. Log what could not be removed.
6. `revalidatePath` the board and redirect there — the job page no longer exists.

**Order matters and is deliberate:** the child check precedes everything, the pathnames are read before the delete, and the blobs go after. A blob removed before a failed delete would leave a live job whose files are gone.

### Outcomes

| Outcome | What the owner sees |
|---|---|
| deleted | back on the board, with the job gone |
| has a service request | the job page, with an explanation naming what to do |
| already gone | back on the board — someone else deleted it; not an error |

## 5. The UI

In `app/admin/jobs/[id]/JobHeader.tsx`'s `•••` panel, **below a rule, under everything else** — the reversible actions stay at the top and the irreversible one sits apart.

The confirmation names the job. A `<details>`-based reveal in the existing style:

> **Delete this job** — Deleting removes Maria Alvarez, PSS-1002, and everything on it: the quote, measurements, photos, documents and history. This cannot be undone.
> [ Delete this job permanently ]

The button uses the repo's existing two-tap `DeleteButton` pattern, so the sequence is: open the menu, expand Delete, read the name, tap, tap again. No single stray tap can destroy a job, and the customer's name is on screen before the last tap.

Works with JavaScript off: the reveal is `<details>`, the action a plain `<form>` post. The two-tap confirm degrades to a single submit without JS, which is acceptable because the reveal and the named warning are still required first.

## 6. Error handling

- A job that no longer exists is not an error — the owner wanted it gone and it is gone.
- A blob that cannot be removed is logged and the deletion still succeeds.
- The child-job refusal is a normal outcome with plain-language copy, never a stack trace.
- Only an authenticated owner can call it; an unauthenticated request is refused exactly as every other admin action refuses.

## 7. Testing

**Unit**
- Refuses without an admin session.
- Refuses a job that has a service child, and **writes nothing** — assert the delete statement never ran.
- Deletes the row in a single statement, with the id bound.
- Reads the file pathnames **before** the delete, not after.
- A rejected blob removal still reports success, and logs.
- A missing job reports "already gone" rather than an error.

**End-to-end (Neon test branch)**
- An owner deletes a job from the menu: it disappears from the board, its events and measurements are gone from the database, and the job page 404s.
- A job with a service request cannot be deleted, and the explanation names the reason.
- **The release gate:** deleting a job must not touch any other job. Create two jobs with files and events, delete one, and assert the other's rows and files are untouched — and watch that assertion fail with the `where id` clause loosened, before trusting it.

## 8. Out of scope

- Undo, a trash bin, or a restore window. The owner asked for deletion.
- Bulk delete from the board.
- Deleting a customer's portal account. If the deleted job was their only one, their link simply shows nothing — which is correct, since they have no projects.
- Any change to "Mark lost", which remains the right tool for a real lost job.
