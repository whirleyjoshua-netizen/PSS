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
  const result = await runDailyReviewRequests();
  // A config error must fail the Vercel Cron run, or it goes unnoticed.
  return Response.json(result, { status: "error" in result && result.error ? 500 : 200 });
}
