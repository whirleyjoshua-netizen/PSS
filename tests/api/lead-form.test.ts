// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertGoogleLead = vi.fn();
const sendLeadNotification = vi.fn();
const sendCustomerConfirmation = vi.fn();
const geocodeLead = vi.fn();

vi.mock("@/lib/leads/google-lead-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/leads/google-lead-db")>()),
  insertGoogleLead,
}));
vi.mock("@/lib/leads/email", () => ({ sendLeadNotification, sendCustomerConfirmation }));
vi.mock("@/lib/routes/geocode", () => ({ geocodeLead }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { (cb() as Promise<unknown> | undefined)?.catch?.(() => {}); } }));

const { POST } = await import("@/app/api/ads/lead-form/route");

const KEY = "a-long-random-leadform-key";
const LEAD_ID = "TeSter-123-ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const body = (over: Record<string, unknown> = {}) => ({
  lead_id: LEAD_ID,
  user_column_data: [
    { column_name: "Full Name", string_value: "Dana Reyes", column_id: "FULL_NAME" },
    { column_name: "User Phone", string_value: "+1 (702) 555-0123", column_id: "PHONE_NUMBER" },
    { column_name: "Postal Code", string_value: "89052", column_id: "POSTAL_CODE" },
  ],
  api_version: "1.0",
  form_id: 40000000000,
  campaign_id: 20000000000,
  adgroup_id: 0,
  creative_id: 0,
  gcl_id: "EAIaIQobChMI-gclid",
  google_key: KEY,
  is_test: false,
  ...over,
});

const raw = (text: string) =>
  POST(new Request("https://premiershadesolutions.com/api/ads/lead-form", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: text,
  }));
const call = (payload: unknown) => raw(JSON.stringify(payload));
const withLength = (text: string, length: string) =>
  POST(new Request("https://premiershadesolutions.com/api/ads/lead-form", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": length },
    body: text,
  }));

const nothingDone = () => {
  expect(insertGoogleLead).not.toHaveBeenCalled();
  expect(sendLeadNotification).not.toHaveBeenCalled();
  expect(geocodeLead).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("ADS_LEADFORM_KEY", KEY);
  insertGoogleLead.mockReset().mockResolvedValue({ id: "stored-id" });
  sendLeadNotification.mockReset().mockResolvedValue(undefined);
  sendCustomerConfirmation.mockReset().mockResolvedValue(undefined);
  geocodeLead.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("off unless ADS_LEADFORM_KEY is set and at least 16 characters", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["15 characters", "fifteen-chars-x"],
  ])("404 when the key is %s, even with a matching google_key", async (_label, value) => {
    vi.stubEnv("ADS_LEADFORM_KEY", value);
    const response = await call(body({ google_key: value ?? "" }));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    nothingDone();
  });

  it("works at exactly 16 characters", async () => {
    vi.stubEnv("ADS_LEADFORM_KEY", "sixteen-chars-xx");
    expect((await call(body({ google_key: "sixteen-chars-xx" }))).status).toBe(200);
    expect(insertGoogleLead).toHaveBeenCalledOnce();
  });
});

describe("403 on a wrong or missing google_key, nothing stored", () => {
  it.each([
    ["wrong", { google_key: "a-long-random-leadform-kez" }],
    ["a prefix of the key", { google_key: KEY.slice(0, 16) }],
    ["the key plus more", { google_key: `${KEY}x` }],
    ["empty", { google_key: "" }],
    ["null", { google_key: null }],
    ["not a string", { google_key: 12345 }],
  ])("%s", async (_label, over) => {
    const response = await call(body(over));
    expect(response.status).toBe(403);
    nothingDone();
  });

  it("missing", async () => {
    const { google_key: _drop, ...rest } = body();
    expect((await call(rest)).status).toBe(403);
    nothingDone();
  });

  it("a wrong key with an invalid body is still 403, so the schema isn't revealed", async () => {
    expect((await call({ google_key: "wrong" })).status).toBe(403);
    nothingDone();
  });
});

describe("400 on a body that isn't JSON or doesn't match the schema", () => {
  it("not JSON", async () => {
    expect((await raw("{not json")).status).toBe(400);
    nothingDone();
  });
  it("JSON that is not an object", async () => {
    expect((await raw("[1,2]")).status).toBe(400);
    nothingDone();
  });
  it("no lead_id", async () => {
    const { lead_id: _drop, ...rest } = body();
    expect((await call(rest)).status).toBe(400);
    nothingDone();
  });
  it("user_column_data that isn't an array", async () => {
    expect((await call(body({ user_column_data: "nope" }))).status).toBe(400);
    nothingDone();
  });
});

