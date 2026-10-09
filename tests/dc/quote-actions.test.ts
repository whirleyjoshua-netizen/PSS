import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => {
  order.push("auth");
  return { email: "o@x.com" };
});
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const setLineOverride = vi.fn(async (..._args: unknown[]) => {
  order.push("store");
  return true;
});
const setVersionChoices = vi.fn(async (..._args: unknown[]) => {
  order.push("store");
  return true;
});
const addQuoteOption = vi.fn(async (..._args: unknown[]): Promise<{ letter: string } | { error: string }> => {
  order.push("store");
  return { letter: "B" };
});
const setVersionDiscount = vi.fn(async (..._args: unknown[]) => {
  order.push("store");
  return true;
});
const validDiscountLabel = (label: string) => label.trim().length >= 1 && label.trim().length <= 60;
vi.mock("@/lib/dc/store", () => ({ setLineOverride, setVersionChoices, setVersionDiscount, validDiscountLabel, addQuoteOption }));
const sendQuote = vi.fn(async (..._args: unknown[]): Promise<{ ok: true; emailed: boolean } | { error: string }> => {
  order.push("send");
  return { ok: true, emailed: true };
});
const sendContract = vi.fn(async (..._args: unknown[]): Promise<{ ok: true; emailed: boolean } | { error: string }> => {
  order.push("send");
  return { ok: true, emailed: true };
});
vi.mock("@/lib/dc/send", () => ({ sendQuote, sendContract }));
const pollMailbox = vi.fn(async (): Promise<{ seen: number; results: { messageId: string; outcome: string }[] }> => {
  order.push("poll");
  return { seen: 0, results: [] };
});
vi.mock("@/lib/dc/import", () => ({ pollMailbox }));

const { setLinePctAction, setChoicesAction, setDiscountAction, sendQuoteAction, sendContractAction, checkNowAction, addQuoteOptionAction } = await import("@/app/admin/jobs/[id]/quote-actions");

const J = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const V = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const BAD_PCT = { error: "Enter a percentage like 60 or 57.5" };
const LOCKED = { error: "This version can no longer be changed." };

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
});

