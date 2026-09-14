"use client";

import Link from "next/link";
import { Icon } from "@/components/admin/icons";

const BASE = "min-h-11 items-center justify-center gap-2 bg-charcoal px-5 text-sm font-medium text-ivory hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Touch devices get "Call <name>": the tel: link starts the call, and the tab
 * then opens the call screen so it is waiting after the call. Computers get
 * "Log a call", which opens the call screen and leaves dialing to the phone.
 * Both are rendered; CSS on the pointer type shows one.
 */
export function CallButton({ jobId, name, phone }: { jobId: string; name: string; phone: string }) {
  const first = name.trim().split(/\s+/)[0] || "customer";
  const screenHref = `/admin/jobs/${jobId}/call`;
  return (
    <div className="flex">
      <a href={`tel:+1${phone}`}
        onClick={() => { window.setTimeout(() => window.location.assign(screenHref), 300); }}
        className={`hidden [@media(pointer:coarse)]:inline-flex ${BASE}`}>
        <Icon name="phone" className="size-4" />
        Call {first}
      </a>
      <Link href={screenHref} className={`inline-flex [@media(pointer:coarse)]:hidden ${BASE}`}>
        <Icon name="phone" className="size-4" />
        Log a call
      </Link>
    </div>
  );
}
