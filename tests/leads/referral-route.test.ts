import { describe, it, expect, vi, beforeEach } from "vitest";

const insertLead = vi.fn();
const findReferrer = vi.fn();
vi.mock("@/lib/leads/db", () => ({ insertLead }));
vi.mock("@/lib/leads/email", () => ({
  sendLeadNotification: vi.fn(async () => {}),
  sendCustomerConfirmation: vi.fn(async () => {}),
}));
vi.mock("@/lib/referrals/db", () => ({ findReferrer }));

const { POST } = await import("@/app/api/consultation/route");
const REFERRER = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const body = { name: "Ana Diaz", phone: "7025550199", email: "ana@example.com", city: "Henderson", source: "hero" };

const request = (payload: unknown, cookie?: string) =>
  new Request("http://localhost/api/consultation", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  insertLead.mockReset().mockResolvedValue({ id: "new" });
  findReferrer.mockReset().mockResolvedValue({ id: REFERRER, code: "K7M2QX", firstName: "Sarah" });
});

describe("referral attribution", () => {
  it("links the lead to the referrer from the form's code", async () => {
    await POST(request({ ...body, referralCode: "K7M2QX" }));
    expect(findReferrer).toHaveBeenCalledWith("K7M2QX");
    expect(insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ referredBy: REFERRER, heardVia: "Referral from a friend" }),
    );
  });

  it("falls back to the remembered cookie, for the homepage form", async () => {
    await POST(request(body, "pss_ref=K7M2QX"));
    expect(findReferrer).toHaveBeenCalledWith("K7M2QX");
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ referredBy: REFERRER }));
  });

  it("prefers the form's code over the cookie", async () => {
    await POST(request({ ...body, referralCode: "AAAAAA" }, "pss_ref=K7M2QX"));
    expect(findReferrer).toHaveBeenCalledWith("AAAAAA");
  });

  it("keeps a how-did-you-hear answer the visitor chose", async () => {
    await POST(request({ ...body, referralCode: "K7M2QX", heardVia: "Google search" }));
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ heardVia: "Google search" }));
  });

  it("saves an unknown code's lead unattributed", async () => {
    findReferrer.mockResolvedValue(null);
    const response = await POST(request({ ...body, referralCode: "ZZZZZZ" }));
    expect(response.status).toBe(201);
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ referredBy: null }));
  });

  it("never loses the lead when the referral lookup fails", async () => {
    findReferrer.mockRejectedValue(new Error("Neon down"));
    const response = await POST(request({ ...body, referralCode: "K7M2QX" }));
    expect(response.status).toBe(201);
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ referredBy: null }));
  });

  it("does not look anything up without a code", async () => {
    await POST(request(body));
    expect(findReferrer).not.toHaveBeenCalled();
  });
});
