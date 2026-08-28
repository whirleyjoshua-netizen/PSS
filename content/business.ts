/**
 * Single source of truth for name, address, phone (NAP).
 *
 * The phone number, email, and street address are not yet known. They live
 * here as placeholders and MUST NOT be duplicated anywhere else in the app —
 * tests/business.test.ts fails the build if a phone number appears in any
 * component. When the real values arrive, this is the only file that changes.
 */

export const PLACEHOLDER_PHONE_DISPLAY = "(702) 000-0000";
export const PLACEHOLDER_PHONE_HREF = "tel:+17020000000";
export const PLACEHOLDER_EMAIL = "hello@premiershadesolutions.com";

export const business = {
  name: "Premier Shade Solutions",
  legalName: "Premier Shade Solutions LLC",
  tagline: "Control the Light. Define the Space.",
  domain: "https://premiershadesolutions.com",

  phone: {
    display: PLACEHOLDER_PHONE_DISPLAY,
    href: PLACEHOLDER_PHONE_HREF,
    isPlaceholder: true,
  },

  email: PLACEHOLDER_EMAIL,
  emailIsPlaceholder: true,

  address: {
    locality: "Las Vegas",
    region: "NV",
    country: "US",
    /** No street address published until the business address is settled.
     *  A wrong address in LocalBusiness schema is worse than none. */
    isPlaceholder: true,
  },

  hours: "Monday–Saturday, by appointment",
  priceRange: "$$",

  serviceArea: ["Las Vegas", "Henderson", "Summerlin", "North Las Vegas"],

  socials: {} as Record<string, string>,
} as const;

export type Business = typeof business;
