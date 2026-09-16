import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/app/(site)/project/ProjectView", () => ({
  ProjectView: ({ job }: { job: { id: string } }) => <p>project {job.id}</p>,
}));
const confirmedInstallAppointments = vi.fn(async () => new Map<string, Date>());
vi.mock("@/lib/portal/timeline", () => ({ confirmedInstallAppointments }));

const Home = (await import("@/app/(site)/project/page")).default;
const JobPage = (await import("@/app/(site)/project/[jobId]/page")).default;

/** A job as visibleJobs() returns it — only the fields the list actually reads. */
const job = (over: Record<string, unknown> = {}) => ({
  id: "a", name: "Maria Lopez", address: "12 Palm Way", city: "Henderson",
  status: "quoted", visitAt: null, orderedOn: null, installOn: null, projectNo: 1048, ...over,
});

const one = job();
const two = job({ id: "b", address: null, city: "Las Vegas", projectNo: 1002 });

beforeEach(() => {
  requireCustomer.mockReset();
  notFound.mockClear();
  confirmedInstallAppointments.mockClear();
  confirmedInstallAppointments.mockResolvedValue(new Map());
});

describe("/project", () => {
  it("shows the only job straight away", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one] });
    render(await Home());
    expect(screen.getByText("project a")).toBeInTheDocument();
  });

  it("names each project by its number, its place and its current step", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, two] });
    render(await Home());

    const [first, second] = screen.getAllByRole("link");
    expect(first).toHaveAttribute("href", "/project/a");
    expect(first).toHaveTextContent("PSS-1048");
    expect(first).toHaveTextContent("12 Palm Way, Henderson");
    expect(first).toHaveTextContent("Quote Ready");
    expect(second).toHaveAttribute("href", "/project/b");
    expect(second).toHaveTextContent("PSS-1002");
    expect(second).toHaveTextContent("Las Vegas");
  });

  /** The owner's own defect: two jobs in one city, one with no street address, read identically. */
  it("tells two jobs in the same city apart when one has no street address", async () => {
    const withStreet = job({ id: "a", address: "1724 Salem Ave", city: "Las Vegas", projectNo: 1048 });
    const withoutStreet = job({ id: "b", address: null, city: "Las Vegas", projectNo: 1002 });
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [withStreet, withoutStreet] });
    render(await Home());

    const [first, second] = screen.getAllByRole("link");
    expect(first.textContent).not.toBe(second.textContent);
    expect(second).toHaveTextContent("Las Vegas");
    expect(second).toHaveTextContent("PSS-1002");
  });

  it("shows the city alone when a job has no street address, and never an empty name", async () => {
    const bare = job({ id: "c", address: null, city: "Las Vegas", projectNo: null });
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, bare] });
    render(await Home());

    const link = screen.getAllByRole("link")[1];
    expect(link).toHaveAttribute("href", "/project/c");
    expect(link).toHaveTextContent("Las Vegas");
    expect(link.textContent?.trim()).not.toBe("");
  });

  it("still labels a job with neither address nor city 'Your project'", async () => {
    const bare = job({ id: "c", address: null, city: null, projectNo: null });
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, bare] });
    render(await Home());

    const link = screen.getAllByRole("link")[1];
    expect(link).toHaveAttribute("href", "/project/c");
    expect(link).toHaveTextContent("Your project");
  });

  it("reads the current step from the confirmed install appointment, in one query for all jobs", async () => {
    const ready = job({ id: "b", address: "9 Oak St", city: "Las Vegas", status: "ordered", orderedOn: "2026-09-01" });
    confirmedInstallAppointments.mockResolvedValue(new Map([["b", new Date("2026-10-13T17:00:00Z")]]));
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, ready] });
    render(await Home());

    expect(screen.getAllByRole("link")[1]).toHaveTextContent("Ready to Install");
    expect(confirmedInstallAppointments).toHaveBeenCalledTimes(1);
    expect(confirmedInstallAppointments).toHaveBeenCalledWith(["a", "b"]);
  });
});

describe("/project/[jobId]", () => {
  it("shows a visible job", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, two] });
    render(await JobPage({ params: Promise.resolve({ jobId: "b" }) }));
    expect(screen.getByText("project b")).toBeInTheDocument();
  });

  it("404s for any job that is not theirs", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one] });
    await expect(JobPage({ params: Promise.resolve({ jobId: "someone-else" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
