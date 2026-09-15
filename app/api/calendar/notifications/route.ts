import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { calendarConfig, calendarEnabled } from "@/lib/calendar/config";
import { getSyncState } from "@/lib/calendar/store";
import { ensureSubscription } from "@/lib/calendar/subscription";
import { applyOutlookChange, reconcileCalendar } from "@/lib/calendar/sync";

type Notification = {
  subscriptionId?: string;
  clientState?: string;
  lifecycleEvent?: "reauthorizationRequired" | "subscriptionRemoved" | "missed";
  resourceData?: { id?: string };
};

/** Constant-time compare. Byte lengths are checked first: timingSafeEqual throws on unequal lengths. */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Microsoft Graph calls this when an event on the shared calendar changes. It must answer
 * within 3 seconds, so it answers first and does the Outlook work in after().
 */
export async function POST(request: Request) {
  if (!calendarEnabled()) return new Response("Not found", { status: 404 });
  const token = new URL(request.url).searchParams.get("validationToken");
  if (token !== null) return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } });

  let payload: { value?: Notification[] };
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const config = calendarConfig();
  if (!config) return new Response("Not found", { status: 404 });
  const { clientState } = config;
  const { subscriptionId } = await getSyncState();
  const valid = (payload.value ?? []).filter(
    (n) => typeof n.clientState === "string" && same(n.clientState, clientState) && n.subscriptionId === subscriptionId,
  );

  after(async () => {
    for (const n of valid) {
      try {
        if (n.lifecycleEvent === "missed") await reconcileCalendar();
        else if (n.lifecycleEvent) await ensureSubscription(true);
        else if (n.resourceData?.id) await applyOutlookChange(n.resourceData.id);
      } catch (error) {
        console.error("Calendar notification failed", error);
      }
    }
  });
  return new Response(null, { status: 202 });
}
