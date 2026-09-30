import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { geocodeLead } from "@/lib/routes/geocode";
import { isBudgetTier, type BudgetTier } from "./budget";
import type { DetailsInput, NewJobInput } from "./schema";
import { isInstalled, isStage, type Stage } from "./stages";
import { isFinish, type Finish } from "@/lib/leads/finish";
import { isTreatmentType, type TreatmentType } from "@/lib/leads/treatment-types";
import { isTeamRole, type TeamRole } from "./team-roles";
import { isUuid } from "./ids";
import { del } from "@vercel/blob";
import { listBlobPathnames } from "./files";
import { deleteEvent } from "@/lib/calendar/remove";
import { adClickLabel } from "@/lib/leads/attribution";

const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);

export { isUuid };

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
  /** The short, human-friendly project number shown to the customer. Optional so older fixtures still type-check. */
  projectNo?: number | null;
  /** The job this one came from, when a customer's service request created it. Null for every job entered by hand. */
  parentJobId?: string | null;
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
  /** How the ad that brought this lead reads, e.g. "Google Ads · Custom Blinds"; null when no ad did. */
  adClick?: string | null;
};

export type JobEvent = {
  id: string;
  createdAt: Date;
  actor: string;
  kind: "stage" | "note" | "edit" | "email" | "reward" | "measure" | "file" | "contact" | "message" | "service" | "signature" | "quote" | "document" | "payment";
  fromStatus: string | null;
  toStatus: string | null;
  body: string | null;
};

// Date columns come back as strings so an install date never shifts across time zones.
export const JOB_COLUMNS = `id, created_at, name, phone, email, address, city, treatments, window_count,
  heard_via, notes, source, status, stage_changed_at, visit_at, quote_cents, sold_cents,
  deposit_cents, brands, ordered_on::text as ordered_on, install_on::text as install_on, lost_reason,
  referral_code, referred_by, referral_paid_at, review_requested_at, review_opt_out, portal_invited_at, budget_tier,
  follow_up_at, follow_up_note, window_count_exact, treatment_types, motorized, gate_code, finish, project_no,
  parent_job_id, assigned_to, gclid, gbraid, wbraid, utm_source, utm_campaign, utm_term,
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
    projectNo: (row.project_no as number | null) ?? null,
    parentJobId: (row.parent_job_id as string | null) ?? null,
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
    adClick: adClickLabel({
      gclid: str(row.gclid), gbraid: str(row.gbraid), wbraid: str(row.wbraid),
      utmSource: str(row.utm_source), utmCampaign: str(row.utm_campaign), utmTerm: str(row.utm_term),
    }),
  };
}

export const SEARCH_MAX = 100;

/** `%`, `_` and `\` are LIKE wildcards; escape them so a search is literal. */
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * "PSS-1042", "pss 1042" or "1042" → 1042, so an owner can find a job by the number Direct Connect
 * shows in its PO column. Four or more digits only: project numbers start at 1001, and a shorter
 * number is far more likely part of a phone or an address. At most nine digits, so the value always
 * fits `project_no`'s integer column: a ten-digit phone must never reach the query as a number.
 * An en or em dash, or "#", counts as the hyphen, because email clients often convert them.
 */
export function projectNoFromSearch(term: string): number | null {
  const match = /^(?:pss[\s\-–—#]*)?(\d{4,9})$/i.exec(term.trim());
  return match ? Number(match[1]) : null;
}

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
            or ($2 <> '' and phone like '%' || $2 || '%')
            or ($3::int is not null and project_no = $3))
     order by stage_changed_at desc`,
    [likePattern(term), phoneDigits, projectNoFromSearch(term)],
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

/**
 * One statement, so the stage and its log entry are saved together or not at all.
 *
 * The two strings are named, never positional, because they are not interchangeable and a caller
 * that confused them would fail silently:
 *
 * - `reason` is Lost's own thing. It writes the lost_reason column on leads, and is echoed as the
 *   event body, only for a move to lost. On any other move it is ignored entirely.
 * - `body` is the sentence for any other move — `setStage(id, "sold", customerEmail, { body:
 *   "Approved \"Quote - Living room.pdf\" from their project page" })` — and never touches
 *   lost_reason.
 */
