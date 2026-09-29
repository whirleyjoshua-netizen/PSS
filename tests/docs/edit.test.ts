import { describe, expect, it } from "vitest";
import { insertText, prefixLines, wrapBold } from "@/lib/docs/edit";

describe("prefixLines", () => {
  it("turns the caret's line into a heading", () =>
    expect(prefixLines({ text: "Scope\nNext", start: 2, end: 2 }, "## ")).toEqual({ text: "## Scope\nNext", start: 0, end: 8 }));
  it("prefixes every selected line, replacing another prefix, skipping blank lines", () =>
    expect(prefixLines({ text: "## a\n\nb\nc", start: 0, end: 8 }, "- ").text).toBe("- a\n\n- b\nc"));
  it("toggles the prefix off when every selected line already has it", () =>
    expect(prefixLines({ text: "- a\n- b", start: 0, end: 7 }, "- ").text).toBe("a\nb"));
  it("tells ## from ###", () =>
    expect(prefixLines({ text: "### a", start: 0, end: 0 }, "## ").text).toBe("## a"));
  it("starts a heading on an empty line, caret after the prefix", () =>
    expect(prefixLines({ text: "", start: 0, end: 0 }, "### ")).toEqual({ text: "### ", start: 4, end: 4 }));
});

describe("wrapBold", () => {
  it("wraps the selection", () => expect(wrapBold({ text: "pay now", start: 4, end: 7 })).toEqual({ text: "pay **now**", start: 4, end: 11 }));
  it("unwraps a selection that is already bold", () =>
    expect(wrapBold({ text: "pay **now**", start: 4, end: 11 })).toEqual({ text: "pay now", start: 4, end: 7 }));
  it("inserts an empty pair with the caret inside", () => expect(wrapBold({ text: "ab", start: 1, end: 1 })).toEqual({ text: "a****b", start: 3, end: 3 }));
});

describe("insertText", () => {
  it("replaces the selection and puts the caret after", () =>
    expect(insertText({ text: "Hi X!", start: 3, end: 4 }, "{{client_name}}")).toEqual({ text: "Hi {{client_name}}!", start: 18, end: 18 }));
});
