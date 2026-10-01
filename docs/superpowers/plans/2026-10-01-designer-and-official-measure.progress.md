# SDD ledger — plan: docs/superpowers/plans/2026-10-01-designer-and-official-measure.md

Spec: docs/superpowers/specs/2026-10-01-designer-and-official-measure-design.md
Worktree: C:/Users/whirl/pss/.claude/worktrees/measure-kinds (feat/measure-kinds), branch base 957214c (origin/main), plan commit 90324e0
All subagents dispatched with model "opus" (memory: sonnet 403s for this org).

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2 | measure-kinds exports (MeasureKind, MeasureSet, workingWindows) → measurements.ts | consistent names/types |
| T2 → T3 | addMeasurement(leadId, kind, input, actor): AddResult; setKeptOfficial → KeepResult | consistent; T2 leaves measure-actions tsc-broken until T3 (plan says so) |
| T2 → T5/T6 | WindowMeasurement.kind; getMeasureSet; listWorkingWindows | test literals lacking `kind` fail tsc until T5 (vitest does not typecheck) — accepted |
| T3 → T4 | saveMeasurement(jobId, windowId, kind, fd); setKeptOfficialAction(jobId, kept) | consistent |
| T4 → T5 | KeepOfficialBox({jobId, kept, blocked}) | consistent |
| T5 ↔ T7 | region names "Designer measure"/"Official measure", link "Add to official measure", note text | consistent with e2e |
| T6 → T7 | Neon test branch URL file | T7 reuses T6's branch |
| T1 self | tests vs code | agree |
| T2 self | update regex vs SQL text; getMeasureSet mock order (list first) | agree (checked joined template text) |
| T3 self | KEPT_REFUSAL text test vs code | agree |
| T4 self | chooser link names regex vs spans; firstParam on arrays | agree |
| T5 self | heading "Designer measure · 12"; kept note text vs formatWhen | agree |
| T7 self | `getByText("35")` count 0 on official form | DEFECT: job name contains Date.now() digits which may contain "35" → flaky |

Ruling: T7 replaces `await expect(page.getByText("35")).toHaveCount(0)` with `await expect(page.getByLabel("Width inches")).toHaveValue("")` and `await expect(page.getByLabel(/^Room/)).toHaveValue("")` — same intent (blank sheet, nothing carried over) without matching the timestamped job name — cost if wrong: one weaker assertion in e2e.

