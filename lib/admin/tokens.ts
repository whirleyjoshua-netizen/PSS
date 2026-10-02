import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes. Only the hash is ever stored, so a leaked table is useless. */
export const newToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/**
 * What a sign-in row stores for its 6-digit code: sha256 of "email:code", never the code. Here,
 * with no server-only import, so the e2e specs set a known code with the app's own hash.
 */
export const codeHash = (email: string, code: string): string => hashToken(`${email}:${code}`);
