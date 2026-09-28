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
  it("answers null when the message was already imported (the statement inserted nothing)", async () => {
    sql.mockResolvedValue([]);
    expect(await store.importVersion({ messageId: "<m@x>", receivedAt: new Date(), leadId: JOB, quote: parsed.quote, sourceFileId: FILE, sha256: "abc", actor: "Direct Connect" })).toBeNull();
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
