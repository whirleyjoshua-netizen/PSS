import { get } from "@vercel/blob";
import { requireAdmin } from "@/lib/admin/session";
import { opensInline } from "@/lib/admin/resource-rules";
import { getResource } from "@/lib/admin/resources";
import { contentDisposition } from "@/lib/admin/uploads";

/**
 * Streams a Resources file to a signed-in owner. PDFs and photos open in the browser; anything else
 * downloads as plain bytes, so an uploaded web page or SVG never runs on our site.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const file = await getResource(id);
  if (!file) return new Response("Not found", { status: 404 });
  let stored: Awaited<ReturnType<typeof get>>;
  try {
    stored = await get(file.pathname, { access: "private" });
  } catch (error) {
    console.error(`Could not read resource ${id}`, error);
    return new Response("That file can't be read right now. Try again.", { status: 502 });
  }
  if (!stored || stored.statusCode !== 200) return new Response("Not found", { status: 404 });

  const inline = opensInline(file.contentType);
  const disposition = contentDisposition(file.name);
  return new Response(stored.stream, {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": inline ? disposition : disposition.replace(/^inline;/, "attachment;"),
      // The size storage reported when it was saved, so a big download shows its progress.
      "Content-Length": String(file.sizeBytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
