import { getFile, readFile } from "@/lib/admin/files";
import { requireAdmin } from "@/lib/admin/session";
import { contentDisposition } from "@/lib/admin/uploads";

/** Streams a private file to a signed-in owner. Never cached publicly. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  await requireAdmin();
  const { fileId } = await params;

  const file = await getFile(fileId);
  const content = file ? await readFile(file) : null;
  if (!file || !content) return new Response("Not found", { status: 404 });

  return new Response(content.stream, {
    headers: {
      "Content-Type": content.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(file.name),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
