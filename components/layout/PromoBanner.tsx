import { holidayPromo } from "@/content/promo";
import { isPromoLive, promoHideScript } from "@/lib/promo";
import { PromoBannerClient } from "./PromoBannerClient";

/**
 * The holiday strip above the header. The inline script comes first so it can hide a closed or expired banner
 * before it paints; the build-time check only covers builds made outside the window.
 */
export function PromoBanner() {
  const promo = holidayPromo;
  if (!isPromoLive(promo, new Date())) return null;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: promoHideScript(promo) }} />
      <PromoBannerClient promo={promo} />
    </>
  );
}
