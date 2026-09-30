-- Visible signatures and initials. Spec docs/superpowers/specs/2026-09-29-visible-signatures-design.md section 6.
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments or string literals.

-- Where the initials and the signature block sit on a generated PDF, written with the file.
-- Null for hand-uploaded files and anything generated before this shipped.
alter table job_files add column if not exists sign_marks jsonb;

alter table job_files drop constraint if exists job_files_sign_marks_check;
alter table job_files add constraint job_files_sign_marks_check check (
  sign_marks is null or jsonb_typeof(sign_marks) = 'object'
);

-- What the client adopted. A null method means the signature was made before adoption existed.
-- Typed initials are text. Drawn signatures and initials are private Blob pathnames.
alter table contract_signatures add column if not exists signature_method text;
alter table contract_signatures add column if not exists signed_initials text;
alter table contract_signatures add column if not exists signature_image_pathname text;
alter table contract_signatures add column if not exists initials_image_pathname text;

alter table contract_signatures drop constraint if exists contract_signatures_signature_method_check;
alter table contract_signatures add constraint contract_signatures_signature_method_check check (
  signature_method is null or signature_method in ('typed','drawn')
);

-- Each method stores only its own kind of adoption. A drawn signature always has its image.
alter table contract_signatures drop constraint if exists contract_signatures_adoption_check;
alter table contract_signatures add constraint contract_signatures_adoption_check check (
  (signature_method is null and signed_initials is null and signature_image_pathname is null and initials_image_pathname is null)
  or (signature_method = 'typed' and signature_image_pathname is null and initials_image_pathname is null)
  or (signature_method = 'drawn' and signature_image_pathname is not null and signed_initials is null)
);
