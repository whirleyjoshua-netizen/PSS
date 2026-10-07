# Resources categories — design

Owner request (2026-10-07): in Resources, add, rename and delete categories, and move files between them. Today a
category is only a text field on each file, so one exists only while a file uses it and there is no way to create one.

## Decisions (owner)

- Categories are their own rows: add (empty allowed), rename, delete.
- Deleting a category with files moves those files to **Uncategorized**. Uncategorized always exists, cannot be renamed
  or deleted, and is listed only when it has files.
- Upload and Move pick from the existing categories (a select). New categories come only from Add category.

## Data: migration 041

- `resource_categories (name text primary key, created_at)`: name trimmed, 1–60 chars; unique on `lower(name)`.
- Seeded with `Uncategorized` and every category files use today. Case variants ("licenses" and "Licenses") collapse to
  one spelling, and the files are updated to it first.
- `company_files.category` defaults to `'Uncategorized'` and references `resource_categories(name)`
  `on update cascade on delete set default`: a rename carries the files, a delete drops them to Uncategorized, each
  in one statement.
- Every statement re-runnable (scripts/migrate.mjs re-applies all files).

## Store and actions

- `listCategories()` → `{ name, fileCount }[]`, A–Z (case-insensitive), Uncategorized included.
- `createCategory(name)` → false if the name exists in any case. `renameCategory(from, to)` and `deleteCategory(name)`
  never touch Uncategorized (guarded in the SQL). Rename onto an existing name answers "taken" (23505).
- Actions (requireAdmin): add, rename, delete, with plain errors: "A category named X already exists.",
  "That category was deleted.", "Uncategorized can't be renamed or deleted." Upload and Move into a category deleted
  meanwhile (23503) answer "That category was deleted. Pick another."

## Page

- A **Categories** card: every category (Uncategorized only when it has files) with its file count, Rename and Delete
  (confirm: "Delete Licenses? Its 3 files move to Uncategorized." / "Delete Licenses?" when empty), and an Add field.
- Upload and Move use a select of the categories. Upload defaults to the first category.
- The file list shows every category, including empty ones ("No files yet"); Uncategorized only when it has files.
  Searching shows only matching groups, as today.

## Rollout

Migrate production first, then push. Between the two, old code can't put a file in a brand-new typed category (the
reference refuses it); everything else keeps working.

## Verification

Unit tests (store SQL text and values, actions, page). `scripts/verify-resources.ts` extended and run on a Neon test
branch, migration applied twice: add, case-duplicate refused, rename carries files, delete drops files to
Uncategorized, Uncategorized guarded, a file can't reference a missing category. Mutation checks on key tests.
