/**
 * What the site promises about warranties. One source, so the homepage, product pages and FAQ can never
 * disagree with each other or with the contract.
 *
 * Owner, 2026-10-13: lifetime on the product, 5–7 years on motors depending on brand. Only the floor every
 * brand meets is published: Norman's own warranty page gives motors 5 years (not 7), Hunter Douglas and Bali
 * also give 5, and Alta's motor term could not be confirmed. Fabrics fade under shorter terms (Norman: 3
 * years) and manufacturers never pay for labor, so "lifetime on everything" would be false.
 *
 * The installation year must agree with §11 of the starter terms (lib/docs/starter-terms.ts);
 * tests/content/warranty.test.ts holds the two together.
 */
export const INSTALL_WARRANTY_YEARS = 1;
export const MOTOR_WARRANTY_YEARS = 5;

export const WARRANTY = {
  product:
    "A limited lifetime manufacturer warranty on blinds, shades and shutters, for as long as you own them.",
  motor: `Motors and motorized parts: ${MOTOR_WARRANTY_YEARS} years.`,
  install: `Our own installation work: ${INSTALL_WARRANTY_YEARS} year. If something goes wrong because of how we installed it, we come back and fix it at no charge.`,
  fineprint: "Your exact terms are written on your quote.",
} as const;

/** One line for tight spaces: trust strips, badges, product-page details. */
export const WARRANTY_LINE = `Limited lifetime manufacturer warranty, ${MOTOR_WARRANTY_YEARS} years on motors, and ${INSTALL_WARRANTY_YEARS} year on our installation.`;
