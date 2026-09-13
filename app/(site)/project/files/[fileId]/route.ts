import { getFile, readFile } from "@/lib/admin/files";
import { contentDisposition } from "@/lib/admin/uploads";
import { requireCustomer } from "@/lib/portal/session";

const NOT_FOUND = () => new Response("Not found", { status: 404 });

/** Streams a shared photo to the customer whose job it is. Every refusal looks the same. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { jobs } = await requireCustomer();
  const { fileId } = await params;

  const file = await getFile(fileId);
  if (!file || file.kind !== "photo" || !file.sharedAt || !jobs.some((job) => job.id === file.leadId)) {
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

  return new Response(content.stream, {
    headers: {
      "Content-Type": content.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(file.name),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
