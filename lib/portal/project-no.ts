/** The customer-facing project number. Internal ids never reach the portal. */
export const formatProjectNo = (n: number | null | undefined): string | null =>
  typeof n === "number" ? `PSS-${String(n).padStart(4, "0")}` : null;

/**
 * A quote option's number (quote options spec §2): option A is the job's own number (PSS-1042), option B
 * is PSS-1042-B, and so on to Z. Null without a project number, or for anything but one capital letter.
 */
export const formatOptionNo = (n: number | null | undefined, option: string): string | null => {
  const projectNo = formatProjectNo(n);
  if (projectNo === null || !/^[A-Z]$/.test(option)) return null;
  return option === "A" ? projectNo : `${projectNo}-${option}`;
};
