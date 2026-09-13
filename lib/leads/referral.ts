/**
 * Referral sources that can be encoded into a link, e.g. a printed QR code:
 *   https://premiershadesolutions.com/contact?ref=flyer
 *
 * The value prefills "How did you hear about us?" on the consultation form, so
 * a scanned flyer arrives already attributed instead of as an anonymous web
 * lead. That is the whole point of putting a code on print: knowing whether
 * the print worked.
 *
 * Keys are short because they are encoded into the QR — every character adds
 * modules to the symbol, and denser symbols scan worse at flyer size.
 */
export const REFERRAL_SOURCES: Record<string, string> = {
  flyer: "Flyer",
  card: "Business card",
  van: "Saw our van",
  yard: "Yard sign",
  door: "Door hanger",
  show: "Home show or event",
  friend: "Referral from a friend",
};

/** Maps a ?ref= value to its form label, or undefined if unrecognized. */
export function referralLabel(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  return REFERRAL_SOURCES[ref.toLowerCase()];
}

/** Every label that can appear in the form's "how did you hear" select. */
export const HEARD_VIA_OPTIONS = [
  "Google search",
  "Referral from a friend",
  "Saw our van",
  "Flyer",
  "Business card",
  "Yard sign",
  "Door hanger",
  "Home show or event",
  "Social media",
  "Other",
] as const;
