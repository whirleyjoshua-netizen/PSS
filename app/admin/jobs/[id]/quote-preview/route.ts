import { requireAdmin } from "@/lib/admin/session";
import { contentDisposition } from "@/lib/admin/uploads";
import { previewQuote } from "@/lib/dc/send";

/** The quote PDF as Send quote would build it, marked PREVIEW, opened in the owner's browser. Nothing is saved or sent. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const result = await previewQuote(id);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if ("error" in result) return new Response(result.error, { status: 409, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(new Uint8Array(result.pdf), {
    headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(result.name) },
  });
}
