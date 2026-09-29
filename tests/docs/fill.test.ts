import { describe, expect, it } from "vitest";
import { business } from "@/content/business";
import { cleanValue, fieldValues, fillFields, type FillJob } from "@/lib/docs/fill";

const job: FillJob = {
  name: "  Maria  Lopez ", email: "maria@example.com", phone: "7025550100", address: "12 Palm Way", city: "Henderson",
  projectNo: 1048, soldCents: 450050, quoteCents: 400000, depositCents: 100000, installOn: "2026-10-12",
};
// 19:00 UTC is noon in Las Vegas.
const NOW = new Date("2026-09-28T19:00:00Z");

describe("fieldValues", () => {
  it("resolves every key from the job and the business constants", () => {
    expect(fieldValues(job, NOW)).toEqual({
      client_name: "Maria  Lopez", client_first_name: "Maria", client_email: "maria@example.com",
      client_phone: "(702) 555-0100", address: "12 Palm Way", city: "Henderson", project_no: "PSS-1048",
      today: "Sep 28, 2026", contract_total: "$4,500.50", deposit: "$1,000", balance_due: "$3,500.50",
      install_date: "Oct 12, 2026", company_name: business.legalName, company_phone: business.phone.display,
      company_email: business.email,
    });
  });
  it("dates today in Las Vegas, not UTC", () =>
    expect(fieldValues(job, new Date("2026-09-29T05:00:00Z")).today).toBe("Sep 28, 2026"));
  it("falls back to the quoted amount before a sale, with no balance yet", () => {
    const values = fieldValues({ ...job, soldCents: null }, NOW);
    expect(values.contract_total).toBe("$4,000");
    expect(values.balance_due).toBeNull();
  });
  it("answers null for every value the job does not have", () => {
    const values = fieldValues({ ...job, email: "  ", phone: "", address: null, city: "", projectNo: null,
      soldCents: null, quoteCents: null, depositCents: null, installOn: null }, NOW);
    for (const key of ["client_email", "client_phone", "address", "city", "project_no", "contract_total", "deposit", "balance_due", "install_date"] as const) {
      expect(values[key], key).toBeNull();
    }
  });
});

describe("fillFields", () => {
  const values = fieldValues({ ...job, depositCents: null }, NOW);
  it("replaces every field that has a value, spaces inside the braces allowed", () =>
    expect(fillFields("Hi {{client_first_name}}, total {{ contract_total }}.", values))
      .toEqual({ text: "Hi Maria, total $4,500.50.", missing: [], unknown: [] }));
  it("leaves a field with no value as a visible marker and says which", () =>
    expect(fillFields("Deposit: {{deposit}}. Again {{ deposit }}.", values))
      .toEqual({ text: "Deposit: {{deposit}}. Again {{deposit}}.", missing: ["deposit"], unknown: [] }));
  it("rejects unknown keys: left as written and reported", () =>
    expect(fillFields("{{nope}} and {{Client_Name}}", values))
      .toEqual({ text: "{{nope}} and {{Client_Name}}", missing: [], unknown: ["nope", "Client_Name"] }));
  it("a value can never become syntax: no bold, marker, heading or bullet", () => {
    const hostile = fieldValues({ ...job, name: "## **Bob** {{deposit}}", address: "- 12\nPalm {{x}}" }, NOW);
    const { text } = fillFields("{{client_name}}\n{{address}}", hostile);
    expect(text).toBe("Bob deposit\n12 Palm x");
  });
  it("a value that cleans to nothing keeps its marker instead of printing a heading or bullet", () => {
    const hostile = fieldValues({ ...job, name: "## **Bob** {{deposit}}", city: "-", address: "-" }, NOW);
    const first = fillFields("{{client_first_name}} agrees", hostile);
    expect(first.text.startsWith("## ")).toBe(false);
    expect(first).toEqual({ text: "{{client_first_name}} agrees", missing: ["client_first_name"], unknown: [] });
    expect(fillFields("{{city}}\n{{address}} here", hostile))
      .toEqual({ text: "{{city}}\n{{address}} here", missing: ["city", "address"], unknown: [] });
  });
  it("a value cannot close or extend the template's own bold", () => {
    expect(fillFields("**{{client_name}}**", fieldValues({ ...job, name: "Bob*" }, NOW)).text).toBe("**Bob**");
    expect(fillFields("**{{client_name}}**", fieldValues({ ...job, name: "*Bob*" }, NOW)).text).toBe("**Bob**");
  });
});

describe("cleanValue", () => {
  it("collapses whitespace, drops braces and stars, and strips a leading heading or bullet", () => {
    expect(cleanValue("  a \n b ")).toBe("a b");
    expect(cleanValue("{{{x}}}")).toBe("x");
    expect(cleanValue("a***b")).toBe("ab");
    expect(cleanValue("Bob*")).toBe("Bob");
    expect(cleanValue("*Bob*")).toBe("Bob");
    expect(cleanValue("### - Title")).toBe("Title");
    expect(cleanValue("#12 Unit")).toBe("#12 Unit");
  });
  it("a value that is only a heading or bullet mark cleans to nothing", () => {
    expect(cleanValue("##")).toBe("");
    expect(cleanValue("-")).toBe("");
    expect(cleanValue("## ##")).toBe("");
    expect(cleanValue("- -")).toBe("");
    expect(cleanValue("{{##}}")).toBe("");
  });
  it("strips only heading-length runs of #: a lone # is ordinary text", () => {
    expect(cleanValue("# 5 Main St")).toBe("# 5 Main St");
    expect(cleanValue("#")).toBe("#");
  });
});
