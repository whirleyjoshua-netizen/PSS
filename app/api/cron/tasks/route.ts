import { sendTaskDigest } from "@/lib/admin/task-emails";
import { sweepTaskUploads } from "@/lib/admin/task-file-sweep";

/**
 * Called each morning by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused before any
 * data is read. Sends the digest, then deletes abandoned task uploads; either
 * failing fails the run, so it isn't missed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendTaskDigest();
  const swept = await sweepTaskUploads();
  return Response.json({ ...result, swept }, { status: result.error || swept.error ? 500 : 200 });
}
