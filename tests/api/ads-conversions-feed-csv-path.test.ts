import { describe, it, expect } from "vitest";
import * as feed from "@/app/api/ads/conversions/route";
import * as csvPath from "@/app/api/ads/conversions.csv/route";

describe("the .csv address for Google Data Manager", () => {
  it("is the very same handler, so it is protected exactly like the feed", () => {
    expect(csvPath.GET).toBe(feed.GET);
    expect(csvPath.dynamic).toBe("force-dynamic");
  });
});
