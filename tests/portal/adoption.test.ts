// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseAdoption, parsePngDataUrl, pngSize, requireInitials, type AdoptionForm } from "@/lib/portal/adoption";
import {
  INITIALS_INPUT_PATTERN, INITIALS_MAX, INITIALS_PATTERN, PNG_DATA_URL_MAX, PNG_DATA_URL_PREFIX, PNG_MAX_BYTES,
} from "@/lib/portal/adoption-limits";
import { PNG_SIGNATURE, corruptPng, pngBytes, pngDataUrl } from "../fixtures/png";

const typed = (initials: string): AdoptionForm => ({ method: "typed", initials, signatureImage: "", initialsImage: "" });
const drawn = (signatureImage: string, initialsImage = ""): AdoptionForm => ({ method: "drawn", initials: "", signatureImage, initialsImage });
const SIG = pngBytes(600, 200);
const INI = pngBytes(200, 100);

describe("pngSize reads IHDR without decoding", () => {
  it("reads width and height", () => expect(pngSize(pngBytes(123, 45))).toEqual({ width: 123, height: 45 }));
  it("refuses bytes that are not a PNG", () => {
    expect(pngSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(40)]))).toBeNull(); // a JPEG header
    expect(pngSize(PNG_SIGNATURE)).toBeNull(); // too short for IHDR
  });
  it("refuses a PNG whose first chunk is not a 13-byte IHDR", () => {
    const wrongType = pngBytes(10, 10);
    wrongType.write("IHDX", 12, "latin1");
    expect(pngSize(wrongType)).toBeNull();
    const wrongLength = pngBytes(10, 10);
    wrongLength.writeUInt32BE(12, 8);
    expect(pngSize(wrongLength)).toBeNull();
  });
});

describe("parsePngDataUrl (spec §6)", () => {
  it("accepts a real PNG at the size limits", () => {
    const edge = pngBytes(1200, 400);
    expect(parsePngDataUrl(pngDataUrl(edge))?.equals(edge)).toBe(true);
  });
  it.each([[1201, 10], [10, 401], [0, 10], [10, 0]])("refuses %i x %i", (w, h) => {
    expect(parsePngDataUrl(pngDataUrl(pngBytes(w, h)))).toBeNull();
  });
  it("refuses another image type, a missing prefix and malformed base64", () => {
    expect(parsePngDataUrl(`data:image/jpeg;base64,${SIG.toString("base64")}`)).toBeNull();
    expect(parsePngDataUrl(SIG.toString("base64"))).toBeNull();
    expect(parsePngDataUrl(`${PNG_DATA_URL_PREFIX}${SIG.toString("base64")}!`)).toBeNull();
    expect(parsePngDataUrl(`${PNG_DATA_URL_PREFIX}${SIG.toString("base64").slice(0, -1)}`)).toBeNull();
    expect(parsePngDataUrl(PNG_DATA_URL_PREFIX)).toBeNull();
    // Whole base64 groups with non-base64 characters: Buffer.from would skip them and decode the PNG.
    const b64 = SIG.toString("base64");
    expect(parsePngDataUrl(`${PNG_DATA_URL_PREFIX}${b64.slice(0, 40)}****${b64.slice(40)}`)).toBeNull();
  });
  it("refuses data that is not a PNG whatever the prefix says", () => {
    expect(parsePngDataUrl(`${PNG_DATA_URL_PREFIX}${Buffer.from("GIF89a is not a png at all.....").toString("base64")}`)).toBeNull();
  });
  it("accepts exactly 150 KB decoded and refuses one byte more", () => {
    const base = pngBytes(10, 10);
    const atLimit = Buffer.concat([base, Buffer.alloc(PNG_MAX_BYTES - base.length)]);
    expect(atLimit.length).toBe(150 * 1024);
    expect(parsePngDataUrl(pngDataUrl(atLimit))).not.toBeNull();
    expect(parsePngDataUrl(pngDataUrl(Buffer.concat([atLimit, Buffer.alloc(1)])))).toBeNull();
  });
  it("refuses an overlong data URL before decoding anything", () => {
    const from = vi.spyOn(Buffer, "from");
    // Four characters over the cap, in whole base64 groups, so only the length check can refuse it undecoded.
    const overlong = PNG_DATA_URL_PREFIX + "A".repeat(PNG_DATA_URL_MAX - PNG_DATA_URL_PREFIX.length + 4);
    expect((overlong.length - PNG_DATA_URL_PREFIX.length) % 4).toBe(0);
    expect(parsePngDataUrl(overlong)).toBeNull();
    expect(from).not.toHaveBeenCalled();
    from.mockRestore();
  });
  it("lets a header-valid PNG with corrupt data through: it is never decoded here (spec §9)", () => {
    expect(parsePngDataUrl(pngDataUrl(corruptPng(20, 10)))).not.toBeNull();
  });
});

