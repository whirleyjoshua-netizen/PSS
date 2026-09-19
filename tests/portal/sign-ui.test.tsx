import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { business } from "@/content/business";

// A server action file that reaches server-only code: mocked away, this is about the markup.
vi.mock("@/app/(site)/project/actions", () => ({ signContractFormAction: vi.fn() }));

const { SignContract, SignatureNotice } = await import("@/app/(site)/project/SignContract");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = { id: "22222222-2222-4222-8222-222222222222", name: "Contract - Living room.pdf" };
const SIGNED = { signedAt: new Date("2026-09-18T17:00:00Z") };
const FAILURE = `We could not record that signature just now. Please call us on ${business.phone.display} and we will sort it out.`;

describe("SignContract", () => {
  it("shows the form for a shared, unsigned contract", () => {
    render(<SignContract jobId={JOB} file={FILE} />);
    expect(document.querySelector("details")).not.toHaveAttribute("open");
    const name = screen.getByLabelText("Your full name");
    expect(name).toHaveAttribute("name", "signedName");
    expect(name).toBeRequired();
    const agree = screen.getByLabelText("I agree to sign this contract electronically");
    expect(agree).toHaveAttribute("type", "checkbox");
    expect(agree).toHaveAttribute("name", "agreed");
    expect(agree).toBeRequired();
    expect(screen.getByRole("button", { name: "Sign this contract" })).toHaveAttribute("type", "submit");
  });

  it("posts the job and the file, and never an email", () => {
    const { container } = render(<SignContract jobId={JOB} file={FILE} />);
    const form = container.querySelector("form")!;
    const data = new FormData(form);
    expect(data.get("jobId")).toBe(JOB);
    expect(data.get("fileId")).toBe(FILE.id);
    expect(form.querySelector('[name="email"]')).toBeNull();
  });
});

describe("SignatureNotice", () => {
  it("says when it was signed, and offers no form", () => {
    const html = renderToStaticMarkup(<SignatureNotice signed="1" signature={SIGNED} />);
    expect(html).toContain("Thank you — your contract was signed on");
    expect(html).toContain("2026");
    expect(html).not.toContain("<form");
  });

  it("says nothing for a forged ?signed=1 with no signature on record", () => {
    expect(renderToStaticMarkup(<SignatureNotice signed="1" signature={null} />)).toBe("");
  });

  it("says nothing about a failure once the contract is signed", () => {
    expect(renderToStaticMarkup(<SignatureNotice signed="no" signature={SIGNED} />)).toBe("");
  });

  it("owns up to a refusal when nothing was signed", () => {
    render(<SignatureNotice signed="no" signature={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(FAILURE);
  });

  it("says nothing on an ordinary visit", () => {
    expect(renderToStaticMarkup(<SignatureNotice signed={null} signature={SIGNED} />)).toBe("");
  });
});
