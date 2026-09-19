import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { listSharedDocuments, readFile, type JobFile } from "@/lib/admin/files";
import { db } from "@/lib/db";

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
});

export async function listSignatures(leadId: string): Promise<Signature[]> {
  const rows = await db()`
    select * from contract_signatures where lead_id = ${leadId} order by signed_at`;
  return rows.map((row) => toSignature(row as Record<string, unknown>));
}

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
export async function signableContracts(leadId: string): Promise<JobFile[]> {
  const documents = await listSharedDocuments(leadId);
  const rows = await db()`
    select file_id, signed_file_id from contract_signatures where lead_id = ${leadId}`;
  const spoken = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    spoken.add(row.file_id as string);
    if (row.signed_file_id) spoken.add(row.signed_file_id as string);
  }
  return documents.filter((file) => file.docType === "contract" && !spoken.has(file.id));
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
 */
export async function recordSignature(input: {
  jobId: string;
  file: JobFile;
  name: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<RecordResult> {
  const name = input.name.trim();
  if (!name) return "invalid";

  const stored = await readFile(input.file);
  if (!stored) return "not-found";
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // One statement, so the signature and its timeline row cannot come apart. `on conflict do
  // nothing` is what makes a second submission a no-op rather than a second signature.
  const inserted = await db()`
    with signed as (
      insert into contract_signatures
        (id, lead_id, file_id, signed_name, signed_email, ip, user_agent, doc_sha256)
      values (${randomUUID()}, ${input.jobId}, ${input.file.id}, ${name}, ${input.email},
              ${input.ip}, ${input.userAgent}, ${sha256})
      on conflict (file_id) do nothing
      returning *
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.email}, 'signature',
             ${`Signed "${input.file.name}" from their project page`} from signed
    )
    select * from signed`;
  return inserted.length > 0 ? "signed" : "already-signed";
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
