import { getJob, isUuid } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { isDocResponse } from "@/lib/docs/kinds";
import { parseDocText } from "@/lib/docs/parse";
import { buildDocumentPdf } from "@/lib/docs/pdf";
import { BODY_MAX } from "@/lib/docs/validate";
import { formatProjectNo } from "@/lib/portal/project-no";

const SAMPLE_CLIENT = { name: "Client name", address: "Street address", city: "City", email: "client@example.com" };

/**
 * The editor's Preview PDF: renders the posted, unsaved text with the real PDF renderer. A route
 * handler, not a Server Action, because the answer is a PDF opened in a new tab. Nothing is stored.
 */
export async function POST(request: Request) {
  await requireAdmin();
  const form = await request.formData();
  const field = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  const body = field("body");
  if (body.length > BODY_MAX) return new Response("The text is too long to preview.", { status: 413 });
  const jobId = field("jobId");
  const job = isUuid(jobId) ? await getJob(jobId) : null;
  const response = field("response");
  const pdf = await buildDocumentPdf({
    title: field("title").trim() || "Untitled document",
    projectNo: job ? formatProjectNo(job.projectNo) : null,
    date: new Date(),
    client: job ? { name: job.name, address: job.address, city: job.city, email: job.email } : SAMPLE_CLIENT,
    blocks: parseDocText(body),
    response: isDocResponse(response) ? response : "view",
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="preview.pdf"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
