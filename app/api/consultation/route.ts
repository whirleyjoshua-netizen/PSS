import { randomUUID } from "node:crypto";
import { hashToken, newToken } from "@/lib/admin/tokens";
import { consultationSchema } from "@/lib/leads/schema";
import { insertLead } from "@/lib/leads/db";
import { sendCustomerConfirmation, sendLeadNotification } from "@/lib/leads/email";
import { questionnaireCookie } from "@/lib/leads/questionnaire-cookie";
import { findReferrer } from "@/lib/referrals/db";
import { REF_COOKIE, cookieValue } from "@/lib/referrals/codes";

/**
 * The only dynamic endpoint on the site.
 *
 * Design rule: never lose a lead. The id is created first, before either
 * write, so the database write and the notification email — which links to
 * that id in the tracker — can run concurrently and be settled independently.
 * A failure in one does not prevent the other. The visitor sees an error only
 * if both fail — and then the form shows them the phone number instead.
 */
export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "We could not read that request." },
      { status: 400 },
    );
  }

  // Honeypot: accept and discard. An error response would tell a bot exactly
  // which field gave it away.
  if (
    typeof payload === "object" &&
    payload !== null &&
    "company" in payload &&
    (payload as { company?: unknown }).company
  ) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const parsed = consultationSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Please check your details and try again.",
      },
      { status: 400 },
    );
  }

  // A referral never blocks a lead: any lookup failure saves it unattributed.
  const lookup = (code: string) =>
    findReferrer(code).catch((error) => {
      console.error("Referral lookup failed", error);
      return null;
    });
  const cookieCode = cookieValue(request.headers.get("cookie"), REF_COOKIE);

  // An unresolved body code falls back to the cookie, rather than overriding
  // a valid one with nothing.
  const referrer =
    (parsed.data.referralCode ? await lookup(parsed.data.referralCode) : null) ??
    (cookieCode ? await lookup(cookieCode) : null);
  const id = randomUUID();
  const key = newToken();
  const lead = {
    ...parsed.data,
    heardVia: parsed.data.heardVia ?? (referrer ? "Referral from a friend" : undefined),
    referredBy: referrer?.id ?? null,
    id,
    questionnaireTokenHash: hashToken(key),
  };

  const [stored, emailed] = await Promise.allSettled([
    insertLead(lead),
    sendLeadNotification(lead, id),
  ]);

  if (stored.status === "rejected") {
    console.error("Lead database write failed", stored.reason);
  }
  if (emailed.status === "rejected") {
    console.error("Lead notification email failed", emailed.reason);
  }

  if (stored.status === "rejected" && emailed.status === "rejected") {
    return Response.json(
      {
        ok: false,
        error: "We could not submit your request. Please call us and we will get you scheduled.",
      },
      { status: 502 },
    );
  }

  // Only once the lead is known to be captured, so nobody is thanked for a
  // request that was lost. Its failure is logged, never shown to the visitor.
  try {
    await sendCustomerConfirmation(parsed.data);
  } catch (error) {
    console.error("Customer confirmation email failed", error);
  }

  // The questionnaire key goes only to a visitor whose lead was actually stored.
  const headers = stored.status === "fulfilled" ? { "set-cookie": questionnaireCookie(key) } : undefined;
  return Response.json({ ok: true }, { status: 201, headers });
}
