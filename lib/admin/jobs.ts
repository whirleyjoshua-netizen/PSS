import "server-only";
import { db } from "@/lib/db";
import { isBudgetTier, type BudgetTier } from "./budget";
import type { DetailsInput, NewJobInput } from "./schema";
import { isInstalled, isStage, type Stage } from "./stages";
import { toLocalInput } from "./time";
import { isFinish, type Finish } from "@/lib/leads/finish";
import { isTreatmentType, type TreatmentType } from "@/lib/leads/treatment-types";
import { isTeamRole, type TeamRole } from "./team-roles";

export type Job = {
  id: string;
  createdAt: Date;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string;
  treatments: string[];
  windowCount: string | null;
  heardVia: string | null;
  notes: string | null;
  source: string;
  status: Stage;
  stageChangedAt: Date;
  visitAt: Date | null;
  quoteCents: number | null;
  soldCents: number | null;
  depositCents: number | null;
  brands: string[];
  orderedOn: string | null;
  installOn: string | null;
  lostReason: string | null;
  referralCode: string | null;
  referredBy: string | null;
  referralPaidAt: Date | null;
  reviewRequestedAt: Date | null;
  reviewOptOut: boolean;
  /** When the customer was last sent a portal invite. Optional so older fixtures still type-check. */
  portalInvitedAt?: Date | null;
  /** Budget tier from the call screen or Job details. Optional so older fixtures still type-check. */
  budgetTier?: BudgetTier | null;
  /** The job's one next call-back, if any. Optional so older fixtures still type-check. */
  followUpAt?: Date | null;
  followUpNote?: string | null;
  /** Questionnaire / call-screen detail. Optional so older fixtures still type-check. The gate code is owner-only. */
  windowCountExact?: number | null;
  treatmentTypes?: TreatmentType[];
  motorized?: boolean;
  gateCode?: string | null;
  finish?: Finish | null;
  /** Newest contact entry or logged call. Optional so older fixtures still type-check. */
  lastContactAt?: Date | null;
  /** Who the job is assigned to, with their name and tag; absent or null when unassigned. */
  assignedTo?: string | null;
  assignedName?: string | null;
  assignedRole?: TeamRole | null;
};

export type JobEvent = {
  id: string;
  createdAt: Date;
  actor: string;
  kind: "stage" | "note" | "edit" | "email" | "reward" | "measure" | "file" | "contact";
  fromStatus: string | null;
  toStatus: string | null;
  body: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string): boolean => UUID.test(id);

// Date columns come back as strings so an install date never shifts across time zones.
export const JOB_COLUMNS = `id, created_at, name, phone, email, address, city, treatments, window_count,
  heard_via, notes, source, status, stage_changed_at, visit_at, quote_cents, sold_cents,
  deposit_cents, brands, ordered_on::text as ordered_on, install_on::text as install_on, lost_reason,
  referral_code, referred_by, referral_paid_at, review_requested_at, review_opt_out, portal_invited_at, budget_tier,
  follow_up_at, follow_up_note, window_count_exact, treatment_types, motorized, gate_code, finish,
  assigned_to,
  (select t.name from team_members t where t.id = leads.assigned_to) as assigned_name,
  (select t.role from team_members t where t.id = leads.assigned_to) as assigned_role,
  (select max(e.created_at) from job_events e where e.lead_id = leads.id and (e.kind = 'contact' or (e.kind = 'note' and e.body like 'Call:%'))) as last_contact_at`;

export function toJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    createdAt: new Date(row.created_at as string),
    name: row.name as string,
    phone: row.phone as string,
    email: (row.email as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    city: row.city as string,
    treatments: (row.treatments as string[]) ?? [],
    windowCount: (row.window_count as string | null) ?? null,
    heardVia: (row.heard_via as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    source: row.source as string,
    status: row.status as Stage,
    stageChangedAt: new Date(row.stage_changed_at as string),
    visitAt: row.visit_at ? new Date(row.visit_at as string) : null,
    quoteCents: (row.quote_cents as number | null) ?? null,
    soldCents: (row.sold_cents as number | null) ?? null,
    depositCents: (row.deposit_cents as number | null) ?? null,
    brands: (row.brands as string[]) ?? [],
    orderedOn: (row.ordered_on as string | null) ?? null,
    installOn: (row.install_on as string | null) ?? null,
    lostReason: (row.lost_reason as string | null) ?? null,
    referralCode: (row.referral_code as string | null) ?? null,
    referredBy: (row.referred_by as string | null) ?? null,
    referralPaidAt: row.referral_paid_at ? new Date(row.referral_paid_at as string) : null,
    reviewRequestedAt: row.review_requested_at ? new Date(row.review_requested_at as string) : null,
    reviewOptOut: row.review_opt_out === true,
    portalInvitedAt: row.portal_invited_at ? new Date(row.portal_invited_at as string) : null,
    budgetTier: isBudgetTier(row.budget_tier) ? row.budget_tier : null,
    followUpAt: row.follow_up_at ? new Date(row.follow_up_at as string) : null,
    followUpNote: (row.follow_up_note as string | null) ?? null,
    windowCountExact: (row.window_count_exact as number | null) ?? null,
    treatmentTypes: ((row.treatment_types as unknown[]) ?? []).filter(isTreatmentType),
    motorized: row.motorized === true,
    gateCode: (row.gate_code as string | null) ?? null,
    finish: isFinish(row.finish) ? row.finish : null,
    lastContactAt: row.last_contact_at ? new Date(row.last_contact_at as string) : null,
    assignedTo: (row.assigned_to as string | null) ?? null,
    assignedName: (row.assigned_name as string | null) ?? null,
    assignedRole: isTeamRole(row.assigned_role) ? row.assigned_role : null,
  };
}

