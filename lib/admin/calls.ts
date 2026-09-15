import "server-only";
import { db } from "@/lib/db";
import { callStageMove, callSummary, type CallInput } from "./call";
import { isUuid } from "./jobs";

/**
 * Saves a call in one statement: what was learned, the forward-only stage move
 * (with its usual 'stage' event) and a 'note' event with the call summary.
 * Every SET expression reads the row as it was, so the stage check and the
 * stage_changed_at update agree. The 'stage' event is logged only when the
 * UPDATE actually landed this call's intended move (updated.status = $6),
 * not merely when the row's status differs from its pre-statement snapshot
 * (prev.status) — under READ COMMITTED another request may have already
 * moved the row between the snapshot and this UPDATE, which would otherwise
 * log a spurious stage event for a move this call didn't make.
 * It also sets the next follow-up, or clears it (a booked call and a call with no call-back time clear it).
 */
export async function logCall(jobId: string, input: CallInput, actor: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const move = callStageMove(input.outcome);
  const body = callSummary(input) + (input.notes ? `\n${input.notes}` : "");
  const rows = await db().query(
    `with prev as (select status from leads where id = $1),
     updated as (
       update leads set
         treatments = $2::text[], window_count = $3, budget_tier = $4,
         visit_at = coalesce($5::timestamptz, visit_at),
         status = case when $6::text is not null and status = any($7::text[]) then $6::text else status end,
         stage_changed_at = case when $6::text is not null and status = any($7::text[]) then now() else stage_changed_at end,
         follow_up_at = $10::timestamptz, follow_up_note = $11,
         updated_at = now()
       where id = $1
       returning id, status
     ),
     moved as (
       insert into job_events (lead_id, actor, kind, from_status, to_status)
       select updated.id, $8, 'stage', prev.status, updated.status from prev, updated
       where updated.status = $6::text and prev.status <> $6::text
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $8, 'note', $9 from updated
     returning id`,
    [jobId, input.treatments, input.windowCount, input.budgetTier, input.visitAt, move?.to ?? null, move?.from ?? [], actor, body,
      input.followUpAt, input.followUpNote],
  );
  return rows.length > 0;
}
