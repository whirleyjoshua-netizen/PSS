import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes. Only the hash is ever stored, so a leaked table is useless. */
export const newToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
