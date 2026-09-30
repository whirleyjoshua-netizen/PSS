import "server-only";
import {
  INITIALS_PATTERN, PNG_DATA_URL_MAX, PNG_DATA_URL_PREFIX, PNG_MAX_BYTES, PNG_MAX_HEIGHT, PNG_MAX_WIDTH,
} from "./adoption-limits";

/** What the client adopted (spec §2). Typed: the signature is the typed full name, drawn in the handwriting font. */
export type Adoption =
  | { method: "typed"; initials: string | null }
  | { method: "drawn"; signaturePng: Buffer; initialsPng: Buffer | null };

/**
 * The adoption's form fields, as posted. Nothing here is trusted until parseAdoption accepts it.
 * `method` is null when the post has no method field at all (FormData.get's null, not "").
 */
export type AdoptionForm = { method: string | null; initials: string; signatureImage: string; initialsImage: string };

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Width and height from the IHDR chunk, which the PNG format requires first: bytes 8-11 are its
 * length (13), 12-15 its type ("IHDR"), 16-19 the width and 20-23 the height, all big-endian.
 * Nothing is decoded (spec §9). Null when the header is not a PNG's.
 */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 33) return null; // signature 8 + length 4 + type 4 + data 13 + CRC 4
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) return null;
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A drawn image (spec §6): a PNG data URL, at most 150 KB decoded, 1 to 1200 wide and 1 to 400 high. Otherwise null. */
export function parsePngDataUrl(value: string): Buffer | null {
  // Length first, so a forged multi-megabyte post is refused without being decoded.
  if (value.length > PNG_DATA_URL_MAX || !value.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const body = value.slice(PNG_DATA_URL_PREFIX.length);
  // Buffer.from silently skips characters that are not base64, so the text is checked before decoding.
  if (body.length % 4 !== 0 || !BASE64.test(body)) return null;
  const bytes = Buffer.from(body, "base64");
  if (bytes.length > PNG_MAX_BYTES) return null;
  const size = pngSize(bytes);
  if (!size || size.width < 1 || size.height < 1 || size.width > PNG_MAX_WIDTH || size.height > PNG_MAX_HEIGHT) return null;
  return bytes;
}

/**
 * The posted adoption, validated (spec §6), or null for "invalid". The other method's fields are
 * ignored, not refused: a client who switched from Draw back to Type may still post a stale image.
 * Whether initials are required depends on the file, so requireInitials settles that afterwards.
 * A post with no method field at all is typed: a portal page opened before this feature deployed
 * posts only the name and the agree box. A method that is present but unknown (even "") is refused.
 */
export function parseAdoption(form: AdoptionForm): Adoption | null {
  if (form.method === null || form.method === "typed") {
    const initials = form.initials.trim();
    if (!initials) return { method: "typed", initials: null };
    return INITIALS_PATTERN.test(initials) ? { method: "typed", initials } : null;
  }
  if (form.method === "drawn") {
    const signaturePng = parsePngDataUrl(form.signatureImage);
    if (!signaturePng) return null;
    if (!form.initialsImage) return { method: "drawn", signaturePng, initialsPng: null };
    const initialsPng = parsePngDataUrl(form.initialsImage);
    return initialsPng ? { method: "drawn", signaturePng, initialsPng } : null;
  }
  return null;
}

/** Spec §6: initials are present exactly when the file has initial marks. Otherwise null ("invalid"). */
export function requireInitials(adoption: Adoption, needed: boolean): Adoption | null {
  const present = adoption.method === "typed" ? adoption.initials !== null : adoption.initialsPng !== null;
  return present === needed ? adoption : null;
}
