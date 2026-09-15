import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
const findQuestionnaire = vi.fn();
vi.mock("@/lib/leads/questionnaire", () => ({ findQuestionnaire }));
vi.mock("@/app/(site)/thank-you/actions", () => ({ submitQuestionnaire: vi.fn() }));

const { default: ThankYouPage, metadata } = await import("@/app/(site)/thank-you/page");
const { business } = await import("@/content/business");

const answers = { windowCountExact: 12, treatmentTypes: ["shutters"], motorized: false, address: "12 Sample St", gateCode: null, finish: "designer" };

beforeEach(() => {
  cookieGet.mockReset().mockReturnValue(undefined);
  findQuestionnaire.mockReset().mockResolvedValue(null);
});

describe("/thank-you", () => {
  it("thanks the visitor and lays out the next steps", async () => {
    render(await ThankYouPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/thank you/i);
    expect(screen.getByText(/within one business day/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  });

  it("offers the phone number for anyone who needs us sooner", async () => {
    render(await ThankYouPage());
    expect(screen.getByRole("link", { name: business.phone.display })).toHaveAttribute("href", business.phone.href);
  });

  it("is kept out of search results", () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("shows no questionnaire without a valid key", async () => {
    render(await ThankYouPage());
    expect(screen.queryByRole("region", { name: "Help us come prepared" })).toBeNull();
    cookieGet.mockReturnValue({ value: "stale" });
    render(await ThankYouPage());
    expect(findQuestionnaire).toHaveBeenCalledWith("stale");
    expect(screen.queryByRole("region", { name: "Help us come prepared" })).toBeNull();
  });

  it("shows the questionnaire, prefilled, for a valid key", async () => {
    cookieGet.mockImplementation((name: string) => (name === "pss_q" ? { value: "the-key" } : undefined));
    findQuestionnaire.mockResolvedValue({ windowRange: "6-10", answers });
    render(await ThankYouPage());
    const card = screen.getByRole("region", { name: "Help us come prepared" });
    expect(card).toHaveTextContent("Optional · about 2 minutes");
    expect(screen.getByLabelText("How many windows?")).toHaveValue("12");
    expect(screen.getByLabelText("Shutters")).toBeChecked();
    expect(screen.getByLabelText("Street address")).toHaveValue("12 Sample St");
  });

  it("stays a normal thank-you page when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    cookieGet.mockReturnValue({ value: "the-key" });
    findQuestionnaire.mockRejectedValue(new Error("Neon down"));
    render(await ThankYouPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/thank you/i);
    expect(screen.queryByRole("region", { name: "Help us come prepared" })).toBeNull();
  });
});
