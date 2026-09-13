import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/app/(site)/project/ProjectView", () => ({
  ProjectView: ({ job }: { job: { id: string } }) => <p>project {job.id}</p>,
}));

const Home = (await import("@/app/(site)/project/page")).default;
const JobPage = (await import("@/app/(site)/project/[jobId]/page")).default;

const one = { id: "a", address: "12 Palm Way", city: "Henderson" };
const two = { id: "b", address: null, city: "Las Vegas" };

beforeEach(() => {
  requireCustomer.mockReset();
  notFound.mockClear();
});

describe("/project", () => {
  it("shows the only job straight away", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one] });
    render(await Home());
    expect(screen.getByText("project a")).toBeInTheDocument();
  });

  it("lists several jobs by address", async () => {
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, two] });
    render(await Home());
    expect(screen.getByRole("link", { name: "12 Palm Way, Henderson" })).toHaveAttribute("href", "/project/a");
    expect(screen.getByRole("link", { name: "Las Vegas" })).toHaveAttribute("href", "/project/b");
  });

  it("labels a job with neither address nor city 'Your project'", async () => {
    const bare = { id: "c", address: null, city: null };
    requireCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [one, bare] });
    render(await Home());
    expect(screen.getByRole("link", { name: "Your project" })).toHaveAttribute("href", "/project/c");
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