## Progress
Env: C: drive full (463 MB free). npm ci failed ENOSPC. node_modules is a JUNCTION to ../deposit-flow/node_modules (same package-lock, verified cmp). Never rm/reinstall node_modules here — deleting through the junction would wipe deposit-flow's. next build (Task 7) needs space — may need owner to free disk.
Task 1: implemented 017774f (base 90324e0), under review
Task 1: complete (commits 90324e0..017774f, review clean)
Task 1: minor (deferred): MEASURE_KIND_LABEL strings unpinned by a test
Task 1: minor (deferred): kept+official rows → officialWindows/workingWindows ignore official rows (spec "kept wins"); T5 tab must still show them (plan T5 test covers)
Task 1: minor (deferred): workingSource recomputes instead of reusing workingWindows
Task 2: base 017774f, dispatching
Ruling: T2 test "never changes a window's kind on edit" narrowed to the update's set-list (plan regex also matched photo `kind = 'photo'`) — plan defect, intent preserved — cost if wrong: weaker tripwire on edit kind.
Ruling: T2 test "ticks only when no official window exists" gained an assertion that the guard sits in the update's where clause (plan's test passed with guard deleted) — strengthens power — cost if wrong: none.
Note for T4/T5 dispatch: tsc errors also in tests/admin/job-files-share.test.tsx and tests/admin/measure-form.test.tsx (literals lack kind) — assign to T5 (job-files-share) and T4 (measure-form).
Task 2: review → Needs fixes: 2 Important (plan-mandated test gaps: add-refusal `from allowed` routing unpinned; no-op `<> kept` guard unpinned)
Task 2: minor (deferred): simultaneous double-untick loser returns "has-official" instead of "unchanged" (message only, no write)
Task 2: minor (deferred): getMeasureSet missing-lead row untested
Task 2: minor (deferred): edit wording pinned by fragments — Task 6 real-DB should read an edit event back whole
Task 2: minor (deferred): full suite prints pool-timer stack traces (noise) — trace at final review
Task 2: fix round 1/5 (2 addressed, 0 open; commits f0104bd..de7c616)
Task 2: complete (commits 017774f..de7c616, review clean)
Task 3: base de7c616, dispatching
Task 3: complete (commits de7c616..ebe4eae, review clean)
Task 3: minor (deferred): setKeptOfficialAction doesn't revalidate /admin (nothing there reads kept today)
Task 3: minor (deferred): edit with invalid kind refused although kind is ignored on edit (harmless)
Task 3: minor (deferred): missing-job refusal returns no values (pre-existing behaviour)
Task 4: base ebe4eae, dispatching
Task 4: complete (commits ebe4eae..0af26af, review clean)
Task 4: minor (deferred): KeepOfficialBox shows duplicate message (static + alert) after a refusal; alert has no error colour
Task 4: minor (deferred): possible optimistic flicker after successful tick (router.refresh not awaited) — check in e2e
Task 4: minor (deferred): no test asserts box snaps back unchecked after refusal
Task 5: base 0af26af, dispatching
Task 5: implementer stopped uncommitted — full-suite run killed by host low-memory (8GB box, ~550MB free; orphan vitest from 09:48 killed by controller).
Ruling: accept T5's extra OverviewTab `allWindows` prop (page passes all windows) — without it designer window photos appear as general photos on Overview once an official measure exists; spec says job-files photo grouping uses all windows — cost if wrong: one extra prop.
Ruling: T5 tab-count assertion changed to exact match (brief's toHaveTextContent("4") also matched "14") — strengthens power — cost if wrong: none.
Task 5: complete (commits 0af26af..212173a, review clean)
Task 5: minor (deferred): kept line reads "by <email> <date>." — email and date run together; add ", " (spec shows parenthetical) — fix in final wave
Task 5: minor (deferred): repeated window literals in job-page-layout/overview-tab tests
TRAP (memory pss-local-verification-quirks): Turbopack refuses junctioned node_modules → Task 7 next build needs real `npm ci` (needs disk). `git worktree remove --force` FOLLOWS the junction and deletes deposit-flow's node_modules/.bin — before removing this worktree, `cmd /c rmdir node_modules` (removes the junction only).
Owner OK required per run for Neon branch creation (memory). Task 6 split: Steps 1-2 now; Step 3 (branch + migrate twice + verify script) after owner OK.
Task 6: base 212173a, dispatching steps 1-2
Task 6: implemented a7e6158 (steps 1, 2, 4) — NOT yet task-reviewed; step 3 (Neon branch, migrate twice, run verify script) NOT run.

## HANDOFF 2026-10-01 — moved to a new computer (old one out of disk/RAM)

Resume on the new machine:
1. `git fetch origin && git worktree add .claude/worktrees/measure-kinds feat/measure-kinds`
2. In that worktree run a real `npm ci` (do NOT junction node_modules — Turbopack refuses it).
3. Copy this file to `.superpowers/sdd/2026-10-01-designer-and-official-measure/progress.md` and continue SDD from "Task 6".
4. Next: task review of Task 6 (base 212173a..a7e6158; implementer report was on the old machine, so the reviewer works from the diff); then Task 6 step 3 with the owner's OK for a Neon branch (project misty-fire-51038688; never print URLs; refuse ep-cold-term); then Task 7 (e2e — apply the ruling above, and add a "Designer measure" click after "Add measurement" in the existing photo test); then Task 8 (final review; fix wave incl. deferred minors; owner OK; prod migrate 031; push to main = auto-deploy).
Migration 031 is claimed by this branch and applied NOWHERE yet.
