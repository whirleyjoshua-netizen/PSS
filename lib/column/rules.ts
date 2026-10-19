import { z } from "zod";
import { business } from "@/content/business";
import { bearerKey, hashKey } from "@/lib/agents/rules";
import type { LeadRow } from "./store";

export const LEADS_PAGE = 500;
export const MAX_LINKS = 1000;
export const UNSUBSCRIBE_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

/** The sha256 of the Column key on a request (`Authorization: Bearer <key>`), or null when there isn't a well-formed one. */
export const columnKeyHash = (request: Request): string | null => {
  const key = bearerKey(request.headers.get("authorization"));
  return key ? hashKey(key) : null;
};

export const unsubscribeUrl = (token: string): string => `${business.domain}/unsubscribe/${token}`;

/** Where the next page starts, and how many to take. A bad cursor or limit is refused rather than guessed. */
export const pageQuery = z.object({
  after: z.uuid("after must be a lead id").nullable(),
  limit: z.coerce.number().int().min(1).max(LEADS_PAGE).default(LEADS_PAGE),
});

export const linksBody = z.object({
  emails: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(MAX_LINKS, `At most ${MAX_LINKS} addresses at a time`),
});

/** A lead as Column reads it. Field names are snake_case, like the agents' sync. */
export function leadJson(lead: LeadRow, token: string | undefined) {
  return {
    id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, address: lead.address, city: lead.city,
    source: lead.source, stage: lead.stage, lost_reason: lead.lostReason, assigned_to: lead.assignedTo,
    created_at: lead.createdAt.toISOString(), updated_at: lead.updatedAt?.toISOString() ?? null,
    stage_changed_at: lead.stageChangedAt?.toISOString() ?? null,
    do_not_email: lead.suppressed,
    unsubscribe_url: token ? unsubscribeUrl(token) : null,
  };
}