export const SEARCH_MAX = 100;

/** `%`, `_` and `\` are LIKE wildcards; escape them so a search is literal. */
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listJobs({ search }: { search?: string }): Promise<Job[]> {
  const term = (search ?? "").trim().slice(0, SEARCH_MAX);
  if (!term) {
    const rows = await db().query(`select ${JOB_COLUMNS} from leads order by stage_changed_at desc`);
    return rows.map(toJob);
  }
  // Only treat the term as a phone search when it looks like one — otherwise a term like
  // "4521 Elm" or "Apt 2" has enough digits to flood results with unrelated phone matches.
  const digits = term.replace(/\D/g, "");
  const phoneDigits = /^[\d\s().+-]+$/.test(term) && digits.length >= 3 ? digits : "";
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where (name ilike $1 or email ilike $1 or city ilike $1 or address ilike $1
            or ($2 <> '' and phone like '%' || $2 || '%'))
     order by stage_changed_at desc`,
    [likePattern(term), phoneDigits],
  );
  return rows.map(toJob);
}

export async function getJob(id: string): Promise<Job | null> {
  if (!isUuid(id)) return null;
  const rows = await db().query(`select ${JOB_COLUMNS} from leads where id = $1`, [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function getEvents(id: string): Promise<JobEvent[]> {
  if (!isUuid(id)) return [];
  const rows = await db()`
    select id, created_at, actor, kind, from_status, to_status, body
    from job_events where lead_id = ${id} order by created_at desc`;
  return rows.map((row) => ({
    id: row.id as string,
    createdAt: new Date(row.created_at as string),
    actor: row.actor as string,
    kind: row.kind as JobEvent["kind"],
    fromStatus: (row.from_status as string | null) ?? null,
    toStatus: (row.to_status as string | null) ?? null,
    body: (row.body as string | null) ?? null,
  }));
}

/** One statement, so the stage and its log entry are saved together or not at all. */
export async function setStage(id: string, to: Stage, actor: string, reason?: string): Promise<boolean> {
  if (!isStage(to)) throw new Error(`Unknown stage: ${String(to)}`);
  if (!isUuid(id)) return false;
  const lostReason = to === "lost" ? (reason ?? null) : null;
  const clearFollowUp = to === "lost";
  const rows = await db()`
    with prev as (select status from leads where id = ${id}),
    moved as (
      update leads set status = ${to}, lost_reason = ${lostReason},
        follow_up_at = case when ${clearFollowUp}::boolean then null else follow_up_at end,
        follow_up_note = case when ${clearFollowUp}::boolean then null else follow_up_note end,
        stage_changed_at = now(), updated_at = now()
      where id = ${id} and status <> ${to}
      returning id
    )
    insert into job_events (lead_id, actor, kind, from_status, to_status, body)
    select ${id}, ${actor}, 'stage', prev.status, ${to}, ${lostReason} from prev, moved
    returning id`;
  return rows.length > 0;
}

/**
 * Saves the details form and logs it, in one statement. Returns null when the job is gone, otherwise
 * which dates this save changed: every CTE reads the row as it was before the update, so prev holds
 * the old dates (Outlook should only be overridden for a date the owner actually changed).
 *
 * A date whose submitted value matches the value the form was loaded with was not edited, so the
 * stored date is kept: a stale form must never undo a move made in Outlook since it was opened.
 * Without the loaded value (an older form, or another caller) both dates are written as before.
 * A New job whose visit date this save set moves to Appointment booked, with its stage entry, in the same statement.
 */
export async function updateDetails(
  id: string, input: DetailsInput, actor: string,
): Promise<{ visitChanged: boolean; installChanged: boolean } | null> {
  if (!isUuid(id)) return null;
  const visitEdited =
    input.visitAtLoaded === undefined || (input.visitAt ? toLocalInput(input.visitAt) : "") !== input.visitAtLoaded;
  const installEdited = input.installOnLoaded === undefined || (input.installOn ?? "") !== input.installOnLoaded;
  // Only a visit date this save actually set books the appointment; a stale form or an Outlook sync never does.
  const book = visitEdited && input.visitAt !== null;
  const rows = await db()`
    with prev as (select status, visit_at, install_on from leads where id = ${id}),
    changed as (
      update leads set
        visit_at = case when ${visitEdited}::boolean then ${input.visitAt}::timestamptz else visit_at end,
        quote_cents = ${input.quoteCents},
        sold_cents = ${input.soldCents}, deposit_cents = ${input.depositCents},
        brands = ${input.brands}, ordered_on = ${input.orderedOn}::date,
        install_on = case when ${installEdited}::boolean then ${input.installOn}::date else install_on end,
        budget_tier = ${input.budgetTier},
        window_count_exact = ${input.windowCountExact}, treatment_types = ${input.treatmentTypes}::text[], motorized = ${input.motorized}, gate_code = ${input.gateCode},
        status = case when ${book}::boolean and status = 'new' then 'visit_booked' else status end,
        stage_changed_at = case when ${book}::boolean and status = 'new' then now() else stage_changed_at end,
        updated_at = now()
      where id = ${id}
      returning id, status
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'edit', 'Updated job details' from changed
    ),
    booked as (
      insert into job_events (lead_id, actor, kind, from_status, to_status)
      select changed.id, ${actor}, 'stage', 'new', 'visit_booked' from prev, changed
      where prev.status = 'new' and changed.status = 'visit_booked'
    )
    select prev.visit_at is distinct from ${input.visitAt}::timestamptz as visit_changed,
           prev.install_on is distinct from ${input.installOn}::date as install_changed
    from prev, changed`;
  const row = rows[0];
  if (!row) return null;
  return {
    visitChanged: visitEdited && Boolean(row.visit_changed),
    installChanged: installEdited && Boolean(row.install_changed),
  };
}

export async function addNote(id: string, body: string, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'note', ${body} from leads where id = ${id}
    returning id`;
  return rows.length > 0;
}

