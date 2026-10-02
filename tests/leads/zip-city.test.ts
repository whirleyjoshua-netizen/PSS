import { describe, it, expect } from "vitest";
import { cityForZip } from "@/lib/leads/zip-city";

describe("cityForZip", () => {
  it.each(["89002", "89011", "89012", "89014", "89015", "89044", "89052", "89074"])(
    "maps Henderson ZIP %s",
    (zip) => expect(cityForZip(zip)).toBe("Henderson"),
  );

  it.each(["89030", "89031", "89032", "89081", "89084", "89085", "89086"])(
    "maps North Las Vegas ZIP %s",
    (zip) => expect(cityForZip(zip)).toBe("North Las Vegas"),
  );

  it.each(["89134", "89135", "89138", "89144", "89145"])("maps Summerlin ZIP %s", (zip) =>
    expect(cityForZip(zip)).toBe("Summerlin"),
  );

  it.each(["89101", "89117", "89123", "89199"])("maps other 891xx ZIP %s to Las Vegas", (zip) =>
    expect(cityForZip(zip)).toBe("Las Vegas"),
  );

  it.each(["89100", "89200", "90210", "89001", "12345"])("returns null for out-of-area ZIP %s", (zip) =>
    expect(cityForZip(zip)).toBeNull(),
  );

  it("uses the first five digits of a ZIP+4", () => {
    expect(cityForZip("89052-1234")).toBe("Henderson");
  });

  it("trims surrounding whitespace", () => {
    expect(cityForZip("  89134 ")).toBe("Summerlin");
  });

  it.each(["", "   ", null, undefined, "abc", "8905"])("returns null for blank or malformed %j", (zip) =>
    expect(cityForZip(zip)).toBeNull(),
  );
});
