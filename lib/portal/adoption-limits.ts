/**
 * The adoption's limits (spec §4, §6), shared by the form and the server, so an input's own limits
 * and the server's checks cannot drift apart. Constants only, so this is safe in a client
 * component. That is why they are not in adoption.ts, which uses Buffer and is server-only.
 */
export const INITIALS_MAX = 6;
/** Spec §6, verbatim. Applied to the trimmed value. */
export const INITIALS_PATTERN = /^[A-Za-z][A-Za-z.\- ]{0,5}$/;
/** The same rule as an HTML pattern attribute. Browsers compile it with the v flag, where "-" in a class must be escaped. */
export const INITIALS_INPUT_PATTERN = "[A-Za-z][A-Za-z.\\- ]{0,5}";

export const PNG_MAX_BYTES = 150 * 1024;
export const PNG_MAX_WIDTH = 1200;
export const PNG_MAX_HEIGHT = 400;
export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
/** The longest data URL that can decode to PNG_MAX_BYTES. Checked before anything is decoded. */
export const PNG_DATA_URL_MAX = PNG_DATA_URL_PREFIX.length + Math.ceil(PNG_MAX_BYTES / 3) * 4;

/** CSS pixel caps for the two pads (spec §4). At a pixel ratio of at most 2, the PNGs stay within 1200 x 400. */
export const SIGNATURE_PAD = { maxWidth: 600, maxHeight: 200 } as const;
export const INITIALS_PAD = { maxWidth: 200, maxHeight: 100 } as const;
export const MAX_PIXEL_RATIO = 2;
