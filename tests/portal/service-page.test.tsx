import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));

const listWorkingWindows = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/admin/measurements", () => ({
  listWorkingWindows,
  describe: (w: { room: string; label: string | null }) => (w.label ? `${w.room}, ${w.label}` : w.room),
}));

/**
 * The two actions are the form's only server dependency. They are held as named mocks so the
 * form can be asked WHICH of them it posts to — the one thing that decides whether a request
 * mutes the owners' review email, and the only part of that wiring not settled server-side.
 */
const requestServiceAction = vi.fn(async () => ({ status: "idle" }) as unknown);
const acknowledgeProblemAction = vi.fn(async () => ({ status: "idle" }) as unknown);
vi.mock("@/app/(site)/project/actions", () => ({ requestServiceAction, acknowledgeProblemAction }));

const ServicePage = (await import("@/app/(site)/project/[jobId]/service/page")).default;
const { ServiceForm } = await import("@/app/(site)/project/[jobId]/service/ServiceForm");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const WINDOW = "1b2c3d4e-5f60-4a71-8b92-0c1d2e3f4a5b";
const job = (over: Record<string, unknown> = {}) => ({ id: MINE, status: "installed", ...over });
const open = (jobId = MINE, from?: string | string[]) =>
  ServicePage({
    params: Promise.resolve({ jobId }),
    searchParams: Promise.resolve(from === undefined ? {} : { from }),
  });

