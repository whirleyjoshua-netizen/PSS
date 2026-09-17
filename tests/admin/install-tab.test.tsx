import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveInstallQuoteAction = vi.fn();
vi.mock("@/app/admin/jobs/[id]/install-actions", () => ({ saveInstallQuoteAction }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { InstallCalculator } = await import("@/app/admin/jobs/[id]/InstallCalculator");
const { priceQuote, priceFingerprint } = await import("@/lib/admin/install-pricing");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, measureCents: 7500 };
const rates = [{ treatment: "roller_shades" as const, basis: "window" as const, rateCents: 2500 }];
/** Priced by the foot first, so an added line shows a width box. */
const footRates = [
  { treatment: "vertical_blinds" as const, basis: "linear_ft" as const, rateCents: 500 },
  { treatment: "shutters" as const, basis: "sq_ft" as const, rateCents: 300 },
  { treatment: "roller_shades" as const, basis: "window" as const, rateCents: 2500 },
];
const snapshot = (over: { id: string; subtotalCents: number; totalCents: number; measureCents?: number }) => ({
  kind: "estimate" as const, minimumCents: 15_000, measureCents: 0, createdBy: "owner@example.com",
  createdAt: new Date("2026-09-16T10:00:00Z"), lines: [], ...over,
});

beforeEach(() => {
  saveInstallQuoteAction.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

describe("InstallCalculator", () => {
  it("says so plainly when no rates are configured, instead of pricing at zero", () => {
    render(<InstallCalculator jobId={JOB} rates={[]} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no installation rates/i);
    expect(screen.queryByRole("button", { name: /save as estimate/i })).toBeNull();
  });

  it("offers a line editor once rates exist", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByRole("button", { name: /add line/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save as estimate/i })).toBeInTheDocument();
  });

  it("shows nothing owed before a line is added", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByTestId("install-total")).toHaveTextContent("$0");
  });

  it("lists past snapshots newest first, with kind, total and author", () => {
    render(
      <InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]} saved={[{
        id: "a", kind: "final", minimumCents: 15_000, measureCents: 0, subtotalCents: 40_000, totalCents: 40_000,
        createdBy: "owner@example.com", createdAt: new Date("2026-09-16T10:00:00Z"), lines: [],
      }, {
        id: "b", kind: "estimate", minimumCents: 15_000, measureCents: 0, subtotalCents: 30_000, totalCents: 30_000,
        createdBy: "owner@example.com", createdAt: new Date("2026-09-10T10:00:00Z"), lines: [],
      }]} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Final");
    expect(items[0]).toHaveTextContent("$400");
    expect(items[1]).toHaveTextContent("Estimate");
  });

  it("offers to fill from measurements only when the job has some", () => {
    const { rerender } = render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.queryByRole("button", { name: /fill from measurements/i })).toBeNull();

    rerender(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[{
      id: "m", room: "Kitchen", label: null, widthEighths: 240, heightEighths: 320,
      requirements: ["high_ladder"],
    }]} />);
    expect(screen.getByRole("button", { name: /fill from measurements/i })).toBeInTheDocument();
  });

  it("notes on a saved price when the minimum applied, and what the lines came to", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]}
      saved={[snapshot({ id: "a", subtotalCents: 5000, totalCents: 15_000 }), snapshot({ id: "b", subtotalCents: 20_000, totalCents: 20_000 })]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Minimum applied (lines came to $50)");
    expect(items[1]).not.toHaveTextContent(/minimum applied/i);
  });

  it("notes a measuring fee on a saved price without claiming the minimum applied", () => {
    // $200 of lines, no minimum involved, plus a $75 measure: total $275, subtotal $200.
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]}
      saved={[snapshot({ id: "a", subtotalCents: 20_000, measureCents: 7500, totalCents: 27_500 })]} />);
    const [item] = screen.getAllByRole("listitem");
    expect(item).toHaveTextContent("Includes $75 measurement");
    expect(item).not.toHaveTextContent(/minimum applied/i);
  });

  it("notes both when a saved price hit the minimum and charged for measuring", () => {
    // $50 of lines raised to the $150 minimum, plus $75: total $225.
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]}
      saved={[snapshot({ id: "a", subtotalCents: 5000, measureCents: 7500, totalCents: 22_500 })]} />);
    const [item] = screen.getAllByRole("listitem");
    expect(item).toHaveTextContent("Minimum applied (lines came to $50)");
    expect(item).toHaveTextContent("Includes $75 measurement");
  });

  it("does not charge for measuring until the owner ticks the box", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    const charge = screen.getByRole("checkbox", { name: "Charge for measuring" });
    expect(charge).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.clear(screen.getByLabelText("Windows"));
    await user.type(screen.getByLabelText("Windows"), "10");
    expect(screen.getByTestId("install-total")).toHaveTextContent("$250");
    expect(screen.queryByTestId("install-measure")).toBeNull();
  });

  it("adds the flat fee on top when ticked, and saves exactly what it shows", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.clear(screen.getByLabelText("Windows"));
    await user.type(screen.getByLabelText("Windows"), "2");
    await user.click(screen.getByRole("checkbox", { name: "Charge for measuring" }));
    // $50 of work rises to the $150 minimum, then the $75 measure goes on top.
    expect(screen.getByTestId("install-measure")).toHaveTextContent("$75");
    expect(screen.getByTestId("install-total")).toHaveTextContent("$225");
    await user.click(screen.getByRole("button", { name: /save as final/i }));

    const [, , sentLines, sentCharge, sentFingerprint] = saveInstallQuoteAction.mock.calls[0];
    expect(sentCharge).toBe(true);
    expect(sentFingerprint).toBe(priceFingerprint(priceQuote(sentLines, rates, settings, true), settings.minimumCents));
    expect(JSON.parse(sentFingerprint)).toMatchObject({ measureCents: 7500, totalCents: 22_500 });
  });

  it("fills one line per measured window, carrying its width and requirements", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[
      { id: "m1", room: "Kitchen", label: null, widthEighths: 240, heightEighths: 320, requirements: ["hard_surface"] },
      { id: "m2", room: "Den", label: null, widthEighths: 300, heightEighths: 400, requirements: ["high_ladder"] },
    ]} />);
    await user.selectOptions(screen.getByLabelText("Treatment for measured windows"), "vertical_blinds");
    await user.click(screen.getByRole("button", { name: /fill from measurements/i }));

    expect(screen.getAllByLabelText("Treatment")).toHaveLength(2);
    const hard = screen.getAllByLabelText("Hard surface");
    const ladder = screen.getAllByLabelText("High ladder");
    expect(hard[0]).toBeChecked();
    expect(ladder[0]).not.toBeChecked();
    expect(hard[1]).not.toBeChecked();
    expect(ladder[1]).toBeChecked();
    const widths = screen.getAllByLabelText("Width (in)");
    expect(widths[0]).toHaveValue("30");
    expect(widths[1]).toHaveValue("37.5");
  });

  it("keeps each line's typed width with that line when an earlier line is removed", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.type(screen.getAllByLabelText("Width (in)")[0], "30");
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.type(screen.getAllByLabelText("Width (in)")[1], "48");
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    const widths = screen.getAllByLabelText("Width (in)");
    expect(widths).toHaveLength(1);
    expect(widths[0]).toHaveValue("48");
  });

  it("edits and removes the line the owner acted on, after earlier lines have shifted", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[]} />);
    for (const width of ["30", "48", "60", "84"]) {
      await user.click(screen.getByRole("button", { name: /add line/i }));
      const boxes = screen.getAllByLabelText("Width (in)");
      await user.type(boxes[boxes.length - 1], width);
    }
    // Remove the 48" line, then edit the 60" line — now second, and neither first nor last, so
    // an edit aimed at the wrong position cannot land on it by accident.
    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    const survivor = screen.getAllByLabelText("Width (in)")[1];
    expect(survivor).toHaveValue("60");
    await user.clear(survivor);
    await user.type(survivor, "72");
    await user.click(screen.getByRole("button", { name: /save as estimate/i }));

    const sent = saveInstallQuoteAction.mock.calls[0][2];
    expect(sent.map((l: { widthEighths: number }) => l.widthEighths)).toEqual([30 * 8, 72 * 8, 84 * 8]);
  });

  it("sends the fingerprint of the price the owner saw, so the server can refuse one that moved", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.clear(screen.getByLabelText("Windows"));
    await user.type(screen.getByLabelText("Windows"), "10");
    expect(screen.getByTestId("install-total")).toHaveTextContent("$250");
    await user.click(screen.getByRole("button", { name: /save as final/i }));

    const [, , sentLines, sentCharge, sentFingerprint] = saveInstallQuoteAction.mock.calls[0];
    expect(sentCharge).toBe(false);
    expect(sentLines).toEqual([expect.objectContaining({ count: 10 })]);
    // Exactly what the page priced and displayed: these rates, this minimum, these lines.
    expect(sentFingerprint).toBe(priceFingerprint(priceQuote(sentLines, rates, settings, false), settings.minimumCents));
    expect(JSON.parse(sentFingerprint)).toMatchObject({ totalCents: 25_000, minimumCents: 15_000 });
  });

  it("shows the width it will price, not the digits typed, once the box loses focus", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    const width = screen.getByLabelText("Width (in)");
    // 30.1 inches is priced as 30 1/8 (241 eighths), the nearest eighth.
    await user.type(width, "30.1");
    await user.tab();
    expect(width).toHaveValue("30.125");
    await user.click(screen.getByRole("button", { name: /save as estimate/i }));
    expect(saveInstallQuoteAction.mock.calls[0][2][0]).toMatchObject({ widthEighths: 241 });
  });

  it("clears a width it cannot price when the box loses focus, rather than showing text it ignores", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    const width = screen.getByLabelText("Width (in)");
    await user.type(width, "abc");
    await user.tab();
    expect(width).toHaveValue("");
  });

  it("keeps the lines and reloads the rates when the server says they changed", async () => {
    const user = userEvent.setup();
    saveInstallQuoteAction.mockResolvedValue({ error: "Rates changed since this page loaded. Review the new total and save again." });
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.click(screen.getByRole("button", { name: /save as estimate/i }));
    expect(await screen.findByText(/rates changed since this page loaded/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Treatment")).toHaveLength(1);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the problem, no price and no enabled save for a line the server would refuse", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    // 0.01 inch rounds to 0 eighths, which the server rejects.
    await user.type(screen.getByLabelText("Width (in)"), "0.01");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a width of at least 1/8 inch");
    expect(screen.getByTestId("install-total")).toHaveTextContent("$0");
    expect(screen.getByRole("button", { name: /save as estimate/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save as final/i })).toBeDisabled();
  });

  it("drops dimensions a new treatment does not use, so none is sent unseen", async () => {
    const user = userEvent.setup();
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.selectOptions(screen.getByLabelText("Treatment"), "shutters");
    await user.type(screen.getByLabelText("Width (in)"), "30");
    await user.type(screen.getByLabelText("Height (in)"), "40");

    await user.selectOptions(screen.getByLabelText("Treatment"), "vertical_blinds");
    await user.click(screen.getByRole("button", { name: /save as estimate/i }));
    await waitFor(() => expect(saveInstallQuoteAction).toHaveBeenCalledTimes(1));
    expect(saveInstallQuoteAction.mock.calls[0][2][0]).toMatchObject({ widthEighths: 240, heightEighths: null });
  });

  it("drops both dimensions when a line moves to a per-window treatment", async () => {
    const user = userEvent.setup();
    saveInstallQuoteAction.mockResolvedValue({ error: "keep the lines" });
    render(<InstallCalculator jobId={JOB} rates={footRates} settings={settings} saved={[]} measurements={[]} />);
    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.selectOptions(screen.getByLabelText("Treatment"), "shutters");
    await user.type(screen.getByLabelText("Width (in)"), "30");
    await user.type(screen.getByLabelText("Height (in)"), "40");

    await user.selectOptions(screen.getByLabelText("Treatment"), "roller_shades");
    await user.click(screen.getByRole("button", { name: /save as estimate/i }));
    await waitFor(() => expect(saveInstallQuoteAction).toHaveBeenCalledTimes(1));
    expect(saveInstallQuoteAction.mock.calls[0][2][0]).toMatchObject({ widthEighths: null, heightEighths: null });
  });
});
