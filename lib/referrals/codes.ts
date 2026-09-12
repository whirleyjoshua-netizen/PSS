import { business } from "@/content/business";
import type { Stage } from "@/lib/admin/stages";

/** 32 characters with no 0/O or 1/I, so a code read aloud or retyped survives. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const REFERRAL_REWARD_CENTS = 10000;

export const REF_COOKIE = "pss_ref";
export const REF_COOKIE_SECONDS = 60 * 60 * 24 * 30;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** 256 is a multiple of 32, so masking each byte to 5 bits is unbiased. */
export function newReferralCode(bytes: (n: number) => Uint8Array = randomBytes): string {
  return Array.from(bytes(CODE_LENGTH), (byte) => CODE_ALPHABET[byte & 31]).join("");
}

export function normalizeCode(input: string | null | undefined): string | null {
  const code = (input ?? "").trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export const referralUrl = (code: string): string => `${business.domain}/r/${code}`;

export type RewardStatus = "pending" | "owed" | "paid" | "none";

export function rewardStatus(job: { status: Stage; referralPaidAt: Date | null }): RewardStatus {
  if (job.referralPaidAt) return "paid";
  if (job.status === "lost") return "none";
  return job.status === "installed" ? "owed" : "pending";
}

/** One cookie from a raw Cookie header. Route handlers get a plain Request in tests. */
export function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
