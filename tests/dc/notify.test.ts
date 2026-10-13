import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));
const { importEmail, notifyOwners, orderEmail, orderRefusalEmail, staleFailuresEmail, staleReceiptsEmail } = await import("@/lib/dc/notify");

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("ADMIN_BASE_URL", "https://admin.example.com");
  vi.stubEnv("RESEND_API_KEY", "re_test");
});

describe("importEmail", () => {
  it("an import names the job and the version, and links to its Quote tab", () => {
    const email = importEmail({ outcome: "imported", dcQuoteNo: "22250749", projectNo: "PSS-1042", jobId: "j1", version: 2, detail: null });
    expect(email?.subject).toBe("PSS-1042: quote v2 ready to review");
    expect(email?.text).toContain("DC quote 22250749 arrived for PSS-1042 as version 2.");
    expect(email?.text).toContain("https://admin.example.com/admin/jobs/j1?tab=quote");
  });
  it("a no-match tells the owner how to fix the PO Reference and send again", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: "PSS-9999" });
    expect(email?.subject).toBe("DC quote 22250749 could not be matched to a job");
    expect(email?.text).toContain("PSS-9999");
    expect(email?.text).toContain("Reports → Dealer Copy → Email");
    expect(email?.text).not.toContain("/admin/jobs/");
  });
  it("a no-match says the PSS number matches no job, not that it is invalid", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: "PSS-9999" });
    expect(email?.text).toContain("DC quote 22250749 names PSS-9999 but no job has that number.");
    expect(email?.text).not.toContain("no valid PSS number");
  });
  it("a no-po says there is no valid PSS number in PO Reference", () => {
    const email = importEmail({ outcome: "no-po", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: 'Quote 22250749 has PO Reference "852"' });
    expect(email?.subject).toBe("DC quote 22250749 could not be matched to a job");
    expect(email?.text).toContain("DC quote 22250749 has no valid PSS number in PO Reference");
    expect(email?.text).not.toContain("no job has that number");
  });
  it("says nothing for unchanged or failed", () => {
    expect(importEmail({ outcome: "unchanged", dcQuoteNo: null, projectNo: null, jobId: null, detail: null })).toBeNull();
    expect(importEmail({ outcome: "failed", dcQuoteNo: null, projectNo: null, jobId: null, detail: null })).toBeNull();
  });
  it("a no-match for a missing option says to add the option first and keep the printed PO", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: "PSS-1042-B", missingOption: "B" });
    expect(email?.text).toContain("DC quote 22250749 names PSS-1042-B, but that job has no quote option B yet.");
    expect(email?.text).toContain("Keep PSS-1042-B in PO Reference. Add option B with Add another quote on the job's Quote tab, then send the Dealer Copy again.");
    expect(email?.text).toContain("Reports → Dealer Copy → Email");
    expect(email?.text).not.toContain("no job has that number");
    // Following the ordinary fix would import option B's prices as a new version of option A.
    expect(email?.text).not.toContain("put the job's number");
  });
  it("a no-match for a missing option says so in the subject and links to the job", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: "j1", detail: "PSS-1042-B", missingOption: "B" });
    expect(email?.subject).toBe("DC quote 22250749 for PSS-1042-B: option B not added yet");
    expect(email?.text).toContain("Open the job: https://admin.example.com/admin/jobs/j1?tab=quote");
    expect(email?.subject).not.toContain("could not be matched");
  });
  it("a no-match for an option number whose job does not exist uses the ordinary wording", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: "PSS-1042-B", missingOption: null });
    expect(email?.text).toContain("DC quote 22250749 names PSS-1042-B but no job has that number.");
    expect(email?.text).toContain("put the job's number (e.g. PSS-1042) in PO Reference");
    expect(email?.text).not.toContain("Add another quote");
  });
  it("the ordinary no-match email is unchanged", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: "PSS-9999" });
    expect(email).toEqual({
      subject: "DC quote 22250749 could not be matched to a job",
      text: "DC quote 22250749 names PSS-9999 but no job has that number.\n\n"
        + "Open the quote in Direct Connect, put the job's number (e.g. PSS-1042) in PO Reference, save, and send the Dealer Copy again.\n"
        + "In Direct Connect: Reports → Dealer Copy → Email → tick Owner and Include dealer costs → Generate.",
    });
  });
  it("an import of an option names the option's number", () => {
    const email = importEmail({ outcome: "imported", dcQuoteNo: "22250749", projectNo: "PSS-1042-B", jobId: "j1", version: 1, detail: null });
    expect(email?.subject).toBe("PSS-1042-B: quote v1 ready to review");
  });
});

describe("staleFailuresEmail", () => {
  it("names each quote and the date it has failed since, and asks for a developer", () => {
    const email = staleFailuresEmail([
      { quoteNo: "22250749", receivedAt: new Date("2026-09-26T19:30:00Z") },
      { quoteNo: null, receivedAt: new Date("2026-09-25T19:30:00Z") },
    ]);
    expect(email.subject).toBe("A Dealer Copy has failed to import for over a day");
    expect(email.text).toContain("A Dealer Copy (quote #22250749) has failed to import since Sep 26, 2026. A developer should look.");
    expect(email.text).toContain("A Dealer Copy (quote number unknown) has failed to import since Sep 25, 2026. A developer should look.");
  });
});

