import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeroForm } from "@/components/forms/HeroForm";
import { ConsultationForm } from "@/components/forms/ConsultationForm";
import { business } from "@/content/business";

const ok = () =>
  vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));

async function fillHero(user: ReturnType<typeof userEvent.setup>, phone = "7025550134") {
  await user.type(screen.getByLabelText(/name/i), "Dana Reyes");
  await user.type(screen.getByLabelText(/phone/i), phone);
  await user.type(screen.getByLabelText(/email/i), "dana@example.com");
}

beforeEach(() => {
  vi.stubGlobal("fetch", ok());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HeroForm", () => {
  it("shows an accessible error and never reaches the network on a short phone", async () => {
    const user = userEvent.setup();
    render(<HeroForm />);

    await fillHero(user, "555");
    await user.click(screen.getByRole("button", { name: /consultation/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/10-digit/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts a valid submission and confirms it", async () => {
    const user = userEvent.setup();
    render(<HeroForm />);

    await fillHero(user);
    await user.click(screen.getByRole("button", { name: /consultation/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("sends the hero source so leads can be attributed", async () => {
    const user = userEvent.setup();
    render(<HeroForm />);

    await fillHero(user);
    await user.click(screen.getByRole("button", { name: /consultation/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({ source: "hero" });
  });

  it("surfaces the phone number when the server rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: "Please call us instead." }), {
            status: 502,
          }),
      ),
    );
    const user = userEvent.setup();
    render(<HeroForm />);

    await fillHero(user);
    await user.click(screen.getByRole("button", { name: /consultation/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/call/i);
    expect(screen.getByText(business.phone.display)).toBeInTheDocument();
  });

  it("recovers when the network throws entirely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const user = userEvent.setup();
    render(<HeroForm />);

    await fillHero(user);
    await user.click(screen.getByRole("button", { name: /consultation/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("carries a honeypot that is hidden from people and assistive tech", () => {
    const { container } = render(<HeroForm />);
    const honeypot = container.querySelector('input[name="company"]');

    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("aria-hidden", "true");
    // display:none is a tell — bots skip it. It must stay in the layout, offscreen.
    expect(honeypot).not.toHaveClass("hidden");
  });

  it("labels every visible input rather than relying on placeholders", () => {
    const { container } = render(<HeroForm />);
    // Hidden inputs carry no visible label by design; only user-facing ones must.
    const visible = "input:not([aria-hidden='true']):not([type='hidden'])";
    for (const input of container.querySelectorAll(visible)) {
      expect(input.getAttribute("id")).toBeTruthy();
      expect(container.querySelector(`label[for="${input.getAttribute("id")}"]`)).not.toBeNull();
    }
  });
});

describe("ConsultationForm", () => {
  it("offers only cities inside the service area", () => {
    render(<ConsultationForm />);
    const options = Array.from(
      screen.getByLabelText(/city/i).querySelectorAll("option"),
    ).map((option) => option.textContent);

    for (const city of business.serviceArea) {
      expect(options).toContain(city);
    }
    expect(options).not.toContain("Phoenix");
  });

  it("sends the contact source and the selected treatments", async () => {
    const user = userEvent.setup();
    render(<ConsultationForm />);

    await user.type(screen.getByLabelText(/name/i), "Dana Reyes");
    await user.type(screen.getByLabelText(/phone/i), "7025550134");
    await user.type(screen.getByLabelText(/email/i), "dana@example.com");
    await user.click(screen.getByRole("checkbox", { name: /shades/i }));
    await user.click(screen.getByRole("button", { name: /consultation/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.source).toBe("contact");
    expect(body.treatments).toContain("Shades");
  });
});
