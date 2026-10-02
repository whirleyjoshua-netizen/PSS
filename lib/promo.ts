/** A site-wide announcement strip. Lives in content/promo.ts; changing `id` re-shows it to people who closed the last one. */
export type Promo = {
  id: string;
  message: string;
  /** Phone-width version of `message`. */
  shortMessage: string;
  cta: string;
  shortCta: string;
  href: string;
  /** ISO instant with offset; inclusive. */
  startsAt: string;
  /** ISO instant with offset; exclusive. */
  endsAt: string;
  /** The lead-times dropdown flags install windows that run past this calendar day, e.g. "2026-12-24". */
  arriveBy?: { day: string; note: string };
};

export const promoStorageKey = (promo: Promo) => `pss-promo-closed:${promo.id}`;

export function isPromoLive(promo: Promo, now: Date): boolean {
  const t = now.getTime();
  return t >= new Date(promo.startsAt).getTime() && t < new Date(promo.endsAt).getTime();
}

/**
 * Runs inline before the banner is parsed, so a closed or expired banner never paints and never shifts the page.
 * It adds a <style> to <head> rather than touching React-owned elements, which keeps hydration clean. Public pages
 * are prerendered, so this is also what retires the banner on time when nobody redeploys.
 */
export function promoHideScript(promo: Promo): string {
  const data = JSON.stringify({
    key: promoStorageKey(promo),
    selector: `[data-promo=${JSON.stringify(promo.id)}]`,
    start: new Date(promo.startsAt).getTime(),
    end: new Date(promo.endsAt).getTime(),
  }).replace(/</g, "\\u003c");
  return `(function(p){var hide=Date.now()<p.start||Date.now()>=p.end;if(!hide){try{hide=localStorage.getItem(p.key)==="1"}catch(e){}}if(hide){var s=document.createElement("style");s.textContent=p.selector+"{display:none}";document.head.appendChild(s)}})(${data})`;
}
