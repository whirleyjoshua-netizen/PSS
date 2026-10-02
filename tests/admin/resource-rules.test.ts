import { describe, expect, it } from "vitest";
import {
  CATEGORY_MAX, NAME_MAX, RESOURCE_MAX_BYTES, cleanCategory, cleanName, formatBytes, groupResources, opensInline,
  resourceIdFromPathname, resourcePathname, type Resource,
} from "@/lib/admin/resource-rules";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("resource paths", () => {
  it("files each upload under resources/<id>/ with a storage-safe name", () => {
    expect(resourcePathname(ID, "HD Price Sheet (2026).pdf")).toBe(`resources/${ID}/HD-Price-Sheet-2026-.pdf`);
  });

  it("reads the id back only from a well-formed path", () => {
    expect(resourceIdFromPathname(resourcePathname(ID, "a.pdf"))).toBe(ID);
    for (const bad of [
      `jobs/${ID}/a.pdf`, `resources/${ID}`, `resources/${ID}/`, `resources/not-a-uuid/a.pdf`, `resources/${ID}/a b.pdf`,
      `resources/${ID}/../x.pdf`, `resources/${ID}/a/b.pdf`, `/resources/${ID}/a.pdf`, `resources/${ID}/.`, `resources/${ID}/..`,
    ]) expect(resourceIdFromPathname(bad)).toBeNull();
  });

  it("allows 200 MB", () => {
    expect(RESOURCE_MAX_BYTES).toBe(200 * 1024 * 1024);
  });
});

describe("names and categories", () => {
  it("trims a name and refuses an empty or too-long one", () => {
    expect(cleanName("  Spec book.pdf ")).toBe("Spec book.pdf");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(NAME_MAX))).toHaveLength(NAME_MAX);
    expect(cleanName("x".repeat(NAME_MAX + 1))).toBeNull();
  });

  it("trims a category, collapses its spaces, and refuses an empty or too-long one", () => {
    expect(cleanCategory("  Price   sheets ")).toBe("Price sheets");
    expect(cleanCategory("")).toBeNull();
    expect(cleanCategory("x".repeat(CATEGORY_MAX + 1))).toBeNull();
  });
});

describe("opensInline", () => {
  it("opens PDFs and photos in the browser, and downloads everything else", () => {
    for (const t of ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf; charset=binary"]) expect(opensInline(t)).toBe(true);
    for (const t of ["text/html", "image/svg+xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", ""]) expect(opensInline(t)).toBe(false);
  });
});

describe("formatBytes", () => {
  it.each([[512, "512 B"], [2048, "2 KB"], [1536 * 1024, "1.5 MB"], [200 * 1024 * 1024, "200 MB"]])("%d → %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe("groupResources", () => {
  const file = (name: string, category: string): Resource => ({
    id: name, name, category, contentType: "application/pdf", sizeBytes: 1, uploadedBy: "o@example.com", createdAt: new Date(0),
  });
  const list = [file("W-9.pdf", "Licenses"), file("Duette spec.pdf", "Spec books"), file("Alustra spec.pdf", "Spec books"), file("COI 2026.pdf", "Licenses")];

  it("groups by category A–Z, each by name A–Z", () => {
    expect(groupResources(list, "").map((g) => [g.category, g.files.map((f) => f.name)])).toEqual([
      ["Licenses", ["COI 2026.pdf", "W-9.pdf"]],
      ["Spec books", ["Alustra spec.pdf", "Duette spec.pdf"]],
    ]);
  });

  it("filters by name or category, ignoring case, and drops empty groups", () => {
    expect(groupResources(list, "DUETTE").map((g) => [g.category, g.files.map((f) => f.name)])).toEqual([["Spec books", ["Duette spec.pdf"]]]);
    expect(groupResources(list, "licen").map((g) => g.files.length)).toEqual([2]);
    expect(groupResources(list, "nothing")).toEqual([]);
  });
});
