import { calendarEnabled } from "@/lib/calendar/config";
import { pollMailbox } from "@/lib/dc/import";

/** Reads new Direct Connect Dealer Copies from support@ (vercel.json). Same Bearer CRON_SECRET check as the other crons. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!calendarEnabled()) return Response.json({ skipped: "Outlook is not configured" });
  const { seen, results } = await pollMailbox();
  // A failed message must fail the Vercel Cron run, or it goes unnoticed.
  const failed = results.filter((r) => r.outcome === "failed").length;
  return Response.json({ seen, results }, { status: failed > 0 ? 500 : 200 });
}
