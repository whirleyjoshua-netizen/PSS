import { describe, it, expect } from "vitest";
import { checkUpload, safeName, fitWithin, LIMITS, contentDisposition } from "@/lib/admin/uploads";

const MB = 1024 * 1024;

describe("checkUpload", () => {
  it("accepts a JPEG photo up to 10 MB", () => {
    expect(checkUpload("photo", "image/jpeg", 10 * MB)).toBeNull();
    expect(checkUpload("photo", "image/jpeg", 10 * MB + 1)).toMatch(/10 MB/);
  });

  it("accepts PDF, JPG, and PNG documents up to 20 MB", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png"]) {
      expect(checkUpload("document", type, 20 * MB)).toBeNull();
    }
    expect(checkUpload("document", "application/pdf", 20 * MB + 1)).toMatch(/20 MB/);
  });

  it("names the allowed types when refusing one", () => {
    expect(checkUpload("document", "application/zip", 1000)).toMatch(/PDF, JPG, or PNG/);
    expect(checkUpload("photo", "image/png", 1000)).toMatch(/JPG/);
  });

  it("refuses an empty file", () => {
    expect(checkUpload("document", "application/pdf", 0)).toMatch(/empty/i);
  });

  it("exposes the limits", () => {
    expect(LIMITS.document.maxBytes).toBe(20 * MB);
  });
});

describe("safeName", () => {
  it("keeps letters, digits, dots, dashes, and underscores", () => {
    expect(safeName("Quote #3 (final).pdf")).toBe("Quote-3-final-.pdf");
  });

  it("never returns an empty name and caps the length", () => {
    expect(safeName("")).toBe("file");
    expect(safeName("a".repeat(200)).length).toBe(80);
  });
});

describe("fitWithin", () => {
  it("scales the longest side down to the limit", () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("leaves small images alone", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe("contentDisposition", () => {
  it("produces an ASCII-only fallback and a UTF-8 extended parameter", () => {
    const header = contentDisposition("Joe\u2019s quote.pdf");
    expect(/^[\x00-\x7F]*$/.test(header)).toBe(true);
    expect(header).toContain('filename="Joe_s quote.pdf"');
    expect(header).toContain("filename*=UTF-8''Joe%E2%80%99s%20quote.pdf");
  });

  it("strips quotes, backslashes, and CRLF from the fallback", () => {
    const header = contentDisposition('evil"\\\r\nname.pdf');
    expect(/^[\x00-\x7F]*$/.test(header)).toBe(true);
    const fallback = /filename="([^"]*)"/.exec(header)?.[1];
    expect(fallback).toBe("evil____name.pdf");
    expect(fallback).not.toMatch(/["\\]/);
    expect(fallback).not.toMatch(/\r|\n/);
  });

  it("falls back to \"file\" when the sanitized name is empty", () => {
    const header = contentDisposition("");
    expect(header).toContain('filename="file"');
  });

  it("does not throw on a lone UTF-16 surrogate", () => {
    expect(() => contentDisposition("bad\uD800name.pdf")).not.toThrow();
    const header = contentDisposition("bad\uD800name.pdf");
    expect(/^[\x00-\x7F]*$/.test(header)).toBe(true);
  });
});
