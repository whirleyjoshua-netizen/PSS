import { describe, it, expect } from "vitest";
import { googleLeadPayloadSchema, parseGoogleLead } from "@/lib/leads/google-lead-form";

const col = (column_id: string, string_value: string) => ({ column_id, string_value });

const base = {
  lead_id: "lead-abc-123",
  api_version: "1.0",
  form_id: 40000000001,
  campaign_id: 23000000002,
  adgroup_id: 1,
  creative_id: 2,
  gcl_id: "gclid-xyz",
  google_key: "k".repeat(20),
  is_test: false,
  user_column_data: [
    col("FULL_NAME", "Dana Reyes"),
    col("PHONE_NUMBER", "+1 (702) 555-0123"),
    col("POSTAL_CODE", "89052"),
  ],
};

const parse = (payload: unknown) => {
  const result = parseGoogleLead(payload);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.lead;
};

describe("googleLeadPayloadSchema", () => {
  it("allows unknown fields", () => {
    expect(googleLeadPayloadSchema.safeParse({ ...base, something_new: 1 }).success).toBe(true);
  });
});

describe("parseGoogleLead", () => {
  it("builds a lead from FULL_NAME, phone and ZIP", () => {
    const lead = parse(base);
    expect(lead).toEqual({
      googleLeadId: "lead-abc-123",
      name: "Dana Reyes",
      phone: "7025550123",
      email: null,
      zip: "89052",
      city: "Henderson",
      gclid: "gclid-xyz",
      notes: "Google lead form (form 40000000001, campaign 23000000002)",
      isTest: false,
      key: "k".repeat(20),
    });
  });

  it("joins FIRST_NAME and LAST_NAME when FULL_NAME is absent", () => {
    const lead = parse({
      ...base,
      user_column_data: [col("FIRST_NAME", "Dana"), col("LAST_NAME", "Reyes"), col("PHONE_NUMBER", "7025550123")],
    });
    expect(lead.name).toBe("Dana Reyes");
  });

  it("falls back to column_name when column_id is missing", () => {
    const lead = parse({
      ...base,
      user_column_data: [{ column_name: "FULL_NAME", string_value: "Pat Lee" }],
    });
    expect(lead.name).toBe("Pat Lee");
  });

  it('names a lead with no name "Google lead"', () => {
    const lead = parse({ ...base, user_column_data: [col("PHONE_NUMBER", "7025550123")] });
    expect(lead.name).toBe("Google lead");
  });

  it("keeps a short phone number and notes it", () => {
    const lead = parse({ ...base, user_column_data: [col("FULL_NAME", "Dana"), col("PHONE_NUMBER", "555-0123")] });
    expect(lead.phone).toBe("5550123");
    expect(lead.notes).toMatch(/phone/i);
    expect(lead.notes).toMatch(/10 digits/);
  });

  it("does not note a valid 10-digit phone", () => {
    expect(parse(base).notes).not.toMatch(/phone/i);
  });

  it("takes EMAIL when present", () => {
    const lead = parse({ ...base, user_column_data: [...base.user_column_data, col("EMAIL", "dana@example.com")] });
    expect(lead.email).toBe("dana@example.com");
  });

  it("uses Las Vegas and notes it when the ZIP is missing", () => {
    const lead = parse({ ...base, user_column_data: [col("FULL_NAME", "Dana"), col("PHONE_NUMBER", "7025550123")] });
    expect(lead.zip).toBeNull();
    expect(lead.city).toBe("Las Vegas");
    expect(lead.notes).toContain("ZIP not in the service-area list");
  });

  it("uses Las Vegas and notes it when the ZIP is out of area", () => {
    const lead = parse({ ...base, user_column_data: [col("FULL_NAME", "Dana"), col("POSTAL_CODE", "90210")] });
    expect(lead.zip).toBe("90210");
    expect(lead.city).toBe("Las Vegas");
    expect(lead.notes).toContain("ZIP not in the service-area list");
  });

  it("does not add the ZIP note for an in-area ZIP", () => {
    expect(parse(base).notes).not.toContain("ZIP not in the service-area list");
  });

  it("passes is_test through", () => {
    expect(parse({ ...base, is_test: true }).isTest).toBe(true);
    const { is_test: _omit, ...noFlag } = base;
    expect(parse(noFlag).isTest).toBe(false);
  });

  it("gives a null gclid and undefined key when Google omits them", () => {
    const { gcl_id: _g, google_key: _k, ...rest } = base;
    const lead = parse(rest);
    expect(lead.gclid).toBeNull();
    expect(lead.key).toBeUndefined();
  });

  it.each([null, "a string", 42, [1, 2]])("rejects a non-object payload %j", (payload) => {
    const result = parseGoogleLead(payload);
    expect(result.ok).toBe(false);
  });

  it("rejects a payload without lead_id", () => {
    const { lead_id: _l, ...rest } = base;
    expect(parseGoogleLead(rest).ok).toBe(false);
  });
});
