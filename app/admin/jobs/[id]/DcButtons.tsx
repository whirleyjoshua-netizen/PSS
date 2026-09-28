"use client";

import { useState, useTransition } from "react";
import { DC_NEW_QUOTE_URL, dcQuoteUrl } from "@/lib/dc/links";
import { checkNowAction } from "./quote-actions";
import { ACTION_LINK, TEXT_LINK } from "./ui";

/** Opens Direct Connect in a new tab. Before any quote exists, it copies the PSS number for the PO Reference field. */
export function DcButtons({ projectNo, dcQuoteNo }: { projectNo: string | null; dcQuoteNo: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  if (dcQuoteNo) {
    return (
      <a className={TEXT_LINK} href={dcQuoteUrl(dcQuoteNo)} target="_blank" rel="noopener noreferrer">
        Open quote {dcQuoteNo} in Direct Connect
      </a>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <a className={TEXT_LINK} href={DC_NEW_QUOTE_URL} target="_blank" rel="noopener noreferrer"
        onClick={() => {
          if (!projectNo) return;
          const copy = navigator.clipboard?.writeText(projectNo) ?? Promise.reject(new Error("no clipboard"));
          copy.then(
            () => setNote(`${projectNo} copied. Paste it into PO Reference.`),
            () => setNote(`Type ${projectNo} into PO Reference.`),
          );
        }}>
        Create quote in Direct Connect
      </a>
      {note ? <p role="status" className="text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}

/** Checks support@ for Dealer Copies now, instead of waiting for the next scheduled check. */
export function CheckNowButton({ jobId }: { jobId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className={ACTION_LINK} disabled={pending}
        onClick={() => startTransition(async () => setMessage((await checkNowAction(jobId)).message))}>
        {pending ? "Checking…" : "Check for new quotes"}
      </button>
      {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
    </div>
  );
}
