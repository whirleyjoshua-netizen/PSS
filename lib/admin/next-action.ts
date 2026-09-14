import type { Job } from "./jobs";
import { balanceCents, formatCents } from "./money";

export type NextActionCta = { kind: "call" } | { kind: "link"; label: string; href: string };
export type NextAction = { title: string; detail: string; cta: NextActionCta | null };

/** The Overview in edit mode, optionally scrolled to one field of the details form. */
export const editDetailsHref = (jobId: string, anchor?: string): string =>
  `/admin/jobs/${jobId}?tab=overview&edit=details${anchor ? `#${anchor}` : ""}`;

const link = (label: string, href: string): NextActionCta => ({ kind: "link", label, href });

/**
 * The one thing to do next at each stage. It only points at screens and
 * fields that exist; moving the stage stays a separate, manual step.
 */
export function nextAction(
  job: Pick<Job, "id" | "status" | "soldCents" | "depositCents">,
  measurementCount: number,
): NextAction | null {
  const edit = editDetailsHref(job.id);
  switch (job.status) {
    case "new":
      return { title: "Call the customer", detail: "Learn what they want and book a visit.", cta: { kind: "call" } };
    case "contacted":
      return { title: "Book the consultation", detail: "Set a date for the in-home visit and measure.", cta: link("Book visit", editDetailsHref(job.id, "visitAt")) };
    case "visit_booked":
      return measurementCount === 0
        ? { title: "Measure the windows", detail: "Record each window at the visit.", cta: link("Add measurement", `/admin/jobs/${job.id}/measure`) }
        : { title: "Send the quote", detail: "Enter the quote, then move the job to Quoted.", cta: link("Enter quote", edit) };
    case "quoted":
      return { title: "Follow up and close", detail: "Enter the sold amount once they say yes.", cta: link("Enter sold amount", edit) };
    case "sold":
      return { title: "Order the product", detail: "Enter the order date once it's placed.", cta: link("Set order date", edit) };
    case "ordered":
      return { title: "Schedule the install", detail: "Set the install date once the product arrives.", cta: link("Set install date", edit) };
    case "installed": {
      const balance = balanceCents(job.soldCents, job.depositCents);
      return balance !== null && balance > 0
        ? { title: "Collect the balance", detail: `${formatCents(balance)} left to collect.`, cta: link("Record payment", edit) }
        : { title: "Job complete", detail: "Nothing left to do on this job.", cta: null };
    }
    case "lost":
      return null;
  }
}
