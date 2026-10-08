import { describe, it, expect } from "vitest";
import { FAQ, PAINS, STEPS } from "@/content/consultation";

/** Takedown is a priced install extra (migration 027); only the haul-away is free. */
describe("the landing page never calls takedown free", () => {
  it("promises a free haul-away, not a free takedown", () => {
    const text = [...PAINS.map((p) => p.body), ...STEPS.map((s) => s.body), ...FAQ.map((f) => f.a)].join(" ");
    expect(text).not.toMatch(/take (them|your old blinds) down[^.]*free/i);
    expect(FAQ.find((f) => /old blinds/.test(f.q))!.a).toMatch(/Taking them down is priced per window on your quote/);
  });
});
