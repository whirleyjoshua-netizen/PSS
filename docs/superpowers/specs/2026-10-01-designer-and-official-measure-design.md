# Designer measure and Official measure — design

Date: 2026-10-01 · Branch: `feat/measure-kinds` · Migration: **031** (claimed)

## Why

A job is measured twice in real life: the designer measures at the consult to build the quote, and
an official measure later gives the exact numbers that are ordered. Today a job holds one untyped
list of windows, so nobody can tell which numbers are which. Sometimes the designer is confident
enough that their measure *is* the official one, and a second trip is wasted.

## What the owner decided (2026-10-01)

| Question | Decision |
|---|---|
| First screen of the Measure app | Two choices: **Designer measure** or **Official measure** |
| What the official measure starts from | **A blank sheet, nothing shown.** The measurer works fast and in flow; designer numbers would only slow them down. |
| Comparing designer vs official | **No comparison.** The Measurements tab shows the two lists separately; nothing is flagged, the quote is never touched. |
| Existing measurements | None in the system. The column defaults to Designer. (Read-only check on prod before migrating, in case one appears.) |
| "Keep as official measure" | A checkbox on the designer measure screen **and** on the Measurements tab. Ticking it only records the fact and adds an Activity entry; the job stage does not move. |

## Model

- `window_measurements.kind text not null default 'designer'`, CHECK `kind in ('designer','official')`.
- `leads.designer_kept_official_at timestamptz null` and `leads.designer_kept_official_by text null`.
  Set means "this job's official measure is its designer measure". No rows are copied: there is one
  set of numbers, and unticking restores the job exactly.
- Positions stay per job (the existing `max(position)+1`), and lists are filtered by kind, so order
  within each list is unchanged.

### The two rules that keep a job to one official list

1. **Ticking "Keep as official" is refused while the job has any official windows.** The box is
   disabled with "An official measure is already recorded."
2. **Adding an official window is refused while the box is ticked.** The Official choice reads
   "Using designer measure — untick to measure separately."

Both are enforced inside the writing SQL statement (single CTE, per `createFile` precedent), not only
in the UI, so two people at once cannot break them.

### Which list each reader uses

`officialWindows(job, all)` = designer windows if kept, else official windows.
`workingWindows(job, all)` = `officialWindows` if it is non-empty, else designer windows.

| Reader | Uses |
|---|---|
| Install calculator "Fill from measurements" | `workingWindows` |
| Customer service request window picker (installed jobs) | `workingWindows` |
| Job tab badge, Overview "Measurements" card count | `workingWindows`, card says "official" or "designer" |
| Measure page "N windows so far", room prefill | the list being measured (by kind) |
| Job files' window-photo grouping | all windows (photos of both kinds are still window photos) |
| Portal "Measurements" step (`lastMeasuredAt`) | unchanged — any window; that step is the consult measure |
| Portal "Final Measure" step | unchanged — the Official measure stage date |

## Screens

**`/admin/jobs/[id]/measure`** (no `kind`): chooser. Two large buttons, each with its count:
"Designer measure · 12 windows" and "Official measure · 0 windows" (or "Using designer measure" when
kept). Overview and Measurements-tab "Add measurement" links point here.

**`/admin/jobs/[id]/measure?kind=designer|official`**: today's measure screen, heading "Designer
measure" / "Official measure", count and room prefill from that kind only. The designer screen has
the "Keep as official measure" checkbox beside Finish. An invalid `kind` shows the chooser.
`?kind=official` on a kept job shows the chooser's explanation instead of the form.

**Edit window** (`measure/[windowId]`): unchanged except the heading names the window's kind. Edits
never change a window's kind.

**Measurements tab**: two sections, "Designer measure · N" and "Official measure · N", each with the
current table and its own "Add" link (to `?kind=…`). The designer section carries the checkbox. When
kept, the official section shows "Using the designer measure (kept as official by <email>, <date>)"
instead of a table.

## Server

- `saveMeasurement(jobId, windowId, kind, formData)`: `kind` validated against the two values;
  ignored on edit. `addMeasurement(leadId, kind, input, actor)` inserts only when the job exists and
  (`kind = 'designer'` or the job is not kept) — returns a distinct "kept" refusal so the form can say
  "This job is using the designer measure as official."
- `setDesignerKeptOfficial(jobId, kept)`: one CTE — update `leads` only if no official windows exist
  (when ticking), plus a `job_events` row of kind `'measure'` (already allowed by
  `job_events_kind_check`): "Designer measure kept as official" / "Designer measure no longer kept as
  official". No-op (no event) when the value is already what was asked.
- Activity wording for windows adds the kind: "Added 3 windows (official): Den".

## Not doing (YAGNI)

No comparison or "differs" flags; no quote re-pricing; no stage automation; no per-measure header
table; no change to the Home Depot import, which does not read measurements.

## Testing

- Migration 031 run **twice** on a Neon test branch; the CHECK and defaults verified on real rows.
- New SQL (both refusal rules, the tick CTE) run against the branch, not only mocked.
- Unit: `officialWindows`/`workingWindows`; each power-tested by deleting the rule and watching it fail.
- Component: chooser counts and kept wording; tab sections; checkbox disabled state.
- E2E (`next start` on 127.0.0.1 + test branch): choose Designer, measure, tick "Keep as official",
  see the Official section say so, Official choice refuses; untick, measure Official, Fill from
  measurements uses the official windows. Existing measure e2e updated for the chooser step.
- Production: claim 031, verify target, migrate, read-only verify, then push (push deploys).