describe("parseAdoption", () => {
  it("takes typed initials trimmed, and none when left empty", () => {
    expect(parseAdoption(typed(" J.D "))).toEqual({ method: "typed", initials: "J.D" });
    expect(parseAdoption(typed("Jo-Ann"))).toEqual({ method: "typed", initials: "Jo-Ann" });
    expect(parseAdoption(typed("   "))).toEqual({ method: "typed", initials: null });
  });
  it.each([["1D"], ["ABCDEFG"], ["J@"], [".J"], ["J_D"]])("refuses typed initials %s", (value) => {
    expect(parseAdoption(typed(value))).toBeNull();
  });
  it("ignores image fields in typed mode", () => {
    expect(parseAdoption({ ...typed("JD"), signatureImage: "junk", initialsImage: "junk" })).toEqual({ method: "typed", initials: "JD" });
  });
  it("takes drawn images as bytes, with or without initials", () => {
    const both = parseAdoption(drawn(pngDataUrl(SIG), pngDataUrl(INI)));
    if (both?.method !== "drawn") throw new Error("expected a drawn adoption");
    expect(both.signaturePng.equals(SIG)).toBe(true);
    expect(both.initialsPng?.equals(INI)).toBe(true);
    expect(parseAdoption(drawn(pngDataUrl(SIG)))).toMatchObject({ method: "drawn", initialsPng: null });
  });
  it("ignores typed initials in drawn mode", () => {
    expect(parseAdoption({ ...drawn(pngDataUrl(SIG)), initials: "JD" })).toMatchObject({ method: "drawn", initialsPng: null });
  });
  it("refuses a drawn adoption without a valid signature, or with invalid initials", () => {
    expect(parseAdoption(drawn(""))).toBeNull();
    expect(parseAdoption(drawn(pngDataUrl(pngBytes(1201, 10))))).toBeNull();
    expect(parseAdoption(drawn(pngDataUrl(SIG), "data:image/png;base64,AAAA"))).toBeNull();
  });
  it.each([[""], ["Typed"], ["both"]])("refuses method %j", (method) => {
    expect(parseAdoption({ ...typed("JD"), method })).toBeNull();
  });
  it("treats a post with no method field as typed: a portal page opened before the deploy posts only the name and the agree box", () => {
    expect(parseAdoption({ method: null, initials: "", signatureImage: "", initialsImage: "" })).toEqual({ method: "typed", initials: null });
    expect(parseAdoption({ method: null, initials: "JD", signatureImage: "", initialsImage: "" })).toEqual({ method: "typed", initials: "JD" });
  });
  it("still refuses a method field that is present but empty", () => {
    expect(parseAdoption({ method: "", initials: "", signatureImage: "", initialsImage: "" })).toBeNull();
  });
});

describe("requireInitials (initials present exactly when the file has initial marks)", () => {
  it.each([
    [{ method: "typed", initials: "JD" } as const, true, true],
    [{ method: "typed", initials: null } as const, true, false],
    [{ method: "typed", initials: "JD" } as const, false, false],
    [{ method: "typed", initials: null } as const, false, true],
  ])("typed %j, needed %s -> accepted %s", (adoption, needed, accepted) => {
    expect(requireInitials(adoption, needed) !== null).toBe(accepted);
  });
  it("applies the same rule to drawn initials", () => {
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: INI }, true)).not.toBeNull();
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: null }, true)).toBeNull();
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: INI }, false)).toBeNull();
    expect(requireInitials({ method: "drawn", signaturePng: SIG, initialsPng: null }, false)).not.toBeNull();
  });
});

describe("the limits the form shares", () => {
  it("the HTML pattern, compiled as browsers do (v flag), agrees with the server's rule", () => {
    const html = new RegExp(`^(?:${INITIALS_INPUT_PATTERN})$`, "v");
    for (const sample of ["J", "JD", "J.D.", "Jo-Ann", "A B", "ABCDEF", "ABCDEFG", "1D", "J@", "", ".J", "J_D"]) {
      expect(html.test(sample), sample).toBe(INITIALS_PATTERN.test(sample));
    }
    expect(INITIALS_MAX).toBe(6);
  });
  it("the data URL cap is exactly the base64 length of 150 KB", () => {
    expect(PNG_DATA_URL_MAX).toBe(PNG_DATA_URL_PREFIX.length + 204800);
  });
});
