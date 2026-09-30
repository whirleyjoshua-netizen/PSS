import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveMeasurement = vi.fn();
const removeFile = vi.fn();
vi.mock("@/app/admin/jobs/measure-actions", () => ({ saveMeasurement, removeFile }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/admin/client-upload", () => ({ resizePhoto: vi.fn(), postFile: vi.fn() }));

const { MeasureForm } = await import("@/app/admin/jobs/[id]/measure/MeasureForm");
const { resizePhoto, postFile } = await import("@/lib/admin/client-upload");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

const existingWindow = {
  id: WIN, leadId: LEAD, position: 1, room: "Kitchen", label: null,
  widthEighths: 285, heightEighths: 384, depthEighths: null, mount: "inside" as const,
  requirements: [], notes: null, photoFileId: null, quantity: 1, measuredBy: "owner@example.com",
  createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  saveMeasurement.mockReset();
  removeFile.mockReset();
  push.mockReset();
  vi.mocked(resizePhoto).mockReset();
  vi.mocked(postFile).mockReset();
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

  it("does not re-upload the same photo on a retry after a failed save", async () => {
    vi.mocked(resizePhoto).mockResolvedValue(new Blob(["x"]));
    vi.mocked(postFile).mockResolvedValue({ id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" });
    saveMeasurement.mockResolvedValueOnce({ error: "Choose inside or outside mount" });
    saveMeasurement.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);

    await fillWindow(user);
    const photo = new File([new Uint8Array([1, 2, 3])], "window.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/photo/i), photo);

    await user.click(screen.getByRole("button", { name: /save and next window/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/mount/i);
    await user.click(screen.getByRole("radio", { name: "Inside" }));
    await user.click(screen.getByRole("button", { name: /save and next window/i }));

    await waitFor(() => expect(saveMeasurement).toHaveBeenCalledTimes(2));
    expect(postFile).toHaveBeenCalledOnce();
    const firstPhotoId = saveMeasurement.mock.calls[0][2].get("photoFileId");
    const secondPhotoId = saveMeasurement.mock.calls[1][2].get("photoFileId");
    expect(firstPhotoId).toBe("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d");
    expect(secondPhotoId).toBe(firstPhotoId);
  });

  it("pre-fills an existing window and saves it in place", async () => {
    saveMeasurement.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={existingWindow} defaultRoom="" />);

    expect(screen.getByLabelText(/^room/i)).toHaveValue("Kitchen");
    expect(screen.getByLabelText(/^width inches/i)).toHaveValue(35);

    await user.clear(screen.getByLabelText(/^height inches/i));
    await user.type(screen.getByLabelText(/^height inches/i), "50");
    await user.click(screen.getByRole("button", { name: /save window/i }));

    await waitFor(() => expect(saveMeasurement).toHaveBeenCalledOnce());
    const [jobId, windowId] = saveMeasurement.mock.calls[0];
    expect([jobId, windowId]).toEqual([LEAD, WIN]);
    expect(push).toHaveBeenCalledWith(`/admin/jobs/${LEAD}?tab=measurements`);
  });

  it("removes an orphaned upload when a different photo replaces it after a failed save", async () => {
    vi.mocked(resizePhoto).mockResolvedValue(new Blob(["x"]));
    vi.mocked(postFile)
      .mockResolvedValueOnce({ id: "aaaaaaaa-0000-4000-8000-000000000000" })
      .mockResolvedValueOnce({ id: "bbbbbbbb-0000-4000-8000-000000000000" });
    saveMeasurement.mockResolvedValueOnce({ error: "Choose inside or outside mount" });
    saveMeasurement.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);

    await fillWindow(user);
    const photoA = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/photo/i), photoA);
    await user.click(screen.getByRole("button", { name: /save and next window/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/mount/i);

    await user.click(screen.getByRole("radio", { name: "Inside" }));
    const photoB = new File([new Uint8Array([2])], "b.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/photo/i), photoB);
    await user.click(screen.getByRole("button", { name: /save and next window/i }));

    await waitFor(() => expect(saveMeasurement).toHaveBeenCalledTimes(2));
    expect(removeFile).toHaveBeenCalledWith(LEAD, "aaaaaaaa-0000-4000-8000-000000000000");
    expect(postFile).toHaveBeenCalledTimes(2);
  });

  it("sends the quantity, never below 1, and starts the next window back at 1", async () => {
    saveMeasurement.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);

    const quantity = screen.getByLabelText(/^quantity/i);
    expect(quantity).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "One fewer" }));
    expect(quantity).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "One more" }));
    await user.click(screen.getByRole("button", { name: "One more" }));
    expect(quantity).toHaveValue(3);
    await user.clear(quantity);
    await user.type(quantity, "10");

    await fillWindow(user);
    await user.click(screen.getByRole("button", { name: /save and next window/i }));
    await waitFor(() => expect(saveMeasurement).toHaveBeenCalledOnce());
    expect(saveMeasurement.mock.calls[0][2].get("quantity")).toBe("10");
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(screen.getByLabelText(/^quantity/i)).toHaveValue(1);
  });

  it("steps from what the box shows, never below 1", async () => {
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);
    const quantity = screen.getByLabelText(/^quantity/i);
    await user.clear(quantity);
    await user.type(quantity, "0");
    await user.click(screen.getByRole("button", { name: "One more" }));
    expect(quantity).toHaveValue(1);
    await user.clear(quantity);
    await user.type(quantity, "12");
    await user.click(screen.getByRole("button", { name: "One more" }));
    expect(quantity).toHaveValue(13);
  });

  it("puts 1 back in a quantity box left blank, so the screen shows what is saved", async () => {
    saveMeasurement.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);
    const quantity = screen.getByLabelText(/^quantity/i);
    await user.clear(quantity);
    await user.tab();
    expect(quantity).toHaveValue(1);

    await fillWindow(user);
    await user.click(screen.getByRole("button", { name: /save and next window/i }));
    await waitFor(() => expect(saveMeasurement).toHaveBeenCalledOnce());
    expect(saveMeasurement.mock.calls[0][2].get("quantity")).toBe("1");
  });

  it("will not submit a blank quantity box", () => {
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="" />);
    expect(screen.getByLabelText(/^quantity/i)).toBeRequired();
  });

  it("shows an existing window's quantity for editing", () => {
    render(<MeasureForm jobId={LEAD} window={{ ...existingWindow, quantity: 6 }} defaultRoom="" />);
    expect(screen.getByLabelText(/^quantity/i)).toHaveValue(6);
  });

  it("labels every requirement toggle and offers the camera", () => {
    render(<MeasureForm jobId={LEAD} window={null} defaultRoom="Office" />);
    expect(screen.getByRole("checkbox", { name: "Hard surface" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "High ladder" })).toBeInTheDocument();
    expect(screen.getByLabelText(/photo/i)).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText(/^room/i)).toHaveValue("Office");
  });
});
