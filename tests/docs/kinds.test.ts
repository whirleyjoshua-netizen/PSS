import { describe, expect, it } from "vitest";
import { FIELDS, FIELD_KEYS, TERMS_FIELDS, fieldLabel, isFieldKey, markerPattern } from "@/lib/docs/fields";
import {
  CLIENT_DOC_KINDS, SINGLETON_KINDS, TEMPLATE_KINDS, allowedFields, docResponseLabel, isClientDocKind, isDocResponse,
  isSingletonKind, isTemplateKind, templateGroup, templateKindLabel,
} from "@/lib/docs/kinds";

describe("fields", () => {
  it("lists exactly the fifteen keys of spec §3, in order, each with a label", () => {
    expect(FIELD_KEYS).toEqual([
      "client_name", "client_first_name", "client_email", "client_phone", "address", "city", "project_no", "today",
      "contract_total", "deposit", "balance_due", "install_date", "company_name", "company_phone", "company_email",
    ]);
    for (const field of FIELDS) expect(field.label.trim()).not.toBe("");
    expect(fieldLabel("project_no")).toBe("Project number (PSS-####)");
  });
  it("lets terms use only what exists when a contract is generated", () => {
    expect(TERMS_FIELDS).toEqual(["client_name", "project_no", "today", "company_name", "company_phone", "company_email"]);
  });
  it("recognises its own keys and nothing else", () => {
    expect(isFieldKey("deposit")).toBe(true);
    expect(isFieldKey("Deposit")).toBe(false);
    expect(isFieldKey(7)).toBe(false);
  });
  it("finds every marker, including ones that are not fields", () => {
    const keys = [..."a {{client_name}} b {{ nope }} {{x y}} {{}}".matchAll(markerPattern())].map((m) => m[1]);
    expect(keys).toEqual(["client_name", " nope ", "x y", ""]);
  });
});

describe("kinds", () => {
  it("has the six template kinds of spec §4 in order", () => {
    expect(TEMPLATE_KINDS.map((k) => k.value)).toEqual(["terms", "service_agreement", "change_order", "other", "guide_install", "guide_care"]);
    expect(CLIENT_DOC_KINDS).toEqual(["service_agreement", "change_order", "other"]);
    expect(SINGLETON_KINDS).toEqual(["terms", "guide_install", "guide_care"]);
  });
  it("groups kinds as Contract terms, Client documents and Portal guides", () => {
    expect(templateGroup("terms")).toBe("terms");
    expect(templateGroup("change_order")).toBe("client");
    expect(templateGroup("guide_care")).toBe("guide");
    expect(templateKindLabel("guide_install")).toBe("Getting ready for your install");
  });
  it("allows the terms fields in terms, none in guides, all in client documents", () => {
    expect(allowedFields("terms")).toEqual(TERMS_FIELDS);
    expect(allowedFields("guide_install")).toEqual([]);
    expect(allowedFields("guide_care")).toEqual([]);
    expect(allowedFields("service_agreement")).toEqual(FIELD_KEYS);
  });
  it("guards its values", () => {
    expect(isTemplateKind("terms")).toBe(true);
    expect(isTemplateKind("contract")).toBe(false);
    expect(isClientDocKind("terms")).toBe(false);
    expect(isSingletonKind("guide_care")).toBe(true);
    expect(isDocResponse("acknowledge")).toBe(true);
    expect(isDocResponse("approve")).toBe(false);
    expect(docResponseLabel("sign")).toBe("Sign");
  });
});
