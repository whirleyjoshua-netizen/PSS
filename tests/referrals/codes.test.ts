import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET, CODE_LENGTH, REFERRAL_REWARD_CENTS, cookieValue, newReferralCode,
  normalizeCode, referralUrl, rewardStatus,
} from "@/lib/referrals/codes";
import { business } from "@/content/business";

describe("newReferralCode", () => {
  it("is six characters from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = newReferralCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const char of code) expect(CODE_ALPHABET).toContain(char);
    }
  });

  it("never uses characters that are easy to misread", () => {
    for (const char of "0O1I") expect(CODE_ALPHABET).not.toContain(char);
  });

  it("maps each random byte onto the alphabet", () => {
    const bytes = () => new Uint8Array([0, 1, 31, 32, 255, 8]);
    expect(newReferralCode(bytes)).toBe("AB9A9J");
  });
});

describe("normalizeCode", () => {
  it("uppercases and trims what a person retypes", () => {
    expect(normalizeCode("  k7m2qx ")).toBe("K7M2QX");
  });

  it("rejects anything that could not be a code", () => {
    expect(normalizeCode("K7M2Q")).toBeNull();
    expect(normalizeCode("K7M2QX1")).toBeNull();
    expect(normalizeCode("K0M2QX")).toBeNull();
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });
});

describe("referralUrl", () => {
  it("builds the link from the production domain", () => {
    expect(referralUrl("K7M2QX")).toBe(`${business.domain}/r/K7M2QX`);
  });
});

describe("rewardStatus", () => {
  it("is pending until the referred job is installed", () => {
    expect(rewardStatus({ status: "sold", referralPaidAt: null })).toBe("pending");
  });
  it("is owed once installed and unpaid", () => {
    expect(rewardStatus({ status: "installed", referralPaidAt: null })).toBe("owed");
  });
  it("is paid once marked paid", () => {
    expect(rewardStatus({ status: "installed", referralPaidAt: new Date() })).toBe("paid");
  });
  it("is none for a lost job", () => {
    expect(rewardStatus({ status: "lost", referralPaidAt: null })).toBe("none");
  });
  it("is one hundred dollars", () => {
    expect(REFERRAL_REWARD_CENTS).toBe(10000);
  });
});

describe("cookieValue", () => {
  it("reads one cookie out of a Cookie header", () => {
    expect(cookieValue("a=1; pss_ref=K7M2QX; b=2", "pss_ref")).toBe("K7M2QX");
  });
  it("is undefined when absent", () => {
    expect(cookieValue("a=1", "pss_ref")).toBeUndefined();
    expect(cookieValue(null, "pss_ref")).toBeUndefined();
  });

  it("is undefined when the value cannot be decoded", () => {
    expect(cookieValue("pss_ref=%E0", "pss_ref")).toBeUndefined();
  });
});
