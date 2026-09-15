import { describe, it, expect } from "vitest";
import { editDetailsHref } from "@/lib/admin/next-action";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const EDIT = `/admin/jobs/${ID}?tab=overview&edit=details`;

describe("editDetailsHref", () => {
  it("opens the details form, optionally at a field", () => {
    expect(editDetailsHref(ID)).toBe(EDIT);
    expect(editDetailsHref(ID, "visitAt")).toBe(`${EDIT}#visitAt`);
  });
});
