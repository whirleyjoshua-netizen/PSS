import { columnKeyHash, leadJson, pageQuery } from "@/lib/column/rules";
import { columnKeyMatches, listLeadsPage, unsubscribeTokens } from "@/lib/column/store";

/**
 * Column's read of the leads: contact details, stage and source, a page at a time in id order. Column pulls
 * every page on each sync, so a lead deleted here drops out there too. Read only, and a missing or wrong
 * key is refused before anything is read.
 */
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const hash = columnKeyHash(request);
  if (!hash || !(await columnKeyMatches(hash))) return json({ error: "unauthorized" }, 401);
  const params = new URL(request.url).searchParams;
  const query = pageQuery.safeParse({ after: params.get("after"), limit: params.get("limit") ?? undefined });
  if (!query.success) return json({ error: query.error.issues[0]?.message ?? "invalid query" }, 400);
  const leads = await listLeadsPage(query.data.after, query.data.limit);
  const tokens = await unsubscribeTokens(leads.flatMap((l) => (l.email?.trim() ? [l.email] : [])));
  return json({
    now: new Date().toISOString(),
    leads: leads.map((l) => leadJson(l, l.email ? tokens.get(l.email.trim().toLowerCase()) : undefined)),
    next: leads.length === query.data.limit ? leads[leads.length - 1].id : null,
  });
}
