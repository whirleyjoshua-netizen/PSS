import { describe, expect, it } from "vitest";
import { findFieldKeys, parseDocText, parseInline, remainingMarkers, unknownFields } from "@/lib/docs/parse";

const t = (text: string, bold = false) => ({ type: "text" as const, text, bold });
const f = (key: string, bold = false) => ({ type: "field" as const, key, bold });

describe("parseInline", () => {
  it("reads plain text as one run", () => expect(parseInline("Hello there")).toEqual([t("Hello there")]));
  it("reads **bold** runs", () => expect(parseInline("Pay **50%** now")).toEqual([t("Pay "), t("50%", true), t(" now")]));
  it("keeps an unmatched ** literal", () => expect(parseInline("a **b")).toEqual([t("a **b")]));
  it("pairs the first ** marks and leaves a trailing odd one literal", () =>
    expect(parseInline("**a** **b")).toEqual([t("a", true), t(" **b")]));
  it("reads an empty bold pair as nothing, leaving one plain run", () =>
    expect(parseInline("a****b")).toEqual([t("ab")]));
  it("reads a field, trimming its key, bold inside bold", () => {
    expect(parseInline("Hi {{ client_name }}!")).toEqual([t("Hi "), f("client_name"), t("!")]);
    expect(parseInline("**{{deposit}}** due")).toEqual([f("deposit", true), t(" due")]);
  });
  it("reads an unknown or malformed key as a field, so the validator can report it", () =>
    expect(parseInline("{{client name}}")).toEqual([f("client name")]));
  it("treats anything else, including HTML, as literal text", () =>
    expect(parseInline('<script>alert("x")</script> [link](http://x) *one*')).toEqual([t('<script>alert("x")</script> [link](http://x) *one*')]));
});

describe("parseDocText", () => {
  it("reads headings, subheadings, paragraphs and bullets", () => {
    const source = "## Scope\n\nWe install **two** shades.\nSecond line joins.\n\n### Notes\n- one\n- two {{city}}\n\nEnd.";
    expect(parseDocText(source)).toEqual([
      { type: "heading", level: 2, inlines: [t("Scope")] },
      { type: "paragraph", inlines: [t("We install "), t("two", true), t(" shades. Second line joins.")] },
      { type: "heading", level: 3, inlines: [t("Notes")] },
      { type: "bullets", items: [[t("one")], [t("two "), f("city")]] },
      { type: "paragraph", inlines: [t("End.")] },
    ]);
  });
  it("accepts Windows line endings", () =>
    expect(parseDocText("## A\r\n\r\nb")).toEqual([{ type: "heading", level: 2, inlines: [t("A")] }, { type: "paragraph", inlines: [t("b")] }]));
  it("accepts a lone carriage return as a line break", () =>
    expect(parseDocText("## A\r\rb")).toEqual([{ type: "heading", level: 2, inlines: [t("A")] }, { type: "paragraph", inlines: [t("b")] }]));
  it("falls back to literal text for everything outside the grammar", () => {
    expect(parseDocText("# Title")).toEqual([{ type: "paragraph", inlines: [t("# Title")] }]);
    expect(parseDocText("#### Deep")).toEqual([{ type: "paragraph", inlines: [t("#### Deep")] }]);
    expect(parseDocText("##NoSpace")).toEqual([{ type: "paragraph", inlines: [t("##NoSpace")] }]);
    expect(parseDocText("-no space")).toEqual([{ type: "paragraph", inlines: [t("-no space")] }]);
    expect(parseDocText("## ")).toEqual([{ type: "paragraph", inlines: [t("##")] }]);
    expect(parseDocText("1. numbered")).toEqual([{ type: "paragraph", inlines: [t("1. numbered")] }]);
  });
  it("keeps bullets one level deep: an indented bullet joins the same list", () =>
    expect(parseDocText("- a\n  - b\n    - c")).toEqual([{ type: "bullets", items: [[t("a")], [t("b")], [t("c")]] }]));
  it("keeps the rest of a bullet line literal, so '- - x' is one item reading '- x'", () =>
    expect(parseDocText("- - x")).toEqual([{ type: "bullets", items: [[t("- x")]] }]));
  it("ends a list at a plain line and a paragraph at a bullet", () =>
    expect(parseDocText("a\n- b\nc")).toEqual([
      { type: "paragraph", inlines: [t("a")] },
      { type: "bullets", items: [[t("b")]] },
      { type: "paragraph", inlines: [t("c")] },
    ]));
  it("answers no blocks for empty or blank text", () => {
    expect(parseDocText("")).toEqual([]);
    expect(parseDocText(" \n\n  ")).toEqual([]);
  });
});

describe("markers", () => {
  const text = "{{client_name}} owes {{deposit}}. {{client_name}} again, {{ nope }} and {{a b}}.";
  it("finds each field key once, in order", () => expect(findFieldKeys(text)).toEqual(["client_name", "deposit", "nope", "a b"]));
  it("names the keys that are not allowed", () =>
    expect(unknownFields(text, ["client_name", "deposit"])).toEqual(["nope", "a b"]));
  it("lists the markers still in the text, as written", () =>
    expect(remainingMarkers(text)).toEqual(["{{client_name}}", "{{deposit}}", "{{ nope }}", "{{a b}}"]));
  it("finds nothing in text without markers", () => expect(remainingMarkers("Just { braces } and }} {{")).toEqual([]));
  it("keeps an unclosed marker literal, and does not count it as remaining", () => {
    expect(parseDocText("Hi {{client_name and more")).toEqual([{ type: "paragraph", inlines: [t("Hi {{client_name and more")] }]);
    expect(remainingMarkers("Hi {{client_name and more")).toEqual([]);
  });
  it("reads {{{deposit}}} as a field between literal braces", () =>
    expect(parseInline("{{{deposit}}}")).toEqual([t("{"), f("deposit"), t("}")]));
  it("parses 200k characters of open braces without throwing, in under 2s", () => {
    const source = "{{".repeat(100_000);
    const start = performance.now();
    expect(parseDocText(source)).toEqual([{ type: "paragraph", inlines: [t(source)] }]);
    expect(remainingMarkers(source)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
