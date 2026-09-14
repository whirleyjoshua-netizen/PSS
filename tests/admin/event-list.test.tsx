import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { JobEvent } from "@/lib/admin/jobs";
import { EventList } from "@/app/admin/jobs/[id]/EventList";

const now = new Date("2026-09-14T18:00:00Z");
const event = (id: string, iso: string, extra: Partial<JobEvent>): JobEvent => ({
  id, createdAt: new Date(iso), actor: "joshua@example.com", kind: "note", fromStatus: null, toStatus: null, body: null, ...extra,
});

describe("EventList", () => {
  it("groups events under Today, Yesterday and a date", () => {
    render(<EventList now={now} events={[
      event("1", "2026-09-14T17:31:00Z", { kind: "stage", fromStatus: "new", toStatus: "contacted" }),
      event("2", "2026-09-14T17:16:00Z", { body: "Call back after 5pm" }),
      event("3", "2026-09-13T23:16:00Z", { kind: "email", body: "Email sent" }),
      event("4", "2026-09-11T18:00:00Z", { body: "Lead created" }),
    ]} />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Today", "Yesterday", "Sep 11"]);
    expect(screen.getByText("New lead → Contacted")).toBeInTheDocument();
    expect(screen.getByText("Call back after 5pm")).toBeInTheDocument();
    expect(screen.getAllByText(/^10:31\sAM$/)).toHaveLength(1);
  });

  it("says so when there is no activity", () => {
    render(<EventList now={now} events={[]} />);
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });
});
