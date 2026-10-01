"use client";

import { useState, useTransition, type FormEvent } from "react";
import { formatCents } from "@/lib/admin/money";
import { isRefundableStage } from "@/lib/admin/stages";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import type { DepositMethod } from "@/lib/payments/deposits";
import { PAID_HOW } from "@/lib/payments/paid-how";
import { cancelDepositAction, recordDepositAction } from "./deposit-actions";

export type DepositView = {
  jobStatus: string;
  amountCents: number;
  soldCents: number;
  /** The last day of the 3-business-day window, YYYY-MM-DD. */
  lastCancellableDay: string;
  inWindow: boolean;
  paid: { id: string; amountCents: number; method: DepositMethod; paidAt: Date } | null;
  refunded: { amountCents: number; refundedAt: Date } | null;
  cardPending: boolean;
};

const field = "min-h-11 border border-rule px-2";
const primary = "inline-flex min-h-11 items-center justify-center bg-charcoal px-5 text-sm text-ivory disabled:opacity-40";
const secondary = "inline-flex min-h-11 items-center justify-center border border-charcoal px-5 text-sm";

/** The Quote tab's deposit (spec §4): what is due or paid, Payment received, and Cancel & refund with its confirmation. */
export function DepositPanel({ jobId, view }: { jobId: string; view: DepositView }) {
  const [recording, setRecording] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: string } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const canRecord = !view.paid && view.jobStatus === "signed";
  // Ruling P21: before Ordered, or Lost, while a deposit is paid. The action re-checks it.
  const canCancel = view.paid !== null && isRefundableStage(view.jobStatus);
  const lastDay = formatDateOnly(view.lastCancellableDay);

  const record = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await recordDepositAction(jobId, String(form.get("amount") ?? ""), String(form.get("method") ?? ""));
      if (result.error) setMessage({ error: result.error });
      else {
        setRecording(false);
        setMessage({ ok: "Deposit recorded. The job is Sold." });
      }
    });
  };

  const cancel = () => {
    if (!view.paid) return;
    const depositId = view.paid.id;
    start(async () => {
      const result = await cancelDepositAction(jobId, depositId);
      if (result.error) setMessage({ error: result.error });
      else {
        setConfirming(false);
        setMessage({ ok: "Cancelled and refunded. The job is Lost." });
      }
    });
  };

  return (
    <section aria-labelledby="deposit-heading" className="flex flex-col gap-3 border-t border-rule pt-5">
      <h2 id="deposit-heading" className="text-lg font-semibold">Deposit</h2>
      {view.refunded ? (
        <p className="text-sm">Deposit {formatCents(view.refunded.amountCents)} refunded {formatShortDate(view.refunded.refundedAt)}.</p>
      ) : null}
      {view.paid ? (
        <p className="text-sm">Deposit {formatCents(view.paid.amountCents)} paid {PAID_HOW[view.paid.method]} on {formatShortDate(view.paid.paidAt)}.</p>
      ) : canRecord ? (
        <p className="text-sm">
          50% deposit due: {formatCents(view.amountCents)} of {formatCents(view.soldCents)}.
          {view.cardPending ? " The client has opened card checkout." : ""}
        </p>
      ) : null}

      {canRecord ? (
        recording ? (
          <form onSubmit={record} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Deposit received
              <input name="amount" inputMode="decimal" defaultValue={(view.amountCents / 100).toFixed(2)} className={`${field} w-32`} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Paid by
              <select name="method" defaultValue="check" className={field}>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button type="submit" disabled={pending} className={primary}>Record payment</button>
            <button type="button" onClick={() => setRecording(false)} disabled={pending} className={`${secondary} disabled:opacity-40`}>Keep waiting</button>
          </form>
        ) : (
          <div>
            <button type="button" onClick={() => { setRecording(true); setMessage(null); }} className={secondary}>Payment received</button>
          </div>
        )
      ) : null}

      {canCancel && view.paid ? (
        confirming ? (
          <div className="flex flex-col gap-2 border border-rule p-3 text-sm">
            <p>
              {view.inWindow
                ? `The client is inside the 3-business-day cancellation window, which ends at the end of ${lastDay}.`
                : `The 3-business-day cancellation window closed at the end of ${lastDay}.`}
            </p>
            <p>
              {view.paid.method === "stripe"
                ? `This refunds ${formatCents(view.paid.amountCents)} to the client's card in full, cancels the contract and marks the job Lost.`
                : `This marks the ${formatCents(view.paid.amountCents)} deposit refunded — return it to the client yourself — cancels the contract and marks the job Lost.`}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={cancel} disabled={pending} className={primary}>Yes, cancel and refund</button>
              <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={`${secondary} disabled:opacity-40`}>Keep the order</button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => { setConfirming(true); setMessage(null); }} className={secondary}>Cancel &amp; refund</button>
          </div>
        )
      ) : null}

      {message && "ok" in message ? <p role="status" className="text-sm">{message.ok}</p> : null}
      {message && "error" in message ? <p role="alert" className="text-sm text-red-700">{message.error}</p> : null}
    </section>
  );
}
