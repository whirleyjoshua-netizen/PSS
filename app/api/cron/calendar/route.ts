import { calendarEnabled } from "@/lib/calendar/config";
import { recordError } from "@/lib/calendar/store";
import { ensureSubscription } from "@/lib/calendar/subscription";
import { reconcileCalendar } from "@/lib/calendar/sync";

/**
 * Daily (vercel.json): keeps the Outlook subscription alive and catches anything the
 * webhook missed. Same Bearer CRON_SECRET check as the review-request cron.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!calendarEnabled()) return Response.json({ skipped: "Outlook is not configured" });

  let subscriptionExpires: string | null = null;
  let subscriptionError: string | null = null;
  try {
    subscriptionExpires = (await ensureSubscription()).expiresAt.toISOString();
  } catch (error) {
    console.error("Calendar subscription failed", error);
    subscriptionError = error instanceof Error ? error.message : String(error);
  }
  const { jobs, failed } = await reconcileCalendar();
  // Recorded after the reconcile, whose clean run clears last_error, so this failure stays visible.
  if (subscriptionError) await recordError(subscriptionError);
  return Response.json({ subscriptionExpires, jobs, failed }, { status: subscriptionError || failed > 0 ? 500 : 200 });
}
