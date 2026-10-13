import { describe, it, expect } from "vitest";
import { INSTALL_WARRANTY_YEARS, MOTOR_WARRANTY_YEARS, WARRANTY, WARRANTY_LINE } from "@/content/warranty";
import { STARTER_TERMS } from "@/lib/docs/starter-terms";

describe("warranty", () => {
  it("promises the same installation year as the contract", () => {
    expect(INSTALL_WARRANTY_YEARS).toBe(1);
    expect(STARTER_TERMS).toContain("We warrant our installation work for **1 year** from your installation date.");
  });

  it("publishes only the motor term every brand meets", () => {
    expect(MOTOR_WARRANTY_YEARS).toBe(5);
    expect(WARRANTY.motor).toBe("Motors and motorized parts: 5 years.");
  });

  it("never claims lifetime on everything", () => {
    expect(WARRANTY_LINE).toBe(
      "Limited lifetime manufacturer warranty, 5 years on motors, and 1 year on our installation.",
    );
    for (const line of [...Object.values(WARRANTY), WARRANTY_LINE]) {
      expect(line).not.toMatch(/lifetime (warranty )?on everything/i);
    }
  });
});
