/** Holds the one-day questionnaire key. Only ever sent back to /thank-you, and never readable by page scripts. */
export const QUESTIONNAIRE_COOKIE = "pss_q";
export const QUESTIONNAIRE_SECONDS = 60 * 60 * 24;

/** The Set-Cookie value for a new key. base64url keys need no escaping. */
export function questionnaireCookie(key: string): string {
  return [
    `${QUESTIONNAIRE_COOKIE}=${key}`,
    "Path=/thank-you",
    `Max-Age=${QUESTIONNAIRE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}
