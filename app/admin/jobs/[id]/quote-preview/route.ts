import { requireAdmin } from "@/lib/admin/session";
import { contentDisposition } from "@/lib/admin/uploads";
import { previewQuote } from "@/lib/dc/send";

/**
 * The quote PDF as Send quote would build it, marked PREVIEW, opened in the owner's browser. Nothing is saved or sent.
 * `?option=B` previews quote option B (quote options spec §3). Without it, option A.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const plain = { ...headers, "Content-Type": "text/plain; charset=utf-8" };
  const option = new URL(request.url).searchParams.get("option") ?? "A";
  if (!/^[A-Z]$/.test(option)) return new Response("No such quote option.", { status: 404, headers: plain });
  const result = await previewQuote(id, option);
  if ("error" in result) return new Response(result.error, { status: 409, headers: plain });
  return new Response(new Uint8Array(result.pdf), {
    headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(result.name) },
  });
}
