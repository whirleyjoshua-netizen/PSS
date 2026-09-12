import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveMeasurement = vi.fn();
vi.mock("@/app/admin/jobs/measure-actions", () => ({ saveMeasurement }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/admin/client-upload", () => ({ resizePhoto: vi.fn(), postFile: vi.fn() }));

const { MeasureForm } = await import("@/app/admin/jobs/[id]/measure/MeasureForm");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  saveMeasurement.mockReset();
  push.mockReset();
});

async function fillWindow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Kitchen" }));
  await user.type(screen.getByLabelText(/^width inches/i), "35");
  await user.selectOptions(screen.getByLabelText(/^width eighths/i), "5");
  await user.type(screen.getByLabelText(/^height inches/i), "48");
  await user.click(screen.getByRole("radio", { name: "Inside" }));
}

describe("MeasureForm", () => {
  it("saves a window and clears the form except the room", async () => {
    saveMeasurement.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);

    await fillWindow(user);
    await user.click(screen.getByRole("button", { name: /save and next window/i }));

    await waitFor(() => expect(saveMeasurement).toHaveBeenCalledOnce());
    const [jobId, windowId, data] = saveMeasurement.mock.calls[0];
    expect([jobId, windowId]).toEqual([LEAD, null]);
    expect(data.get("room")).toBe("Kitchen");
    expect(data.get("widthEighth")).toBe("5");
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(screen.getByLabelText(/^room/i)).toHaveValue("Kitchen");
    expect(screen.getByLabelText(/^width inches/i)).toHaveValue(null);
  });

  it("keeps what was typed when the save fails", async () => {
    saveMeasurement.mockResolvedValue({ error: "Choose inside or outside mount" });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);

    await user.click(screen.getByRole("button", { name: "Kitchen" }));
    await user.type(screen.getByLabelText(/^width inches/i), "35");
    await user.click(screen.getByRole("button", { name: /save and next window/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/mount/i);
    expect(screen.getByLabelText(/^width inches/i)).toHaveValue(35);
  });

  it("labels every requirement toggle and offers the camera", () => {
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="Office" />);
    expect(screen.getByRole("checkbox", { name: "Hard surface" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "High ladder" })).toBeInTheDocument();
    expect(screen.getByLabelText(/photo/i)).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText(/^room/i)).toHaveValue("Office");
  });
});
