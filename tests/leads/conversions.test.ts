import { describe, it, expect } from "vitest";
import { conversionsCsv } from "@/lib/leads/conversions";

describe("conversionsCsv", () => {
  it("writes a lead, a booking and a sale with its value", () => {
    const csv = conversionsCsv([{
      gclid: "Cj0abc",
      createdAt: new Date("2026-09-14T20:05:00Z"),
      bookedAt: new Date("2026-09-15T17:00:00Z"),
      soldAt: new Date("2026-09-20T18:30:00Z"),
      soldCents: 245000,
    }]);
    expect(csv.split("\n")).toEqual([
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
      "Cj0abc,Consultation request,2026-09-14 20:05:00+00:00,,",
      "Cj0abc,Appointment booked,2026-09-15 17:00:00+00:00,,",
      "Cj0abc,Sale,2026-09-20 18:30:00+00:00,2450.00,USD",
      "",
    ]);
  });
  it("still reports a sale whose amount was never entered, without a value", () => {
    const csv = conversionsCsv([{ gclid: "x", createdAt: new Date("2026-09-14T00:00:00Z"), bookedAt: null,
      soldAt: new Date("2026-09-20T18:30:00Z"), soldCents: null }]);
    expect(csv.trim().split("\n")[2]).toBe("x,Sale,2026-09-20 18:30:00+00:00,,");
  });
  it("writes only the lead for a job that has gone nowhere yet", () => {
    const csv = conversionsCsv([{ gclid: "x", createdAt: new Date("2026-09-14T00:00:00Z"), bookedAt: null, soldAt: null, soldCents: null }]);
    expect(csv.trim().split("\n")).toHaveLength(2);
  });
});
