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
const pdf = { buildContractPdf: vi.fn() };
vi.mock("@/lib/dc/contract-pdf", () => pdf);
const email = { sendContractEmail: vi.fn() };
vi.mock("@/lib/dc/send-contract-email", () => email);
const { loadReview, sendContract } = await import("@/lib/dc/send");

const { createFile, deleteFile } = files;
const { sendContractEmail } = email;
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const V1 = "33333333-3333-4333-8333-333333333333";
const V0 = "44444444-4444-4444-8444-444444444444";
const FILE = "55555555-5555-4555-8555-555555555555";
const INSTALL = "66666666-6666-4666-8666-666666666666";
const OWNER = "owner@example.com";
const parsed = parseDealerCopy(readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8"));
if (!parsed.ok) throw new Error("fixture must parse");
const quote = parsed.quote;

const version: StoredVersion = {
  id: V1, leadId: JOB, version: 1, dcQuoteNo: quote.quoteNo, poReference: quote.poReference,
  sourceFileId: "77777777-7777-4777-8777-777777777777", sourceSha256: "abc", status: "draft",
  subtotalCents: quote.subtotalCents, handlingFeeCents: quote.handlingFeeCents, oversizedFeeCents: quote.oversizedFeeCents,
  dealerTotalCents: quote.dealerTotalCents, waiveHandling: false, noInstall: false,
  installQuoteId: null, installCents: null, productsCents: null, clientTotalCents: null,
  contractFileId: null, sentAt: null, signedAt: null, createdAt: new Date("2026-09-27T19:30:00Z"),
  lines: quote.lines.map((l) => ({ ...l, pctOverride: null, markupPct: null, sellUnitCents: null, markupOverridden: false })),
};
const job = { id: JOB, name: "Test Testt", email: "t@example.com", status: "visit_booked", projectNo: 1042, address: "1 Main St", city: "Las Vegas" };
const termsBytes = new Uint8Array([37, 80, 68, 70]);
const install = { id: INSTALL, kind: "final", totalCents: 25000, createdAt: new Date("2026-09-26T12:00:00Z") };

beforeEach(() => {
  for (const f of [sql, ...Object.values(store), ...Object.values(installs), ...Object.values(jobs), ...Object.values(files),
    ...Object.values(blob), ...Object.values(pdf), ...Object.values(email)]) f.mockReset();
  jobs.getJob.mockResolvedValue(job);
  store.listVersions.mockResolvedValue([version]);
  store.listMarkupRules.mockResolvedValue({ Duette: 60 });
  store.getDcSettings.mockResolvedValue({ termsPathname: "settings/terms.pdf", termsUpdatedAt: null, lastPolledAt: null });
  installs.listInstallQuotes.mockResolvedValue([install]);
  blob.get.mockImplementation(async () => ({ statusCode: 200, stream: new Response(termsBytes).body }));
  pdf.buildContractPdf.mockResolvedValue(new Uint8Array([1]));
  files.createFile.mockResolvedValue({ id: FILE });
  files.deleteFile.mockResolvedValue(true);
  sql.mockResolvedValue([{ id: V1 }]);
  email.sendContractEmail.mockResolvedValue(undefined);
});

describe("loadReview", () => {
  it("prices the newest version with the Settings markup and the newest final install price", async () => {
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
  it("answers null for a job with no Direct Connect quote", async () => {
    store.listVersions.mockResolvedValue([]);
    expect(await loadReview(JOB)).toBeNull();
  });
});

describe("sendContract", () => {
  it("refuses when the screen's fingerprint differs from the server's (Settings changed meanwhile)", async () => {
    // The owner's page was priced at 55%; Settings now say 60%.
    const onScreen = pricingFingerprint(priceVersion({
      lines: version.lines, rules: { Duette: 55 }, handlingFeeCents: version.handlingFeeCents,
      oversizedFeeCents: version.oversizedFeeCents, dealerTotalCents: version.dealerTotalCents,
      waiveHandling: false, install: install as never, noInstall: false,
    }));
    const result = await sendContract({ jobId: JOB, versionId: V1, fingerprint: onScreen, actor: OWNER });
    expect(result).toEqual({ error: "Prices changed since you opened this page. Review them and send again." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
  it("refuses with the first blocker and writes nothing", async () => {
    store.listMarkupRules.mockResolvedValue({});
    const review = await loadReview(JOB);
    const result = await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    expect(result).toEqual({ error: "Set a markup for Duette first." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
  it("refuses a version that is no longer the newest", async () => {
    const review = await loadReview(JOB);
    const result = await sendContract({ jobId: JOB, versionId: V0, fingerprint: review!.fingerprint, actor: OWNER });
    expect(result).toEqual({ error: "A newer version of this quote has arrived. Review that one." });
    expect(createFile).not.toHaveBeenCalled();
  });
  it("refuses, writing nothing, when the terms file cannot be read", async () => {
    blob.get.mockResolvedValue(null);
    const review = await loadReview(JOB);
    const result = await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    expect(result).toEqual({ error: "Your contract terms file could not be read. Upload it again in Settings." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
  it("freezes, shares and logs in ONE statement, then emails the client", async () => {
    const review = await loadReview(JOB);
    const result = await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    expect(result).toEqual({ ok: true, emailed: true });
    expect(createFile).toHaveBeenCalledWith(expect.objectContaining({ docType: "contract", name: "Contract PSS-1042 v1.pdf", contentType: "application/pdf" }));
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of ["update dc_quote_versions set status = 'sent'", "status = 'draft'", "select max(version)",
      "update dc_quote_lines", "status = 'superseded'", "update job_files set shared_at = null", "update job_files set shared_at = now()",
      "quote_cents", "'quoted'", "'quote'"]) expect(s).toContain(part);
    expect(sendContractEmail).toHaveBeenCalledWith(job, "Contract PSS-1042 v1.pdf");
    expect(blob.get).toHaveBeenCalledWith("settings/terms.pdf", { access: "private" });
  });
  it("the saved figures, the contract and the review screen are one and the same", async () => {
    const review = await loadReview(JOB);
    await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    const { priced } = review!;
    const [contract, terms] = pdf.buildContractPdf.mock.calls[0];
    expect(terms).toEqual(termsBytes);
    expect(contract).toMatchObject({
      projectNo: "PSS-1042", version: 1,
      client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
      installCents: priced.installCents, handlingChargedCents: priced.handlingChargedCents,
      oversizedCents: priced.oversizedCents, clientTotalCents: priced.clientTotalCents,
    });
    expect(contract.lines).toEqual([expect.objectContaining({ qty: 1, sellUnitCents: priced.lines[0].sellUnitCents, sellExtendedCents: priced.lines[0].sellExtendedCents })]);

    const values = sql.mock.calls[0].slice(1);
    const lineJson = values.find((v: unknown) => typeof v === "string" && v.startsWith("[{"));
    expect(JSON.parse(lineJson as string)).toEqual([{ position: 1, override: null, pct: 60, sell_unit_cents: priced.lines[0].sellUnitCents, overridden: false }]);
    for (const figure of [priced.installQuoteId, priced.installCents, priced.productsCents, priced.clientTotalCents, FILE, V1, JOB, OWNER]) {
      expect(values).toContain(figure);
    }
    expect(values).toContain(`Sent Contract PSS-1042 v1.pdf for ${formatCents(priced.clientTotalCents)}`);
  });
  it("the freeze re-checks the stored pricing inputs the review read (waive, no-install, every line's %)", async () => {
    const waived = { ...version, waiveHandling: true, lines: version.lines.map((l) => ({ ...l, pctOverride: 64.1 })) };
    store.listVersions.mockResolvedValue([waived]);
    const review = await loadReview(JOB);
    await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    const call = sql.mock.calls[0];
    const s = text(call);
    const frozen = s.slice(s.indexOf("frozen as ("), s.indexOf("priced_lines as ("));
    expect(frozen).toContain("and waive_handling = ? and no_install = ?");
    expect(frozen).toMatch(/and not exists \( select 1 from dc_quote_lines q join jsonb_to_recordset\(\?::jsonb\) as r\(position int, override numeric\) on q.position = r.position where q.version_id = \? and q.pct_override is distinct from r.override \)/);
    // The values bound to those guards are the ones the review priced from.
    const strings = call[0] as TemplateStringsArray;
    const valueAfter = (fragment: string) => call[1 + strings.findIndex((part) => part.replace(/\s+/g, " ").endsWith(fragment))];
    expect(valueAfter("and waive_handling = ")).toBe(true);
    expect(valueAfter(" and no_install = ")).toBe(false);
    const lineJson = JSON.parse(call.slice(1).find((v: unknown) => typeof v === "string" && v.startsWith("[{")) as string);
    expect(lineJson[0]).toMatchObject({ position: 1, override: 64.1, pct: 64.1, overridden: true });
  });
  it("the freeze re-checks, where they are stored, that the job is not Lost and has an email", async () => {
    const review = await loadReview(JOB);
    await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    const s = text(sql.mock.calls[0]);
    const frozen = s.slice(s.indexOf("frozen as ("), s.indexOf("priced_lines as ("));
    expect(frozen).toContain("and exists (select 1 from leads where id = ? and status <> 'lost' and nullif(trim(email), '') is not null)");
  });
  it("removes the generated file when the freeze statement matched nothing (a race)", async () => {
    sql.mockResolvedValue([]);
    const review = await loadReview(JOB);
    expect(await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER })).toEqual({ error: "This quote changed while you were sending. Reload and try again." });
    expect(deleteFile).toHaveBeenCalledWith(FILE, OWNER);
    expect(sendContractEmail).not.toHaveBeenCalled();
  });
  it("logs when the race cleanup cannot remove the file", async () => {
    sql.mockResolvedValue([]);
    files.deleteFile.mockResolvedValue(false);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const review = await loadReview(JOB);
    expect(await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER })).toEqual({ error: "This quote changed while you were sending. Reload and try again." });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(FILE));
    spy.mockRestore();
  });
  it("removes the generated file when the freeze statement throws, and the error still propagates", async () => {
    sql.mockRejectedValue(new Error("db down"));
    files.deleteFile.mockRejectedValue(new Error("cleanup failed too"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const review = await loadReview(JOB);
    await expect(sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER })).rejects.toThrow("db down");
    expect(deleteFile).toHaveBeenCalledWith(FILE, OWNER);
    expect(sendContractEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("a failed client email still leaves the contract sent, and says so", async () => {
    vi.mocked(sendContractEmail).mockRejectedValue(new Error("resend down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const review = await loadReview(JOB);
    expect(await sendContract({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER })).toEqual({ ok: true, emailed: false });
    expect(deleteFile).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
