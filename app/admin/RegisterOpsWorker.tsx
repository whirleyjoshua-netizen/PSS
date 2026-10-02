"use client";

import { useEffect } from "react";

/** Registers the PSS Ops service worker, which only shows an offline page when an admin page can't load. */
export function RegisterOpsWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/ops-sw.js", { scope: "/admin" }).catch((error: unknown) => {
      console.warn("Could not register the PSS Ops offline page", error);
    });
  }, []);
  return null;
}
