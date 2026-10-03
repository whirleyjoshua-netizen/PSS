import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseDealerCopy } from "@/lib/dc/parse";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/dc/store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";
const parsed = parseDealerCopy(readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8"));
if (!parsed.ok) throw new Error("fixture must parse");

beforeEach(() => sql.mockReset());

describe("importVersion", () => {
  it("writes the message, version, lines and event in ONE statement", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    const result = await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB,
      quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    expect(result).toEqual({ versionId: "v1", version: 1 });
    expect(sql).toHaveBeenCalledTimes(1);
    const statement = text(sql.mock.calls[0]);
    for (const part of ["insert into ingested_messages", "on conflict (message_id) do nothing",
      "insert into dc_quote_versions", "insert into dc_quote_lines", "jsonb_to_recordset", "insert into job_events", "'quote'"]) {
      expect(statement).toContain(part);
    }
  });
  it("sends the lines as one JSON document with exact cents and options", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    const json = sql.mock.calls[0].slice(1).find((v) => typeof v === "string" && v.startsWith("[{"));
    const [line] = JSON.parse(json as string);
    expect(line).toMatchObject({ position: 1, qty: 1, msrp_unit_cents: 65500, cost_extended_cents: 33667, collection: "Duette" });
    expect(line.options[0]).toEqual(["Location", "Living Room"]);
  });
  it("stores the DC Client name on the version, beside the PO", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: { ...parsed.quote, clientName: "Jane Client" },
      sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("dc_quote_no, po_reference, client_name, source_file_id");
    const binds = sql.mock.calls[0].slice(1);
    expect(binds[binds.indexOf("PSS-1042") + 1]).toBe("Jane Client");
  });
  it("answers null when the message was already imported (the statement inserted nothing)", async () => {
    sql.mockResolvedValue([]);
    expect(await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" })).toBeNull();
  });
});

describe("listVersions", () => {
  const row = { id: VERSION, lead_id: JOB, version: 1, dc_quote_no: "1", po_reference: "PSS-1042", client_name: "Jane Client",
    source_file_id: FILE, source_sha256: "x", status: "draft", dealer_subtotal_cents: 1, handling_fee_cents: 0, oversized_fee_cents: 0,
    dealer_total_cents: 1, created_at: new Date().toISOString(),
    quote_file_id: "q1", offered_at: "2026-09-21T18:00:00.000Z", approved_at: null, option: "A" };
  it("reads the DC Client name back", async () => {
    sql.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    const [version] = await store.listVersions(JOB);
    expect(version.clientName).toBe("Jane Client");
    expect(version).toMatchObject({ quoteFileId: "q1", offeredAt: new Date("2026-09-21T18:00:00.000Z"), approvedAt: null });
  });
  it("reads each version's option back", async () => {
    sql.mockResolvedValueOnce([{ ...row, option: "B", po_reference: "PSS-1042-B" }]).mockResolvedValueOnce([]);
    const [version] = await store.listVersions(JOB);
    expect(version.option).toBe("B");
  });
});

