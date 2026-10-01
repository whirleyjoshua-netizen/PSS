import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { listSharedDocuments, readFile, type JobFile } from "@/lib/admin/files";
import { db } from "@/lib/db";
import type { ClientDocKind } from "@/lib/docs/kinds";
import { parseSignMarks, type SignMarks } from "@/lib/pdf/sign-marks";
import type { Adoption } from "./adoption";

/** What signing can answer. Every refusal is a plain outcome, never an exception. */
export type SignResult = "signed" | "not-found" | "invalid";

/**
 * What recordSignature answers. "already-signed" is internal: the insert hit the unique file_id
 * and wrote nothing, so the caller must not email or stamp again. The customer is still told
 * "signed", because the contract is.
 */
export type RecordResult = SignResult | "already-signed";

export type Signature = {
  id: string;
  leadId: string;
  fileId: string;
  signedName: string;
  signedEmail: string;
  signedAt: Date;
  docSha256: string;
  signedFileId: string | null;
  /** Null for a signature made before adoption existed (spec §6). */
  signatureMethod: "typed" | "drawn" | null;
  signedInitials: string | null;
  signatureImagePathname: string | null;
  initialsImagePathname: string | null;
};

const toSignature = (row: Record<string, unknown>): Signature => ({
  id: row.id as string,
  leadId: row.lead_id as string,
  fileId: row.file_id as string,
  signedName: row.signed_name as string,
  signedEmail: row.signed_email as string,
  signedAt: row.signed_at as Date,
  docSha256: row.doc_sha256 as string,
  signedFileId: (row.signed_file_id as string | null) ?? null,
  signatureMethod: (row.signature_method as "typed" | "drawn" | null) ?? null,
  signedInitials: (row.signed_initials as string | null) ?? null,
  signatureImagePathname: (row.signature_image_pathname as string | null) ?? null,
  initialsImagePathname: (row.initials_image_pathname as string | null) ?? null,
});

/** A recorded signature plus the title of the job document it was on, null for a quote contract. */
export type ListedSignature = Signature & { documentTitle: string | null };

export async function listSignatures(leadId: string): Promise<ListedSignature[]> {
  const rows = await db()`
    select s.*, d.title as document_title
    from contract_signatures s left join job_documents d on d.file_id = s.file_id
    where s.lead_id = ${leadId} order by s.signed_at`;
  return rows.map((row) => ({
    ...toSignature(row as Record<string, unknown>),
    documentTitle: ((row as Record<string, unknown>).document_title as string | null) ?? null,
  }));
}

/**
 * A contract-typed file the customer can sign. `document` is set when it is a job document's PDF.
 * `signMarks` is where initials and the signature block belong (spec §3), null for a file without.
 */
export type SignableFile = JobFile & { document: { title: string; kind: ClientDocKind } | null; signMarks: SignMarks | null };

/**
 * The contracts this job can still be asked to sign.
 *
 * One helper, used by BOTH the page and the action, so the control the page hides and the post
 * the action refuses cannot drift apart. The page hiding a button is a convenience; the action
 * refusing is the guard.
 *
 * A signature output is excluded because it is itself a shared file with doc_type 'contract':
 * without this the page would offer to sign the signed copy, and then its copy, forever.
 */
export async function signableContracts(leadId: string): Promise<SignableFile[]> {
  const [documents, rows, jobDocuments, markRows] = await Promise.all([
    listSharedDocuments(leadId),
    db()`select file_id, signed_file_id from contract_signatures where lead_id = ${leadId}`,
    // So the portal can word a job document as a document, not a contract.
    db()`select file_id, title, kind from job_documents where lead_id = ${leadId} and file_id is not null`,
    // The file's sign marks, from the database and never from the form (spec §9).
    db()`select id, sign_marks from job_files where lead_id = ${leadId} and sign_marks is not null`,
  ]);
  const spoken = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    spoken.add(row.file_id as string);
    if (row.signed_file_id) spoken.add(row.signed_file_id as string);
  }
  const byFile = new Map((jobDocuments as Record<string, unknown>[]).map((row) =>
    [row.file_id as string, { title: row.title as string, kind: row.kind as ClientDocKind }]));
  const marks = new Map((markRows as Record<string, unknown>[]).map((row) => [row.id as string, parseSignMarks(row.sign_marks)]));
  return documents
    .filter((file) => file.docType === "contract" && !spoken.has(file.id))
    .map((file) => ({ ...file, document: byFile.get(file.id) ?? null, signMarks: marks.get(file.id) ?? null }));
}

