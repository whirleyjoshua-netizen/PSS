/** The contract terms upload's limits and messages, shared by the terms route and TermsSection. No imports: it runs in the browser too. */

/** Vercel refuses request bodies over about 4.5 MB before the route runs, so the cap sits below that. */
export const TERMS_MAX_BYTES = 4 * 1024 * 1024;
export const TERMS_NOT_A_PDF = "Upload a PDF file (its type must be application/pdf).";
export const TERMS_TOO_LARGE = "The PDF must be under 4 MB.";
