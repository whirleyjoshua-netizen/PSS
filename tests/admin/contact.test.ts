import { describe, it, expect } from "vitest";
import { CONTACT_METHODS, contactBody } from "@/lib/admin/contact";
import { contactSchema } from "@/lib/admin/schema";
import { formatShortDay } from "@/lib/admin/time";

describe("contact log", () => {
  it("offers the four ways, in order", () => {
    expect(CONTACT_METHODS.map((m) => m.label)).toEqual(["Called", "Texted", "Voicemail", "Email"]);
  });
  it("writes one line, methods in list order, note after a dash", () => {
    expect(contactBody(["texted", "called"], "left details on price")).toBe("Contacted · Called, Texted — left details on price");
    expect(contactBody(["voicemail"], null)).toBe("Contacted · Voicemail");
  });
  it("needs at least one method and keeps notes short", () => {
    expect(contactSchema.safeParse({ methods: [], note: "" }).error!.issues[0].message).toBe("Pick how you reached them");
    expect(contactSchema.safeParse({ methods: ["fax"], note: "" }).success).toBe(false);
    expect(contactSchema.safeParse({ methods: ["called"], note: "x".repeat(501) }).error!.issues[0].message).toBe("Keep the note under 500 characters");
    expect(contactSchema.parse({ methods: ["email", "called", "email"], note: "  " })).toEqual({ methods: ["email", "called"], note: null });
  });
  it("formats the last-contacted day in Las Vegas time", () => {
    expect(formatShortDay(new Date("2026-09-16T05:00:00Z"))).toBe("Tue 9/15");
  });
});
