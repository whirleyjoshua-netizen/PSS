import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { business } from "@/content/business";

// A server action file that reaches server-only code: mocked away, this is about the markup.
vi.mock("@/app/(site)/project/actions", () => ({ signContractFormAction: vi.fn() }));

const { SignContract, SignatureNotice } = await import("@/app/(site)/project/SignContract");
const { TYPED_NAME_MAX } = await import("@/lib/portal/typed-name");

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
    // The same cap the action enforces, so the browser stops a name the server would refuse.
    expect(name).toHaveAttribute("maxLength", String(TYPED_NAME_MAX));
    // A name of only spaces satisfies `required`; the pattern is what refuses it in the browser.
    expect(name).toHaveAttribute("pattern", String.raw`.*\S.*`);
    const pattern = new RegExp(`^(?:${name.getAttribute("pattern")})$`);
    expect(pattern.test("   ")).toBe(false);
    expect(pattern.test("Jane Doe")).toBe(true);
    const agree = screen.getByLabelText("I agree to sign this contract electronically");
    expect(agree).toHaveAttribute("type", "checkbox");
    expect(agree).toHaveAttribute("name", "agreed");
    expect(agree).toBeRequired();
    expect(screen.getByRole("button", { name: "Sign this contract" })).toHaveAttribute("type", "submit");
  });

  it("keeps the contract wording, and shows no document title, for a quote contract", () => {
    render(<SignContract jobId={JOB} file={{ ...FILE, document: null }} />);
    expect(screen.getByText("Sign this contract", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByLabelText("I agree to sign this contract electronically")).toBeInTheDocument();
    expect(screen.queryByText(/document/)).toBeNull();
  });

  it("words a job document as a document and names it", () => {
    render(<SignContract jobId={JOB} file={{ id: FILE.id, name: "Change order — PSS-1048.pdf", document: { title: "Change order — PSS-1048", kind: "change_order" } }} />);
    expect(screen.getByText("Sign this document", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("Change order — PSS-1048", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("I agree to sign this document electronically")).toBeRequired();
    expect(screen.getByRole("button", { name: "Sign this document" })).toHaveAttribute("type", "submit");
    expect(screen.queryByText(/contract/i)).toBeNull();
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

  it("names the job document that was signed, never calling it a contract", () => {
    const html = renderToStaticMarkup(<SignatureNotice signed="1" signature={{ ...SIGNED, documentTitle: "Change order — PSS-1048" }} />);
    expect(html).toContain("Thank you — you signed “Change order — PSS-1048” on Sep 18, 2026. A copy is on its way to your email.");
    expect(html).not.toContain("contract");
  });

  it("keeps the contract wording when the signature is on no job document", () => {
    const html = renderToStaticMarkup(<SignatureNotice signed="1" signature={{ ...SIGNED, documentTitle: null }} />);
    expect(html).toContain("Thank you — your contract was signed on Sep 18, 2026. A copy is on its way to your email.");
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

  it("names the empty field when the name or the box was missing", () => {
    render(<SignatureNotice signed="missing" signature={null} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("please type your full name, add your initials or signature where asked, and tick the box to agree");
    expect(status).not.toHaveTextContent(business.phone.display);
  });

  it("drops the field hint once that contract is signed", () => {
    expect(renderToStaticMarkup(<SignatureNotice signed="missing" signature={SIGNED} />)).toBe("");
  });

  it("says nothing on an ordinary visit", () => {
    expect(renderToStaticMarkup(<SignatureNotice signed={null} signature={SIGNED} />)).toBe("");
  });
});
