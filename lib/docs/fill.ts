import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { balanceCents, formatCents } from "@/lib/admin/money";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import { formatPhone } from "@/lib/leads/schema";
import { formatProjectNo } from "@/lib/portal/project-no";
import { isFieldKey, markerPattern, type FieldKey } from "./fields";

export type FillJob = Pick<Job, "name" | "email" | "phone" | "address" | "city" | "projectNo" | "soldCents" | "quoteCents" | "depositCents" | "installOn">;
export type FieldValues = Record<FieldKey, string | null>;
export type FillResult = { text: string; missing: FieldKey[]; unknown: string[] };

const present = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Spec §3: every field's value for this job at `now`. Null means "no value": the marker stays. */
export function fieldValues(job: FillJob, now: Date): FieldValues {
  const name = present(job.name);
  const phone = present(job.phone);
  const sold = job.soldCents ?? null;
  const total = sold ?? job.quoteCents ?? null;
  const balance = balanceCents(sold, job.depositCents ?? null);
  return {
    client_name: name,
    client_first_name: name ? name.split(/\s+/)[0] : null,
    client_email: present(job.email),
    client_phone: phone ? formatPhone(phone) : null,
    address: present(job.address),
    city: present(job.city),
    project_no: formatProjectNo(job.projectNo),
    today: formatShortDate(now),
    contract_total: total === null ? null : formatCents(total),
    deposit: job.depositCents == null ? null : formatCents(job.depositCents),
    balance_due: balance === null ? null : formatCents(balance),
    install_date: job.installOn ? formatDateOnly(job.installOn) : null,
    company_name: business.legalName,
    company_phone: business.phone.display,
    company_email: business.email,
  };
}

/**
 * A value is plain text wherever it lands: one line, no braces (so no new marker), no `*` at all (so
 * it can never open, close or extend bold, even beside the template's own `**`), and nothing at its
 * start that would read as a heading (`##`, `###`) or bullet (`-`) if the marker began a line. A value
 * that is only such a mark cleans to "", so the caller keeps the `{{key}}` marker instead.
 */
export function cleanValue(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[{}*]/g, "")
    .trim()
    .replace(/^(?:(?:#{2,}|-)(?:\s+|$))+/, "")
    .trim();
}

/** Replaces every marker it can. Spec §3: a field with no value stays `{{key}}`; unknown keys are reported. */
export function fillFields(body: string, values: FieldValues): FillResult {
  const missing = new Set<FieldKey>();
  const unknown = new Set<string>();
  const text = body.replace(markerPattern(), (marker: string, raw: string) => {
    const key = raw.trim();
    if (!isFieldKey(key)) {
      unknown.add(key);
      return marker;
    }
    const value = values[key];
    const cleaned = value === null ? "" : cleanValue(value);
    if (!cleaned) {
      missing.add(key);
      return `{{${key}}}`;
    }
    return cleaned;
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}
