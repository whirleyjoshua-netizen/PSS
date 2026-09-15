/** The exact window count: 1 to 30, with 31 standing for "30+". */
export const WINDOW_EXACT_MAX = 31;

export const windowCountLabel = (count: number): string => (count >= WINDOW_EXACT_MAX ? "30+" : String(count));

export const WINDOW_EXACT_OPTIONS = Array.from({ length: WINDOW_EXACT_MAX }, (_, index) => ({
  value: String(index + 1),
  label: windowCountLabel(index + 1),
}));

export const windowsPhrase = (count: number): string => (count === 1 ? "1 window" : `${windowCountLabel(count)} windows`);
