import { describe, expect, it } from "vitest";
import { BODY_MAX, NAME_MAX, templateErrors } from "@/lib/docs/validate";

const ok = { name: "Service agreement", kind: "service_agreement", response: "acknowledge", body: "## Scope\n\nHi {{client_name}}." };

describe("templateErrors", () => {
  it("accepts a good template", () => expect(templateErrors(ok)).toEqual([]));
  it("requires a name, at most 120 characters", () => {
    expect(templateErrors({ ...ok, name: "   " })).toEqual(["Give the template a name."]);
    expect(templateErrors({ ...ok, name: "x".repeat(NAME_MAX + 1) })).toEqual(["Name must be 120 characters or fewer."]);
  });
  it("requires a known kind and response", () => {
    expect(templateErrors({ ...ok, kind: "contract" })).toEqual(["Choose what kind of template this is."]);
    expect(templateErrors({ ...ok, response: "approve" })).toEqual(["Choose how the client responds: sign, acknowledge or view."]);
  });
  it("keeps terms and guides view-only", () =>
    expect(templateErrors({ ...ok, kind: "terms", response: "sign", body: "x" })).toEqual(["Contract terms and portal guides are view only."]));
  it("refuses an empty or oversized body", () => {
    expect(templateErrors({ ...ok, body: " \n " })).toEqual(["The template is empty."]);
    expect(templateErrors({ ...ok, body: "x".repeat(BODY_MAX + 1) })).toEqual(["The template is too long."]);
  });
  it("names every unknown field", () =>
    expect(templateErrors({ ...ok, body: "{{nope}} and {{client name}} and {{deposit}}" }))
      .toEqual(["Unknown field {{nope}}.", "Unknown field {{client name}}."]));
  it("refuses a real field the kind cannot use", () => {
    expect(templateErrors({ name: "Terms", kind: "terms", response: "view", body: "Deposit {{deposit}} for {{client_name}}" }))
      .toEqual(["{{deposit}} can't be used in Contract terms."]);
    expect(templateErrors({ name: "Care", kind: "guide_care", response: "view", body: "Hi {{client_first_name}}" }))
      .toEqual(["{{client_first_name}} can't be used in Caring for your shades."]);
  });
  it("refuses a marker split across lines, once per marker and never as unknown", () => {
    expect(templateErrors({ ...ok, body: "Pay {{deposit\n}} now" })).toEqual(["Field {{deposit}} must be on one line."]);
    expect(templateErrors({ ...ok, body: "Pay {{deposit\n\n}} now" })).toEqual(["Field {{deposit}} must be on one line."]);
    expect(templateErrors({ ...ok, body: "Pay {{\r\ndeposit}} now" })).toEqual(["Field {{deposit}} must be on one line."]);
    expect(templateErrors({ ...ok, body: "{{nope\r}} and {{deposit\n}} and {{deposit\n}}" }))
      .toEqual(["Field {{nope}} must be on one line.", "Field {{deposit}} must be on one line."]);
  });
  it("reads an empty marker as an unknown field", () =>
    expect(templateErrors({ ...ok, body: "Hi {{}}" })).toEqual(["Unknown field {{}}."]));
  it("checks a 200k-character body without throwing, in under 2s", () => {
    const body = "{{".repeat(100_000);
    const start = performance.now();
    expect(templateErrors({ ...ok, body })).toEqual(["The template is too long."]);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
