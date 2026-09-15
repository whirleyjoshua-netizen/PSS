import { describe, it, expect } from "vitest";
import { editDetailsHref, nextAction } from "@/lib/admin/next-action";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const EDIT = `/admin/jobs/${ID}?tab=overview&edit=details`;
const job = (status: string, soldCents: number | null = null, depositCents: number | null = null) =>
  ({ id: ID, status, soldCents, depositCents }) as Parameters<typeof nextAction>[0];

describe("editDetailsHref", () => {
  it("opens the details form, optionally at a field", () => {
    expect(editDetailsHref(ID)).toBe(EDIT);
    expect(editDetailsHref(ID, "visitAt")).toBe(`${EDIT}#visitAt`);
  });
});

describe("nextAction", () => {
  it("calls a new lead", () => {
    expect(nextAction(job("new"), 0)).toMatchObject({ title: "Call the customer", cta: { kind: "call" } });
  });
  it("measures a booked visit with no measurements", () => {
    expect(nextAction(job("visit_booked"), 0)).toMatchObject({
      title: "Measure the windows", cta: { label: "Add measurement", href: `/admin/jobs/${ID}/measure` },
    });
  });
  it("quotes a booked visit once measured", () => {
    expect(nextAction(job("visit_booked"), 3)).toMatchObject({
      title: "Send the quote", cta: { label: "Enter quote", href: `${EDIT}#quote` },
    });
  });
  it("follows up a quote", () => {
    expect(nextAction(job("quoted"), 0)).toMatchObject({
      title: "Follow up and close", cta: { label: "Enter sold amount", href: `${EDIT}#sold` },
    });
  });
  it("orders a sold job", () => {
    expect(nextAction(job("sold"), 0)).toMatchObject({
      title: "Order the product", cta: { label: "Set order date", href: `${EDIT}#orderedOn` },
    });
  });
  it("schedules an ordered job", () => {
    expect(nextAction(job("ordered"), 0)).toMatchObject({
      title: "Schedule the install", cta: { label: "Set install date", href: `${EDIT}#installOn` },
    });
  });
  it("collects an installed job's balance", () => {
    expect(nextAction(job("installed", 500000, 250000), 0)).toMatchObject({
      title: "Collect the balance", detail: "$2,500 left to collect.", cta: { label: "Record payment", href: `${EDIT}#deposit` },
    });
  });
  it("is complete when installed with nothing owed", () => {
    expect(nextAction(job("installed", 500000, 500000), 0)).toMatchObject({ title: "Job complete", cta: null });
    expect(nextAction(job("installed"), 0)).toMatchObject({ title: "Job complete", cta: null });
  });
  it("has no action for a lost job", () => {
    expect(nextAction(job("lost"), 0)).toBeNull();
  });
});