describe("413 on a body over 64 KB, by its content-length, before any parse", () => {
  it("rejects a content-length over 64 KB without reading the body", async () => {
    // Not JSON: a parse would answer 400, so 413 proves the body was never parsed.
    const response = await withLength("{not json", String(64 * 1024 + 1));
    expect(response.status).toBe(413);
    expect(await response.text()).toBe("");
    nothingDone();
  });

  it("rejects a real oversized lead too", async () => {
    const text = JSON.stringify(body({ padding: "x".repeat(70_000) }));
    expect((await withLength(text, String(Buffer.byteLength(text)))).status).toBe(413);
    nothingDone();
  });

  it("accepts a content-length of exactly 64 KB", async () => {
    const text = JSON.stringify(body());
    const padded = text.slice(0, -1) + "," + JSON.stringify("pad") + ":" + JSON.stringify("x".repeat(64 * 1024 - text.length - 9)) + "}";
    expect(Buffer.byteLength(padded)).toBe(64 * 1024);
    expect((await withLength(padded, String(64 * 1024))).status).toBe(200);
    expect(insertGoogleLead).toHaveBeenCalledOnce();
  });

  it("proceeds as before when there is no content-length", async () => {
    expect((await call(body())).status).toBe(200);
    expect(insertGoogleLead).toHaveBeenCalledOnce();
  });

  it("is still 404 when the route is off", async () => {
    vi.stubEnv("ADS_LEADFORM_KEY", "");
    expect((await withLength("{}", String(64 * 1024 + 1))).status).toBe(404);
  });
});

describe("Google's Send test data", () => {
  it("is_test: true answers 200 and stores and emails nothing", async () => {
    const response = await call(body({ is_test: true }));
    expect(response.status).toBe(200);
    nothingDone();
  });
});

describe("a new lead", () => {
  it("is inserted with the mapped fields and a fresh id, emailed, 200", async () => {
    const response = await call(body());
    expect(response.status).toBe(200);

    expect(insertGoogleLead).toHaveBeenCalledOnce();
    const stored = insertGoogleLead.mock.calls[0][0];
    expect(stored).toMatchObject({
      googleLeadId: LEAD_ID,
      name: "Dana Reyes",
      phone: "7025550123",
      email: null,
      zip: "89052",
      city: "Henderson",
      gclid: "EAIaIQobChMI-gclid",
    });
    expect(stored.notes).toContain("Google lead form (form 40000000000, campaign 20000000000)");
    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
    // The secret is never carried into the insert.
    expect(stored).not.toHaveProperty("key");
    expect(JSON.stringify(stored)).not.toContain(KEY);

    expect(sendLeadNotification).toHaveBeenCalledOnce();
    const [emailed, emailedId] = sendLeadNotification.mock.calls[0];
    expect(emailedId).toBe(stored.id);
    expect(emailed).toMatchObject({
      name: "Dana Reyes",
      phone: "7025550123",
      email: null,
      city: "Henderson",
      address: "89052",
      heardVia: "Google lead form",
      source: "google_form",
      attribution: { gclid: "EAIaIQobChMI-gclid", utmSource: "google", utmMedium: "cpc" },
    });
    expect(emailed.notes).toContain("Google lead form (form");
    expect(JSON.stringify(emailed)).not.toContain(KEY);
  });

  it("is never geocoded: its address is only a ZIP", async () => {
    expect((await call(body())).status).toBe(200);
    expect(insertGoogleLead).toHaveBeenCalledOnce();
    expect(geocodeLead).not.toHaveBeenCalled();
  });

  it("never sends the customer confirmation email", async () => {
    await call(body({
      user_column_data: [...body().user_column_data, { column_id: "EMAIL", string_value: "dana@example.com" }],
    }));
    expect(sendLeadNotification).toHaveBeenCalledOnce();
    expect(sendLeadNotification.mock.calls[0][0].email).toBe("dana@example.com");
    expect(sendCustomerConfirmation).not.toHaveBeenCalled();
  });

  it("still answers 200 when the lead is stored but the email fails", async () => {
    sendLeadNotification.mockRejectedValue(new Error("Resend down"));
    expect((await call(body())).status).toBe(200);
    expect(insertGoogleLead).toHaveBeenCalledOnce();
  });
});

describe("a resend of a lead already stored", () => {
  it("answers 200 and sends no email", async () => {
    insertGoogleLead.mockResolvedValue(null);
    const response = await call(body());
    expect(response.status).toBe(200);
    expect(insertGoogleLead).toHaveBeenCalledOnce();
    expect(sendLeadNotification).not.toHaveBeenCalled();
    expect(geocodeLead).not.toHaveBeenCalled();
  });
});

describe("never lose a lead", () => {
  it("insert fails but the email goes out → 200, no geocode", async () => {
    insertGoogleLead.mockRejectedValue(new Error("Neon down"));
    const response = await call(body());
    expect(response.status).toBe(200);
    expect(sendLeadNotification).toHaveBeenCalledOnce();
    expect(geocodeLead).not.toHaveBeenCalled();
  });

  it("insert and email both fail → 500 so Google retries", async () => {
    insertGoogleLead.mockRejectedValue(new Error("Neon down"));
    sendLeadNotification.mockRejectedValue(new Error("Resend down"));
    const response = await call(body());
    expect(response.status).toBe(500);
    expect(geocodeLead).not.toHaveBeenCalled();
  });
});
