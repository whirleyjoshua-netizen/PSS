import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const resizePhoto = vi.fn();
const postFile = vi.fn();
vi.mock("@/lib/admin/client-upload", () => ({ resizePhoto, postFile }));

const { AddPhotoButton } = await import("@/app/admin/jobs/[id]/AddPhotoButton");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  refresh.mockReset();
  resizePhoto.mockReset().mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  postFile.mockReset().mockResolvedValue({ id: "new" });
});

describe("AddPhotoButton", () => {
  it("resizes, uploads as a photo named .jpg, and refreshes", async () => {
    render(<AddPhotoButton jobId={JOB} />);
    fireEvent.change(screen.getByLabelText("Add photo"), {
      target: { files: [new File(["x"], "IMG_0042.HEIC", { type: "image/heic" })] },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(postFile).toHaveBeenCalledWith(JOB, expect.any(Blob), "IMG_0042.jpg", "photo");
  });

  it("shows the reason when the photo cannot be read", async () => {
    resizePhoto.mockRejectedValue(new Error("We couldn't read that photo. Try taking it again."));
    render(<AddPhotoButton jobId={JOB} />);
    fireEvent.change(screen.getByLabelText("Add photo"), {
      target: { files: [new File(["x"], "bad.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't read that photo");
    expect(postFile).not.toHaveBeenCalled();
  });

  it("shows an upload error", async () => {
    postFile.mockResolvedValue({ error: "Upload failed. Check your signal and try again." });
    render(<AddPhotoButton jobId={JOB} />);
    fireEvent.change(screen.getByLabelText("Add photo"), {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
  });
});
