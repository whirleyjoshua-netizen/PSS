import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

describe("robots", () => {
  it("keeps crawlers out of the API and the admin area", () => {
    const [rule] = [robots().rules].flat();
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/admin"]));
  });
});
