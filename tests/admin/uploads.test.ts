import { describe, it, expect } from "vitest";
import { contentDisposition } from "@/lib/admin/uploads";

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
});
