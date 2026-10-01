import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TreatmentHero } from "@/components/treatment/TreatmentHero";
import { consultationPhoto } from "@/content/gallery";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 })));
});
afterEach(() => vi.unstubAllGlobals());

const hero = () =>
  render(
    <TreatmentHero
      photo={consultationPhoto}
      trail={[{ name: "Shades", url: "/shades" }]}
      eyebrow="Soft light, or none at all."
      title="Shades in Las Vegas"
      lead="Roller, solar and cellular shades for Las Vegas homes."
      treatment="Shades"
    />,
  );

describe("TreatmentHero", () => {
  it("is the booking section: one serif h1, eyebrow, lead, breadcrumbs and one photo", () => {
    const { container } = hero();
    const section = container.querySelector("section#book")!;
    expect(section).not.toBeNull();
    const h1 = screen.getByRole("heading", { level: 1, name: "Shades in Las Vegas" });
    expect(h1.className).toContain("heading-serif");
    expect(screen.getByText("Soft light, or none at all.")).toBeInTheDocument();
    expect(screen.getByText(/Roller, solar and cellular shades/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(section.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });

  it("orders title, form, then review card, so a phone reaches the form first", () => {
    const { container } = hero();
    const h1 = container.querySelector("h1")!;
    const form = container.querySelector("form")!;
    const review = container.querySelector("figure")!;
    expect(h1.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(form.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("files the lead as a booking under the page's treatment", async () => {
    hero();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), "Dana Reyes");
    await user.type(screen.getByLabelText(/phone/i), "7025550134");
    await user.type(screen.getByLabelText(/email/i), "dana@example.com");
    await user.click(screen.getByRole("button", { name: /invite us over/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({ source: "booking", treatments: ["Shades"] });
    expect(document.getElementById("book-name")).not.toBeNull();
  });

  it("keeps the photo short on a phone and fills the section from lg up, with the slow zoom", () => {
    const { container } = hero();
    const frame = container.querySelector("section#book img")!.parentElement!;
    expect(frame.className).toContain("aspect-[16/7]");
    expect(frame.className).toContain("lg:absolute");
    expect(container.querySelector("img")!.className).toContain("animate-slow-zoom");
  });
});