const discardBlobs = (pathnames: (string | null)[]) =>
  Promise.all(pathnames.filter((pathname): pathname is string => pathname !== null)
    .map((pathname) => del(pathname).catch((cleanup) => console.error("Could not remove orphaned blob", cleanup))));

/**
 * Spec §6: a drawn adoption's PNGs are stored in private Blob BEFORE the signature statement, so the
 * row can name them. Answers their pathnames (both null for a typed adoption), or null when storing
 * failed. Every path a put was ATTEMPTED on is then removed, not only the confirmed ones: a put can
 * reject after the object was written (a timeout, say).
 */
async function storeAdoptionImages(jobId: string, adoption: Adoption): Promise<{ signature: string | null; initials: string | null } | null> {
  if (adoption.method === "typed") return { signature: null, initials: null };
  const id = randomUUID();
  const signature = `jobs/${jobId}/signatures/${id}-signature.png`;
  const initials = adoption.initialsPng ? `jobs/${jobId}/signatures/${id}-initials.png` : null;
  const options = { access: "private", contentType: "image/png", addRandomSuffix: false } as const;
  const attempted: string[] = [];
  try {
    attempted.push(signature);
    await put(signature, adoption.signaturePng, options);
    if (initials && adoption.initialsPng) {
      attempted.push(initials);
      await put(initials, adoption.initialsPng, options);
    }
    return { signature, initials };
  } catch (error) {
    console.error("Could not store the drawn signature", error);
    await discardBlobs(attempted);
    return null;
  }
}

/**
 * Records one signature on one contract.
 *
 * Does NOT check ownership — it trusts the caller, exactly as approveQuote does. Every caller
 * must first re-derive the customer's own jobs from the session and refuse anything else.
 *
 * The fingerprint is taken from the bytes actually served, not from anything stored alongside
 * them: it is what proves the document the owners hold is the one that was agreed to.
 *
 * The timeline body names the DOCUMENT, never the typed name. `signed_name` is stored as data
 * and nothing a customer typed reaches the owners' permanent record.
 *
 * A generated contract (a `dc_quote_versions` row in 'sent' points at this file through
 * contract_file_id) is also closed in the same statement: the version becomes 'signed', the job's
 * sold_cents becomes that version's client_total_cents (even past Sold, so a signed change order
 * updates the sold amount), and a job still at new/visit_booked/quoted/approved moves to Signed
 * with one 'stage' event (Sold waits for the paid deposit). A hand-uploaded contract matches no version, so `version` is empty and nothing
 * but the signature and its event is written, exactly as before.
 *
 * A sign job document (lib/docs/job-documents.ts) whose PDF is this file, still 'sent', becomes
 * 'completed' in the same statement. A contract or a hand-uploaded file matches no document.
 *
 * The adoption (spec §6), already validated by the caller, is written in the same insert. A drawn
 * adoption's PNGs are stored first. If the statement then writes nothing (already signed) or fails,
 * they are removed. If they cannot be stored, nothing is written and the answer is "not-found",
 * which the customer reads as "could not record, please call".
 */
