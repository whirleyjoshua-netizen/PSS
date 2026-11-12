import { getFile, readFile } from "@/lib/admin/files";
import { contentDisposition } from "@/lib/admin/uploads";
import { recordFileOpened } from "@/lib/portal/file-views";
import { requireCustomer } from "@/lib/portal/session";

const NOT_FOUND = () => new Response("Not found", { status: 404 });

/**
 * The kinds a customer may download. Documents joined photos when the project page began
 * listing shared paperwork; an owner still has to tick "share" on each file either way.
 * Anything else — now or in future — is refused by default.
 */
const DOWNLOADABLE: readonly string[] = ["photo", "document"];

/**
 * Streams a shared photo or document to the customer whose job it is. Every refusal looks
 * the same: the file must exist, be a downloadable kind, be shared, and belong to one of
 * this customer's own jobs.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { email, jobs } = await requireCustomer();
  const { fileId } = await params;

  const file = await getFile(fileId);
  if (!file || !DOWNLOADABLE.includes(file.kind) || !file.sharedAt || !jobs.some((job) => job.id === file.leadId)) {
    return NOT_FOUND();
  }
  let content;
  try {
    content = await readFile(file);
  } catch (error) {
    console.error(`Could not read customer file ${fileId}`, error);
    return NOT_FOUND();
  }
  if (!content) return NOT_FOUND();

  // The owners see on the job's Activity tab when the client first opened a document. A failure
  // here never stops the client getting their file.
  if (file.kind === "document") {
    await recordFileOpened({ leadId: file.leadId, fileName: file.name, docType: file.docType ?? null, email })
      .catch((error) => console.error(`Could not log that file ${fileId} was opened`, error));
  }

  return new Response(content.stream, {
    headers: {
      "Content-Type": content.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(file.name),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
