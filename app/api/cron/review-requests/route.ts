import { runDailyReviewRequests } from "@/lib/reviews/send";

/**
 * Called once a day by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused before any
 * data is read.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runDailyReviewRequests());
}
