"use client";

import { useState } from "react";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-11 items-center self-start border border-charcoal px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
