import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShutterRates } from "@/lib/admin/shutter-pricing";

const actions = { saveShutterRatesAction: vi.fn() };
vi.mock("@/app/admin/resources/shutters/actions", () => actions);
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { getShutterRates: vi.fn(), getShutterInstallRate: vi.fn(), saveShutterRates: vi.fn() };
vi.mock("@/lib/admin/shutter-rates", () => store);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { ShutterQuote } = await import("@/app/admin/resources/shutters/ShutterQuote");
const { RatesEditor } = await import("@/app/admin/resources/shutters/rates/RatesEditor");
const { saveShutterRatesAction } = await vi.importActual<typeof import("@/app/admin/resources/shutters/actions")>("@/app/admin/resources/shutters/actions");

// Made-up rates: the real dealer costs never go in this public repo.
const rates: ShutterRates = {
  lines: [
    { id: "a", supplier: "norman", name: "Alpha", costCentsPerSqft: 1000, minSqft: 8 },
    { id: "b", supplier: "onyx", name: "Beta", costCentsPerSqft: 800, minSqft: 0 },
  ],
  options: [
    { id: "shape", supplier: "norman", name: "Angle top", kind: "per_window", amount: 20_000 },
    { id: "pull", supplier: "norman", name: "Ring pull", kind: "each", amount: 1500 },
    { id: "color", supplier: "norman", name: "Custom color", kind: "per_order", amount: 20_000 },
    { id: "french", supplier: "onyx", name: "French door", kind: "per_window", amount: 11_000 },
  ],
  freight: [
    { supplier: "norman", firstCents: 7500, additionalCents: 2500, oversizeWidthEighths: 720, oversizeFirstCents: 8000, oversizeAdditionalCents: 5000, perSqftCents: 0, minSqft: 0 },
    { supplier: "onyx", firstCents: 0, additionalCents: 0, oversizeWidthEighths: 0, oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 100, minSqft: 200 },
  ],
  markupHundredths: 200,
  installCentsPerSqft: 600,
};
const install = { basis: "sq_ft" as const, rateCents: 600 };

const window1 = () => screen.getByRole("listitem", { name: "Window 1" });
const totals = () => screen.getByRole("region", { name: "Totals" });
const type = (label: string, value: string, scope = window1()) => fireEvent.change(within(scope).getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "owner@example.com" });
});

