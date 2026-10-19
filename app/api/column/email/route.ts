import { columnKeyHash, linksBody, unsubscribeUrl } from "@/lib/column/rules";
import { columnKeyMatches, suppressedAddresses, unsubscribeTokens } from "@/lib/column/store";

/**
 * What Column needs before it sends a marketing email. GET is the do-not-contact list, so it skips those
 * addresses. POST takes the addresses it's about to email (not only leads) and returns each one's unsubscribe link.
 */
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function authorized(request: Request): Promise<boolean> {
  const hash = columnKeyHash(request);
  return !!hash && (await columnKeyMatches(hash));
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
  return json({ do_not_email: await suppressedAddresses() });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "body must be JSON" }, 400); }
  const parsed = linksBody.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);
  const tokens = await unsubscribeTokens(parsed.data.emails);
  return json({ unsubscribe_urls: Object.fromEntries([...tokens].map(([address, token]) => [address, unsubscribeUrl(token)])) });
}
