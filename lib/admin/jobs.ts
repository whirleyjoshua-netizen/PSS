import "server-only";
import { db } from "@/lib/db";
import type { DetailsInput, NewJobInput } from "./schema";
import { isStage, type Stage } from "./stages";

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
};

export type JobEvent = {
  id: string;
  createdAt: Date;
  actor: string;
  kind: "stage" | "note" | "edit" | "email" | "reward" | "measure" | "file";
  fromStatus: Stage | null;
  toStatus: Stage | null;
  body: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string): boolean => UUID.test(id);

// Date columns come back as strings so an install date never shifts across time zones.
export const JOB_COLUMNS = `id, created_at, name, phone, email, address, city, treatments, window_count,
  heard_via, notes, source, status, stage_changed_at, visit_at, quote_cents, sold_cents,
  deposit_cents, brands, ordered_on::text as ordered_on, install_on::text as install_on, lost_reason,
  referral_code, referred_by, referral_paid_at, review_requested_at, review_opt_out, portal_invited_at`;

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
  };
}

export const SEARCH_MAX = 100;

/** `%`, `_` and `\` are LIKE wildcards; escape them so a search is literal. */
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listJobs({ includeLost, search }: { includeLost: boolean; search?: string }): Promise<Job[]> {
  const term = (search ?? "").trim().slice(0, SEARCH_MAX);
  if (!term) {
    const rows = await db().query(
      `select ${JOB_COLUMNS} from leads where ($1 or status <> 'lost') order by stage_changed_at desc`,
      [includeLost],
    );
    return rows.map(toJob);
  }
  // Only treat the term as a phone search when it looks like one — otherwise a term like
  // "4521 Elm" or "Apt 2" has enough digits to flood results with unrelated phone matches.
  const digits = term.replace(/\D/g, "");
  const phoneDigits = /^[\d\s().+-]+$/.test(term) && digits.length >= 3 ? digits : "";
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where ($1 or status <> 'lost')
       and (name ilike $2 or email ilike $2 or city ilike $2 or address ilike $2
            or ($3 <> '' and phone like '%' || $3 || '%'))
     order by stage_changed_at desc`,
    [includeLost, likePattern(term), phoneDigits],
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
    fromStatus: (row.from_status as Stage | null) ?? null,
    toStatus: (row.to_status as Stage | null) ?? null,
    body: (row.body as string | null) ?? null,
  }));
}

/** One statement, so the stage and its log entry are saved together or not at all. */
export async function setStage(id: string, to: Stage, actor: string, reason?: string): Promise<boolean> {
  if (!isStage(to)) throw new Error(`Unknown stage: ${String(to)}`);
  if (!isUuid(id)) return false;
  const lostReason = to === "lost" ? (reason ?? null) : null;
  const rows = await db()`
    with prev as (select status from leads where id = ${id}),
    moved as (
      update leads set status = ${to}, lost_reason = ${lostReason},
        stage_changed_at = now(), updated_at = now()
      where id = ${id} and status <> ${to}
      returning id
    )
    insert into job_events (lead_id, actor, kind, from_status, to_status, body)
    select ${id}, ${actor}, 'stage', prev.status, ${to}, ${lostReason} from prev, moved
    returning id`;
  return rows.length > 0;
}

export async function updateDetails(id: string, input: DetailsInput, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    with changed as (
      update leads set
        visit_at = ${input.visitAt}, quote_cents = ${input.quoteCents},
        sold_cents = ${input.soldCents}, deposit_cents = ${input.depositCents},
        brands = ${input.brands}, ordered_on = ${input.orderedOn}::date,
        install_on = ${input.installOn}::date, updated_at = now()
      where id = ${id}
      returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'edit', 'Updated job details' from changed
    returning id`;
  return rows.length > 0;
}

export async function addNote(id: string, body: string, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'note', ${body} from leads where id = ${id}
    returning id`;
  return rows.length > 0;
}

export async function createJob(input: NewJobInput, actor: string): Promise<string> {
  // A job entered as already installed must not trigger tomorrow's review email; the owner can untick it.
  const body = input.stage === "installed" ? "Added by hand (review request off)" : "Added by hand";
  const rows = await db()`
    with created as (
      insert into leads (name, phone, email, city, address, notes, source, status, review_opt_out)
      values (${input.name}, ${input.phone}, ${input.email ?? null}, ${input.city},
              ${input.address ?? null}, ${input.notes ?? null}, ${input.source}, ${input.stage}, ${input.stage === "installed"})
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, to_status, body)
      select id, ${actor}, 'stage', ${input.stage}, ${body} from created
    )
    select id from created`;
  return rows[0].id as string;
}
