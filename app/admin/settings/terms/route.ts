import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import { requireAdmin } from "@/lib/admin/session";
import { saveTermsPathname } from "@/lib/dc/store";
import { TERMS_MAX_BYTES, TERMS_NOT_A_PDF, TERMS_TOO_LARGE } from "@/lib/dc/terms";

/**
 * Replaces the contract terms appended to every contract sent from now on. Sent contracts keep theirs.
 * A Route Handler rather than a Server Action, because Server Actions cap bodies at 1 MB.
 */
export async function POST(request: Request) {
  const { email } = await requireAdmin();
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return Response.json({ error: TERMS_NOT_A_PDF }, { status: 400 });
  if (file.size === 0 || file.size > TERMS_MAX_BYTES) return Response.json({ error: TERMS_TOO_LARGE }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const doc = await PDFDocument.load(bytes);
    if (doc.getPageCount() === 0) throw new Error("no pages");
  } catch {
    return Response.json({ error: "That PDF can't be read (is it password protected?)." }, { status: 400 });
  }
  const pathname = `settings/contract-terms/${randomUUID()}.pdf`;
  await put(pathname, file, { access: "private", contentType: "application/pdf", addRandomSuffix: false });
  let previous: string | null;
  try {
    previous = await saveTermsPathname(pathname, email);
  } catch (error) {
    // Nothing points at the new file, so it would only take up space.
    await del(pathname).catch((cleanup) => console.error("Could not remove unsaved terms", cleanup));
    throw error;
  }
  // Sent contracts embed their own copy of the terms, so nothing needs the old file any more.
  // Removing it only saves space, and a failure here is harmless.
  if (previous) await del(previous).catch((error) => console.error("Could not remove old terms", error));
  return Response.json({ ok: true });
}
