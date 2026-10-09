import { get } from "@vercel/blob";
import { requireAdmin } from "@/lib/admin/session";
import { opensInline } from "@/lib/admin/resource-rules";
import { getTaskFile } from "@/lib/admin/task-files";
import { contentDisposition } from "@/lib/admin/uploads";

/**
 * Opens a task's file for a signed-in admin. A file uploaded to the task streams like a Resources file:
 * PDFs and photos open in the browser, anything else downloads as plain bytes, so an uploaded web page
 * or SVG never runs on our site. A linked Resources file opens through the library's own route.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  await requireAdmin();
  const { fileId } = await params;
  const file = await getTaskFile(fileId);
  if (!file) return new Response("Not found", { status: 404 });
  if (file.resourceId) {
    return new Response(null, { status: 303, headers: { Location: `/admin/resources/${file.resourceId}`, "Cache-Control": "private, no-store" } });
  }
  if (!file.pathname) return new Response("Not found", { status: 404 });
  let stored: Awaited<ReturnType<typeof get>>;
  try {
    stored = await get(file.pathname, { access: "private" });
  } catch (error) {
    console.error(`Could not read task file ${fileId}`, error);
    return new Response("That file can't be read right now. Try again.", { status: 502 });
  }
  if (!stored || stored.statusCode !== 200) return new Response("Not found", { status: 404 });

  const inline = opensInline(file.contentType);
  const disposition = contentDisposition(file.name);
  return new Response(stored.stream, {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": inline ? disposition : disposition.replace(/^inline;/, "attachment;"),
      "Content-Length": String(file.sizeBytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
