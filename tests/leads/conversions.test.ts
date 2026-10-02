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

  it("leaves out the Consultation row for a Google lead form lead, which Google already counts, but keeps its booking and sale", () => {
    const csv = conversionsCsv([{
      gclid: "Cj0goo",
      createdAt: new Date("2026-09-14T20:05:00Z"),
      bookedAt: new Date("2026-09-15T17:00:00Z"),
      soldAt: new Date("2026-09-20T18:30:00Z"),
      soldCents: 120000,
      source: "google_form",
    }]);
    expect(csv.split("\n")).toEqual([
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
      "Cj0goo,Appointment booked,2026-09-15 17:00:00+00:00,,",
      "Cj0goo,Sale,2026-09-20 18:30:00+00:00,1200.00,USD",
      "",
    ]);
  });
  it("writes nothing for a Google lead form lead that has gone nowhere yet", () => {
    const csv = conversionsCsv([{ gclid: "x", createdAt: new Date("2026-09-14T00:00:00Z"), bookedAt: null, soldAt: null,
      soldCents: null, source: "google_form" }]);
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
  it("still writes all three rows for a website lead", () => {
    const csv = conversionsCsv([{ gclid: "w", createdAt: new Date("2026-09-14T00:00:00Z"),
      bookedAt: new Date("2026-09-15T00:00:00Z"), soldAt: new Date("2026-09-16T00:00:00Z"), soldCents: 100, source: "hero" }]);
    expect(csv.trim().split("\n").slice(1).map((line) => line.split(",")[1]))
      .toEqual(["Consultation request", "Appointment booked", "Sale"]);
  });
});