describe("setLinePctAction", () => {
  it("checks the admin first, saves the % with who set it, and refreshes the job", async () => {
    expect(await setLinePctAction(J, V, 2, " 57.5 ")).toEqual({});
    expect(order).toEqual(["auth", "store"]);
    expect(setLineOverride).toHaveBeenCalledWith(J, V, 2, 57.5, "o@x.com");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });

  it("clears the override when the box is emptied", async () => {
    expect(await setLinePctAction(J, V, 1, "")).toEqual({});
    expect(setLineOverride).toHaveBeenCalledWith(J, V, 1, null, "o@x.com");
  });

  it.each(["abc", "0", "1001", "-5", "60.123", "1e2"])("refuses %j without touching the store", async (raw) => {
    expect(await setLinePctAction(J, V, 1, raw)).toEqual(BAD_PCT);
    expect(order).toEqual(["auth"]);
    expect(setLineOverride).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("says the version is locked when the store refuses", async () => {
    setLineOverride.mockResolvedValueOnce(false);
    expect(await setLinePctAction(J, V, 1, "60")).toEqual(LOCKED);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setDiscountAction", () => {
  it("checks the admin first, then saves a percent with its trimmed name", async () => {
    expect(await setDiscountAction(J, V, { kind: "pct", value: " 10 ", label: "  Holiday special " })).toEqual({});
    expect(order).toEqual(["auth", "store"]);
    expect(setVersionDiscount).toHaveBeenCalledWith(J, V, { pct: 10, amountCents: null, label: "Holiday special" }, "o@x.com");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });
  it("reads dollars with or without $ and commas, to the cent", async () => {
    await setDiscountAction(J, V, { kind: "amount", value: "$1,250.50", label: "Friends and family" });
    expect(setVersionDiscount).toHaveBeenLastCalledWith(J, V, { pct: null, amountCents: 125050, label: "Friends and family" }, "o@x.com");
    await setDiscountAction(J, V, { kind: "amount", value: "200", label: "x" });
    expect(setVersionDiscount).toHaveBeenLastCalledWith(J, V, { pct: null, amountCents: 20000, label: "x" }, "o@x.com");
  });
  it("null removes the discount", async () => {
    expect(await setDiscountAction(J, V, null)).toEqual({});
    expect(setVersionDiscount).toHaveBeenCalledWith(J, V, null, "o@x.com");
  });
  it("refuses a bad percent, a bad amount or a missing name without touching the store", async () => {
    for (const value of ["0", "100", "abc", "12.345", "-5"]) {
      expect((await setDiscountAction(J, V, { kind: "pct", value, label: "Sale" })).error).toMatch(/percentage/);
    }
    for (const value of ["0", "abc", "1.234", "-20"]) {
      expect((await setDiscountAction(J, V, { kind: "amount", value, label: "Sale" })).error).toMatch(/dollar amount/);
    }
    expect((await setDiscountAction(J, V, { kind: "pct", value: "10", label: "   " })).error).toMatch(/name/);
    expect((await setDiscountAction(J, V, { kind: "pct", value: "10", label: "x".repeat(61) })).error).toMatch(/name/);
    expect((await setDiscountAction(J, V, { kind: "both" as "pct", value: "10", label: "Sale" })).error).toMatch(/percent or dollars/);
    expect(setVersionDiscount).not.toHaveBeenCalled();
  });
  it("says the version is locked when the store refuses", async () => {
    setVersionDiscount.mockResolvedValueOnce(false);
    expect(await setDiscountAction(J, V, { kind: "pct", value: "10", label: "Sale" })).toEqual({ error: "This version can no longer be changed." });
  });
});

describe("setChoicesAction", () => {
  it("checks the admin first and passes only real booleans", async () => {
    expect(await setChoicesAction(J, V, { waiveHandling: true })).toEqual({});
    expect(order).toEqual(["auth", "store"]);
    expect(setVersionChoices).toHaveBeenCalledWith(J, V, { waiveHandling: true, noInstall: undefined });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });

  it("drops a value that is not a boolean", async () => {
    await setChoicesAction(J, V, { noInstall: "yes" as unknown as boolean, waiveHandling: false });
    expect(setVersionChoices).toHaveBeenCalledWith(J, V, { waiveHandling: false, noInstall: undefined });
  });

  it("says the version is locked when the store refuses", async () => {
    setVersionChoices.mockResolvedValueOnce(false);
    expect(await setChoicesAction(J, V, { noInstall: true })).toEqual(LOCKED);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("sendQuoteAction", () => {
  // Surrounding spaces included: "untouched" means not even trimmed.
  const FP = ' {"lines":[[1,60,39300,39300]],"total":123} ';

  it("checks the admin first and passes the fingerprint through untouched", async () => {
    expect(await sendQuoteAction(J, V, FP)).toEqual({ ok: true, emailed: true });
    expect(order).toEqual(["auth", "send"]);
    expect(sendQuote).toHaveBeenCalledWith({ jobId: J, versionId: V, fingerprint: FP, actor: "o@x.com" });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });

  it("answers emailed false when the client email failed", async () => {
    sendQuote.mockResolvedValueOnce({ ok: true, emailed: false });
    expect(await sendQuoteAction(J, V, FP)).toEqual({ ok: true, emailed: false });
  });

  it("returns Send's error verbatim", async () => {
    sendQuote.mockResolvedValueOnce({ error: "Prices changed since you opened this page. Review them and send again." });
    expect(await sendQuoteAction(J, V, FP)).toEqual({ error: "Prices changed since you opened this page. Review them and send again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("an unexpected failure inside Send (Blob, pdf-lib) is logged and answered plainly, not thrown", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendQuote.mockRejectedValueOnce(new Error("Blob put failed"));
    expect(await sendQuoteAction(J, V, FP)).toEqual({
      error: "The quote could not be sent. Try again, and if it keeps failing, contact support.",
    });
    expect(error).toHaveBeenCalledWith("Sending the quote failed", expect.any(Error));
    expect(revalidatePath).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("refuses a fingerprint that is not a string or is huge", async () => {
    expect(await sendQuoteAction(J, V, 5 as unknown as string)).toEqual({ error: "Reload the page and try again." });
    expect(await sendQuoteAction(J, V, "x".repeat(50_001))).toEqual({ error: "Reload the page and try again." });
    expect(sendQuote).not.toHaveBeenCalled();
  });
});

describe("sendContractAction", () => {
  it("checks the admin first and sends the approved version's contract as the owner", async () => {
    expect(await sendContractAction(J, V)).toEqual({ ok: true, emailed: true });
    expect(order).toEqual(["auth", "send"]);
    expect(sendContract).toHaveBeenCalledWith({ jobId: J, versionId: V, actor: "o@x.com" });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });
  it("returns the refusal verbatim, and answers a failure plainly", async () => {
    sendContract.mockResolvedValueOnce({ error: "The client has not approved this quote yet." });
    expect(await sendContractAction(J, V)).toEqual({ error: "The client has not approved this quote yet." });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendContract.mockRejectedValueOnce(new Error("Blob put failed"));
    expect(await sendContractAction(J, V)).toEqual({ error: "The contract could not be sent. Try again, and if it keeps failing, contact support." });
    expect(error).toHaveBeenCalledWith("Sending the contract failed", expect.any(Error));
    error.mockRestore();
  });
});

describe("checkNowAction", () => {
  it("checks the admin first, polls the mailbox, and says when nothing arrived", async () => {
    expect(await checkNowAction(J)).toEqual({ message: "No new Dealer Copies." });
    expect(order).toEqual(["auth", "poll"]);
    expect(pollMailbox).toHaveBeenCalledWith();
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });

  it("counts what it imported", async () => {
    pollMailbox.mockResolvedValueOnce({ seen: 2, results: [{ messageId: "a", outcome: "imported" }, { messageId: "b", outcome: "no-match" }] });
    expect(await checkNowAction(J)).toEqual({ message: "Imported 1." });
  });

  it("says plainly when the mailbox could not be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    pollMailbox.mockRejectedValueOnce(new Error("Graph 403"));
    expect(await checkNowAction(J)).toEqual({ message: "Could not check the mailbox. Try again in a few minutes." });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("says how many could not be imported, instead of claiming the owners were emailed", async () => {
    pollMailbox.mockResolvedValueOnce({ seen: 2, results: [{ messageId: "a", outcome: "failed" }, { messageId: "b", outcome: "failed" }] });
    expect(await checkNowAction(J)).toEqual({ message: "2 Dealer Copies could not be imported. Try again shortly." });
    pollMailbox.mockResolvedValueOnce({ seen: 1, results: [{ messageId: "a", outcome: "failed" }] });
    expect(await checkNowAction(J)).toEqual({ message: "1 Dealer Copy could not be imported. Try again shortly." });
  });

  it("keeps the import count when some imported and some failed", async () => {
    pollMailbox.mockResolvedValueOnce({ seen: 3, results: [
      { messageId: "a", outcome: "imported" }, { messageId: "b", outcome: "failed" }, { messageId: "c", outcome: "no-match" },
    ] });
    expect(await checkNowAction(J)).toEqual({ message: "Imported 1. 1 Dealer Copy could not be imported. Try again shortly." });
  });

  it("says when it checked mail but imported nothing", async () => {
    pollMailbox.mockResolvedValueOnce({ seen: 1, results: [{ messageId: "b", outcome: "no-match" }] });
    expect(await checkNowAction(J)).toEqual({ message: "Checked. Nothing new to import (the owners were emailed about anything that needs fixing)." });
  });
});

describe("addQuoteOptionAction", () => {
  it("checks the admin first, adds the option as that owner and refreshes the job", async () => {
    expect(await addQuoteOptionAction(J)).toEqual({ letter: "B" });
    expect(order).toEqual(["auth", "store"]);
    expect(addQuoteOption).toHaveBeenCalledWith(J, "o@x.com");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });
  it("returns the refusal verbatim and refreshes nothing", async () => {
    addQuoteOption.mockResolvedValueOnce({ error: "This job is marked Lost." });
    expect(await addQuoteOptionAction(J)).toEqual({ error: "This job is marked Lost." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
