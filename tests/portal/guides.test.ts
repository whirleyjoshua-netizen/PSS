import { describe, expect, it } from "vitest";
import { guidesToShow } from "@/lib/portal/guides";

const at = new Date("2026-10-13T17:00:00Z");

describe("guidesToShow", () => {
  it("shows neither before an install is booked or ordered", () => {
    expect(guidesToShow({ status: "sold", installOn: null }, null)).toEqual({ install: false, care: false });
  });
  it("shows the install guide once an install appointment or date is booked, or the job is Ordered", () => {
    expect(guidesToShow({ status: "sold", installOn: null }, at)).toEqual({ install: true, care: false });
    expect(guidesToShow({ status: "sold", installOn: "2026-10-13" }, null)).toEqual({ install: true, care: false });
    expect(guidesToShow({ status: "ordered", installOn: null }, null)).toEqual({ install: true, care: false });
  });
  it("adds the care guide once Installed or Completed", () => {
    expect(guidesToShow({ status: "installed" }, null)).toEqual({ install: true, care: true });
    expect(guidesToShow({ status: "completed" }, null)).toEqual({ install: true, care: true });
  });
  it("shows nothing on a Lost job", () => expect(guidesToShow({ status: "lost", installOn: "2026-10-13" }, at)).toEqual({ install: false, care: false }));
});
