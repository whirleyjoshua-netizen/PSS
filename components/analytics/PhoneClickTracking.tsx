"use client";

import { useEffect } from "react";
import { trackPhoneClick } from "@/lib/analytics/events";

/**
 * Counts taps on our phone number anywhere on the public site. One listener on
 * the document covers every tel: link, so no link has to remember to report
 * itself. Renders nothing.
 */
export function PhoneClickTracking() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => trackPhoneClick(event, window.location.pathname);
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
