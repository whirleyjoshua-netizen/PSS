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
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname) => {
        if (!resourceIdFromPathname(pathname)) throw new Error("That upload path is not allowed.");
        return { maximumSizeInBytes: RESOURCE_MAX_BYTES, addRandomSuffix: false, allowOverwrite: false };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
