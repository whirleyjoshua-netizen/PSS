# Files on tasks — design

Owner, 2026-10-09: "I want Shade to go over Google headlines and descriptions and I want to upload the PDF so she can see it."
Approved in chat the same day: files live **both** ways — uploaded to the task, or picked from Resources.

## What people see

- **Files** section on the New task form and on the task page, with two controls:
  - **Upload files** — any type, up to 200 MB each, several at once, a progress bar per file.
  - **Add from Resources** — a searchable list of the library; picking one attaches it without a second copy.
- Each attached file: name (opens it), size, who added it, and **Remove**.
  - A file uploaded to the task opens like a Resources file: PDFs and photos in the browser, anything else downloads.
  - A linked Resources file shows "From Resources", and Remove only unlinks it.
- Board cards show "📎 2" when a task has files.
- Anyone with admin sign-in can add or remove files, as with editing a task today.
- Assignment and reminder emails list the file names under the notes. They carry the "Open the task" link, not the files: files stay private behind sign-in, and 200 MB can't be emailed.
- Resources: deleting a file that tasks link to says "It's attached to N tasks and will be removed from them." before Yes, delete.

## Data (migration 043)

`task_files`, one row per attachment:

| column | |
|---|---|
| id uuid pk | for an upload, the id in its storage path |
| task_id uuid not null → tasks(id) on delete cascade | |
| resource_id uuid → company_files(id) on delete cascade | set for a link only |
| name, content_type, size_bytes, blob_pathname | set for an upload only |
| added_by text not null, created_at timestamptz | |

Checks: exactly one kind — `resource_id` set and the four upload columns null, or `resource_id` null and all four set; name trimmed 1–200; size 1 byte–200 MB. Unique `(task_id, resource_id)` (a file is linked once), unique `blob_pathname`. Index on task_id. Every statement re-runnable.

## Uploads

- Storage path `task-files/<taskId>/<fileId>/<safe name>`. Browser → private Blob directly through a token route `/admin/tasks/upload` (admin only, that path shape only, never overwrites, 200 MB, 6-hour token), the same as Resources, so the 4.5 MB request cap never applies.
- **Task page:** after the upload, `saveTaskFileAction` checks the file with `head()` (size and type from storage, not the browser) and inserts the row. A repeat save of the same file answers ok and changes nothing. If the task was deleted meanwhile (foreign key), the upload is removed and the person is told "That task was deleted."
- **New task form:** the browser makes the task's id when the form opens. Files upload as they are picked; **Add task** waits for them. `createTaskAction` takes the id, the uploaded paths and the picked Resources ids, checks each upload with `head()`, and writes the task and all its files in **one statement**, so the assignment email lists them all. A file removed before saving is deleted from storage at once. A repeat submit of the same id answers "Task added." and sends no second email. After it's saved the form clears and makes a fresh id.
- **Left-behind uploads** (a form abandoned after picking files, a failed save): the daily tasks cron deletes any `task-files/` upload older than 24 hours that no row records.

## Removing and deleting

- Remove an upload: the row goes first, then the stored file. A file left by a failed removal is unreachable and the sweep cannot see it; it is logged.
- Remove a link: the row only.
- Delete a task: one statement deletes the task and returns its uploads' paths; then those files are deleted. Links go with the cascade.
- Delete a Resources file: its links go with the cascade.

## Opening a file

`/admin/tasks/files/<id>`, admin only. An upload streams from private Blob with the Resources route's headers (inline only for PDFs and photos, nosniff, no-store). A link redirects to `/admin/resources/<resourceId>`.

## Proof

- Unit tests for the rules, store SQL text, actions, routes, uploader, list, card count, emails, Resources warning; mutation checks on the key guards.
- `scripts/verify-task-files.ts` on a Neon branch: the checks refuse bad rows, save and link, double link refused, repeat save harmless, create-with-files in one statement, task delete returns paths and cascades, Resources delete cascades links, counts. Migrations run twice.
- Production: 043 applied and checked read-only before the push; then a real PDF uploaded and opened on the live site.
