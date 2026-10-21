"use client";

import { useSyncExternalStore } from "react";
import { isPromoLive, type Season } from "@/lib/promo";

const noSubscribe = () => () => {};

/**
 * The offers inside a hero form (the homepage's holiday and solar lines, the Solar Shades page's line), above Invite Us Over, with the hidden note that tags the lead
 * the way the /holiday form does. The homepage is prerendered, so Hero only renders this when the offer was live at
 * build time; here the browser checks again, so a page built during the offer drops the line and the note after
 * it ends. (Hero's season script hides the line before it paints; this removes the note from the form.)
 */
export function HeroOffer({ line, note, season }: { line: string | readonly string[]; note: string; season: Season }) {
  const live = useSyncExternalStore(
    noSubscribe,
    () => isPromoLive(season, new Date()),
    // The server only renders this while the offer is live, so hydration starts from that.
    () => true,
  );
  if (!live) return null;
  return (
    <div data-holiday-offer className="border-l-4 border-holiday-red bg-holiday-red/5 px-3 py-2">
      {(typeof line === "string" ? [line] : line).map((text) => (
        <p key={text} className="text-sm font-medium text-charcoal">{text}</p>
      ))}
      <input type="hidden" name="notes" value={note} readOnly />
    </div>
  );
}
