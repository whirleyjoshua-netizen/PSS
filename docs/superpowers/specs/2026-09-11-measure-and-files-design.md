# Measure and Job Files — Design

**Date:** 2026-09-11
**Status:** Approved in conversation, pending spec review
**Scope:** An iPhone-first measuring screen for each job and a Files section on the job page, inside the existing owner-only `/admin` area. Nothing here is visible to customers.

## 1. Purpose

At the in-home visit, the owner measures every window on a phone: room, label, width, height, optional depth, mount, special requirements, notes, and a photo. Everything saves to that job's files as it is entered. Anyone signed in to the tracker opens the project and sees the measurement sheet and any other uploaded files; there is no handoff step.

Success means: one window takes under a minute to record one-handed, a photo uploads over ordinary cell signal, and the job page shows every window and file for the project in one place.

## 2. Approach

Built inside the existing Next.js admin area, reusing its sign-in, job pages, and Neon database. Photos and uploaded documents go into a new private Vercel Blob store; their metadata lives in Postgres.

Rejected: storing photos in Postgres (bloats and slows the database), and a third-party measuring app (monthly cost, and it would not feed the job pages or the future client portal).

## 3. The Files section — on `/admin/jobs/[id]`

- A **Files** section on the job page, newest first, with two parts:
  - **Measurements:** one row per window, grouped by room in entry order, showing label, width × height, depth if set, mount, special requirements, notes, and a photo thumbnail that opens the full photo. Each row has Edit and Delete.
  - **Uploads:** every other file, with name, type, size, uploader, and date. Each opens in a new tab and has Delete.
- A **Measure** button opens the measuring screen.
- An **Upload file** button accepts PDF, JPG, and PNG up to 20 MB.

## 4. The measuring screen — `/admin/jobs/[id]/measure`

Designed for an iPhone held in one hand. One form per window:

1. **Room:** quick-pick buttons (Living room, Family room, Kitchen, Dining room, Primary bedroom, Bedroom, Bathroom, Office, Patio) or free text. Pre-filled with the previous window's room.
2. **Label:** free text, e.g. "Left of fireplace". Optional.
3. **Width** and **Height:** whole inches plus an eighths picker (0, ⅛, ¼, ⅜, ½, ⅝, ¾, ⅞). Required.
4. **Depth:** same input, optional.
5. **Mount:** Inside or Outside. Required.
6. **Special requirements:** toggles for Hard surface and High ladder.
7. **Notes:** free text, optional.
8. **Photo:** opens the camera (`accept="image/*"`, `capture="environment"`). Optional.
9. **Save and next window:** saves, confirms, and clears the form except Room.

Keyboard dictation works in every text field. **Finish** returns to the job page. Finishing does not change the job's stage.

A window is edited from the Files section, which opens the same form filled in at `/admin/jobs/[id]/measure/[windowId]`.

## 5. Data

Migration `003_measure_and_files.sql`, safe to re-run (the migrate script re-applies every file and splits on `;`):

**`job_files`**: `id uuid pk default gen_random_uuid()`, `lead_id uuid not null references leads on delete cascade`, `created_at timestamptz not null default now()`, `uploaded_by text not null`, `kind text not null check (kind in ('photo','document'))`, `name text not null`, `content_type text not null`, `size_bytes integer not null`, `blob_pathname text not null`. Index on `(lead_id, created_at desc)`.

**`window_measurements`**: `id uuid pk default gen_random_uuid()`, `lead_id uuid not null references leads on delete cascade`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `measured_by text not null`, `position integer not null`, `room text not null`, `label text`, `width_eighths integer not null check (width_eighths > 0)`, `height_eighths integer not null check (height_eighths > 0)`, `depth_eighths integer check (depth_eighths > 0)`, `mount text not null check (mount in ('inside','outside'))`, `requirements text[] not null default '{}'`, `notes text`, `photo_file_id uuid references job_files on delete set null`. Index on `(lead_id, position)`.

**`job_events`**: the `kind` check constraint is widened to `('stage','note','edit','measure','file')`.

**Units.** Dimensions are stored as integer eighths of an inch (35 ⅝″ = 285) so there is no floating-point rounding, and are always shown as whole inches plus a reduced fraction. The largest accepted value is 600 inches.

**Special requirements** are a fixed list in code, like the brands list: `hard_surface` (Hard surface) and `high_ladder` (High ladder). The database stores the values; adding one later is a one-line code change.

## 6. Storage

- A private Vercel Blob store connected to the project, which provides `BLOB_READ_WRITE_TOKEN`.
- Files are stored at `jobs/<leadId>/<fileId>-<safe-name>` with `access: 'private'`. No file is ever public.
- **Viewing:** `GET /admin/files/[fileId]` calls `requireAdmin()`, looks up the file row, streams the blob with its content type, and sends `Cache-Control: private, no-store` and `Content-Disposition: inline`.
- **Uploading:** `POST /admin/jobs/[id]/files`, a Route Handler that accepts one multipart file. It calls `requireAdmin()` first, validates the job id, type, and size, writes the blob, then inserts the `job_files` row and its event. Uploads do not use Server Actions, whose default 1 MB body limit is too small.
- **Photos** are resized in the browser before upload (longest side 2000 px, JPEG quality 0.8), which also turns an iPhone HEIC photo into JPEG.
- **Limits:** photos up to 10 MB after resizing; documents (PDF, JPG, PNG) up to 20 MB. Anything else is refused with a message naming the allowed types.
- **Deleting** a file deletes the blob and the row. Deleting a window that has a photo deletes its photo too.

## 7. Activity log

Adding, editing, or deleting a window writes a `measure` event, e.g. "Added window: Kitchen, left of sink" or "Deleted window: Office". Uploading or deleting a file writes a `file` event, e.g. "Uploaded Quote.pdf". Each records the actor's email, like every other event.

## 8. Access

Every page, Server Action, and Route Handler in this feature calls `requireAdmin()` before reading input or data, exactly as the rest of `/admin` does. File URLs are useless without a valid owner session.

## 9. Errors

- A save or upload that fails shows an inline message and keeps what was typed, so the owner can retry on better signal.
- A missing job or window shows the admin not-found page.
- A wrong file type or an oversized file is refused before upload, with the reason.
- A file whose blob is missing returns 404 rather than an error page.

## 10. Testing

- **Unit:** eighths parsing and formatting; the measurement schema (required fields, mount, requirements list, 600-inch cap); upload validation (type and size); every Route Handler and action rejects a request without a session; file rows map correctly.
- **E2E**, against a Neon branch with a Blob store: measure a window with a photo, see it in Files, open the photo, edit the window, delete it and its photo.

## 11. Out of scope

A printable or PDF measurement sheet; customers seeing their files (that comes with the client project page); offline capture; automatic checks between readings; multiple readings per window.