export async function setStage(
  id: string, to: Stage, actor: string, options?: { reason?: string; body?: string },
): Promise<boolean> {
  if (!isStage(to)) throw new Error(`Unknown stage: ${String(to)}`);
  if (!isUuid(id)) return false;
  const lostReason = to === "lost" ? (options?.reason ?? null) : null;
  const eventBody = to === "lost" ? lostReason : (options?.body ?? null);
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
    select ${id}, ${actor}, 'stage', prev.status, ${to}, ${eventBody} from prev, moved
    returning id`;
  return rows.length > 0;
}

/**
 * Saves the details form and logs it, in one statement. saved false means the job is gone.
 * addressChanged compares against the row as it was before this update, so only a real edit re-geocodes.
 *
 * No appointment date passes through here: visit_at and install_on are mirrors of the confirmed
 * appointments (see mirrorToJob), and a New job now moves to Appointment booked only when its
 * consultation is confirmed. This save therefore never touches Outlook.
 */
export async function updateDetails(
  id: string, input: DetailsInput, actor: string,
): Promise<{ saved: boolean; addressChanged: boolean }> {
  if (!isUuid(id)) return { saved: false, addressChanged: false };
  const rows = await db()`
    with prev as (select address, city from leads where id = ${id}),
    changed as (
      update leads set
        address = ${input.address}, city = ${input.city},
        lat = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else lat end,
        lng = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else lng end,
        geocode_status = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else geocode_status end,
        geocoded_at = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else geocoded_at end,
        brands = ${input.brands}, ordered_on = ${input.orderedOn}::date,
        budget_tier = ${input.budgetTier},
        window_count_exact = ${input.windowCountExact}, treatment_types = ${input.treatmentTypes}::text[], motorized = ${input.motorized}, gate_code = ${input.gateCode},
        updated_at = now()
      where id = ${id}
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'edit', 'Updated job details' from changed
      returning id
    )
    select changed.id,
           (prev.address is distinct from ${input.address}::text or prev.city is distinct from ${input.city}::text) as address_changed
      from changed, prev`;
  return { saved: rows.length > 0, addressChanged: rows[0]?.address_changed === true };
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

/**
 * Creates a job and logs its opening event, in one statement.
 *
 * `options.parentJobId` links a job back to the one it came from — a customer's service request
 * makes a real job on the owners' board that points at the original. `options.eventBody` replaces
 * the hand-entered wording, so that opening event can say where the job actually came from.
 * `options.eventKind` records what kind of opening this was: a customer's service request logs
 * `service`, which is the value migration 019 widened the kind constraint to allow. It defaults
 * to `stage`, so every job entered by hand logs exactly what it always has.
 *
 * The new job is assigned to the default chosen in Settings (lead_settings, migration 023), read in
 * this same statement. The new-job form has no assignee field, so there is nothing for it to override.
 */
export async function createJob(
  input: NewJobInput,
  actor: string,
  options: { parentJobId?: string; eventBody?: string; eventKind?: JobEvent["kind"] } = {},
): Promise<string> {
  // A job entered as already installed (or completed) must not trigger tomorrow's review email; the owner can untick it.
  const installed = isInstalled(input.stage);
  const body = options.eventBody ?? (installed ? "Added by hand (review request off)" : "Added by hand");
  const kind = options.eventKind ?? "stage";
  const rows = await db()`
    with created as (
      insert into leads (name, phone, email, city, address, notes, source, status, review_opt_out, parent_job_id, assigned_to)
      values (${input.name}, ${input.phone}, ${input.email ?? null}, ${input.city},
              ${input.address ?? null}, ${input.notes ?? null}, ${input.source}, ${input.stage}, ${installed},
              ${options.parentJobId ?? null}, (select default_assignee from lead_settings where id))
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, to_status, body)
      select id, ${actor}, ${kind}, ${input.stage}, ${body} from created
    )
    select id from created`;
  const id = rows[0].id as string;
  // Here rather than in each caller, so every new job gets coordinates. Never blocks or fails the save.
  // after() throws outside a request (a script, a test); the job is already inserted, so log and move on,
  // and the route build's retry or the backfill picks it up.
  try {
    after(() => geocodeLead(id));
  } catch (error) {
    console.error("Could not schedule geocoding for job", id, error);
  }
  return id;
}

/**
 * Permanently deletes a job: the row, everything the foreign keys cascade with it
 * (its events, files, measurements, appointments, calendar links and install quotes)
 * and the job's objects in Blob storage. There is no undo.
 *
 * The order is load-bearing and deliberate:
 *
 * 1. A job with a service request against it is refused. `leads.parent_job_id` declares no
 *    `on delete` rule, so Postgres would refuse anyway — but with a raw error. A named
 *    outcome lets the UI say what to do instead.
 * 2. The blob pathnames are read BEFORE the delete, because `job_files` cascades away with
 *    the row and afterwards nothing says which objects belonged to it. The Outlook event ids
 *    are read before it for exactly the same reason: `job_calendar_events` cascades too, and
 *    `event_id` is the only record anywhere of which event on the owners' shared calendar
 *    belongs to this job. Once the row is gone, no cron can find the orphan — every branch of
 *    reconcileTargets joins `leads`.
 * 3. One statement deletes the row; the cascades do the rest.
 * 4. The blobs and the calendar events go AFTER, each independently. A blob or an event removed
 *    before a delete that then failed would leave a live job whose files, or whose appointment
 *    on the calendar, had already vanished.
 */
export async function deleteJob(id: string, actor: string): Promise<"deleted" | "has-children" | "missing"> {
  if (!isUuid(id)) return "missing";
  const sql = db();
  const children = await sql`select id from leads where parent_job_id = ${id} limit 1`;
  if (children.length > 0) return "has-children";

  // Before the delete: job_files and job_calendar_events are both `on delete cascade`.
  const pathnames = await listBlobPathnames(id);
  const links = await sql`select event_id from job_calendar_events where lead_id = ${id}`;
  const eventIds = links.map((row) => row.event_id as string);

  const rows = await sql`delete from leads where id = ${id} returning id`;
  if (rows.length === 0) return "missing";

  // The row is gone. A blob that will not delete is an orphan in storage — worth a log, and
  // not worth telling the owner their deletion failed when it did not. Nothing here rolls back.
  for (const pathname of pathnames) {
    await del(pathname).catch((error) => console.error("Could not remove orphaned blob", pathname, actor, error));
  }
  // Same rule for the calendar: a phantom event left on the shared mailbox is bad, but the job
  // really is deleted, so an Outlook outage must not report that as a failure. deleteEvent does
  // nothing when Outlook is not configured.
  for (const eventId of eventIds) {
    await deleteEvent(eventId).catch((error) => console.error("Could not remove orphaned calendar event", eventId, actor, error));
  }
  return "deleted";
}
