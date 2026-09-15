# Team and "Assigned to" — Design

**Date:** 2026-09-15
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:**
- A simple team list in Settings: a name plus a Designer or Installer tag.
- Each job (case) has one "Assigned to" person, chosen from that list.

This builds on the Completed stage and the All jobs list, which are live.

## 1. Purpose

**The problem.** The owners (Joshua and Shade) share every job. As more people join, they need to see at a glance who is responsible for each case.

**The fix.** A team list the owners manage themselves, and one "Assigned to" per job, shown on the job page, the board and the job list.

**Success means:**
- In Settings, either owner adds "Shade — Designer" in one step and can remove a person.
- On a job, picking a person from "Assigned to" saves immediately and is logged in the activity feed.
- Board cards and the All jobs list show who each job is assigned to.

## 2. Decisions made in conversation

- **Team members are names only.** Adding someone never grants sign-in. Who can sign in stays controlled by `ADMIN_EMAILS`, unchanged.
- **One person per job.** The owners reassign as the job moves along.
- **Tags:** Designer or Installer, exactly one per person.
- **Keep it simple:** add and remove only. No rename or edit (remove and re-add instead), no notifications, no filtering by person.

## 3. Data

Migration `db/migrations/013_team.sql`, idempotent, following the migrate.mjs rules (whole-line `--` comments, no `;` inside comments):

1. `create table if not exists team_members (id uuid primary key default gen_random_uuid(), name text not null, role text not null, created_at timestamptz not null default now())`.
2. Drop and re-add `team_members_role_check`: `role in ('designer','installer')`.
3. Drop and re-add `team_members_name_check`: `length(trim(name)) between 1 and 60`.
4. `alter table leads add column if not exists assigned_to uuid references team_members(id) on delete set null`.

Removing a person therefore unassigns their jobs automatically. Activity entries keep the old text.

## 4. The team (lib/admin/team.ts, Settings)

**Module `lib/admin/team.ts`** (server-only):
- `type TeamRole = "designer" | "installer"`, `TEAM_ROLES` with labels `Designer`, `Installer`, and `roleLabel(role)`.
- `type TeamMember = { id: string; name: string; role: TeamRole }`.
- `listTeam(): Promise<TeamMember[]>`, ordered by name (case-insensitive).
- `addTeamMember(name, role): Promise<string>` returns the new id.
- `removeTeamMember(id): Promise<boolean>`, false for a non-UUID or a missing id.

**Validation (zod, in lib/admin/schema.ts):** the name is trimmed and 1–60 characters ("Enter a name", "Keep the name under 60 characters"). The role must be designer or installer ("Pick Designer or Installer").

**Server actions (app/admin/settings/actions.ts):** `addMember(prev, formData)` and `removeMember(id)`. Each calls `requireAdmin()` before reading input and revalidates `/admin/settings` and `/admin`.

**Settings page:** a new "Team" section above Outlook calendar.
- A list of people, each shown as "Name — Designer" with a **Remove** button.
- Under the list, text says: "Removing someone leaves their jobs unassigned."
- An empty list says "No one added yet."
- An add form has a Name input, a Designer/Installer select (label "Role") and an **Add** button.
  - Validation errors show inline, and the typed name stays.
  - After a successful add, the form clears.

## 5. Assigning a job

**Data:**
- `Job` gains `assignedTo: string | null`, `assignedName: string | null` and `assignedRole: TeamRole | null`.
- `JOB_COLUMNS` selects `assigned_to` plus the member's name and role through a correlated subquery, keeping `from leads` unchanged for every existing query.

**`assignJob(id, memberId | null, actor)`** in lib/admin/jobs.ts:
- It sets `assigned_to` and `updated_at` and logs an `edit` event in the same statement.
- The event body is "Assigned to Shade (Designer)", or "Unassigned".
- It returns false when the job does not exist, when the member id is not a current team member, or when the value is unchanged. Nothing is logged in those cases.

**Server action `assignJob(jobId, formData)`** in app/admin/jobs/actions.ts:
- It calls `requireAdmin()` first.
- It reads `assignedTo` from the form, where "" means Unassigned.
- It refreshes the job page and the board as the other job actions do.

**Control (`AssignControl`, client component):**
- A select labelled "Assigned to" with "Unassigned" first, then each member as "Name — Designer".
- It submits its form on change (the same pattern as the job list's `SubmitOnChange`), with a visually hidden **Save** button for no-JS.
- It appears on the job page header, under the name/city line, and in the board's side panel (`JobPanel`).
- When the team is empty, it shows "Add people in Settings" linking to `/admin/settings` instead of a select.

## 6. Where it shows

- **Board card (`JobCard`):** when assigned, a line reading "Shade · Designer" under the city.
- **All jobs list (`JobList`):** a new "Assigned to" column after City, showing "Shade · Designer" or "—".
- **Job page and side panel:** the `AssignControl` above.
- Customers never see any of this. The portal is unchanged.

## 7. Error handling

- A remove action for a person who is already gone does nothing and just refreshes.
- Assigning to an id that is no longer a team member returns "That person is no longer on the team." and leaves the job unchanged.
- Adding or assigning on a missing job gives the existing "That job no longer exists." message.

## 8. Testing

**Unit (Vitest)**
- The migration parses under migrate.mjs rules, is re-runnable, and has the role list, the name check and `on delete set null`.
- `team.ts`: list order, add and remove SQL, and UUID guarding.
- Schema validation messages.
- The settings actions require admin first and validate input.
- The Settings Team section: the list, the empty state, add-form errors, and a Remove button per person.
- `assignJob`: sets the column, logs the exact event body, refuses an unknown member, and does not log a no-op.
- The job action requires admin first; "" unassigns.
- `toJob` maps the assigned fields.
- `AssignControl`: the options' order and labels, the selected value, and the empty-team link.
- The board card and the list show the assignee.

**End-to-end (Neon test branch, production build, desktop)**
- Add "E2E Team Designer" in Settings, assign a job to them on the job page, see "E2E Team Designer · Designer" on the board card, then remove them and see the job show "Unassigned".

## 9. Out of scope

- Sign-in for team members.
- Notifications to the assignee.
- Filtering the board or list by person.
- Renaming or re-tagging a person.
- More than one assignee per job.
