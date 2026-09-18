import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION_KEY,
  adClickLabel,
  attributionFromUrl,
  recallAttribution,
  rememberAttribution,
} from "@/lib/leads/attribution";
import { consultationSchema } from "@/lib/leads/schema";

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
};
const now = new Date("2026-09-17T12:00:00Z");

describe("attributionFromUrl", () => {
  it("reads the gclid and campaign tags from a landing URL", () => {
    const click = attributionFromUrl(
      "https://premiershadesolutions.com/shutters?gclid=Cj0KabC&utm_source=google&utm_campaign=Custom%20Blinds&utm_term=blinds",
      now,
    );
    expect(click).toEqual({
      gclid: "Cj0KabC", utmSource: "google", utmCampaign: "Custom Blinds", utmTerm: "blinds",
      landingPage: "/shutters", clickedAt: now.toISOString(),
    });
  });
  it("is null for an ordinary visit, so an organic visit never overwrites an ad click", () => {
    expect(attributionFromUrl("https://premiershadesolutions.com/contact?ref=flyer")).toBeNull();
  });
});

describe("remembering a click", () => {
  it("round-trips through storage", () => {
    const store = memory();
    rememberAttribution(store, "https://x.test/?gclid=abc", now);
    expect(recallAttribution(store, now)?.gclid).toBe("abc");
  });
  it("keeps the earlier click when a later visit has none", () => {
    const store = memory();
    rememberAttribution(store, "https://x.test/?gclid=abc", now);
    rememberAttribution(store, "https://x.test/contact", now);
    expect(recallAttribution(store, now)?.gclid).toBe("abc");
  });
  it("drops a click older than Google's 90-day window", () => {
    const store = memory();
    rememberAttribution(store, "https://x.test/?gclid=abc", new Date("2026-06-01T00:00:00Z"));
    expect(recallAttribution(store, now)).toBeUndefined();
  });
  it("ignores garbage in storage", () => {
    const store = memory();
    store.setItem(ATTRIBUTION_KEY, "{not json");
    expect(recallAttribution(store, now)).toBeUndefined();
  });
});

describe("adClickLabel", () => {
  it("names a paid click Google Ads with its campaign and keyword", () => {
    expect(adClickLabel({ gclid: "a", utmCampaign: "Custom Blinds", utmTerm: "blinds" })).toBe(
      "Google Ads · Custom Blinds · “blinds”",
    );
  });
  it("is null with no click", () => {
    expect(adClickLabel({})).toBeNull();
    expect(adClickLabel(null)).toBeNull();
  });
});

describe("the consultation schema", () => {
  const base = { name: "Dana", phone: "7025550134", email: "d@example.com", city: "Henderson", source: "hero" };
  it("carries a click through", () => {
    expect(consultationSchema.parse({ ...base, attribution: { gclid: "abc" } }).attribution?.gclid).toBe("abc");
  });
  it("never fails a lead over a malformed click", () => {
    const parsed = consultationSchema.safeParse({ ...base, attribution: "nonsense" });
    expect(parsed.success).toBe(true);
  });
});