describe("ShutterQuote", () => {
  it("prices a window once it has a size: 36 × 60 Alpha", () => {
    render(<ShutterQuote rates={rates} install={install} />);
    expect(screen.queryByRole("region", { name: "Totals" })).toBeNull();
    type("Width (in)", "36");
    type("Height (in)", "60");
    // cost 150, freight 75, install 15 × 6 = 90; price (150 + 75) × 2 + 90 = 540
    expect(window1()).toHaveTextContent("15 sq ft · Cost $150 · Install $90 · Price $540");
    expect(within(totals()).getByText("$540")).toBeInTheDocument();
  });

  it("reads fractions and says when the minimum area applies", () => {
    render(<ShutterQuote rates={rates} install={install} />);
    type("Width (in)", "23 1/2");
    type("Height (in)", "24");
    expect(window1()).toHaveTextContent("3.92 sq ft (billed as 8)");
  });

  it("adds a ticked add-on and a counted one", () => {
    render(<ShutterQuote rates={rates} install={install} />);
    type("Width (in)", "36");
    type("Height (in)", "60");
    fireEvent.click(within(window1()).getByLabelText("Angle top"));
    fireEvent.change(within(window1()).getByLabelText(/Ring pull/), { target: { value: "2" } });
    expect(window1()).toHaveTextContent("Cost $380");
  });

  it("switching supplier shows only that supplier's lines and add-ons, and clears picks", () => {
    render(<ShutterQuote rates={rates} install={install} />);
    fireEvent.click(within(window1()).getByLabelText("Angle top"));
    fireEvent.click(screen.getByLabelText("Onyx"));
    expect(within(window1()).getByLabelText("Line")).toHaveValue("b");
    expect(within(window1()).queryByLabelText("Angle top")).toBeNull();
    expect(within(window1()).getByLabelText("French door")).not.toBeChecked();
    expect(screen.queryByLabelText("Custom color")).toBeNull();
  });

  it("adds and removes windows, and the totals follow", () => {
    render(<ShutterQuote rates={rates} install={install} />);
    type("Width (in)", "36");
    type("Height (in)", "60");
    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    const second = screen.getByRole("listitem", { name: "Window 2" });
    type("Width (in)", "36", second);
    type("Height (in)", "60", second);
    expect(within(totals()).getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove window 2" }));
    expect(within(totals()).getByText("1")).toBeInTheDocument();
  });

  it("shows cost only and will not copy prices until a markup is set", () => {
    render(<ShutterQuote rates={{ ...rates, markupHundredths: null }} install={install} />);
    expect(screen.getByRole("note")).toHaveTextContent("No markup is set");
    type("Width (in)", "36");
    type("Height (in)", "60");
    expect(window1()).toHaveTextContent("Price —");
    expect(screen.getByRole("button", { name: "Copy client prices" })).toBeDisabled();
  });

  it("warns when no install rate is set", () => {
    render(<ShutterQuote rates={rates} install={null} />);
    expect(screen.getByRole("note")).toHaveTextContent("No installation rate is set, so prices leave install out. Set it on the Rates screen.");
  });

  it("copies client prices without any cost", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShutterQuote rates={rates} install={install} />);
    type("Room", "Kitchen");
    type("Width (in)", "36");
    type("Height (in)", "60");
    fireEvent.click(screen.getByRole("button", { name: "Copy client prices" }));
    await screen.findByRole("button", { name: "Copied" });
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("Kitchen: Alpha shutters, 36″ × 60″: $540");
    expect(text).not.toContain("$150");
  });

  it("says to enter rates when there are none", () => {
    render(<ShutterQuote rates={{ ...rates, lines: [], options: [] }} install={install} />);
    expect(screen.getByText(/No shutter rates yet/)).toBeInTheDocument();
  });
});

describe("RatesEditor", () => {
  const payload = (container: HTMLElement) =>
    JSON.parse((container.querySelector('input[name="rates"]') as HTMLInputElement).value);

  it("shows saved rates in dollars and percents", () => {
    render(<RatesEditor rates={{ ...rates, options: [...rates.options, { id: "p", supplier: "norman", name: "Premium", kind: "percent", amount: 1000 }] }} />);
    expect(screen.getAllByLabelText("$ / sq ft")[0]).toHaveValue("10");
    expect(screen.getByLabelText("Markup (× cost)")).toHaveValue("2");
    const premium = screen.getByDisplayValue("Premium").closest("div")!;
    expect(within(premium).getByLabelText("%")).toHaveValue("10");
  });

  it("sends what is on screen, in cents and basis points", () => {
    const { container } = render(<RatesEditor rates={rates} />);
    fireEvent.change(screen.getAllByLabelText("$ / sq ft")[0], { target: { value: "12.34" } });
    fireEvent.change(screen.getByLabelText("Markup (× cost)"), { target: { value: "1.9" } });
    const sent = payload(container);
    expect(sent.lines[0]).toEqual({ supplier: "norman", name: "Alpha", costCentsPerSqft: 1234, minSqft: 8 });
    expect(sent.markupHundredths).toBe(190);
    expect(sent.installCentsPerSqft).toBe(600);
    expect(sent.freight[0]).toMatchObject({ supplier: "norman", firstCents: 7500, oversizeWidthEighths: 720 });
  });

  it("adds pasted add-ons to the right supplier", () => {
    const { container } = render(<RatesEditor rates={{ ...rates, options: [] }} />);
    const onyx = screen.getByRole("region", { name: "Onyx" });
    fireEvent.click(within(onyx).getByText("Paste a list of Onyx add-ons"));
    fireEvent.change(within(onyx).getByRole("textbox", { name: /One per line/ }), { target: { value: "Arch | window | 220\nCustom color | order | 150" } });
    fireEvent.click(within(onyx).getByRole("button", { name: "Add these rows" }));
    expect(payload(container).options).toEqual([
      { supplier: "onyx", name: "Arch", kind: "per_window", amount: 22_000 },
      { supplier: "onyx", name: "Custom color", kind: "per_order", amount: 15_000 },
    ]);
  });

  it("names a bad box and will not save it", () => {
    render(<RatesEditor rates={rates} />);
    fireEvent.change(screen.getAllByLabelText("$ / sq ft")[0], { target: { value: "ten" } });
    expect(screen.getByRole("list", { name: "Fix before saving" })).toHaveTextContent('Norman line Alpha: "ten" is not an amount');
    expect(screen.getByRole("button", { name: "Save rates" })).toBeDisabled();
  });

  it("edits the guide's install rate, and blank means not set rather than free", () => {
    const { container } = render(<RatesEditor rates={rates} />);
    expect(screen.getByLabelText("Installation ($ per sq ft)")).toHaveValue("6");
    fireEvent.change(screen.getByLabelText("Installation ($ per sq ft)"), { target: { value: "7.50" } });
    expect(payload(container).installCentsPerSqft).toBe(750);
    fireEvent.change(screen.getByLabelText("Installation ($ per sq ft)"), { target: { value: "" } });
    expect(payload(container).installCentsPerSqft).toBeNull();
  });

  it("allows a blank markup", () => {
    const { container } = render(<RatesEditor rates={rates} />);
    fireEvent.change(screen.getByLabelText("Markup (× cost)"), { target: { value: "" } });
    expect(payload(container).markupHundredths).toBeNull();
    expect(screen.getByRole("button", { name: "Save rates" })).toBeEnabled();
  });
});

