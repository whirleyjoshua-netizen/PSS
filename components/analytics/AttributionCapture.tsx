"use client";

import { useEffect } from "react";
import { rememberAttribution } from "@/lib/leads/attribution";

/**
 * Remembers an ad click on whichever page it lands, so the form can send it
 * later. Renders nothing. Storage can be blocked (private windows), and a
 * missed attribution must never break the page.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      rememberAttribution(window.localStorage, window.location.href);
    } catch {
      // No storage, no attribution. The lead still arrives.
    }
  }, []);
  return null;
}
