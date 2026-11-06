import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { signedOrder } = await import("@/lib/portal/order");

const VERSION = "6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

beforeEach(() => { sql.mockReset().mockResolvedValue([]); });

describe("signedOrder", () => {
  it("reads only room, product and quantity, so no cost or price can reach the client's page", async () => {
    await signedOrder(VERSION);
    expect(text(sql.mock.calls[0])).toBe(" select room, description, qty from dc_quote_lines where version_id = ? order by position");
    expect(sql.mock.calls[0].slice(1)).toEqual([VERSION]);
  });

  it("names products as the quote PDF does, and a line with no room as an accessory", async () => {
    sql.mockResolvedValue([
      { room: "Living Room", description: "Hunter Douglas Duette LiteRise Bottom-Up", qty: 1 },
      { room: "", description: "Hunter Douglas PowerView Gateway", qty: "1" },
    ]);
    expect(await signedOrder(VERSION)).toEqual([
      { room: "Living Room", product: "Duette LiteRise Bottom-Up", qty: 1 },
      { room: "Accessory", product: "PowerView Gateway", qty: 1 },
    ]);
  });

  it("reads nothing for a malformed id", async () => {
    expect(await signedOrder("../etc")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});