export async function recordSignature(input: {
  jobId: string;
  file: JobFile;
  name: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
  adoption: Adoption;
}): Promise<RecordResult> {
  const name = input.name.trim();
  if (!name) return "invalid";

  const stored = await readFile(input.file);
  if (!stored) return "not-found";
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const images = await storeAdoptionImages(input.jobId, input.adoption);
  if (!images) return "not-found";
  const initials = input.adoption.method === "typed" ? input.adoption.initials : null;

  // One statement, so the signature, its adoption, its timeline row and the sale cannot come apart.
  // `on conflict do nothing` is what makes a second submission a no-op rather than a second
  // signature, and with `signed` empty nothing below it moves either.
  let inserted: Record<string, unknown>[];
  try {
    inserted = await db()`
      with signed as (
        insert into contract_signatures
          (id, lead_id, file_id, signed_name, signed_email, ip, user_agent, doc_sha256,
           signature_method, signed_initials, signature_image_pathname, initials_image_pathname)
        values (${randomUUID()}, ${input.jobId}, ${input.file.id}, ${name}, ${input.email},
                ${input.ip}, ${input.userAgent}, ${sha256},
                ${input.adoption.method}, ${initials}, ${images.signature}, ${images.initials})
        on conflict (file_id) do nothing
        returning *
      ),
      version as (
        update dc_quote_versions set status = 'signed', signed_at = now()
        where contract_file_id = (select file_id from signed) and lead_id = (select lead_id from signed) and status = 'sent'
        returning lead_id, version, client_total_cents
      ),
      prev as (select l.status from leads l join version v on l.id = v.lead_id),
      -- ('new','visit_booked','quoted','approved') mirrors the stages before Signed in lib/admin/stages.ts.
      -- Spec §3: signing moves the job to Signed. Sold waits for the paid deposit (lib/payments/deposits.ts).
      sold as (
        update leads set sold_cents = (select client_total_cents from version),
          status = case when status in ('new','visit_booked','quoted','approved') then 'signed' else status end,
          stage_changed_at = case when status in ('new','visit_booked','quoted','approved') then now() else stage_changed_at end,
          updated_at = now()
        where id = (select lead_id from version)
        returning id
      ),
      stage_logged as (
        insert into job_events (lead_id, actor, kind, from_status, to_status, body)
        select sold.id, ${input.email}, 'stage', prev.status, 'signed', 'Signed contract version ' || version.version
        from sold, prev, version
        where prev.status in ('new','visit_booked','quoted','approved')
      ),
      document as (
        update job_documents set status = 'completed', completed_at = now(), updated_at = now()
        where file_id = (select file_id from signed) and lead_id = (select lead_id from signed)
          and status = 'sent' and response = 'sign'
        returning id
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select lead_id, ${input.email}, 'signature',
               ${`Signed "${input.file.name}" from their project page`} from signed
      )
      select * from signed`;
  } catch (error) {
    await discardBlobs([images.signature, images.initials]);
    throw error;
  }
  if (inserted.length === 0) {
    // Already signed: this post's images belong to nothing.
    await discardBlobs([images.signature, images.initials]);
    return "already-signed";
  }
  return "signed";
}

/**
 * Stores the stamped PDF as a second job_files row, shared and typed as a contract, so it
 * reaches the customer through the file route that already exists.
 *
 * Deliberately not createFile(): that logs an "Uploaded ..." event attributed to whoever passed
 * actor, and the customer did not upload anything. One statement here, no event: the signature
 * event written in recordSignature is the record of what happened.
 *
 * The row is created only while this job's signature on the original has no stamped copy yet,
 * so a repeat call cannot leave a second, unlinked "(signed)" file on the page. Anything that
 * stops the row being written removes the stored bytes and answers null: the signature itself
 * stands regardless (spec section 6).
 */
export async function storeSignedCopy(input: {
  jobId: string;
  original: JobFile;
  bytes: Buffer;
  actor: string;
}): Promise<string | null> {
  const id = randomUUID();
  const name = input.original.name.replace(/\.pdf$/i, "") + " (signed).pdf";
  const pathname = `jobs/${input.jobId}/${id}-signed.pdf`;
  try {
    await put(pathname, input.bytes, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
    });
  } catch (error) {
    console.error("Could not store the signed copy", error);
    return null;
  }

  const discard = () =>
    del(pathname).catch((cleanup) => console.error("Could not remove orphaned blob", cleanup));
  try {
    const rows = await db()`
      with pending as (
        select id from contract_signatures
        where file_id = ${input.original.id} and lead_id = ${input.jobId}
          and signed_file_id is null
      ),
      created as (
        insert into job_files
          (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname,
           shared_at, doc_type)
        select ${id}, ${input.jobId}, ${input.actor}, 'document', ${name}, 'application/pdf',
               ${input.bytes.length}, ${pathname}, now(), 'contract'
        from pending
        returning id
      ),
      linked as (
        update contract_signatures set signed_file_id = (select id from created)
        where id in (select id from pending)
      )
      select id from created`;
    const stored = (rows[0]?.id as string | undefined) ?? null;
    if (!stored) await discard();
    return stored;
  } catch (error) {
    console.error("Could not record the signed copy", error);
    await discard();
    return null;
  }
}

export async function signatureFor(fileId: string): Promise<Signature | null> {
  const rows = await db()`select * from contract_signatures where file_id = ${fileId}`;
  return rows[0] ? toSignature(rows[0] as Record<string, unknown>) : null;
}
