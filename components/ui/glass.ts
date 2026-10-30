/**
 * Frosted, rounded tiles over a hero photo (owner 2026-10-29: trialled on plantation shutters, then every category
 * and product page). Only from lg up, where the tiles sit on the photo; below lg they sit on sand and keep their
 * solid ivory.
 */
const GLASS_EDGE = "lg:rounded-2xl lg:border lg:border-white/50 lg:backdrop-blur-md";

/**
 * The title panel and the booking form. 80% is the floor: over the darkest hero (the motorization page's charcoal
 * shade) a 60% tile turned grey and the ink-soft lead fell to about 2.9:1; at 80% it clears WCAG AA (about 4.6:1).
 */
export const GLASS_TILE = `${GLASS_EDGE} lg:bg-ivory/80`;

/**
 * The review card: small grey type, often over the darkest part of the photo (the plantation shutters cabinets
 * turned a 60% tile muddy grey), so it stays a little firmer.
 */
export const GLASS_TILE_FIRM = `${GLASS_EDGE} lg:bg-ivory/90`;
