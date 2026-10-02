import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { formatCents } from "@/lib/admin/money";
import { parseDealerCopy } from "@/lib/dc/parse";
import { pricingFingerprint, priceVersion } from "@/lib/dc/pricing";
import type { StoredVersion } from "@/lib/dc/store";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = { listVersions: vi.fn(), listMarkupRules: vi.fn(), getDcSettings: vi.fn() };
vi.mock("@/lib/dc/store", () => store);
const installs = { listInstallQuotes: vi.fn() };
vi.mock("@/lib/admin/install-quotes", () => installs);
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const blob = { get: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const pdf = { renderContractPdf: vi.fn() };
vi.mock("@/lib/dc/contract-pdf", () => pdf);
const quotePdf = { buildQuotePdf: vi.fn() };
vi.mock("@/lib/dc/quote-pdf", () => quotePdf);
const email = { sendContractEmail: vi.fn() };
vi.mock("@/lib/dc/send-contract-email", () => email);
const quoteEmail = { sendQuoteEmail: vi.fn() };
vi.mock("@/lib/dc/send-quote-email", () => quoteEmail);
const templates = { liveTemplateOfKind: vi.fn() };
vi.mock("@/lib/docs/templates", () => templates);
const { loadReview, previewQuote, sendContract, sendQuote } = await import("@/lib/dc/send");

const { createFile, deleteFile } = files;
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const V1 = "33333333-3333-4333-8333-333333333333";
const V0 = "44444444-4444-4444-8444-444444444444";
const FILE = "55555555-5555-4555-8555-555555555555";
const INSTALL = "66666666-6666-4666-8666-666666666666";
const QUOTE_FILE = "99999999-9999-4999-8999-999999999999";
const OWNER = "owner@example.com";
const MARKS = { initials: [{ page: 1, x: 502, y: 700, section: "4" }], signature: { page: 2, x: 154, y: 300 } };
const parsed = parseDealerCopy(readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8"));
if (!parsed.ok) throw new Error("fixture must parse");
const quote = parsed.quote;

const version: StoredVersion = {
  id: V1, leadId: JOB, version: 1, dcQuoteNo: quote.quoteNo, poReference: quote.poReference,
  sourceFileId: "77777777-7777-4777-8777-777777777777", sourceSha256: "abc", clientName: "Test", status: "draft",
  subtotalCents: quote.subtotalCents, handlingFeeCents: quote.handlingFeeCents, oversizedFeeCents: quote.oversizedFeeCents,
  dealerTotalCents: quote.dealerTotalCents, waiveHandling: false, noInstall: false,
  installQuoteId: null, installCents: null, productsCents: null, clientTotalCents: null,
  contractFileId: null, sentAt: null, signedAt: null, createdAt: new Date("2026-09-27T19:30:00Z"),
  quoteFileId: null, offeredAt: null, approvedAt: null,
  lines: quote.lines.map((l) => ({ ...l, pctOverride: null, markupPct: null, sellUnitCents: null, markupOverridden: false })),
};
const line = version.lines[0];
const productsCents = 39300 * line.qty;
const frozenTotal = productsCents + version.handlingFeeCents + version.oversizedFeeCents + 25000;
/** The quote as Send quote froze it, approved by the client: what sendContract builds from. */
const offered: StoredVersion = {
  ...version, status: "offered", installQuoteId: INSTALL, installCents: 25000, productsCents, clientTotalCents: frozenTotal,
  quoteFileId: QUOTE_FILE, offeredAt: new Date("2026-09-27T20:00:00Z"), approvedAt: new Date("2026-09-28T15:00:00Z"),
  lines: [{ ...line, markupPct: 60, sellUnitCents: 39300, markupOverridden: false }],
};
const job = { id: JOB, name: "Test Testt", email: "t@example.com", status: "visit_booked", projectNo: 1042, address: "1 Main St", city: "Las Vegas" };
const termsBytes = new Uint8Array([37, 80, 68, 70]);
const install = { id: INSTALL, kind: "final", totalCents: 25000, createdAt: new Date("2026-09-26T12:00:00Z") };
const TERMS = { id: "t", name: "Contract terms", kind: "terms", response: "view", archivedAt: null,
  body: "## Terms\n\n{{company_name}} and {{client_name}}, {{project_no}}." };

beforeEach(() => {
  for (const f of [sql, ...Object.values(store), ...Object.values(installs), ...Object.values(jobs), ...Object.values(files),
    ...Object.values(blob), ...Object.values(pdf), ...Object.values(quotePdf), ...Object.values(email),
    ...Object.values(quoteEmail), ...Object.values(templates)]) f.mockReset();
  templates.liveTemplateOfKind.mockResolvedValue(null);
  jobs.getJob.mockResolvedValue(job);
  store.listVersions.mockResolvedValue([version]);
  store.listMarkupRules.mockResolvedValue({ Duette: 60 });
  store.getDcSettings.mockResolvedValue({ termsPathname: "settings/terms.pdf", termsUpdatedAt: null, lastPolledAt: null });
  installs.listInstallQuotes.mockResolvedValue([install]);
  blob.get.mockImplementation(async () => ({ statusCode: 200, stream: new Response(termsBytes).body }));
  pdf.renderContractPdf.mockResolvedValue({ bytes: new Uint8Array([1]), marks: MARKS });
  quotePdf.buildQuotePdf.mockResolvedValue(new Uint8Array([2]));
  files.createFile.mockResolvedValue({ id: FILE });
  files.deleteFile.mockResolvedValue(true);
  sql.mockResolvedValue([{ id: V1 }]);
  email.sendContractEmail.mockResolvedValue(undefined);
  quoteEmail.sendQuoteEmail.mockResolvedValue(undefined);
});

const send = async (over: Partial<Parameters<typeof sendQuote>[0]> = {}) => {
  const review = await loadReview(JOB);
  return sendQuote({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER, ...over });
};

describe("loadReview", () => {
  it("prices the newest draft with the Settings markup and the newest final install price", async () => {
    store.listVersions.mockResolvedValue([version, { ...version, id: V0, version: 0, status: "superseded" }]);
    const review = await loadReview(JOB);
    expect(review!.version.id).toBe(V1);
    expect(review!.olderVersions.map((v) => v.id)).toEqual([V0]);
    expect(review!.install).toEqual(install);
    expect(review!.blockers).toEqual([]);
    expect(review!.priced.lines[0]).toMatchObject({ pct: 60, source: "rule", sellUnitCents: 39300 });
    expect(review!.priced.installCents).toBe(25000);
    expect(review!.fingerprint).toBe(pricingFingerprint(review!.priced));
  });

  describe("an offered or later version shows what was sent, not today's price", () => {
    const newer = { id: "88888888-8888-4888-8888-888888888888", kind: "final", totalCents: 31000, createdAt: new Date("2026-09-28T12:00:00Z") };
    beforeEach(() => {
      // Both changed after sending: the rule went from 60 to 70 and a newer install price was saved.
      store.listMarkupRules.mockResolvedValue({ Duette: 70 });
      installs.listInstallQuotes.mockResolvedValue([newer, install]);
    });

    it.each(["offered", "sent", "signed", "cancelled"] as const)("prices a %s version from the frozen columns", async (status) => {
      store.listVersions.mockResolvedValue([{ ...offered, status }]);
      const review = await loadReview(JOB);
      expect(review!.priced).toEqual({
        lines: [{ position: line.position, pct: 60, source: "rule", sellUnitCents: 39300, sellExtendedCents: productsCents, marginCents: productsCents - line.costExtendedCents }],
        productsCents, handlingChargedCents: version.handlingFeeCents, oversizedCents: version.oversizedFeeCents,
        installCents: 25000, installQuoteId: INSTALL, clientTotalCents: frozenTotal, costCents: version.dealerTotalCents,
        marginCents: frozenTotal - 25000 - version.dealerTotalCents, waiveHandling: false, blockers: [],
      });
      expect(review!.install).toEqual(install);
    });

    it("keeps a waived fee, an override and no installation as they were sent", async () => {
      const total = 41000 * line.qty + version.oversizedFeeCents;
      store.listVersions.mockResolvedValue([{ ...offered, status: "signed", waiveHandling: true, noInstall: true, installQuoteId: null, installCents: 0,
        productsCents: 41000 * line.qty, clientTotalCents: total,
        lines: [{ ...offered.lines[0], pctOverride: 62.6, markupPct: 62.6, sellUnitCents: 41000, markupOverridden: true }] }]);
      const review = await loadReview(JOB);
      expect(review!.priced).toMatchObject({ handlingChargedCents: 0, installCents: 0, installQuoteId: null, clientTotalCents: total, waiveHandling: true });
      expect(review!.priced.lines[0]).toMatchObject({ pct: 62.6, source: "override", sellUnitCents: 41000 });
      expect(review!.install).toBeNull();
    });

    it("refuses to send an offered quote again: the status blocker remains", async () => {
      store.listVersions.mockResolvedValue([offered]);
      const review = await loadReview(JOB);
      expect(review!.blockers).toEqual(["This version has already been sent."]);
      expect(await send({ fingerprint: review!.fingerprint })).toEqual({ error: "This version has already been sent." });
      expect(createFile).not.toHaveBeenCalled();
      expect(sql).not.toHaveBeenCalled();
    });
  });

  it("answers null for a job with no Direct Connect quote", async () => {
    store.listVersions.mockResolvedValue([]);
    expect(await loadReview(JOB)).toBeNull();
  });
});

describe("sendQuote", () => {
  it("refuses when the screen's fingerprint differs from the server's (Settings changed meanwhile)", async () => {
    const onScreen = pricingFingerprint(priceVersion({
      lines: version.lines, rules: { Duette: 55 }, handlingFeeCents: version.handlingFeeCents,
      oversizedFeeCents: version.oversizedFeeCents, dealerTotalCents: version.dealerTotalCents,
      waiveHandling: false, install: install as never, noInstall: false,
    }));
    expect(await send({ fingerprint: onScreen })).toEqual({ error: "Prices changed since you opened this page. Review them and send again." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("refuses with the first blocker and writes nothing", async () => {
    store.listMarkupRules.mockResolvedValue({});
    expect(await send()).toEqual({ error: "Set a markup for Duette first." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("refuses a version that is no longer the newest", async () => {
    expect(await send({ versionId: V0 })).toEqual({ error: "A newer version of this quote has arrived. Review that one." });
    expect(createFile).not.toHaveBeenCalled();
  });

  it("refuses, writing nothing, when the uploaded terms cannot be read — the contract could not be built on approval", async () => {
    blob.get.mockResolvedValue(null);
    expect(await send()).toEqual({ error: "Your contract terms file could not be read. Add your contract terms on the Documents page." });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("freezes the price, shares a quote PDF and logs it in ONE statement, then emails the client; no contract yet", async () => {
    expect(await send()).toEqual({ ok: true, emailed: true });
    expect(createFile).toHaveBeenCalledWith(expect.objectContaining({
      docType: "quote", name: "Quote PSS-1042 v1.pdf", contentType: "application/pdf", actor: OWNER,
    }));
    expect(new Uint8Array(await (createFile.mock.calls[0][0] as { body: Blob }).body.arrayBuffer())).toEqual(new Uint8Array([2]));
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set status = 'offered'", "quote_file_id = ?, offered_at = now(), offered_by = ?",
      "and status = 'draft'", "select max(version)", "update dc_quote_lines",
      "update dc_quote_versions set status = 'superseded'", "status in ('draft','offered','sent')",
      "returning contract_file_id, quote_file_id",
      "(id in (select contract_file_id from superseded) or id in (select quote_file_id from superseded))",
      "update job_files set shared_at = now()", "quote_cents = ?",
      "when status in ('new','contacted','visit_booked','approved') then 'quoted'", "'Quote sent'", "'quote'",
      "stage_changed_at = case when status in ('new','contacted','visit_booked','approved') then now() else stage_changed_at end",
    ]) expect(s).toContain(part);
    expect(quoteEmail.sendQuoteEmail).toHaveBeenCalledWith(job, "Quote PSS-1042 v1.pdf");
    expect(pdf.renderContractPdf).not.toHaveBeenCalled();
    expect(email.sendContractEmail).not.toHaveBeenCalled();
    expect(blob.get).toHaveBeenCalledWith("settings/terms.pdf", { access: "private" });
  });

  it("the saved figures, the quote PDF and the review screen are one and the same", async () => {
    const review = await loadReview(JOB);
    await sendQuote({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    const { priced } = review!;
    const [printed] = quotePdf.buildQuotePdf.mock.calls[0];
    expect(printed).toMatchObject({
      projectNo: "PSS-1042", version: 1,
      client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
      installCents: priced.installCents, handlingChargedCents: priced.handlingChargedCents,
      oversizedCents: priced.oversizedCents, clientTotalCents: priced.clientTotalCents,
    });
    expect(printed.lines).toEqual([expect.objectContaining({ qty: 1, sellUnitCents: priced.lines[0].sellUnitCents, sellExtendedCents: priced.lines[0].sellExtendedCents })]);
    const values = sql.mock.calls[0].slice(1);
    const lineJson = values.find((v: unknown) => typeof v === "string" && v.startsWith("[{"));
    expect(JSON.parse(lineJson as string)).toEqual([{ position: 1, override: null, pct: 60, sell_unit_cents: priced.lines[0].sellUnitCents, overridden: false }]);
    for (const figure of [priced.installQuoteId, priced.installCents, priced.productsCents, priced.clientTotalCents, FILE, V1, JOB, OWNER]) {
      expect(values).toContain(figure);
    }
    expect(values).toContain(`Sent Quote PSS-1042 v1.pdf for ${formatCents(priced.clientTotalCents)}`);
  });

  it("re-checks the stored pricing inputs the review read (waive, no-install, every line's %)", async () => {
    const waived = { ...version, waiveHandling: true, lines: version.lines.map((l) => ({ ...l, pctOverride: 64.1 })) };
    store.listVersions.mockResolvedValue([waived]);
    await send();
    const call = sql.mock.calls[0];
    const s = text(call);
    const offeredCte = s.slice(s.indexOf("offered as ("), s.indexOf("priced_lines as ("));
    expect(offeredCte).toContain("and waive_handling = ? and no_install = ?");
    expect(offeredCte).toMatch(/and not exists \( select 1 from dc_quote_lines q join jsonb_to_recordset\(\?::jsonb\) as r\(position int, override numeric\) on q.position = r.position where q.version_id = \? and q.pct_override is distinct from r.override \)/);
    const strings = call[0] as TemplateStringsArray;
    const valueAfter = (fragment: string) => call[1 + strings.findIndex((part) => part.replace(/\s+/g, " ").endsWith(fragment))];
    expect(valueAfter("and waive_handling = ")).toBe(true);
    expect(valueAfter(" and no_install = ")).toBe(false);
  });

  it("re-checks, where they are stored, that the job is not Lost and has an email", async () => {
    await send();
    const s = text(sql.mock.calls[0]);
    const offeredCte = s.slice(s.indexOf("offered as ("), s.indexOf("priced_lines as ("));
    expect(offeredCte).toContain("and exists (select 1 from leads where id = ? and status <> 'lost' and nullif(trim(email), '') is not null)");
  });

  it("a quote re-sent after approval supersedes the old one, unshares its quote and unsigned contract, and puts Approved back to Quoted", async () => {
    await send();
    const s = text(sql.mock.calls[0]);
    const superseded = s.slice(s.indexOf("superseded as ("), s.indexOf("unshared as ("));
    expect(superseded).toContain("status in ('draft','offered','sent') and id <> ? and exists (select 1 from offered)");
    const unsharedAt = s.indexOf("unshared as (");
    const unshared = s.slice(unsharedAt, s.indexOf("shared as (", unsharedAt + "unshared as (".length));
    expect(unshared).toContain("not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)");
    const stageAt = s.indexOf("stage_logged as (");
    const stage = s.slice(stageAt, s.indexOf("logged as (", stageAt + "stage_logged as (".length));
    expect(stage).toContain("where prev.status in ('new','contacted','visit_booked','approved')");
  });

  it("removes the generated quote when the statement matched nothing (a race)", async () => {
    sql.mockResolvedValue([]);
    expect(await send()).toEqual({ error: "This quote changed while you were sending. Reload and try again." });
    expect(deleteFile).toHaveBeenCalledWith(FILE, OWNER);
    expect(quoteEmail.sendQuoteEmail).not.toHaveBeenCalled();
  });

  it("removes the generated quote when the statement throws, and the error still propagates", async () => {
    sql.mockRejectedValue(new Error("db down"));
    files.deleteFile.mockRejectedValue(new Error("cleanup failed too"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(send()).rejects.toThrow("db down");
    expect(deleteFile).toHaveBeenCalledWith(FILE, OWNER);
    spy.mockRestore();
  });

  it("a failed client email still leaves the quote sent, and says so", async () => {
    quoteEmail.sendQuoteEmail.mockRejectedValue(new Error("resend down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await send()).toEqual({ ok: true, emailed: false });
    expect(deleteFile).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("sendContract, from the approved quote", () => {
  beforeEach(() => {
    store.listVersions.mockResolvedValue([offered]);
    jobs.getJob.mockResolvedValue({ ...job, status: "approved" });
  });
  const contract = () => sendContract({ jobId: JOB, versionId: V1, actor: "Sent on approval" });

  it("builds the contract from the frozen figures, with its sign marks, and sends it in ONE statement", async () => {
    expect(await contract()).toEqual({ ok: true, emailed: true });
    const [printed, terms] = pdf.renderContractPdf.mock.calls[0];
    expect(terms).toEqual({ pdf: termsBytes });
    expect(printed).toMatchObject({ projectNo: "PSS-1042", version: 1, clientTotalCents: frozenTotal, installCents: 25000 });
    expect(printed.lines).toEqual([expect.objectContaining({ sellUnitCents: 39300, sellExtendedCents: productsCents })]);
    expect(createFile).toHaveBeenCalledWith(expect.objectContaining({
      docType: "contract", name: "Contract PSS-1042 v1.pdf", signMarks: MARKS, actor: "Sent on approval",
    }));
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set status = 'sent', contract_file_id = ?, sent_at = now(), sent_by = ?",
      "and status = 'offered' and approved_at is not null", "select max(version)",
      "and exists (select 1 from leads where id = ? and status <> 'lost' and nullif(trim(email), '') is not null)",
      "update job_files set shared_at = now()", "'quote'",
    ]) expect(s).toContain(part);
    // The price was frozen at Send quote: nothing re-prices or supersedes here.
    expect(s).not.toContain("update dc_quote_lines");
    expect(s).not.toContain("superseded");
    expect(sql.mock.calls[0].slice(1)).toContain(`Sent Contract PSS-1042 v1.pdf for ${formatCents(frozenTotal)}`);
    expect(email.sendContractEmail).toHaveBeenCalledWith({ ...job, status: "approved" }, "Contract PSS-1042 v1.pdf");
  });

  it("prints the live terms template, filled for this job", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    expect(await contract()).toEqual({ ok: true, emailed: true });
    expect(blob.get).not.toHaveBeenCalled();
    expect(pdf.renderContractPdf.mock.calls[0][1]).toEqual({ text: "## Terms\n\nPremier Shade Solutions LLC and Test Testt, PSS-1042." });
  });

  it.each([
    ["a quote the client has not approved", { ...offered, approvedAt: null }, "The client has not approved this quote yet."],
    ["a quote whose contract is already out", { ...offered, status: "sent" as const }, "This quote's contract has already been sent, or the quote was never sent."],
    ["a draft", version, "This quote's contract has already been sent, or the quote was never sent."],
  ])("refuses %s, building nothing", async (_label, stored, error) => {
    store.listVersions.mockResolvedValue([stored]);
    expect(await contract()).toEqual({ error });
    expect(pdf.renderContractPdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
  });

  it("refuses a Lost job, a job with no email and a version that is not the newest", async () => {
    jobs.getJob.mockResolvedValue({ ...job, status: "lost" });
    expect(await contract()).toEqual({ error: "This job is marked Lost." });
    jobs.getJob.mockResolvedValue({ ...job, email: " " });
    expect(await contract()).toEqual({ error: "Add the client's email address to the job first." });
    jobs.getJob.mockResolvedValue(job);
    expect(await sendContract({ jobId: JOB, versionId: V0, actor: OWNER })).toEqual({ error: "A newer version of this quote has arrived. Review that one." });
    expect(createFile).not.toHaveBeenCalled();
  });

  it("removes the contract when the statement matched nothing (approved twice, or a race)", async () => {
    sql.mockResolvedValue([]);
    expect(await contract()).toEqual({ error: "This quote changed while you were sending. Reload and try again." });
    expect(deleteFile).toHaveBeenCalledWith(FILE, "Sent on approval");
    expect(email.sendContractEmail).not.toHaveBeenCalled();
  });
});

describe("terms from the Documents page", () => {
  it("has no terms blocker with a template and no upload", async () => {
    store.getDcSettings.mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    expect((await loadReview(JOB))!.blockers).toEqual([]);
  });
  it("blocks with neither a template nor an upload", async () => {
    store.getDcSettings.mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
    expect((await loadReview(JOB))!.blockers).toContain("Add your contract terms on the Documents page first.");
  });
  it("refuses Send quote, storing nothing, when a terms field has no value for this job", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    jobs.getJob.mockResolvedValue({ ...job, name: "   " });
    expect(await send()).toEqual({ error: "Your contract terms have {{client_name}} with no value for this job. Fix the terms on the Documents page." });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
  });
  it("shows a terms field with no value as a blocker on the review, before Send quote", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    jobs.getJob.mockResolvedValue({ ...job, name: "   " });
    expect((await loadReview(JOB))!.blockers)
      .toContain("Your contract terms have {{client_name}} with no value for this job. Fix the terms on the Documents page.");
  });
  describe("the starter's DRAFT line", () => {
    const DRAFT = "Your contract terms still carry the DRAFT line. Remove it on the Documents page.";
    it("blocks the review and refuses Send quote while the live terms still carry it", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: STARTER_TERMS });
      const review = await loadReview(JOB);
      expect(review!.blockers).toContain(DRAFT);
      expect(await send({ fingerprint: review!.fingerprint })).toEqual({ error: DRAFT });
      expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
      expect(createFile).not.toHaveBeenCalled();
      expect(sql).not.toHaveBeenCalled();
    });
    it("refuses the contract too, if the line comes back after the quote was sent", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      store.listVersions.mockResolvedValue([offered]);
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: STARTER_TERMS });
      expect(await sendContract({ jobId: JOB, versionId: V1, actor: OWNER })).toEqual({ error: DRAFT });
      expect(pdf.renderContractPdf).not.toHaveBeenCalled();
    });
    it("finds the line anywhere in the body, padded with spaces", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      const first = STARTER_TERMS.split("\n")[0].trim();
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: `## Terms\n\n  ${first}  \n\nMore.` });
      expect((await loadReview(JOB))!.blockers).toEqual([DRAFT]);
    });
    it("still finds the line with its bold taken off or its spacing changed", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      const plain = STARTER_TERMS.split("\n")[0].trim().replace(/\*/g, "").replace(/ /g, "   ");
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: `## Terms\n\n${plain}\n\nMore.` });
      expect((await loadReview(JOB))!.blockers).toEqual([DRAFT]);
    });
    it("does not mistake terms that merely mention a draft for the banner", async () => {
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: "## Terms\n\nA draft of the order is shared before it is placed." });
      expect((await loadReview(JOB))!.blockers).toEqual([]);
    });
    it("clears once the owner deletes the line", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      const reviewed = STARTER_TERMS.split("\n").slice(1).join("\n");
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: reviewed });
      expect((await loadReview(JOB))!.blockers).toEqual([]);
    });
  });
  it("never fills a field terms may not use, so a stray figure cannot print beside the total", async () => {
    templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: "## Terms\n\nPay {{deposit}} on signing." });
    jobs.getJob.mockResolvedValue({ ...job, depositCents: 50000, soldCents: 200000 });
    const review = await loadReview(JOB);
    const refusal = "Your contract terms have {{deposit}} with no value for this job. Fix the terms on the Documents page.";
    expect(review!.blockers).toContain(refusal);
    expect(await send({ fingerprint: review!.fingerprint })).toEqual({ error: refusal });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("previewQuote", () => {
  it("prints exactly what Send quote would print, marked a preview, and writes nothing", async () => {
    const result = await previewQuote(JOB);
    expect(result).toEqual({ pdf: new Uint8Array([2]), name: "Quote PSS-1042 v1 PREVIEW.pdf" });
    const [previewed, options] = quotePdf.buildQuotePdf.mock.calls[0];
    expect(options).toEqual({ preview: true });

    quotePdf.buildQuotePdf.mockClear();
    await send();
    const [sent] = quotePdf.buildQuotePdf.mock.calls[0];
    expect({ ...previewed, date: null }).toEqual({ ...sent, date: null });
  });

  it("writes nothing, shares nothing and emails no one", async () => {
    await previewQuote(JOB);
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
    expect(quoteEmail.sendQuoteEmail).not.toHaveBeenCalled();
  });

  it("previews even when Send is blocked by something other than the price", async () => {
    jobs.getJob.mockResolvedValue({ ...job, email: null });
    expect(await previewQuote(JOB)).toMatchObject({ name: "Quote PSS-1042 v1 PREVIEW.pdf" });
  });

  it("refuses while a line has no price", async () => {
    store.listMarkupRules.mockResolvedValue({});
    expect(await previewQuote(JOB)).toEqual({ error: "Set a markup for Duette first." });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
  });

  it("refuses while no installation price is chosen", async () => {
    installs.listInstallQuotes.mockResolvedValue([]);
    expect(await previewQuote(JOB)).toEqual({ error: "Save an installation price, or tick No installation." });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
  });

  it.each(["offered", "sent", "signed"] as const)("refuses a %s version: the sent quote is in Files", async (status) => {
    store.listVersions.mockResolvedValue([{ ...offered, status }]);
    expect(await previewQuote(JOB)).toEqual({ error: "This quote has been sent. Its PDF is in Files." });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
  });

  it("says so when the job has no quote", async () => {
    store.listVersions.mockResolvedValue([]);
    expect(await previewQuote(JOB)).toEqual({ error: "This job has no Direct Connect quote." });
  });
});
