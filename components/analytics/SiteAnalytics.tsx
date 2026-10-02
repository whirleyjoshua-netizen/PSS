"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";

export const GA_ID = "G-HP83GW86YX";
/** The Google Ads tag. It rides on GA's gtag.js: one more `config` on the same dataLayer. */
export const ADS_ID = "AW-18438614507";

/**
 * GoogleAnalytics takes a single ID, so the Ads ID is configured by an inline
 * script on the same `dataLayer` (GoogleAnalytics' default name) that GA's
 * gtag.js reads. Both are afterInteractive scripts, inserted in render order, so
 * this runs after GA's init; the `|| []` keeps it safe either way.
 */
const ADS_CONFIG = `
  window['dataLayer'] = window['dataLayer'] || [];
  function gtag(){window['dataLayer'].push(arguments);}
  gtag('config', '${ADS_ID}');`;

/**
 * The owners' admin app and the customer portal. Their use would swamp the public
 * site's numbers, and a client's own project activity is not Google's business.
 */
const UNTRACKED = ["/admin", "/project"];

export function isUntrackedPath(pathname: string): boolean {
  return UNTRACKED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** gtag.js's documented per-tag off switch, checked before every hit, for GA and the Ads tag. */
function setGaDisabled(disabled: boolean) {
  for (const id of [GA_ID, ADS_ID]) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
}

/**
 * GA4 and the Google Ads tag on the public site only. A visit that starts in the admin app or the portal
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

  if (untracked) return null;
  return (
    <>
      <GoogleAnalytics gaId={GA_ID} />
      <Script id="google-ads-config" dangerouslySetInnerHTML={{ __html: ADS_CONFIG }} />
    </>
  );
}
