/**
 * Single source of truth for name, address, phone (NAP).
 *
 * The phone number and email are live. The street address is still a
 * placeholder. Nothing here may be duplicated anywhere else in the app —
 * tests/business.test.ts fails if a phone number appears in any component.
 * When the remaining real values arrive, this is the only file that changes.
 */

export const business = {
  name: "Premier Shade Solutions",
  legalName: "Premier Shade Solutions LLC",
  tagline: "Control the Light. Define the Space.",
  domain: "https://premiershadesolutions.com",

  phone: {
    display: "(702) 859-8294",
    href: "tel:+17028598294",
    isPlaceholder: false,
  },

  email: "support@premiershadesolutions.com",
  emailIsPlaceholder: false,

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

  /** Published as schema.org sameAs so Google ties these profiles to the site. */
  socials: {
    googleBusinessProfile: "https://maps.google.com/?cid=17944498424867039244",
  } as Record<string, string>,
} as const;

export type Business = typeof business;

/**
 * How long production typically takes, shown on the customer's project page while
 * their order is in production. A rule of thumb for every job, never per-job data —
 * the copy says "typically" for that reason.
 */
export const PRODUCTION_ESTIMATE = "Typically 4–6 weeks from order to install";
