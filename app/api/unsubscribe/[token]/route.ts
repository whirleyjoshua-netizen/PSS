import { addSuppression } from "@/lib/agents/store";
import { UNSUBSCRIBE_TOKEN } from "@/lib/column/rules";
import { addressForToken } from "@/lib/column/store";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from an email's List-Unsubscribe header, with no page in
 * between. An unknown token gets the same answer, so the endpoint can't be used to test addresses.
 */
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const address = UNSUBSCRIBE_TOKEN.test(token) ? await addressForToken(token) : null;
  if (address) await addSuppression(address, "Unsubscribed from an email", "link");
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
