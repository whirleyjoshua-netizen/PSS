"use client";

import { useState, useTransition, type ReactNode } from "react";
import { formatCents } from "@/lib/admin/money";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import { keyDetails } from "@/lib/dc/contract-layout";
import { diffLines, type LineChange } from "@/lib/dc/diff";
import { dcQuoteUrl } from "@/lib/dc/links";
import { cancellationWindowLastDay, inCancellationWindow } from "@/lib/docs/business-days";
import { ruleFor, type PricedLine } from "@/lib/dc/pricing";
import type { Review } from "@/lib/dc/send";
import type { StoredLine, StoredVersion } from "@/lib/dc/store";
import { sendContractAction, sendQuoteAction, setChoicesAction, setLinePctAction } from "./quote-actions";
import { HEADING, TEXT_LINK } from "./ui";

const STATUS: Record<StoredVersion["status"], string> = {
  draft: "Draft", offered: "Quote sent", sent: "Contract sent", signed: "Signed", superseded: "Superseded", cancelled: "Cancelled",
};
const EMAIL_FAILED = "Quote sent, but the email to the client failed — send them their project page link yourself.";
const CONTRACT_EMAIL_FAILED = "Contract sent, but the email to the client failed — send them their project page link yourself.";
const MARKUP_SETTINGS = "/admin/settings#markup-heading";
const cell = "border-b border-rule px-2 py-2 align-top";
const num = `${cell} text-right tabular-nums`;

function changeText(change: LineChange): string {
  if (change.kind === "added") return `Line ${change.position} added: ${change.description}`;
  if (change.kind === "removed") return `Line ${change.position} removed: ${change.description}`;
  const parts: string[] = [];
  if (change.fromMsrpCents !== change.toMsrpCents) parts.push(`MSRP ${formatCents(change.fromMsrpCents)} → ${formatCents(change.toMsrpCents)}`);
  if (change.fromQty !== change.toQty) parts.push(`qty ${change.fromQty} → ${change.toQty}`);
  if (parts.length === 0) parts.push("description changed");
  return `Line ${change.position} ${change.description}: ${parts.join(", ")}`;
}

/**
 * One line's % of MSRP. Uncontrolled and keyed by the saved value, so a refresh after a save
 * shows what the server stored. Saves on blur, and only when the text changed.
 */
