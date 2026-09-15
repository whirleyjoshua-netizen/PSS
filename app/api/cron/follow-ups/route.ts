import { sendFollowUpDigest } from "@/lib/admin/follow-up-digest";

/**
 * Called each morning by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused before any
 * data is read.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendFollowUpDigest();
  return Response.json(result, { status: result.error ? 500 : 200 });
}
