import { bearerKey, hashKey, parsePushItem, pushSchema, type Agent } from "@/lib/agents/rules";
import { findAgentByKeyHash, pullReplies, pullUpdates, recordRun, upsertItem } from "@/lib/agents/store";
import { businessCounts } from "@/lib/agents/stats";
import { pollReplies } from "@/lib/agents/mail";

/**
 * The agent runner's sync endpoint (run-agent.ps1 on the owner's PC). Every call carries the agent's own key as
 * `Authorization: Bearer <key>`; only its sha256 is stored, and a missing or wrong key is refused before any
 * data is read or written. Response field names are snake_case because the runner reads them as-is.
 */
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function authenticate(request: Request): Promise<Agent | null> {
  const key = bearerKey(request.headers.get("authorization"));
  return key ? findAgentByKeyHash(hashKey(key)) : null;
}

/** The runner's pull: the owner's decisions, replies to this agent's emails, and (if allowed) business counts. */
export async function GET(request: Request) {
  const agent = await authenticate(request);
  if (!agent) return json({ error: "unauthorized" }, 401);
  // A mailbox outage must not stop the runner getting the owner's decisions.
  try { await pollReplies(); } catch (error) { console.error("Agent reply poll failed", error); }
  const [updates, replies, stats] = await Promise.all([
    pullUpdates(agent.slug),
    pullReplies(agent.slug),
    agent.statsAccess
      ? Promise.all([businessCounts(7), businessCounts(28)]).then(([last_7, last_28]) => ({ last_7, last_28 }))
      : Promise.resolve(null),
  ]);
  return json({
    agent: agent.slug, now: new Date().toISOString(), stats, replies,
    updates: updates.map((i) => ({
      external_id: i.externalId, kind: i.kind, status: i.status, owner_note: i.ownerNote, final_to: i.finalTo,
      final_subject: i.finalSubject, final_body: i.finalBody, decided_at: i.decidedAt?.toISOString() ?? null,
      sent_at: i.sentAt?.toISOString() ?? null, error: i.error,
    })),
  });
}

/** The runner's push: reports, email proposals and decision requests, plus how the run went. */
export async function POST(request: Request) {
  const agent = await authenticate(request);
  if (!agent) return json({ error: "unauthorized" }, 401);
  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "body must be JSON" }, 400); }
  const parsed = pushSchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid push" }, 400);
  const results: { external_id: string; result: string }[] = [];
  for (const rawItem of parsed.data.items) {
    const claimedId = (rawItem as { external_id?: unknown } | null)?.external_id;
    const externalId = typeof claimedId === "string" ? claimedId : "?";
    const item = parsePushItem(rawItem);
    if (!item.ok) { results.push({ external_id: externalId, result: `invalid: ${item.reason}` }); continue; }
    results.push({ external_id: item.item.external_id, result: await upsertItem(agent.slug, item.item) });
  }
  if (parsed.data.run) await recordRun(agent.slug, parsed.data.run.status, parsed.data.run.note ?? null);
  return json({ results });
}
