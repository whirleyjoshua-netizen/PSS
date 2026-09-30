import { describe, expect, it } from "vitest";
import { PAID_HOW } from "@/lib/payments/paid-how";

describe("PAID_HOW", () => {
  it("words every deposit method the way the receipts and the Quote tab say it", () => {
    expect(PAID_HOW).toEqual({ stripe: "by card", check: "by check", cash: "in cash", other: "by other means" });
  });
});
