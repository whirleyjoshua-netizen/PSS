import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { listSharedDocuments, readFile, type JobFile } from "@/lib/admin/files";
import { db } from "@/lib/db";

/** What signing can answer. Every refusal is a plain outcome, never an exception. */
export type SignResult = "signed" | "not-found" | "invalid";

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
}): Promise<SignResult> {
  const name = input.name.trim();
  if (!name) return "invalid";

  const stored = await readFile(input.file);
  if (!stored) return "not-found";
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // One statement, so the signature and its timeline row cannot come apart. `on conflict do
  // nothing` is what makes a second submission a no-op rather than a second signature.
  await db()`
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
  return "signed";
}
