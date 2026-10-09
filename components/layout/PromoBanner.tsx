import { Fragment } from "react";
import { promos } from "@/content/promo";
import { promoHideScript } from "@/lib/promo";
import { PromoBannerClient } from "./PromoBannerClient";

/**
 * The holiday strips above the header. Public pages are prerendered, so every strip that has not ended yet is
 * rendered, each with its inline script first: the script hides a strip that is closed, not started yet or over
 * before it paints, which is what hands one strip to the next on time when nobody redeploys.
 */
export function PromoBanner() {
  const now = Date.now();
  return promos
    .filter((promo) => new Date(promo.endsAt).getTime() > now)
    .map((promo) => (
      <Fragment key={promo.id}>
        <script dangerouslySetInnerHTML={{ __html: promoHideScript(promo) }} />
        <PromoBannerClient promo={promo} />
      </Fragment>
    ));
}
