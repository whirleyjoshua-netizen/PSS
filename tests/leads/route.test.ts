import { describe, it, expect, vi, beforeEach } from "vitest";

const insertLead = vi.fn();
const sendLeadNotification = vi.fn();

vi.mock("@/lib/leads/db", () => ({ insertLead }));
vi.mock("@/lib/leads/email", () => ({ sendLeadNotification }));

const { POST } = await import("@/app/api/consultation/route");

const body = {
  name: "Dana Reyes",
  phone: "7025550134",
  email: "dana@example.com",
  city: "Henderson",
  source: "hero",
};

const request = (payload: unknown) =>
  new Request("http://localhost/api/consultation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  insertLead.mockReset().mockResolvedValue({ id: "abc" });
  sendLeadNotification.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/consultation", () => {
  it("stores the lead and sends the email on a valid request", async () => {
    const response = await POST(request(body));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(insertLead).toHaveBeenCalledOnce();
    expect(sendLeadNotification).toHaveBeenCalledOnce();
  });

  it("passes the normalized payload downstream, not the raw one", async () => {
    await POST(request({ ...body, phone: "(702) 555-0134", email: "DANA@Example.com" }));

    expect(insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "7025550134", email: "dana@example.com" }),
    );
  });

  it("returns 400 with a usable message when validation fails", async () => {
    const response = await POST(request({ ...body, email: "nope" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(insertLead).not.toHaveBeenCalled();
    expect(sendLeadNotification).not.toHaveBeenCalled();
  });

  it("returns 400 on a malformed request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/consultation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("still succeeds when the email fails, because the lead was saved", async () => {
    sendLeadNotification.mockRejectedValue(new Error("Resend down"));

    const response = await POST(request(body));

    expect(response.status).toBe(201);
    expect(insertLead).toHaveBeenCalledOnce();
  });

  it("still succeeds when the database fails, because the email was sent", async () => {
    insertLead.mockRejectedValue(new Error("Neon down"));

    const response = await POST(request(body));

    expect(response.status).toBe(201);
    expect(sendLeadNotification).toHaveBeenCalledOnce();
  });

  it("returns 502 only when both the database and the email fail", async () => {
    insertLead.mockRejectedValue(new Error("Neon down"));
    sendLeadNotification.mockRejectedValue(new Error("Resend down"));

    const response = await POST(request(body));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("attempts both writes concurrently rather than short-circuiting", async () => {
    insertLead.mockRejectedValue(new Error("Neon down"));

    await POST(request(body));

    // A sequential await would have skipped the email once the insert threw.
    expect(sendLeadNotification).toHaveBeenCalledOnce();
  });

  it("silently accepts a honeypot submission without storing it", async () => {
    const response = await POST(request({ ...body, company: "spam" }));

    // 201, not an error: telling a bot it was caught teaches it how to pass.
    expect(response.status).toBe(201);
    expect(insertLead).not.toHaveBeenCalled();
    expect(sendLeadNotification).not.toHaveBeenCalled();
  });
});
