"use client";

import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";

export const GA_ID = "G-HP83GW86YX";

/**
 * The owners' admin app and the customer portal. Their use would swamp the public
 * site's numbers, and a client's own project activity is not Google's business.
 */
const UNTRACKED = ["/admin", "/project"];

export function isUntrackedPath(pathname: string): boolean {
  return UNTRACKED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** GA's documented per-property off switch, checked by gtag.js before every hit. */
function setGaDisabled(disabled: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = disabled;
}

/**
 * GA4 on the public site only. A visit that starts in the admin app or the portal
 * never loads it. A visit that starts on the public site has loaded it for good (a
 * script can't be unloaded), and GA counts every client-side URL change as a page
 * view, so moving into those areas throws GA's off switch instead.
 *
 * The switch is thrown during render, not in an effect: the router pushes the new
 * URL in an insertion effect, which runs before any effect of ours, and that push is
 * what GA counts. Setting a global flag while rendering is idempotent.
 */
export function SiteAnalytics() {
  const untracked = isUntrackedPath(usePathname());

  if (typeof window !== "undefined") setGaDisabled(untracked);

  return untracked ? null : <GoogleAnalytics gaId={GA_ID} />;
}
