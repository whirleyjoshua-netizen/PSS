import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CallButton } from "@/app/admin/jobs/[id]/CallButton";

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("CallButton", () => {
  it("dials on touch devices and names the customer", () => {
    render(<CallButton jobId={JOB} name="Maria Lopez" phone="7025550100" />);
    const call = screen.getByRole("link", { name: "Call Maria" });
    expect(call).toHaveAttribute("href", "tel:+17025550100");
    expect(call.className).toContain("[@media(pointer:coarse)]:inline-flex");
  });

  it("opens the call screen on computers", () => {
    render(<CallButton jobId={JOB} name="Maria Lopez" phone="7025550100" />);
    const log = screen.getByRole("link", { name: "Log a call" });
    expect(log).toHaveAttribute("href", `/admin/jobs/${JOB}/call`);
    expect(log.className).toContain("[@media(pointer:coarse)]:hidden");
  });

  it("opens the call screen after starting the call", () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, origin: "http://localhost", assign });
    render(<CallButton jobId={JOB} name="Maria Lopez" phone="7025550100" />);
    fireEvent.click(screen.getByRole("link", { name: "Call Maria" }));
    vi.runAllTimers();
    expect(assign).toHaveBeenCalledWith(`http://localhost/admin/jobs/${JOB}/call`);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
