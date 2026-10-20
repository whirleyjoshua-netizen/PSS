import { columnKeyHash, eventsBody } from "@/lib/column/rules";
import { addColumnEvent, columnKeyMatches } from "@/lib/column/store";

/**
 * Column sends the calls and emails it logged against leads, and each lands on that lead's timeline. Column
 * marks the ones listed back as done; a lead deleted here comes back under `missing`, so it stops resending it.
 */
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const hash = columnKeyHash(request);
  if (!hash || !(await columnKeyMatches(hash))) return json({ error: "unauthorized" }, 401);
  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "body must be JSON" }, 400); }
  const parsed = eventsBody.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);
  const saved: string[] = [];
  const missing: string[] = [];
  for (const e of parsed.data.events) ((await addColumnEvent(e)) === "saved" ? saved : missing).push(e.id);
  return json({ saved, missing });
}
