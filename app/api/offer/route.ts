import { randomUUID } from "node:crypto";
import { offerSignupSchema } from "@/lib/leads/schema";
import { ownerRecipients } from "@/lib/leads/email";
import { liveOffers } from "@/content/offer-popup";
import { insertOfferLead, offerSignupNotes, sendOfferEmail, sendOfferNotification } from "@/lib/leads/offer-signup";

/**
 * The offer pop-up's sign-up (owner 2026-10-21). The same never-lose-a-lead rule as /api/consultation: the lead and
 * the owners' email run side by side, the visitor sees an error only if both fail, and the offer email goes out only
 * once the sign-up is known to be captured.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "We could not read that request." }, { status: 400 });
  }

  // Honeypot: accept and discard, as /api/consultation does.
  if (typeof payload === "object" && payload !== null && "company" in payload && (payload as { company?: unknown }).company) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const parsed = offerSignupSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details and try again." },
      { status: 400 },
    );
  }

  const now = new Date();
  // The pop-up only shows while an offer runs; a page left open past the last day gets told, not an empty email.
  if (liveOffers(now).length === 0) {
    return Response.json({ ok: false, error: "This offer has ended. Call us and we'll tell you what's on now." }, { status: 410 });
  }
  const id = randomUUID();
  const notes = offerSignupNotes(now);
  const [stored, emailed] = await Promise.allSettled([
    insertOfferLead({ ...parsed.data, id, notes }),
    sendOfferNotification({ ...parsed.data, notes }, id, ownerRecipients()),
  ]);
  if (stored.status === "rejected") console.error("Offer sign-up database write failed", stored.reason);
  if (emailed.status === "rejected") console.error("Offer sign-up notification email failed", emailed.reason);

  if (stored.status === "rejected" && emailed.status === "rejected") {
    return Response.json(
      { ok: false, error: "We could not send that. Please try again, or call us." },
      { status: 502 },
    );
  }

  try {
    await sendOfferEmail(parsed.data, now);
  } catch (error) {
    console.error("Offer email failed", error);
  }

  return Response.json({ ok: true }, { status: 201 });
}
