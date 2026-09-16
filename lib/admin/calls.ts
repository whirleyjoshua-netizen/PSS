import "server-only";
import { db } from "@/lib/db";
import { callStageMove, callSummary, type CallInput } from "./call";
import { isUuid } from "./jobs";

/**
 * Saves a call in one statement: what was learned, the forward-only stage move
 * (with its usual 'stage' event) and a 'note' event with the call summary.
 * Every SET expression reads the row as it was, so the stage check and the
 * stage_changed_at update agree. The 'stage' event is logged only when the
 * UPDATE actually landed this call's intended move (updated.status = $8),
 * not merely when the row's status differs from its pre-statement snapshot
 * (prev.status) — under READ COMMITTED another request may have already
 * moved the row between the snapshot and this UPDATE, which would otherwise
 * log a spurious stage event for a move this call didn't make.
 * It also sets the next follow-up, or clears it (a booked call and a call with no call-back time clear it).
 *
 * A booked call with a visit date books that visit in the same statement, as a CONFIRMED consultation:
 * the customer was told the date on the phone, so it is a commitment exactly like "Confirm schedule".
 * It is one statement with the stage move on purpose — the job must never end up moved to
 * visit_booked with no appointment behind it. leads.visit_at is NOT written here: it is a mirror of
 * the confirmed consultation, and only mirrorToJob writes it (the caller runs it after this returns).
 */
export async function logCall(jobId: string, input: CallInput, actor: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const move = callStageMove(input.outcome);
  const body = callSummary(input) + (input.notes ? `\n${input.notes}` : "");
  // Only a booked call with a date books the visit; every other outcome leaves the appointments alone.
  const consultationAt = input.outcome === "booked" ? input.visitAt ?? null : null;
  const rows = await db().query(
    `with prev as (select status from leads where id = $1),
     updated as (
       update leads set
         treatment_types = $2::text[], motorized = $3, window_count_exact = $4, gate_code = $5, budget_tier = $6,
         status = case when $8::text is not null and status = any($9::text[]) then $8::text else status end,
         stage_changed_at = case when $8::text is not null and status = any($9::text[]) then now() else stage_changed_at end,
         follow_up_at = $12::timestamptz, follow_up_note = $13,
         updated_at = now()
       where id = $1
       returning id, status
     ),
     booked as (
       insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
       select updated.id, 'consultation', $7::timestamptz, false, now(), $10
       from updated where $7::timestamptz is not null
       on conflict (lead_id, kind) do update set
         starts_at = excluded.starts_at, all_day = false,
         window_start = null, window_end = null, duration_minutes = null,
         confirmed_at = now(), confirmed_by = excluded.confirmed_by, updated_at = now()
     ),
     moved as (
       insert into job_events (lead_id, actor, kind, from_status, to_status)
       select updated.id, $10, 'stage', prev.status, updated.status from prev, updated
       where updated.status = $8::text and prev.status <> $8::text
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $10, 'note', $11 from updated
     returning id`,
    // $7 is NOT input.visitAt: it is consultationAt, null unless this was a booked call WITH a date.
    // It only ever feeds the appointments upsert above — nothing here writes leads.visit_at.
    [jobId, input.treatmentTypes, input.motorized, input.windowCountExact, input.gateCode, input.budgetTier, consultationAt,
      move?.to ?? null, move?.from ?? [], actor, body, input.followUpAt, input.followUpNote],
  );
  return rows.length > 0;
}
