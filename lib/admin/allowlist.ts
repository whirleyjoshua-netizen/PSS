export const parseAllowlist = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** Read on every request, so removing an address locks it out immediately. */
export const isAllowed = (email: string, raw = process.env.ADMIN_EMAILS): boolean =>
  parseAllowlist(raw).includes(email.trim().toLowerCase());
