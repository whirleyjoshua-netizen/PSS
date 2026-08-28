import { consultationSchema } from "@/lib/leads/schema";
import { insertLead } from "@/lib/leads/db";
import { sendLeadNotification } from "@/lib/leads/email";

/**
 * The only dynamic endpoint on the site.
 *
 * Design rule: never lose a lead. The database write and the notification
 * email run concurrently and are settled independently, so a failure in one
 * does not prevent the other. The visitor sees an error only if both fail —
 * and then the form shows them the phone number instead.
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

  const [stored, emailed] = await Promise.allSettled([
    insertLead(parsed.data),
    sendLeadNotification(parsed.data),
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

  return Response.json({ ok: true }, { status: 201 });
}
