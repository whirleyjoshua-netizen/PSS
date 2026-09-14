import { describe, it, expect } from "vitest";
import { balanceCents } from "@/lib/admin/money";

describe("balanceCents", () => {
  it("is sold minus deposit", () => {
    expect(balanceCents(500000, 250000)).toBe(250000);
  });
  it("treats a missing deposit as zero", () => {
    expect(balanceCents(500000, null)).toBe(500000);
  });
  it("is null until there is a sale", () => {
    expect(balanceCents(null, 100000)).toBeNull();
  });
});
