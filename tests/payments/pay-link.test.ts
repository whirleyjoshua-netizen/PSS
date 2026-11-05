import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.test" }));
const { payLink, payPath, verifyPayLink } = await import("@/lib/payments/pay-link");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const sigOf = (path: string | null) => path!.split("/").at(-1)!;

beforeEach(() => vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_one"));
afterEach(() => vi.unstubAllEnvs());

describe("deposit pay link", () => {
  it("is /pay/<job>/<signature> on the site's own origin", () => {
    expect(payPath(JOB)).toMatch(new RegExp(`^/pay/${JOB}/[A-Za-z0-9_-]{22}$`));
    expect(payLink(JOB)).toBe(`https://pss.test${payPath(JOB)}`);
  });

  it("is the same link every time for one job, so a link already sent keeps working", () => {
    expect(payPath(JOB)).toBe(payPath(JOB));
  });

  it("verifies only its own job's signature", () => {
    const sig = sigOf(payPath(JOB));
    expect(verifyPayLink(JOB, sig)).toBe(true);
    expect(verifyPayLink(OTHER, sig)).toBe(false);
    expect(verifyPayLink(JOB, sigOf(payPath(OTHER)))).toBe(false);
  });

  it("refuses a tampered, short or malformed signature", () => {
    const sig = sigOf(payPath(JOB));
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    for (const bad of [flipped, sig.slice(0, 21), `${sig}x`, "", "../../etc/passwd", `${sig.slice(0, 21)}=`]) {
      expect(verifyPayLink(JOB, bad)).toBe(false);
    }
  });

  it("is keyed off the Stripe secret: a new key retires old links", () => {
    const sig = sigOf(payPath(JOB));
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_two");
    expect(verifyPayLink(JOB, sig)).toBe(false);
    expect(verifyPayLink(JOB, sigOf(payPath(JOB)))).toBe(true);
  });

  it("has no link, and verifies nothing, while card payments are not set up", () => {
    const sig = sigOf(payPath(JOB));
    vi.stubEnv("STRIPE_SECRET_KEY", "  ");
    expect(payPath(JOB)).toBeNull();
    expect(payLink(JOB)).toBeNull();
    expect(verifyPayLink(JOB, sig)).toBe(false);
  });
});
