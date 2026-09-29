import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { firstParam, parseJobTab, tabHref } from "@/app/admin/jobs/[id]/tabs";
import { JobTabs } from "@/app/admin/jobs/[id]/JobTabs";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("parseJobTab", () => {
  it("accepts each tab", () => {
    for (const tab of ["overview", "measurements", "files", "documents", "quote", "install", "activity"]) expect(parseJobTab(tab)).toBe(tab);
  });
  it("falls back to overview for missing or unknown values", () => {
    expect(parseJobTab(undefined)).toBe("overview");
    expect(parseJobTab("bogus")).toBe("overview");
    expect(parseJobTab(["files", "activity"])).toBe("files");
  });
  it("takes the first of repeated params", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
  it("links overview without a param", () => {
    expect(tabHref(ID, "overview")).toBe(`/admin/jobs/${ID}`);
    expect(tabHref(ID, "files")).toBe(`/admin/jobs/${ID}?tab=files`);
  });
});

describe("JobTabs", () => {
  it("marks the active tab and shows counts", () => {
    render(<JobTabs jobId={ID} active="files" counts={{ measurements: 3, files: 2 }} />);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("Files");
    expect(screen.getByRole("link", { name: /Measurements/ })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", `/admin/jobs/${ID}?tab=activity`);
  });
});
