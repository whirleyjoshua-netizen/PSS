import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));

const listMeasurements = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/admin/measurements", () => ({
  listMeasurements,
  describe: (w: { room: string; label: string | null }) => (w.label ? `${w.room}, ${w.label}` : w.room),
}));

// The action is the form's only server dependency; the page test does not exercise it.
vi.mock("@/app/(site)/project/actions", () => ({ requestServiceAction: vi.fn() }));

const ServicePage = (await import("@/app/(site)/project/[jobId]/service/page")).default;
const { ServiceForm } = await import("@/app/(site)/project/[jobId]/service/ServiceForm");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const WINDOW = "1b2c3d4e-5f60-4a71-8b92-0c1d2e3f4a5b";
const job = (over: Record<string, unknown> = {}) => ({ id: MINE, status: "installed", ...over });
const open = (jobId = MINE) => ServicePage({ params: Promise.resolve({ jobId }) });

beforeEach(() => {
  requireCustomer.mockReset().mockResolvedValue({ email: "maria@example.com", jobs: [job()] });
  listMeasurements.mockReset().mockResolvedValue([]);
  notFound.mockClear();
});

describe("/project/[jobId]/service", () => {
  it("opens for the customer's own installed job", async () => {
    render(await open());
    expect(screen.getByRole("heading", { name: "Request a service" })).toBeInTheDocument();
  });

  /** A job that is not theirs looks exactly like one that is not there. */
  it("is missing for a job the customer does not own", async () => {
    await expect(open(THEIRS)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listMeasurements).not.toHaveBeenCalled();
  });

  it.each(["quoted", "sold", "ordered"] as const)("is missing while the job is only %s", async (status) => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [job({ status })] });
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists the windows the owners measured, in their own words", async () => {
    listMeasurements.mockResolvedValue([{ id: WINDOW, room: "Dining Room", label: "left window" }]);
    render(await open());
    expect(screen.getByRole("option", { name: "Dining Room, left window" })).toBeInTheDocument();
  });
});

describe("ServiceForm", () => {
  const windows = [{ id: WINDOW, label: "Dining Room, left window" }];

  it("asks two required questions and two optional ones, and no more", () => {
    render(<ServiceForm jobId={MINE} windows={windows} />);
    expect(screen.getByLabelText("Which window?")).toBeInTheDocument();
    expect(screen.getByLabelText("What is happening?")).toBeInTheDocument();
    expect(screen.getByLabelText("Anything else we should know? (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("A photo (optional)")).toBeInTheDocument();
    // No dates, counts, part numbers or severity scale: the customer knows none of them.
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("offers every problem the customer might be reporting", () => {
    render(<ServiceForm jobId={MINE} windows={windows} />);
    for (const label of [
      "Will not go up or down",
      "Crooked or uneven",
      "Damaged or broken",
      "Remote or motor not working",
      "Something else",
    ]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  /**
   * "Somewhere else" must not depend on a click: with JavaScript off there is nothing to
   * reveal a hidden box, so the text input is always on the page beside the picker.
   */
  it("works with JavaScript off, text box and all", () => {
    const html = renderToStaticMarkup(<ServiceForm jobId={MINE} windows={windows} />);
    expect(html).toContain('name="windowText"');
    expect(html).toContain('name="windowId"');
    expect(html).toContain("Somewhere else");
    // The picker, the fallback box and the file input are all in the markup the browser gets,
    // so a post with no script running carries every answer. (encType is not asserted here:
    // React fills it in from the real server action, which this test mocks out.)
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('type="file"');
  });

  it("is just a text box for a job with no measured windows", () => {
    render(<ServiceForm jobId={MINE} windows={[]} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByText("Tell us which window or room.")).toBeInTheDocument();
  });

  it("states the photo size limit in the copy", () => {
    render(<ServiceForm jobId={MINE} windows={windows} />);
    expect(screen.getByText(/up to\s*10\s*MB/i)).toBeInTheDocument();
  });
});
