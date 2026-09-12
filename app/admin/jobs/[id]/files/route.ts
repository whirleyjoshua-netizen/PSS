import { createFile } from "@/lib/admin/files";
import { requireAdmin } from "@/lib/admin/session";
import { checkUpload, type FileKind } from "@/lib/admin/uploads";

/**
 * Upload endpoint. A Route Handler rather than a Server Action, because Server
 * Actions cap request bodies at 1 MB by default and photos and PDFs exceed it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { email } = await requireAdmin();
  const { id } = await params;

  const data = await request.formData();
  const file = data.get("file");
  const kind: FileKind = data.get("kind") === "photo" ? "photo" : "document";
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });

  const problem = checkUpload(kind, file.type, file.size);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const saved = await createFile({ leadId: id, kind, name: file.name, contentType: file.type, body: file, actor: email });
  if (!saved) return Response.json({ error: "That job no longer exists." }, { status: 404 });
  return Response.json({ id: saved.id }, { status: 201 });
}
