/**
 * Sign marks (spec §2): where, on a generated PDF, the initials and the signature block belong.
 * Types and constants only, safe to import anywhere. The renderer (lib/docs/pdf.ts) draws the empty
 * boxes and records the marks, and the stamp (lib/portal/stamp.ts) writes into them. Both read the
 * geometry below, so the two can never disagree about where a box is.
 */
export type MarkPoint = { page: number; x: number; y: number };
/** `section` is the heading's number ("4" for "4. Your Right to Cancel"), for "Initialed sections: 4, 5". */
export type InitialsMark = MarkPoint & { section: string };
export type SignMarks = { initials: InitialsMark[]; signature: MarkPoint | null };

const NUMBERED = /^(\d+)\.\s/;

/** The section number of a numbered heading's text (spec §2: `^\d+\.\s`), or null. */
export const sectionNumber = (headingText: string): string | null => NUMBERED.exec(headingText.trimStart())?.[1] ?? null;

/** How much narrower a numbered heading wraps, leaving room for its initials box at the right margin. */
export const INITIALS_GUTTER = 64;
/** The initials line. The mark is its left end, lineDrop below the heading's first baseline. */
export const INITIALS_BOX = { width: 56, height: 16, lineDrop: 3 } as const;
/**
 * The signature block. The mark is the left end of the "Client signature" line. "Printed name" and
 * "Date" follow `row` points below each other. `height` is what the renderer keeps free before drawing it.
 */
export const SIGNATURE_BLOCK = {
  before: 30, row: 30, labelWidth: 100, lineWidth: 240, dateWidth: 120, signatureHeight: 26, lineDrop: 2, height: 110,
} as const;

const isPoint = (value: unknown): value is MarkPoint => {
  if (typeof value !== "object" || value === null) return false;
  const { page, x, y } = value as Record<string, unknown>;
  return Number.isInteger(page) && (page as number) >= 0 && Number.isFinite(x) && Number.isFinite(y);
};
const isInitials = (value: unknown): value is InitialsMark =>
  isPoint(value) && typeof (value as InitialsMark).section === "string" && /^\d+$/.test((value as InitialsMark).section);

/** Reads a stored `sign_marks` value. Anything malformed is null, and is then signed as a file with no marks. */
export function parseSignMarks(value: unknown): SignMarks | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.initials) || !record.initials.every(isInitials)) return null;
  if (record.signature !== null && !isPoint(record.signature)) return null;
  const signature = record.signature as MarkPoint | null;
  return {
    initials: (record.initials as InitialsMark[]).map(({ page, x, y, section }) => ({ page, x, y, section })),
    signature: signature === null ? null : { page: signature.page, x: signature.x, y: signature.y },
  };
}

export const initialedSections = (marks: SignMarks | null): string[] => marks?.initials.map((mark) => mark.section) ?? [];

/** True when the file has numbered sections to initial, in which case initials are required (spec §4). */
export const hasInitialMarks = (marks: SignMarks | null | undefined): boolean => (marks?.initials.length ?? 0) > 0;