describe("setLineOverride / setVersionChoices", () => {
  it("only touches a draft of this job", async () => {
    sql.mockResolvedValue([{ position: 1 }]);
    await store.setLineOverride(JOB, VERSION, 1, 55, "o@x.com");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("status = 'draft'");
    expect(s).toContain("lead_id =");
    sql.mockClear();
    await store.setVersionChoices(JOB, VERSION, { waiveHandling: true });
    expect(text(sql.mock.calls[0])).toContain("status = 'draft'");
  });
  it("refuses a percentage outside 0–1000 without touching the database", async () => {
    await expect(store.setLineOverride(JOB, VERSION, 1, 0, "o@x.com")).resolves.toBe(false);
    await expect(store.setLineOverride(JOB, VERSION, 1, 1000.01, "o@x.com")).resolves.toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("saveMarkupRule", () => {
  it("trims the collection and upserts, or deletes for null", async () => {
    sql.mockResolvedValue([]);
    await store.saveMarkupRule("  Duette ", 60, "o@x.com");
    expect(text(sql.mock.calls[0])).toContain("on conflict (collection) do update");
    expect(sql.mock.calls[0]).toContain("Duette");
    await store.saveMarkupRule("Duette", null, "o@x.com");
    expect(text(sql.mock.calls[1])).toContain("delete from markup_rules");
  });
});

describe("percentages with float error", () => {
  it("accepts 2-decimal values whose *100 is not an exact float (64.1, 57.35, 33.3)", async () => {
    sql.mockResolvedValue([{ id: "e1" }]);
    for (const pct of [64.1, 57.35, 33.3]) {
      await expect(store.setLineOverride(JOB, VERSION, 1, pct, "o@x.com")).resolves.toBe(true);
      await expect(store.saveMarkupRule("Duette", pct, "o@x.com")).resolves.toBeUndefined();
    }
  });
  it("still rejects 0, 1000.01 and 60.123", async () => {
    for (const pct of [0, 1000.01, 60.123]) {
      await expect(store.setLineOverride(JOB, VERSION, 1, pct, "o@x.com")).resolves.toBe(false);
      await expect(store.saveMarkupRule("Duette", pct, "o@x.com")).rejects.toThrow();
    }
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("one markup rule per product line, whatever its case", () => {
  it("saving a spelling removes other-case spellings in the same statement as the upsert", async () => {
    sql.mockResolvedValue([]);
    await store.saveMarkupRule("duette", 70, "o@x.com");
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    expect(s).toMatch(/delete from markup_rules where lower\(collection\) = lower\(\?\) and collection <> \?.*insert into markup_rules/);
    expect(s).toContain("on conflict (collection) do update");
  });
  it("lists rules in a fixed order", async () => {
    sql.mockResolvedValue([]);
    await store.listMarkupRules();
    expect(text(sql.mock.calls[0])).toContain("order by");
  });
  it("lists each seen product line once, case-folded, preferring the ruled spelling", async () => {
    sql.mockResolvedValue([{ collection: "Duette" }]);
    expect(await store.listSeenCollections()).toEqual(["Duette"]);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("distinct on (lower(");
    expect(s).toMatch(/from markup_rules.*union all.*from dc_quote_lines/);
  });
});

/** The values bound right after each template part ending with `fragment`, in order. */
const after = (call: unknown[], fragment: string) => {
  const strings = call[0] as TemplateStringsArray;
  return strings.map((part, i) => [part.replace(/\s+/g, " "), call[1 + i]] as const)
    .filter(([part]) => part.endsWith(fragment)).map(([, value]) => value);
};

describe("quote options in the store (spec §2, §4)", () => {
  const B_QUOTE = { ...parsed.quote, option: "B", poReference: "PSS-1042-B" };

  it("importVersion stores the option and numbers the version within it", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: B_QUOTE, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    const call = sql.mock.calls[0];
    const s = text(call);
    expect(s).toContain("insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, client_name, source_file_id");
    expect(s).toContain("coalesce((select max(version) from dc_quote_versions where lead_id = ? and option = ?), 0) + 1");
    expect(after(call, "and option = ")).toEqual(["B"]);
    expect(call.slice(1)).toContain("Direct Connect quote 22250749 arrived as PSS-1042-B version ");
  });

  it("an option A import keeps today's event wording", async () => {
    sql.mockResolvedValue([{ id: "v1", version: 1 }]);
    await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" });
    expect(sql.mock.calls[0].slice(1)).toContain("Direct Connect quote 22250749 arrived as version ");
    expect(after(sql.mock.calls[0], "and option = ")).toEqual(["A"]);
  });

  it("latestSha reads the newest version of that option only", async () => {
    sql.mockResolvedValueOnce([{ source_sha256: "s1", status: "offered" }]);
    expect(await store.latestSha(JOB, "B")).toBe("s1");
    expect(text(sql.mock.calls[0])).toContain("from dc_quote_versions where lead_id = ? and option = ? order by version desc limit 1");
    expect(sql.mock.calls[0].slice(1)).toEqual([JOB, "B"]);
  });

  it.each(["superseded", "cancelled"])("latestSha is null when the option's newest version is %s, so an unchanged re-send comes back as a draft", async (status) => {
    sql.mockResolvedValueOnce([{ source_sha256: "s1", status }]);
    expect(await store.latestSha(JOB, "A")).toBeNull();
  });

  it("latestSha is null for an option with no versions", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.latestSha(JOB, "C")).toBeNull();
  });

  it("option A always exists; B–Z exist once stored; anything else never, and without a query", async () => {
    expect(await store.quoteOptionExists(JOB, "A")).toBe(true);
    expect(sql).not.toHaveBeenCalled();
    sql.mockResolvedValueOnce([{ exists: 1 }]);
    expect(await store.quoteOptionExists(JOB, "B")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("select 1 from quote_options where lead_id = ? and letter = ?");
    sql.mockResolvedValueOnce([]);
    expect(await store.quoteOptionExists(JOB, "C")).toBe(false);
    sql.mockClear();
    expect(await store.quoteOptionExists(JOB, "b")).toBe(false);
    expect(await store.quoteOptionExists("x", "B")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("lists option A first, then every stored letter in order", async () => {
    sql.mockResolvedValueOnce([{ letter: "B" }, { letter: "C" }]);
    expect(await store.listQuoteOptions(JOB)).toEqual(["A", "B", "C"]);
    expect(text(sql.mock.calls[0])).toContain("select letter from quote_options where lead_id = ? order by letter");
    sql.mockClear();
    expect(await store.listQuoteOptions("x")).toEqual(["A"]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("addQuoteOption (spec §3)", () => {
  it("in ONE statement adds the next letter and logs it, only on a job that is not Lost, has no signed version, has a number and is short of Z", async () => {
    sql.mockResolvedValueOnce([{ letter: "B", status: "quoted", signed: false, project_no: 1042, code: 66 }]);
    expect(await store.addQuoteOption(JOB, "o@x.com")).toEqual({ letter: "B" });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "exists (select 1 from dc_quote_versions v where v.lead_id = leads.id and v.status = 'signed') as signed",
      "select coalesce(max(ascii(letter)), ascii('A')) + 1 as code from quote_options where lead_id = ?",
      "insert into quote_options (lead_id, letter, created_by) select job.id, chr(slot.code), ? from job, slot",
      "where job.status <> 'lost' and not job.signed and job.project_no is not null and slot.code <= ascii('Z')",
      "on conflict (lead_id, letter) do nothing",
      "select added.lead_id, ?, 'quote', 'Added quote option PSS-' || lpad(job.project_no::text, greatest(4, length(job.project_no::text)), '0') || '-' || added.letter from added, job",
      "select (select letter from added) as letter, job.status, job.signed, job.project_no, slot.code from job, slot",
    ]) expect(s).toContain(part);
  });

  it.each([
    [{ letter: null, status: "lost", signed: false, project_no: 1042, code: 66 }, "This job is marked Lost."],
    [{ letter: null, status: "signed", signed: true, project_no: 1042, code: 66 }, "This job has a signed quote. Make changes as a new version of the signed option."],
    [{ letter: null, status: "quoted", signed: false, project_no: null, code: 66 }, "This job has no PSS number yet."],
    [{ letter: null, status: "quoted", signed: false, project_no: 1042, code: 91 }, "This job already has options A to Z."],
    [{ letter: null, status: "quoted", signed: false, project_no: 1042, code: 67 }, "Another quote option was just added. Reload and try again."],
  ])("refuses with the reason read in the same statement (%o)", async (row, error) => {
    sql.mockResolvedValueOnce([row]);
    expect(await store.addQuoteOption(JOB, "o@x.com")).toEqual({ error });
  });

  it("refuses a job that does not exist, and never queries a malformed id", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.addQuoteOption(JOB, "o@x.com")).toEqual({ error: "This job no longer exists." });
    sql.mockClear();
    expect(await store.addQuoteOption("x", "o@x.com")).toEqual({ error: "This job no longer exists." });
    expect(sql).not.toHaveBeenCalled();
  });
});
