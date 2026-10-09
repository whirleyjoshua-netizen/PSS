import { describe, expect, it } from "vitest";
import {
  bearerKey, composeEmailBody, defaultSignature, hashKey, isOptOut, newAgentKey, OPT_OUT_LINE, parsePushItem, pushSchema, sendBlocker,
} from "@/lib/agents/rules";

describe("keys", () => {
  it("makes 43-character base64url keys, different each time", () => {
    const a = newAgentKey(), b = newAgentKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  it("hashes to 64 hex characters", () => {
    expect(hashKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("reads only a well-formed bearer header", () => {
    const key = newAgentKey();
    expect(bearerKey(`Bearer ${key}`)).toBe(key);
    expect(bearerKey(`bearer ${key}`)).toBeNull();
    expect(bearerKey("Bearer short")).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
});

describe("push items", () => {
  const report = { kind: "report", external_id: "2026-10-09-daily", title: "Daily brief", report_type: "daily", body_md: "# Hi" };
  it("accepts a report, an email and a decision", () => {
    expect(parsePushItem(report)).toMatchObject({ ok: true });
    expect(parsePushItem({ kind: "email", external_id: "e-1", title: "Intro", email_to: "Pat@Example.com ", email_subject: "Hello", email_body: "Hi Pat", reason: "Four Seasons" }))
      .toEqual({ ok: true, item: expect.objectContaining({ email_to: "pat@example.com" }) });
    expect(parsePushItem({ kind: "decision", external_id: "A-001", title: "Pick a tagline" })).toMatchObject({ ok: true });
  });
  it("refuses two recipients, a bad id, a 201 KB report and an unknown kind, with a reason", () => {
    expect(parsePushItem({ kind: "email", external_id: "e-2", title: "x", email_to: "a@b.co, c@d.co", email_subject: "s", email_body: "b" })).toMatchObject({ ok: false });
    expect(parsePushItem({ ...report, external_id: "has space" })).toEqual({ ok: false, reason: expect.stringContaining("external_id") });
    expect(parsePushItem({ ...report, body_md: "x".repeat(204_801) })).toEqual({ ok: false, reason: expect.stringContaining("200 KB") });
    expect(parsePushItem({ kind: "tweet", external_id: "t", title: "t" })).toMatchObject({ ok: false });
  });
  it("caps a push at 50 items and allows a push with only a run status", () => {
    expect(pushSchema.safeParse({ items: Array(51).fill(report) }).success).toBe(false);
    expect(pushSchema.safeParse({ run: { status: "ok" } }).success).toBe(true);
  });
});

describe("email body", () => {
  it("adds signature, mailing address and the opt-out line, exactly", () => {
    expect(composeEmailBody("  Hi Pat  ", "PSS\n702", "PO Box 1, Las Vegas NV")).toBe(
      `Hi Pat\n\n--\nPSS\n702\nPO Box 1, Las Vegas NV\n\n${OPT_OUT_LINE}`,
    );
    expect(OPT_OUT_LINE).toBe(`If you'd rather not hear from us, just reply "no thanks".`);
  });
  it("default signature names the business, phone and site", () => {
    expect(defaultSignature()).toBe("Premier Shade Solutions\n(702) 859-8294\npremiershadesolutions.com");
  });
  it("spots opt-outs, and not lookalikes", () => {
    for (const t of ["No thanks.", "please UNSUBSCRIBE me", "STOP", "remove me from your list"]) expect(isOptOut(t)).toBe(true);
    for (const t of ["Thanks so much!", "nonstop schedule", "let's not stopgap"]) expect(isOptOut(t)).toBe(false);
  });
});

describe("sendBlocker", () => {
  const ok = { outlookConfigured: true, mailingAddress: "PO Box 1", suppressed: false, sentToday: 0, cap: 10 };
  it("allows a clean send", () => expect(sendBlocker(ok)).toBeNull());
  it("names each blocker", () => {
    expect(sendBlocker({ ...ok, outlookConfigured: false })).toMatch(/Outlook is not connected/);
    expect(sendBlocker({ ...ok, mailingAddress: " " })).toMatch(/mailing address/);
    expect(sendBlocker({ ...ok, suppressed: true })).toMatch(/do-not-contact/);
    expect(sendBlocker({ ...ok, sentToday: 10 })).toMatch(/10 emails today/);
  });
});
