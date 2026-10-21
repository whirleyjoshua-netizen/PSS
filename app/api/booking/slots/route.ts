import { availableDays } from "@/lib/booking/book";
import { slotDays } from "@/lib/booking/labels";

/**
 * The open consultation times for the home form's "Pick a time" pop-up, labelled in Las Vegas time.
 * When Outlook can't be read, nothing is offered: the visitor sends their details and we call.
 */
export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    return Response.json({ ok: true, days: slotDays(await availableDays()) }, { headers });
  } catch (error) {
    console.error("Booking slots could not be read", error);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
