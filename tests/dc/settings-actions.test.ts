import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => {
  order.push("auth");
  return { email: "o@x.com" };
});
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const saveMarkupRule = vi.fn(async (..._args: unknown[]) => {
  order.push("save");
});
vi.mock("@/lib/dc/store", () => ({ saveMarkupRule }));

const { saveMarkupAction } = await import("@/app/admin/settings/actions");

/** A FormData that records when it is first read, so the test can see auth came first. */
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  const get = data.get.bind(data);
  data.get = (name: string) => {
    order.push(`read:${name}`);
    return get(name);
  };
  return data;
};

const BAD_PCT = { error: "Enter a percentage like 60 or 57.5" };

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
});

describe("saveMarkupAction", () => {
  it("saves a product line's % of MSRP with who saved it, and refreshes Settings and job pages", async () => {
    expect(await saveMarkupAction({}, form({ collection: "Duette", pct: "60" }))).toEqual({ ok: true });
    expect(saveMarkupRule).toHaveBeenCalledWith("Duette", 60, "o@x.com");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/jobs/[id]", "page");
  });

  it("accepts two decimals and trims the name", async () => {
    expect(await saveMarkupAction({}, form({ collection: "  Alta Honeycomb Shades ", pct: " 57.25 " }))).toEqual({ ok: true });
    expect(saveMarkupRule).toHaveBeenCalledWith("Alta Honeycomb Shades", 57.25, "o@x.com");
  });

  it("clears the rule when the percentage is blank", async () => {
    expect(await saveMarkupAction({}, form({ collection: "Duette", pct: "" }))).toEqual({ ok: true });
    expect(saveMarkupRule).toHaveBeenCalledWith("Duette", null, "o@x.com");
  });

  it.each(["abc", "0", "0.00", "-5", "1000.01", "60.123", "1e2"])("refuses %j without saving", async (pct) => {
    expect(await saveMarkupAction({}, form({ collection: "Duette", pct }))).toEqual(BAD_PCT);
    expect(saveMarkupRule).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts the 1000% ceiling", async () => {
    expect(await saveMarkupAction({}, form({ collection: "Duette", pct: "1000" }))).toEqual({ ok: true });
    expect(saveMarkupRule).toHaveBeenCalledWith("Duette", 1000, "o@x.com");
  });

  it("checks the session before reading the form", async () => {
    await saveMarkupAction({}, form({ collection: "Duette", pct: "60" }));
    expect(order[0]).toBe("auth");
  });

  it("saves nothing when the session check fails", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const data = form({ collection: "Duette", pct: "60" });
    await expect(saveMarkupAction({}, data)).rejects.toThrow("NEXT_REDIRECT");
    expect(order).toEqual([]);
    expect(saveMarkupRule).not.toHaveBeenCalled();
  });

  describe("adding a product line before any quote uses it", () => {
    it("saves the typed name and percentage", async () => {
      const result = await saveMarkupAction({}, form({ mode: "add", collection: " Silhouette Window Shadings ", pct: "62.5" }));
      expect(result).toEqual({ ok: true });
      expect(saveMarkupRule).toHaveBeenCalledWith("Silhouette Window Shadings", 62.5, "o@x.com");
    });

    it("refuses a blank or whitespace name", async () => {
      expect(await saveMarkupAction({}, form({ mode: "add", collection: "   ", pct: "60" }))).toEqual({
        error: "Enter the product line name",
      });
      expect(saveMarkupRule).not.toHaveBeenCalled();
    });

    it("refuses a blank percentage, since adding a line with no markup would save nothing", async () => {
      expect(await saveMarkupAction({}, form({ mode: "add", collection: "Duette", pct: "" }))).toEqual(BAD_PCT);
      expect(saveMarkupRule).not.toHaveBeenCalled();
    });
  });
});
