import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { business } from "@/content/business";

vi.mock("@/app/(site)/project/actions", () => ({ acknowledgeDocumentFormAction: vi.fn() }));
const { AcknowledgeDocument, DocumentAcknowledgedNotice } = await import("@/app/(site)/project/AcknowledgeDocument");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const doc = { id: "d1", title: "Service agreement — PSS-1048", file: { id: "f1", name: "Service agreement — PSS-1048.pdf" } };

describe("AcknowledgeDocument", () => {
  it("shows the title and a closed form that carries only the job and file", () => {
    const { container } = render(<AcknowledgeDocument jobId={JOB} document={doc} />);
    expect(screen.getByText(doc.title, { selector: "p" })).toBeInTheDocument();
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Read and acknowledge")).toBeInTheDocument();
    const form = details.querySelector("form")!;
    expect(form.querySelector('input[name="jobId"]')).toHaveValue(JOB);
    expect(form.querySelector('input[name="fileId"]')).toHaveValue("f1");
    expect(within(form).getByRole("link", { name: `Open ${doc.file.name}` })).toHaveAttribute("href", "/project/files/f1");
    expect(within(form).getByLabelText("Your full name")).toBeRequired();
    expect(within(form).getByLabelText(`I have read ${doc.title}`)).toBeRequired();
    expect(within(form).getByRole("button", { name: "Acknowledge" })).toHaveAttribute("type", "submit");
  });
});

describe("DocumentAcknowledgedNotice", () => {
  const at = { acknowledgedAt: new Date("2026-09-28T19:00:00Z") };
  it("confirms only a recorded acknowledgement", () => {
    const { rerender, container } = render(<DocumentAcknowledgedNotice flag="1" acknowledgement={at} />);
    expect(screen.getByRole("status")).toHaveTextContent("Thank you — your acknowledgement was recorded on Sep 28, 2026.");
    rerender(<DocumentAcknowledgedNotice flag="1" acknowledgement={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("explains a refusal, unless it is already recorded", () => {
    const { rerender, container } = render(<DocumentAcknowledgedNotice flag="missing" acknowledgement={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("We could not record that: please type your full name and tick the box, then try again.");
    rerender(<DocumentAcknowledgedNotice flag="no" acknowledgement={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(`Please call us on ${business.phone.display}`);
    rerender(<DocumentAcknowledgedNotice flag="no" acknowledgement={at} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DocumentAcknowledgedNotice flag={null} acknowledgement={at} />);
    expect(container).toBeEmptyDOMElement();
  });
});
