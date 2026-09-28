import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { TermsSection } = await import("@/app/admin/settings/TermsSection");

const fetchMock = vi.fn();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const choose = (file: File) => fireEvent.change(screen.getByLabelText(/Upload terms PDF|Replace terms PDF/), { target: { files: [file] } });
const PDF = () => new File(["%PDF-1.7"], "Terms.pdf", { type: "application/pdf" });

describe("terms section", () => {
  it("says contracts can't be sent before terms are uploaded", () => {
    render(<TermsSection updatedAt={null} />);
    expect(screen.getByRole("region", { name: "Contract terms" })).toHaveTextContent(
      "No terms uploaded. Contracts can't be sent until you add them.",
    );
    expect(screen.getByLabelText("Upload terms PDF")).toHaveAttribute("accept", "application/pdf");
  });

  it("shows when the terms were last updated", () => {
    render(<TermsSection updatedAt={new Date("2026-09-20T18:00:00Z")} />);
    expect(screen.getByText(/^Terms last updated Sun, Sep 20/)).toBeInTheDocument();
    expect(screen.getByLabelText("Replace terms PDF")).toBeInTheDocument();
  });

  it("posts the chosen PDF to the terms route and refreshes the page", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<TermsSection updatedAt={null} />);
    choose(PDF());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/admin/settings/terms");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the route's error and does not refresh", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "That PDF can't be read (is it password protected?)." }), { status: 400 }));
    render(<TermsSection updatedAt={null} />);
    choose(PDF());
    expect(await screen.findByRole("alert")).toHaveTextContent("That PDF can't be read (is it password protected?).");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses a file that isn't typed as a PDF before sending it", async () => {
    render(<TermsSection updatedAt={null} />);
    choose(new File(["%PDF-1.7"], "Terms.pdf", { type: "" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload a PDF file (its type must be application/pdf).");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a PDF over 4 MB before sending it", async () => {
    render(<TermsSection updatedAt={null} />);
    choose(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "Terms.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The PDF must be under 4 MB.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a PDF of exactly 4 MB", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<TermsSection updatedAt={null} />);
    choose(new File([new Uint8Array(4 * 1024 * 1024)], "Terms.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says the file is too large when the server refuses its size", async () => {
    fetchMock.mockResolvedValue(new Response("Request Entity Too Large", { status: 413 }));
    render(<TermsSection updatedAt={null} />);
    choose(PDF());
    expect(await screen.findByRole("alert")).toHaveTextContent("That file is too large to upload.");
  });

  it("says the upload failed when the network does", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<TermsSection updatedAt={null} />);
    choose(PDF());
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed. Check your signal and try again.");
  });
});