describe("saveShutterRatesAction", () => {
  const form = (value: unknown) => {
    const data = new FormData();
    data.set("rates", typeof value === "string" ? value : JSON.stringify(value));
    return data;
  };
  const valid = {
    lines: [{ supplier: "norman", name: "Alpha", costCentsPerSqft: 1000, minSqft: 8 }],
    options: [{ supplier: "norman", name: "Angle top", kind: "per_window", amount: 20_000 }],
    freight: [{ supplier: "norman", firstCents: 0, additionalCents: 0, oversizeWidthEighths: 0, oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 0, minSqft: 0 }],
    markupHundredths: null,
    installCentsPerSqft: 600,
  };

  it("saves valid rates as the signed-in admin", async () => {
    expect(await saveShutterRatesAction({}, form(valid))).toEqual({ ok: true });
    expect(store.saveShutterRates).toHaveBeenCalledWith(valid, "owner@example.com");
  });

  it("names the row that is wrong", async () => {
    const bad = { ...valid, lines: [...valid.lines, { supplier: "norman", name: "", costCentsPerSqft: 900, minSqft: 0 }] };
    expect(await saveShutterRatesAction({}, form(bad))).toEqual({ error: "Line 2: Every line needs a name" });
    expect(store.saveShutterRates).not.toHaveBeenCalled();
  });

  it("refuses a line with no cost, an unknown kind or a supplier we do not use", async () => {
    expect((await saveShutterRatesAction({}, form({ ...valid, lines: [{ ...valid.lines[0], costCentsPerSqft: 0 }] }))).error).toMatch(/needs a \$\/sq ft cost/);
    expect((await saveShutterRatesAction({}, form({ ...valid, options: [{ ...valid.options[0], kind: "weekly" }] }))).error).toMatch(/^Add-on 1:/);
    expect((await saveShutterRatesAction({}, form({ ...valid, lines: [{ ...valid.lines[0], supplier: "hunter" }] }))).error).toMatch(/^Line 1:/);
    expect(store.saveShutterRates).not.toHaveBeenCalled();
  });

  it("refuses unreadable input", async () => {
    expect(await saveShutterRatesAction({}, form("{not json"))).toEqual({ error: "The rates could not be read. Reload the page and try again." });
  });

  it("requires an admin", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveShutterRatesAction({}, form(valid))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.saveShutterRates).not.toHaveBeenCalled();
  });
});
