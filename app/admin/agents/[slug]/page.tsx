import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { formatWhen } from "@/lib/admin/time";
import { REPORT_TYPES } from "@/lib/agents/rules";
import { getAgent, listItems } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

const FILTERS: readonly { value: (typeof REPORT_TYPES)[number] | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "brief", label: "Brief" },
  { value: "other", label: "Other" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting on you", approved: "Approved", sent: "Sent", failed: "Send failed", declined: "Declined", answered: "Answered",
};

/** One agent's history: its reports (filterable by type), then the emails and decisions it raised. */
export default async function AgentPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const { type } = await searchParams;
  const agent = await getAgent(slug);
  if (!agent) notFound();
  // Only a known type reaches the query; anything else shows everything.
  const picked = REPORT_TYPES.find((t) => t === type);
  const items = await listItems(agent.slug, picked);
  const reports = items.filter((i) => i.kind === "report");
  const raised = items.filter((i) => i.kind !== "report");
  const base = `/admin/agents/${agent.slug}`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/agents" className="text-sm underline underline-offset-4">← Agents</Link>
        <h1 className="text-2xl font-semibold">{agent.name}</h1>
        <p className="text-sm text-ink-soft">{agent.role}</p>
      </div>

      <section aria-labelledby="reports-heading" className="flex flex-col gap-3">
        <h2 id="reports-heading" className="text-lg font-semibold">Reports</h2>
        <nav aria-label="Report type" className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map(({ value, label }) => {
            const active = (value ?? undefined) === picked;
            return (
              <Link
                key={label}
                href={value ? `${base}?type=${value}` : base}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3 py-1 ${active ? "border-champagne bg-champagne/15 font-semibold" : "border-rule"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {reports.length === 0 ? (
          <p className="text-sm text-ink-soft">No reports{picked ? " of this type" : ""} yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                <Link href={`${base}/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                  {r.status === "unread" && <span aria-label="unread" className="mr-2 inline-block size-2 rounded-full bg-champagne" />}
                  {r.title}
                </Link>
                <span className="text-xs text-ink-soft">{formatWhen(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Emails and decisions have no report type, so a type filter leaves this list empty. */}
      {!picked && (
        <section aria-labelledby="raised-heading" className="flex flex-col gap-3">
          <h2 id="raised-heading" className="text-lg font-semibold">Emails and decisions</h2>
          {raised.length === 0 ? (
            <p className="text-sm text-ink-soft">None yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
              {raised.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`${base}/${i.id}`} className="font-medium underline-offset-4 hover:underline">{i.title}</Link>
                    <span className="rounded-full border border-rule px-2 text-xs">{i.kind === "email" ? "Email" : "Decision"} · {STATUS_LABEL[i.status] ?? i.status}</span>
                  </div>
                  {i.sentAt && <p className="text-xs text-ink-soft">Sent {formatWhen(i.sentAt)}</p>}
                  {i.ownerNote && <p className="text-sm text-ink-soft">Your note: {i.ownerNote}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
