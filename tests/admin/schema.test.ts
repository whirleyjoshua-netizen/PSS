import { describe, it, expect } from "vitest";
import { appointmentSchema, detailsSchema, newJobSchema, noteSchema, lostSchema, routeSettingsSchema, teamMemberSchema, installRateSchema, installSettingsSchema, installLinesSchema, installKindSchema } from "@/lib/admin/schema";
import { APPOINTMENT_KINDS } from "@/lib/admin/appointment-kinds";
import { TEAM_ROLES } from "@/lib/admin/team-roles";

describe("new job stage", () => {
  const base = { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone" };
  it("defaults to a new lead", () => {
    expect(newJobSchema.parse(base).stage).toBe("new");
    expect(newJobSchema.parse({ ...base, stage: "" }).stage).toBe("new");
  });
  it("accepts any working stage", () => {
    expect(newJobSchema.parse({ ...base, stage: "quoted" }).stage).toBe("quoted");
  });
  it("rejects lost and unknown stages", () => {
    const lost = newJobSchema.safeParse({ ...base, stage: "lost" });
    expect(lost.success).toBe(false);
    expect(lost.error?.issues[0].message).toBe("Pick a stage");
    expect(newJobSchema.safeParse({ ...base, stage: "shipped" }).success).toBe(false);
  });
});

const place = { address: "", city: "Henderson" };

describe("detailsSchema", () => {
  it("turns form strings into typed values, with blanks as null", () => {
    const parsed = detailsSchema.parse({ ...place, 
      quote: "$4,500", sold: "", deposit: "2250",
      brands: ["Alta Window Fashions"], orderedOn: "2027-01-10",
    });
    expect(parsed).toEqual({
      quoteCents: 450000, soldCents: null, depositCents: 225000,
      brands: ["Alta Window Fashions"], orderedOn: "2027-01-10",
      address: null, city: "Henderson",
      budgetTier: null,
      windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null,
    });
  });

  it("rejects an unknown brand and a nonsense amount", () => {
    expect(detailsSchema.safeParse({ ...place,  brands: ["Acme"] }).success).toBe(false);
    expect(detailsSchema.safeParse({ ...place,  quote: "lots" }).success).toBe(false);
  });

  it("has no appointment dates: the Schedule button owns those", () => {
    const parsed = detailsSchema.parse({ ...place,  quote: "", visitAt: "2026-12-15T14:30", installOn: "2027-01-10" });
    expect(parsed).not.toHaveProperty("visitAt");
    expect(parsed).not.toHaveProperty("installOn");
  });
});

describe("detailsSchema address", () => {
  it("accepts an address and city, with a blank address as null", () => {
    expect(detailsSchema.parse({ address: "12 Sample St", city: "Henderson" })).toMatchObject({ address: "12 Sample St", city: "Henderson" });
    expect(detailsSchema.parse({ address: "  ", city: "Henderson" }).address).toBeNull();
  });
  it("requires a served city", () => {
    const result = detailsSchema.safeParse({ address: "12 Sample St", city: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("We currently serve the Las Vegas valley");
  });
});

describe("detailsSchema budget", () => {
  it("accepts a tier and maps blank to null", () => {
    expect(detailsSchema.parse({ ...place,  budget: "premium" }).budgetTier).toBe("premium");
    expect(detailsSchema.parse({ ...place,  budget: "" }).budgetTier).toBeNull();
    expect(detailsSchema.parse({ ...place, }).budgetTier).toBeNull();
  });
  it("rejects an unknown tier", () => {
    expect(detailsSchema.safeParse({ ...place,  budget: "luxury" }).success).toBe(false);
  });
});

describe("detailsSchema questionnaire fields", () => {
  it("parses exact windows, treatment types, motorized and gate code", () => {
    expect(detailsSchema.parse({ ...place,  windowCountExact: "31", treatmentTypes: ["shutters"], motorized: true, gateCode: " 12# " }))
      .toMatchObject({ windowCountExact: 31, treatmentTypes: ["shutters"], motorized: true, gateCode: "12#" });
  });
  it("rejects bad values", () => {
    expect(detailsSchema.safeParse({ ...place,  windowCountExact: "0" }).success).toBe(false);
    expect(detailsSchema.safeParse({ ...place,  treatmentTypes: ["Blinds"] }).success).toBe(false);
    expect(detailsSchema.safeParse({ ...place,  gateCode: "x".repeat(41) }).success).toBe(false);
  });
});

describe("newJobSchema", () => {
  it("accepts a phone lead without an email", () => {
    const parsed = newJobSchema.parse({
      name: "Dana Reyes", phone: "(702) 555-0134", email: "", city: "Henderson", source: "phone",
    });
    expect(parsed.phone).toBe("7025550134");
    expect(parsed.email).toBeUndefined();
  });

  it("requires a known source and a service-area city", () => {
    expect(newJobSchema.safeParse({ name: "Dana", phone: "7025550134", city: "Henderson", source: "hero" }).success).toBe(false);
    expect(newJobSchema.safeParse({ name: "Dana", phone: "7025550134", city: "Phoenix", source: "phone" }).success).toBe(false);
  });
});

describe("appointmentSchema", () => {
  const base = { kind: "consultation", startsAt: "2026-09-20T10:00", allDay: false };

  it("parses the datetime-local value as a Las Vegas instant", () => {
    const parsed = appointmentSchema.parse(base);
    expect(parsed.startsAt).toEqual(new Date("2026-09-20T17:00:00Z"));
    expect(parsed.kind).toBe("consultation");
    expect(parsed.allDay).toBe(false);
  });

  it("treats a missing checkbox as a timed appointment and 'on' as all day", () => {
    expect(appointmentSchema.parse({ kind: "install", startsAt: base.startsAt }).allDay).toBe(false);
    expect(appointmentSchema.parse({ ...base, kind: "install", allDay: true }).allDay).toBe(true);
  });

  it("accepts exactly the four kinds the Schedule button offers", () => {
    for (const kind of APPOINTMENT_KINDS) {
      expect(appointmentSchema.safeParse({ ...base, kind: kind.value }).success).toBe(true);
    }
    expect(appointmentSchema.safeParse({ ...base, kind: "visit" }).success).toBe(false);
  });

  it("asks for a date and time when it is missing or not a real one", () => {
    for (const startsAt of ["", "not-a-date", "2026-02-30T10:00", "2026-09-20"]) {
      const parsed = appointmentSchema.safeParse({ ...base, startsAt });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0].message).toBe("Pick a date and time");
    }
  });

  it("asks what the appointment is for when no kind was chosen", () => {
    expect(appointmentSchema.safeParse({ ...base, kind: "" }).error?.issues[0].message).toBe("Pick what this is for");
  });
});

describe("notes and lost reasons", () => {
  it("must not be empty", () => {
    expect(noteSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(lostSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(lostSchema.parse({ reason: " Went with a cheaper quote " }).reason).toBe("Went with a cheaper quote");
  });
});

describe("teamMemberSchema", () => {
  it("trims the name and accepts a role", () => {
    expect(teamMemberSchema.parse({ name: "  Shade ", role: "designer" })).toEqual({ name: "Shade", role: "designer" });
  });
  it("explains a missing name, a long name and a missing role", () => {
    expect(teamMemberSchema.safeParse({ name: " ", role: "designer" }).error?.issues[0].message).toBe("Enter a name");
    expect(teamMemberSchema.safeParse({ name: "x".repeat(61), role: "designer" }).error?.issues[0].message).toBe("Keep the name under 60 characters");
    expect(teamMemberSchema.safeParse({ name: "Shade", role: "" }).error?.issues[0].message).toBe("Pick Designer or Installer");
  });
  it("accepts exactly the roles the team list offers", () => {
    for (const role of TEAM_ROLES) {
      expect(teamMemberSchema.safeParse({ name: "Shade", role: role.value }).success).toBe(true);
    }
    expect(teamMemberSchema.safeParse({ name: "Shade", role: "owner" }).success).toBe(false);
  });
});

describe("routeSettingsSchema", () => {
  const form = { dayStart: "09:00", dayEnd: "18:00", consultationHours: "1", measureHours: "1", installHours: "4", serviceHours: "1.5" };
  const message = (input: Record<string, string>) => routeSettingsSchema.safeParse(input).error?.issues[0].message;

  it("turns hours into minutes", () => {
    expect(routeSettingsSchema.parse(form)).toEqual({
      dayStart: "09:00", dayEnd: "18:00",
      minutes: { consultation: 60, measure: 60, install: 240, service: 90 },
    });
  });

  it("rejects a day that ends before it starts", () => {
    expect(message({ ...form, dayStart: "18:00", dayEnd: "09:00" })).toBe("The day must end after it starts");
    expect(message({ ...form, dayStart: "09:00", dayEnd: "09:00" })).toBe("The day must end after it starts");
  });

  it("keeps lengths between a quarter hour and 12 hours, in quarter steps", () => {
    expect(message({ ...form, installHours: "0.1" })).toBe("Lengths are between 0.25 and 12 hours");
    expect(message({ ...form, installHours: "12.25" })).toBe("Lengths are between 0.25 and 12 hours");
    expect(message({ ...form, installHours: "1.3" })).toBe("Use quarter hours");
  });

  it("asks for a length when a box is left blank", () => {
    expect(message({ ...form, installHours: "" })).toBe("Enter the length in hours");
    expect(message({ ...form, installHours: "  " })).toBe("Enter the length in hours");
  });

  it("only accepts half-hour clock times", () => {
    expect(message({ ...form, dayStart: "09:15" })).toBe("Pick a time");
  });
});

describe("appointmentSchema timing", () => {
  const base = { kind: "install", startsAt: "2026-09-24T09:00", allDay: false };

  it("stores 'Any time' as no window", () => {
    const out = appointmentSchema.parse({ ...base, windowStart: "", windowEnd: "", hours: "4" });
    expect(out).toMatchObject({ windowStart: null, windowEnd: null, durationMinutes: 240 });
  });

  it("stores a window in 30-minute steps", () => {
    const out = appointmentSchema.parse({ ...base, windowStart: "08:00", windowEnd: "10:00", hours: "1.5" });
    expect(out).toMatchObject({ windowStart: "08:00", windowEnd: "10:00", durationMinutes: 90 });
  });

  it("needs both ends, in order", () => {
    expect(appointmentSchema.safeParse({ ...base, windowStart: "08:00", windowEnd: "", hours: "1" }).error!.issues[0].message)
      .toBe("Pick both ends of the arrival window, or Any time");
    expect(appointmentSchema.safeParse({ ...base, windowStart: "10:00", windowEnd: "08:00", hours: "1" }).error!.issues[0].message)
      .toBe("The window must end after it starts");
  });

  it("leaves the length unset when blank, so the kind's default applies", () => {
    expect(appointmentSchema.parse({ ...base, windowStart: "", windowEnd: "", hours: "" }).durationMinutes).toBeNull();
  });

  it("rejects lengths outside quarter hours between 0.25 and 12", () => {
    expect(appointmentSchema.safeParse({ ...base, windowStart: "", windowEnd: "", hours: "13" }).success).toBe(false);
  });
});

describe("appointmentSchema length", () => {
  const base = { kind: "install", startsAt: "2026-09-24T09:00", allDay: false, windowStart: "", windowEnd: "" };
  it("rejects a length that is not a quarter hour", () => {
    expect(appointmentSchema.safeParse({ ...base, hours: "1.1" }).error!.issues[0].message).toBe("Use quarter hours");
  });
  it("rejects a zero length", () => {
    expect(appointmentSchema.safeParse({ ...base, hours: "0" }).error!.issues[0].message).toBe("Lengths are between 0.25 and 12 hours");
  });
});

describe("installation rate money fields", () => {
  const settings = { minimumCents: "150", hardSurfaceCents: "0", highLadderCents: "50", motorizedCents: "15.50" };

  it("accepts money the way people type it", () => {
    const parsed = installSettingsSchema.safeParse({ ...settings, minimumCents: "$1,500" });
    expect(parsed.success && parsed.data.minimumCents).toBe(150_000);
    expect(installRateSchema.safeParse({ treatment: "roller_shades", basis: "window", rateCents: "$25" }).data?.rateCents).toBe(2500);
  });

  it("keeps 0 as a real amount", () => {
    expect(installSettingsSchema.safeParse(settings).data?.hardSurfaceCents).toBe(0);
  });

  it("rejects a blank minimum instead of saving it as zero", () => {
    const parsed = installSettingsSchema.safeParse({ ...settings, minimumCents: "  " });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe("Enter an amount, or 0");
  });

  it("asks in words for a pricing basis", () => {
    expect(installRateSchema.safeParse({ treatment: "roller_shades", basis: "", rateCents: "25" }).error?.issues[0].message)
      .toBe("Pick how this treatment is priced");
  });

  it("rejects an amount that is not money", () => {
    expect(installSettingsSchema.safeParse({ ...settings, motorizedCents: "abc" }).success).toBe(false);
  });
});

describe("installLinesSchema", () => {
  const line = {
    treatment: "roller_shades", count: 3, widthEighths: 240, heightEighths: null,
    hardSurface: false, highLadder: true, motorized: false,
  };

  it("accepts a valid line", () => {
    expect(installLinesSchema.safeParse([line]).data).toEqual([line]);
  });

  it("rejects a fractional count", () => {
    expect(installLinesSchema.safeParse([{ ...line, count: 1.5 }]).success).toBe(false);
  });

  it("rejects a negative count", () => {
    expect(installLinesSchema.safeParse([{ ...line, count: -1 }]).success).toBe(false);
  });

  it("rejects an unknown treatment", () => {
    expect(installLinesSchema.safeParse([{ ...line, treatment: "moat" }]).success).toBe(false);
  });

  it("rejects a width beyond the measurable maximum", () => {
    expect(installLinesSchema.safeParse([{ ...line, widthEighths: 600 * 8 + 1 }]).success).toBe(false);
  });

  it("says in words when a width or height is too small to measure", () => {
    expect(installLinesSchema.safeParse([{ ...line, widthEighths: 0 }]).error?.issues[0].message)
      .toBe("Enter a width of at least 1/8 inch");
    expect(installLinesSchema.safeParse([{ ...line, heightEighths: 0 }]).error?.issues[0].message)
      .toBe("Enter a height of at least 1/8 inch");
  });

  it("says in words when a width or height is too large", () => {
    expect(installLinesSchema.safeParse([{ ...line, widthEighths: 600 * 8 + 1 }]).error?.issues[0].message)
      .toBe("Enter a width of 600 inches or less");
    expect(installLinesSchema.safeParse([{ ...line, heightEighths: 600 * 8 + 1 }]).error?.issues[0].message)
      .toBe("Enter a height of 600 inches or less");
  });

  it("asks for a line when there are none", () => {
    expect(installLinesSchema.safeParse([]).error?.issues[0].message).toBe("Add at least one line before saving.");
  });

  it("accepts only estimate or final as a kind", () => {
    expect(installKindSchema.safeParse("final").success).toBe(true);
    expect(installKindSchema.safeParse("draft").success).toBe(false);
  });
});
