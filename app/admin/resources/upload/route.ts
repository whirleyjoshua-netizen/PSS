import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/admin/session";
import { RESOURCE_MAX_BYTES, resourceIdFromPathname } from "@/lib/admin/resource-rules";

/**
 * Issues the browser a token to upload one Resources file straight to private Blob storage, so a
 * large file never passes through a function (whose request body is capped). Only for a signed-in
 * owner, only under resources/<id>/, never overwriting. The row is written afterwards by
 * saveResourceAction, which checks the file really arrived, so no completion callback is taken.
 */
export async function POST(request: Request) {
  await requireAdmin();
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "That upload request can't be read." }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname) => {
        if (!resourceIdFromPathname(pathname)) throw new Error("That upload path is not allowed.");
        // Six hours, not the default one: a 200 MB file on a slow connection must finish inside the token.
        return { maximumSizeInBytes: RESOURCE_MAX_BYTES, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 6 * 3600_000 };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