beforeEach(() => {
  requireCustomer.mockReset().mockResolvedValue({ email: "maria@example.com", jobs: [job()] });
  listWorkingWindows.mockReset().mockResolvedValue([]);
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
    expect(listWorkingWindows).not.toHaveBeenCalled();
  });

  it.each(["quoted", "sold", "ordered"] as const)("is missing while the job is only %s", async (status) => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [job({ status })] });
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  /**
   * The acknowledgement marker. Without these, the page could stop reading `?from=` entirely
   * and every other test would still pass — the customer would land on the ordinary form, the
   * review email would never be muted, and nothing would say so.
   */
  describe("arriving from an installation acknowledgement", () => {
    const SORRY = /we are sorry it is not right/i;

    it("answers a customer who said something is not right in those terms", async () => {
      render(await open(MINE, "acknowledgement"));
      expect(screen.getByText(SORRY)).toBeInTheDocument();
    });

    it("is the ordinary form on an ordinary visit", async () => {
      render(await open());
      expect(screen.queryByText(SORRY)).toBeNull();
    });

    /** The marker is matched against one known value, never interpreted. */
    it("ignores any other value a browser might send", async () => {
      for (const from of ["1", "true", "completed", "Acknowledgement", ""]) {
        const { unmount } = render(await open(MINE, from));
        expect(screen.queryByText(SORRY)).toBeNull();
        unmount();
      }
    });

    /** The marker never chooses a status: it cannot open the page for a job that is not installed. */
    it("still refuses a job that is not installed, marker or no marker", async () => {
      requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [job({ status: "quoted" })] });
      await expect(open(MINE, "acknowledgement")).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("still refuses a job the customer does not own", async () => {
      await expect(open(THEIRS, "acknowledgement")).rejects.toThrow("NEXT_NOT_FOUND");
    });

    /**
     * I-1. The marker is the customer's own URL, so neither the sentence nor the action behind
     * it may be chosen by it alone.
     *
     * isInstalled() admits `completed`, so a customer who has ALREADY answered "everything
     * looks great" can still open this page. Hand-typing the marker would otherwise tell them
     * we are sorry it is not right — about a job they themselves confirmed — and hand them the
     * MUTING action, opting their own finished job out of the owners' review request. Both are
     * re-derived from the job's raw status instead, which is the rule Task 2 established.
     */
    describe("on a job the customer has already confirmed", () => {
      const completed = () =>
        requireCustomer.mockResolvedValue({
          email: "maria@example.com",
          jobs: [job({ status: "completed" })],
        });

      beforeEach(() => {
        requestServiceAction.mockClear();
        acknowledgeProblemAction.mockClear();
      });

      it("says nothing about an acknowledgement, whatever the URL says", async () => {
        completed();
        render(await open(MINE, "acknowledgement"));
        expect(screen.queryByText(SORRY)).toBeNull();
        // The ordinary wording stands in its place — the page still works, it just does not
        // pretend to know something the job does not say.
        expect(screen.getByText(/we will get back to you to arrange a visit/i)).toBeInTheDocument();
      });

      it("hands it the NON-muting action, so a finished job cannot be opted out by a typed URL", async () => {
        completed();
        render(await open(MINE, "acknowledgement"));
        fireEvent.submit(document.querySelector("form") as HTMLFormElement);
        await waitFor(() => expect(requestServiceAction).toHaveBeenCalled());
        expect(acknowledgeProblemAction).not.toHaveBeenCalled();
      });

      /**
       * The positive control: the same marker on a job that really is installed still works.
       *
       * DELIBERATELY relies on the OUTER `installed` default and does NOT call `completed()` —
       * despite sitting in a describe named for a confirmed job. That mismatch is the point: it
       * is what makes this the control. "Tidying" the setup to match the describe name would
       * make both branches `completed`, and this test would then pass for the wrong reason and
       * guard nothing.
       */
      it("still hands a genuinely installed job the muting action", async () => {
        render(await open(MINE, "acknowledgement"));
        fireEvent.submit(document.querySelector("form") as HTMLFormElement);
        await waitFor(() => expect(acknowledgeProblemAction).toHaveBeenCalled());
        expect(requestServiceAction).not.toHaveBeenCalled();
      });
    });
  });

  it("lists the working windows (official, else designer), in their own words", async () => {
    listWorkingWindows.mockResolvedValue([{ id: WINDOW, room: "Dining Room", label: "left window" }]);
    render(await open());
    expect(screen.getByRole("option", { name: "Dining Room, left window" })).toBeInTheDocument();
  });

  it("says a measured line of identical windows is one of several", async () => {
    listWorkingWindows.mockResolvedValue([{ id: WINDOW, room: "Den", label: null, quantity: 10 }]);
    render(await open());
    expect(screen.getByRole("option", { name: "Den (one of 10)" })).toBeInTheDocument();
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
    expect(html).toContain('accept="image/*');
    expect(html).toContain('type="file"');
  });

  it("is just a text box for a job with no measured windows", () => {
    render(<ServiceForm jobId={MINE} windows={[]} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByText("Tell us which window or room.")).toBeInTheDocument();
  });

  /**
   * Which action the form posts to IS the provenance mechanism: there is no field in the post
   * that says where the request came from, by design. Without these two, the form could send an
   * acknowledged fault to the ordinary action and the customer who just told us the install is
   * wrong would still be asked for a public review — with every other test still green.
   */
  describe("which action it posts to", () => {
    const submit = () => {
      render(<ServiceForm jobId={MINE} windows={windows} fromAcknowledgement={FROM_ACK} />);
      fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    };
    let FROM_ACK = false;

    beforeEach(() => {
      requestServiceAction.mockClear();
      acknowledgeProblemAction.mockClear();
    });

    it("sends an ordinary request to the plain action, which mutes nothing", async () => {
      FROM_ACK = false;
      submit();
      await waitFor(() => expect(requestServiceAction).toHaveBeenCalled());
      expect(acknowledgeProblemAction).not.toHaveBeenCalled();
    });

    it("sends an acknowledged fault to the muting action", async () => {
      FROM_ACK = true;
      submit();
      await waitFor(() => expect(acknowledgeProblemAction).toHaveBeenCalled());
      expect(requestServiceAction).not.toHaveBeenCalled();
    });
  });

  it("states the photo size limit in the copy", () => {
    render(<ServiceForm jobId={MINE} windows={windows} />);
    expect(screen.getByText(/up to\s*10\s*MB/i)).toBeInTheDocument();
  });

  /**
   * The framework rejects an over-limit body before any of our code runs, so an enormous photo
   * would take the customer's words down with it. This catch is the only thing standing between
   * a 13 MB holiday-camera JPEG and a lost repair request.
   */
  it("catches an oversized photo before the post, and keeps the rest of the form", () => {
    render(<ServiceForm jobId={MINE} windows={windows} />);
    const input = screen.getByLabelText("A photo (optional)") as HTMLInputElement;
    const huge = new File(["x"], "broken-blind.jpg", { type: "image/jpeg" });
    Object.defineProperty(huge, "size", { value: 13 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [huge] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/13 MB.*over the 10 MB limit/i);
    // Cleared, so they can send the request without the photo rather than losing it.
    expect(input.value).toBe("");
  });

  it("says nothing about a photo that is within the limit", () => {
    render(<ServiceForm jobId={MINE} windows={windows} />);
    const input = screen.getByLabelText("A photo (optional)") as HTMLInputElement;
    const fine = new File(["x"], "blind.heic", { type: "image/heic" });
    Object.defineProperty(fine, "size", { value: 2 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [fine] } });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  /**
   * `capture` forces the camera open on several phones. A customer who already photographed the
   * broken blind must be able to choose that picture from their library.
   */
  it("offers the photo library, not only the camera, and admits HEIC", () => {
    render(<ServiceForm jobId={MINE} windows={windows} />);
    const input = screen.getByLabelText("A photo (optional)");
    expect(input).not.toHaveAttribute("capture");
    expect(input.getAttribute("accept")).toContain(".heic");
  });
});