describe("notifyOwners", () => {
  it("sends plain text to the owners", async () => {
    await notifyOwners({ subject: "s", text: "t" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["owner@example.com"], subject: "s", text: "t" }));
  });
  it("throws when Resend is not configured, rather than dropping the email", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(notifyOwners({ subject: "s", text: "t" })).rejects.toThrow("not configured");
    expect(send).not.toHaveBeenCalled();
  });
  it("throws when Resend rejects it", async () => {
    send.mockResolvedValue({ error: { message: "bad from" } });
    await expect(notifyOwners({ subject: "s", text: "t" })).rejects.toThrow("bad from");
  });
});

describe("orderEmail", () => {
  const order = {
    orderNo: "14286505", poReference: "PSS-1042-E", projectNo: 1042, option: "E", orderDate: "2026-10-12", status: "Confirmed",
    subtotalCents: 109113, oversizeCents: 0, handlingCents: 5500, taxCents: 9138, totalCents: 123751,
  };
  it("names HD's order, every figure, the matching quote and the stage move, and links to the job", () => {
    const email = orderEmail({ order, jobId: "j1", fromStatus: "measure", toStatus: "ordered", quotedCents: 114613 });
    expect(email.subject).toBe("PSS-1042-E ordered: HD order 14286505");
    expect(email.text).toBe([
      "Hunter Douglas confirmed order 14286505 for PSS-1042-E on Oct 12, 2026.",
      "Total $1,237.51: products $1,091.13, handling $55, tax $91.38.",
      "That matches the quoted dealer cost of $1,146.13 before tax.",
      "",
      "The job moved from Official measure to Ordered.",
      "Open the job: https://admin.example.com/admin/jobs/j1",
    ].join("\n"));
  });
  it("shows an oversize surcharge only when there is one", () => {
    const email = orderEmail({ order: { ...order, oversizeCents: 9000, totalCents: 132751 }, jobId: "j1", fromStatus: "sold", toStatus: "ordered", quotedCents: null });
    expect(email.text).toContain("handling $55, oversize $90, tax $91.38.");
  });
  it("flags a cost that differs from the quote, before tax", () => {
    const email = orderEmail({ order, jobId: "j1", fromStatus: "sold", toStatus: "ordered", quotedCents: 110000 });
    expect(email.text).toContain("That does not match the quote. Quoted dealer cost $1,100, HD charged $1,146.13 before tax.");
  });
  it("says when there was no quote to compare", () => {
    expect(orderEmail({ order, jobId: "j1", fromStatus: "sold", toStatus: "ordered", quotedCents: null }).text)
      .toContain("No quote was found for PSS-1042-E to compare the cost with.");
  });
  it("a job already ordered keeps its stage, and a job before Signed or Lost is flagged", () => {
    expect(orderEmail({ order, jobId: "j1", fromStatus: "ordered", toStatus: "ordered", quotedCents: 114613 }).text)
      .toContain("The job was already at Ordered, so its stage did not change.");
    expect(orderEmail({ order, jobId: "j1", fromStatus: "approved", toStatus: "approved", quotedCents: 114613 }).text)
      .toContain("The job is at Approved, so it was not moved to Ordered. Check it.");
    expect(orderEmail({ order, jobId: "j1", fromStatus: "lost", toStatus: "lost", quotedCents: 114613 }).text)
      .toContain("The job is at Lost, so it was not moved to Ordered. Check it.");
  });
});

describe("orderRefusalEmail", () => {
  it("every refusal asks the owners to move the job by hand", () => {
    for (const outcome of ["no-po", "no-match", "unreadable"] as const) {
      expect(orderRefusalEmail({ outcome, orderNo: "14286505", detail: "x" }).text).toContain("Move the job to Ordered by hand.");
    }
  });
  it("a PO that is not a PSS number says how to fix it next time", () => {
    const email = orderRefusalEmail({ outcome: "no-po", orderNo: "14286505", detail: 'HD order 14286505 has PO "Jennie"' });
    expect(email.subject).toBe("HD order 14286505 could not be matched to a job");
    expect(email.text).toContain('HD order 14286505 has PO "Jennie", which is not a PSS number.');
    expect(email.text).toContain("put the job's number (e.g. PSS-1042) in PO Reference");
  });
  it("an unreadable email with no order number still says what it is", () => {
    expect(orderRefusalEmail({ outcome: "unreadable", orderNo: null, detail: "No order number" }).subject).toBe("An HD order confirmation could not be read");
  });
});

describe("staleReceiptsEmail", () => {
  it("names one unconfirmed order in the subject, and lists each", () => {
    const one = staleReceiptsEmail([{ quoteNo: "22293638", poReference: "PSS-1042-E", receivedAt: new Date("2026-10-12T22:09:27Z") }]);
    expect(one.subject).toBe("PSS-1042-E has no order confirmation from HD");
    expect(one.text).toContain("Direct Connect received quote 22293638 for PSS-1042-E on Oct 12, 2026, but Hunter Douglas has not sent its order confirmation.");
    const two = staleReceiptsEmail([
      { quoteNo: "1", poReference: "PSS-1042", receivedAt: new Date("2026-10-12T20:00:00Z") },
      { quoteNo: null, poReference: "PSS-1043", receivedAt: new Date("2026-10-12T20:00:00Z") },
    ]);
    expect(two.subject).toBe("Orders with no confirmation from HD");
    expect(two.text).toContain("received an order for PSS-1043");
  });
});

describe("staleFailuresEmail for order mail", () => {
  it("names an order or receipt for what it is, not a Dealer Copy", () => {
    const email = staleFailuresEmail([{ quoteNo: null, receivedAt: new Date("2026-10-12T22:34:03Z"), kind: "order" }]);
    expect(email.subject).toBe("A Direct Connect email has failed to import for over a day");
    expect(email.text).toBe("An HD order confirmation has failed to import since Oct 12, 2026. A developer should look.");
  });
});
