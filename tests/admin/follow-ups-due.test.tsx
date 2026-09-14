import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FollowUpsDue } from "@/app/admin/FollowUpsDue";

const now = new Date("2026-10-14T20:00:00Z"); // 1:00 PM Las Vegas
const job = (id: string, name: string, at: string, note: string | null) =>
  ({ id, name, followUpAt: new Date(at), followUpNote: note }) as Parameters<typeof FollowUpsDue>[0]["jobs"][number];

describe("FollowUpsDue", () => {
  it("renders nothing when nothing is due", () => {
    const { container } = render(<FollowUpsDue jobs={[]} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists overdue and today with links to the job and the call screen", () => {
    render(<FollowUpsDue now={now} jobs={[
      job("00000000-0000-4000-8000-000000000001", "Maria Lopez", "2026-10-14T19:00:00Z", "checking with husband"),
      job("00000000-0000-4000-8000-000000000002", "Sam Park", "2026-10-14T21:00:00Z", null),
    ]} />);
    const list = screen.getByRole("region", { name: "Follow-ups due · 2" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Overdue · Wed 10/14, 12:00 PM");
    expect(within(rows[0]).getByText(/Overdue/).className).toContain("text-overdue");
    expect(rows[0]).toHaveTextContent("checking with husband");
    expect(within(rows[0]).getByRole("link", { name: "Maria Lopez" })).toHaveAttribute("href", "/admin/jobs/00000000-0000-4000-8000-000000000001");
    expect(within(rows[0]).getByRole("link", { name: "Call" })).toHaveAttribute("href", "/admin/jobs/00000000-0000-4000-8000-000000000001/call");
    expect(rows[1]).toHaveTextContent("Today · 2:00 PM");
  });

  it("shows at most 20, then how many more", () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      job(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `Lead ${i}`, "2026-10-14T19:00:00Z", null));
    render(<FollowUpsDue jobs={many} now={now} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByText("and 3 more")).toBeInTheDocument();
  });
});