function PctInput({ jobId, versionId, line, priced, rule, locked }: {
  jobId: string; versionId: string; line: StoredLine; priced: PricedLine; rule: number | null; locked: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const initial = priced.pct === null ? "" : String(priced.pct);
  return (
    <div className="flex flex-col items-end gap-1">
      <input
        key={`${versionId}:${line.position}:${initial}`}
        aria-label={`Line ${line.position} % of MSRP`}
        className="min-h-11 w-20 border border-rule px-2 text-right read-only:bg-transparent read-only:border-transparent"
        inputMode="decimal"
        defaultValue={initial}
        placeholder={rule === null ? "" : String(rule)}
        readOnly={locked}
        aria-busy={pending || undefined}
        onBlur={(event) => {
          const raw = event.currentTarget.value;
          if (locked || raw.trim() === initial) return;
          startTransition(async () => {
            const result = await setLinePctAction(jobId, versionId, line.position, raw);
            setError(result.error ?? null);
          });
        }}
      />
      {priced.source === "override" ? <span className="text-xs text-champagne-ink">adjusted</span> : null}
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

/**
 * Uncontrolled and keyed by the saved value plus a refusal count, so a refresh or a refused save
 * puts the box back to what is stored. Disabled while any choice is saving, so two quick
 * toggles can't land out of order.
 */
function Choice({ label, checked, locked, busy, resets, onChange }: {
  label: string; checked: boolean; locked: boolean; busy: boolean; resets: number; onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-sm">
      <input key={`${checked}:${resets}`} type="checkbox" defaultChecked={checked} disabled={locked || busy}
        onChange={(event) => onChange(event.currentTarget.checked)} />
      {label}
    </label>
  );
}

function Total({ label, value, children, muted }: { label: string; value: string; children?: ReactNode; muted?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1 ${muted ? "text-sm text-ink-soft" : ""}`}>
      <dt>{label}</dt>
      <div className="flex flex-wrap items-center gap-3">
        {children}
        <dd className="tabular-nums">{value}</dd>
      </div>
    </div>
  );
}

/**
 * The owner's review of the latest DC quote version. Every figure charged to the client is read
 * from `review.priced`, the object whose fingerprint Send compares, so the screen can't show a
 * number Send wouldn't charge. Nothing is fetched here: the server passes the whole review.
 */
export function QuoteReview({ jobId, review, now }: { jobId: string; review: Review; now?: Date }) {
  const { version, priced, blockers, fingerprint, install, rules, olderVersions } = review;
  const locked = version.status !== "draft";
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: string } | { error: string } | null>(null);
  const [sending, startSend] = useTransition();
  const [choosing, startChoice] = useTransition();
  const [refusals, setRefusals] = useState(0);

  const pricedFor = (position: number) => priced.lines.find((l) => l.position === position)!;
  const previous = olderVersions[0];
  const changes = previous ? diffLines(previous.lines, version.lines) : [];
  const signedEarlier = olderVersions.find((v) => v.status === "signed");
  // Spec §9: the order is not placed until the 3-business-day cancellation window has passed.
  // Named as the last day the client may cancel, not the midnight after it (which reads as "12:00 AM" the next day).
  const lastCancellableDay = version.status === "signed" && version.signedAt ? cancellationWindowLastDay(version.signedAt) : null;
  const inWindow = lastCancellableDay !== null && version.signedAt !== null && inCancellationWindow(version.signedAt, now ?? new Date());

  const choose = (choices: { waiveHandling?: boolean; noInstall?: boolean }) =>
    startChoice(async () => {
      const { error } = await setChoicesAction(jobId, version.id, choices);
      setChoiceError(error ?? null);
      if (error) setRefusals((n) => n + 1);
    });

  const send = () =>
    startSend(async () => {
      const result = await sendQuoteAction(jobId, version.id, fingerprint);
      if (result.error) setSendResult({ error: result.error });
      else setSendResult({ ok: result.emailed === false ? EMAIL_FAILED : "Quote sent." });
    });

  // Spec §2: the client approved, but the contract step failed (the owners were emailed). The owner sends it.
  const awaitingContract = version.status === "offered" && version.approvedAt !== null;
  const sendContract = () =>
    startSend(async () => {
      const result = await sendContractAction(jobId, version.id);
      if (result.error) setSendResult({ error: result.error });
      else setSendResult({ ok: result.emailed === false ? CONTRACT_EMAIL_FAILED : "Contract sent." });
    });

  const installNote = version.noInstall
    ? "No installation"
    : install
      ? `${install.kind === "final" ? "Final install price" : "Estimate"}, ${formatShortDate(install.createdAt)}`
      : null;

  return (
    <section aria-labelledby="dc-quote-heading" className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="dc-quote-heading" className="text-lg font-semibold">
          DC quote {version.dcQuoteNo} · version {version.version}{olderVersions.length > 0 ? ` of ${olderVersions.length + 1}` : ""}
        </h2>
        {/* The name DC printed, so a quote filed on the wrong household is visible before it is priced. */}
        <span className="text-sm">Direct Connect client: {version.clientName || "none given"}</span>
        <span className="border border-rule px-2 py-0.5 text-xs uppercase tracking-wide">{STATUS[version.status]}</span>
        <a className={TEXT_LINK} href={`/admin/files/${version.sourceFileId}`} target="_blank" rel="noreferrer">Dealer copy</a>
      </header>

      {version.status === "offered" && version.offeredAt ? (
        <p className="text-sm">Quote sent {formatShortDate(version.offeredAt)} for {formatCents(priced.clientTotalCents)}.{version.approvedAt ? "" : " Waiting for the client to approve it."}</p>
      ) : null}
      {awaitingContract && version.approvedAt ? (
        <p className="text-sm font-semibold">The client approved this quote on {formatShortDate(version.approvedAt)}, but the contract was not sent.</p>
      ) : null}
      {version.sentAt ? <p className="text-sm">Contract sent {formatShortDate(version.sentAt)} for {formatCents(priced.clientTotalCents)}</p> : null}
      {version.status === "signed" ? (
        <div className="flex flex-col gap-1">
          {inWindow && version.signedAt && lastCancellableDay ? (
            <p className="text-sm font-semibold">
              Signed {formatShortDate(version.signedAt)}. Cancellation window ends at the end of {formatDateOnly(lastCancellableDay)} — place the Direct Connect order after that.
            </p>
          ) : (
            <>
              {version.signedAt ? <p className="text-sm">Signed {formatShortDate(version.signedAt)}</p> : null}
              <a className={`${TEXT_LINK} font-semibold`} href={dcQuoteUrl(version.dcQuoteNo)} target="_blank" rel="noopener noreferrer">
                Signed — ready to order: Open quote {version.dcQuoteNo} in Direct Connect
              </a>
            </>
          )}
        </div>
      ) : null}

      {previous ? (
        changes.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <p id="dc-changes">Changes from version {previous.version}:</p>
            <ul aria-labelledby="dc-changes" className="list-disc pl-5">
              {changes.map((c) => <li key={`${c.kind}-${c.position}`}>{changeText(c)}</li>)}
            </ul>
          </div>
        ) : (
          <p className="text-sm">No price or quantity changes from version {previous.version}.</p>
        )
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className={cell}>Room</th>
              <th className={cell}>Product</th>
              <th className={cell}>Details</th>
              <th className={`${cell} text-right`}>Qty</th>
              <th className={`${cell} text-right`}>MSRP</th>
              <th className={`${cell} text-right`}>% of MSRP</th>
              <th className={`${cell} text-right`}>Sell</th>
              <th className={`${cell} text-right`}>Cost</th>
              <th className={`${cell} text-right`}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {version.lines.map((line) => {
              const p = pricedFor(line.position);
              return (
                <tr key={line.position}>
                  <th scope="row" className={`${cell} text-left font-normal`}>{line.room || "Accessory"}</th>
                  <td className={cell}>{line.description.replace(/^Hunter Douglas\s+/, "")}</td>
                  <td className={`${cell} text-ink-soft`}>{keyDetails(line.options)}</td>
                  <td className={num}>{line.qty}</td>
                  <td className={num}>{formatCents(line.msrpUnitCents)}</td>
                  <td className={num}>
                    <PctInput jobId={jobId} versionId={version.id} line={line} priced={p} rule={ruleFor(rules, line.collection)} locked={locked} />
                  </td>
                  {p.source === "missing" ? (
                    <td className={cell}>
                      <a className={TEXT_LINK} href={MARKUP_SETTINGS}>Set a markup in Settings</a>
                    </td>
                  ) : (
                    <td className={num}>
                      <div>{formatCents(p.sellExtendedCents)}</div>
                      {line.qty > 1 ? <div className="text-xs text-ink-soft">{formatCents(p.sellUnitCents)} each</div> : null}
                    </td>
                  )}
                  <td className={num}>{formatCents(line.costExtendedCents)}</td>
                  <td className={num}>{p.source === "missing" ? "—" : formatCents(p.marginCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="flex max-w-xl flex-col self-end">
        <Total label="Products" value={formatCents(priced.productsCents)} />
        <Total label="HD handling fee" value={formatCents(priced.handlingChargedCents)}>
          <Choice label="Waive" checked={priced.waiveHandling} locked={locked} busy={choosing} resets={refusals} onChange={(checked) => choose({ waiveHandling: checked })} />
        </Total>
        {priced.oversizedCents > 0 ? <Total label="Oversized" value={formatCents(priced.oversizedCents)} /> : null}
        <Total label="Installation" value={formatCents(priced.installCents)}>
          {installNote ? <span className="text-xs text-ink-soft">{installNote}</span> : (
            <a className={TEXT_LINK} href={`/admin/jobs/${jobId}?tab=install`}>No installation price saved yet</a>
          )}
          <Choice label="No installation on this job" checked={version.noInstall} locked={locked} busy={choosing} resets={refusals} onChange={(checked) => choose({ noInstall: checked })} />
        </Total>
        <div className="border-t border-charcoal pt-1 font-semibold">
          <Total label="Client total" value={formatCents(priced.clientTotalCents)} />
        </div>
        <Total label="Your cost (HD)" value={formatCents(priced.costCents)} muted />
        <Total label="Margin" value={formatCents(priced.marginCents)} muted />
        {choiceError ? <p role="alert" className="text-sm text-red-700">{choiceError}</p> : null}
      </dl>

      <div className="flex flex-col gap-3">
        {signedEarlier && !locked ? (
          <p className="text-sm font-semibold">
            The client signed version {signedEarlier.version} for {formatCents(signedEarlier.clientTotalCents)}. Sending this one asks them to sign a change for {formatCents(priced.clientTotalCents)}.
          </p>
        ) : null}
        {blockers.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <p id="dc-blockers" className={HEADING}>Before you can send</p>
            <ul aria-labelledby="dc-blockers" className="list-disc pl-5">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={send} disabled={blockers.length > 0 || sending}
            className="inline-flex min-h-11 items-center justify-center bg-charcoal px-5 text-sm text-ivory disabled:cursor-not-allowed disabled:opacity-40">
            Send quote
          </button>
          {awaitingContract ? (
            <button type="button" onClick={sendContract} disabled={sending}
              className="inline-flex min-h-11 items-center justify-center border border-charcoal px-5 text-sm disabled:opacity-40">
              Send contract
            </button>
          ) : null}
        </div>
        {sendResult && "ok" in sendResult ? <p role="status" className="text-sm">{sendResult.ok}</p> : null}
        {sendResult && "error" in sendResult ? <p role="alert" className="text-sm text-red-700">{sendResult.error}</p> : null}
      </div>

      {olderVersions.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer">Older versions</summary>
          <ul className="mt-2 flex flex-col gap-1 pl-5">
            {olderVersions.map((v) => (
              <li key={v.id}>Version {v.version} · {v.status} · {v.clientTotalCents === null ? "not sent" : formatCents(v.clientTotalCents)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
