/**
 * Our insurance, from the certificate of liability insurance (ACORD 25) dated 2026-10-15 (owner, 2026-10-15).
 * Only the general liability policy is published: the property certificate shows no limits, and the professional
 * liability row has none filled in. The certificate itself is never posted (it carries the home address and the
 * policy number); the site offers it on request and the owners email it.
 *
 * tests/content/insurance.test.tsx fails once `expires` passes: renew, update this file, and the claim stays true.
 */
export const INSURANCE = {
  insurer: "Berkshire Hathaway Direct Insurance Company",
  agency: "biBERK",
  perOccurrence: 1_000_000,
  aggregate: 2_000_000,
  /** Policy period, as the certificate gives it. */
  effective: "2026-10-16",
  expires: "2027-10-16",
} as const;

/**
 * Our Nevada licence number, once the owner sends it. Until then the site says "insured", never "licensed".
 */
export const LICENSE_NUMBER: string | null = null;

/** The trust bar's line under "Insured". */
export const INSURED_LINE = "$1M liability coverage, backed by Berkshire Hathaway";

/** The footer's line on every page. */
export const INSURED_FOOTER =
  LICENSE_NUMBER === null
    ? "Fully insured. Certificate of insurance on request."
    : `Licensed and insured. Nevada licence #${LICENSE_NUMBER}. Certificate of insurance on request.`;
