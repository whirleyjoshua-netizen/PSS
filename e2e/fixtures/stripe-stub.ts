import { createServer, type ServerResponse } from "node:http";
import Stripe from "stripe";

export const STRIPE_STUB_PORT = 3198;
/** The values playwright.config.ts gives the app server. A mismatch fails every Stripe call loudly (401). */
export const STRIPE_E2E_KEY = "sk_test_e2e";
export const STRIPE_E2E_WEBHOOK_SECRET = "whsec_e2e_test_secret";

export type StubSession = {
  id: string; status: "open" | "complete" | "expired"; amount: number; depositId: string; leadId: string;
  email: string; successUrl: string; url: string; paymentIntent: string;
};

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

/** A Checkout Session as Stripe's API and its events present one. */
export const sessionObject = (s: StubSession) => ({
  id: s.id, object: "checkout.session", status: s.status, url: s.status === "open" ? s.url : null,
  amount_total: s.amount, currency: "usd", customer_email: s.email, success_url: s.successUrl,
  payment_status: s.status === "complete" ? "paid" : "unpaid",
  payment_intent: s.status === "complete" ? s.paymentIntent : null,
  metadata: { depositId: s.depositId, leadId: s.leadId },
});

/**
 * Stands in for api.stripe.com (STRIPE_API_URL in playwright.config.ts). It creates Checkout Sessions — one per
 * Idempotency-Key, replayed as Stripe does — retrieves and expires them, and records refunds. The checkout
 * "page" it hands out is a plain page on the stub: a test pays by completing the session and posting a
 * signed webhook (signedEvent). No request ever reaches Stripe.
 */
export async function startStripeStub(port = STRIPE_STUB_PORT) {
  const sessions = new Map<string, StubSession>();
  const byKey = new Map<string, string>();
  const creates: URLSearchParams[] = [];
  const refunds: { paymentIntent: string; idempotencyKey: string | null }[] = [];
  let count = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      if (req.method === "GET" && path.startsWith("/pay/")) {
        res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Stub checkout</title><h1>Stub checkout</h1>");
        return;
      }
      if (req.headers.authorization !== `Bearer ${STRIPE_E2E_KEY}`) {
        json(res, 401, { error: { type: "authentication_error", message: "Invalid API key" } });
        return;
      }
      const form = new URLSearchParams(raw);
      const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : null;
      if (req.method === "POST" && path === "/v1/checkout/sessions") {
        creates.push(form);
        const replay = key ? byKey.get(key) : undefined;
        if (replay) {
          json(res, 200, sessionObject(sessions.get(replay)!));
          return;
        }
        count += 1;
        const id = `cs_test_e2e_${Date.now()}_${count}`;
        const session: StubSession = {
          id, status: "open", amount: Number(form.get("line_items[0][price_data][unit_amount]")),
          depositId: form.get("metadata[depositId]") ?? "", leadId: form.get("metadata[leadId]") ?? "",
          email: form.get("customer_email") ?? "", successUrl: form.get("success_url") ?? "",
          url: `http://127.0.0.1:${port}/pay/${id}`, paymentIntent: `pi_test_e2e_${Date.now()}_${count}`,
        };
        sessions.set(id, session);
        if (key) byKey.set(key, id);
        json(res, 200, sessionObject(session));
        return;
      }
      const match = /^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/.exec(path);
      if (match) {
        const session = sessions.get(match[1]);
        if (!session) {
          json(res, 404, { error: { type: "invalid_request_error", message: `No such checkout.session: ${match[1]}` } });
          return;
        }
        if (match[2]) {
          if (session.status !== "open") {
            json(res, 400, { error: { type: "invalid_request_error", message: "Only open Checkout Sessions can be expired." } });
            return;
          }
          session.status = "expired";
        }
        json(res, 200, sessionObject(session));
        return;
      }
      if (req.method === "POST" && path === "/v1/refunds") {
        refunds.push({ paymentIntent: form.get("payment_intent") ?? "", idempotencyKey: key });
        json(res, 200, { id: `re_test_e2e_${refunds.length}`, object: "refund", status: "succeeded", payment_intent: form.get("payment_intent") });
        return;
      }
      json(res, 404, { error: { type: "invalid_request_error", message: `Unrecognized request URL (${req.method}: ${path})` } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => reject(error.code === "EADDRINUSE"
      ? new Error(`Stripe stub: port ${port} is already in use. Stop whatever holds it (a previous e2e run?) and retry.`)
      : error));
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    sessions, creates, refunds,
    /** The client paid: the session completes, as Stripe marks it before sending checkout.session.completed. */
    complete(id: string): StubSession {
      const session = sessions.get(id)!;
      session.status = "complete";
      return session;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A Stripe event for a session, signed with the e2e webhook secret exactly as Stripe signs one. */
export function signedEvent(type: string, session: StubSession): { body: string; signature: string } {
  const body = JSON.stringify({
    id: `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`, object: "event", type,
    data: { object: sessionObject(session) },
  });
  const signature = new Stripe(STRIPE_E2E_KEY).webhooks.generateTestHeaderString({ payload: body, secret: STRIPE_E2E_WEBHOOK_SECRET });
  return { body, signature };
}
