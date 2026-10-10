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
    for (const t of [
      "No thanks.", "please UNSUBSCRIBE me", "STOP", "remove me from your list", "Please stop emailing me",
      "No thanks.\n\nOn Mon PSS wrote:\n> " + OPT_OUT_LINE,
    ]) expect(isOptOut(t)).toBe(true);
    for (const t of [
      // A bare "stop" counts in a reply of 4 words or fewer, so a longer sentence is needed for "stop by".
      "Thanks so much!", "nonstop schedule", "let's not stopgap", "I'll stop by on Tuesday afternoon",
      "Sounds great, let's talk\n\n-----Original Message-----\nHi Pat\n\n--\nPSS\n\n" + OPT_OUT_LINE,
      "Yes please\n\nOn Mon, Oct 12, 2026 at 9:00 AM PSS wrote:\n> Hi\n> " + OPT_OUT_LINE,
      "Interested!\n> " + OPT_OUT_LINE,
      // Each stripping step on its own: a footer left unquoted, a rewrapped footer under ">", and rewrapped quoted originals.
      "Interested!\n\n" + OPT_OUT_LINE,
      "Interested!\n> If you'd rather not hear from us, just reply\n> \"no thanks\".",
      "Sounds great\n\n-----Original Message-----\nIf you'd rather not hear from us, just reply\n\"no thanks\".",
      "Yes please\n\nOn Mon PSS wrote:\nIf you'd rather not hear from us, just reply\n\"no thanks\".",
      "Yes please\n\nFrom: PSS <support@example.com>\nIf you'd rather not hear from us, just reply\n\"no thanks\".",
    ]) expect(isOptOut(t)).toBe(false);
  });
  it("reads a short \"stop\" past phone footers and signatures, but not a longer sentence", () => {
    for (const t of ["STOP\n\nSent from my iPhone", "Please stop.", "Stop!!\n--\nJane", "stop\r\n-- \r\nJane Smith\r\nAcme"]) {
      expect(isOptOut(t), JSON.stringify(t)).toBe(true);
    }
    for (const t of [
      "I can't stop thinking about your shades, call me",
      // The signature is cut before matching, so a "stop" in it never counts.
      "Call me Tuesday\n-- \nJane Smith\nStop by our booth",
      "Sounds good\n\nSent from my iPhone",
    ]) expect(isOptOut(t), JSON.stringify(t)).toBe(false);
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