export async function addContact(id: string, body: string, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'contact', ${body} from leads where id = ${id}
    returning id`;
  return rows.length > 0;
}

export type AssignResult = "ok" | "missing" | "unknown-member" | "unchanged";

/** Assigns a job to one team member (or nobody) and logs it, in one statement. */
export async function assignJob(id: string, memberId: string | null, actor: string): Promise<AssignResult> {
  if (!isUuid(id)) return "missing";
  if (memberId !== null && !isUuid(memberId)) return "unknown-member";
  const [result] = await db()`
    with member as (select id, name, role from team_members where id = ${memberId}::uuid),
    target as (select id from leads where id = ${id}),
    changed as (
      update leads set assigned_to = ${memberId}::uuid, updated_at = now()
      where id = ${id} and assigned_to is distinct from ${memberId}::uuid
        and (${memberId}::uuid is null or exists (select 1 from member))
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'edit',
        coalesce((select 'Assigned to ' || name || ' (' || initcap(role) || ')' from member), 'Unassigned')
      from changed
      returning id
    )
    select (select count(*) from target)::int as job, (select count(*) from member)::int as member,
           (select count(*) from changed)::int as changed`;
  if (!result?.job) return "missing";
  if (memberId !== null && !result.member) return "unknown-member";
  return result.changed ? "ok" : "unchanged";
}

export async function createJob(input: NewJobInput, actor: string): Promise<string> {
  // A job entered as already installed (or completed) must not trigger tomorrow's review email; the owner can untick it.
  const installed = isInstalled(input.stage);
  const body = installed ? "Added by hand (review request off)" : "Added by hand";
  const rows = await db()`
    with created as (
      insert into leads (name, phone, email, city, address, notes, source, status, review_opt_out)
      values (${input.name}, ${input.phone}, ${input.email ?? null}, ${input.city},
              ${input.address ?? null}, ${input.notes ?? null}, ${input.source}, ${input.stage}, ${installed})
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, to_status, body)
      select id, ${actor}, 'stage', ${input.stage}, ${body} from created
    )
    select id from created`;
  return rows[0].id as string;
}
