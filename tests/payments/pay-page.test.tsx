import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.test" }));
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const deposits = { depositState: vi.fn() };
vi.mock("@/lib/payments/deposits", () => deposits);
const checkout = { openDepositCheckout: vi.fn() };
vi.mock("@/lib/payments/checkout", () => checkout);
const session = { getCustomer: vi.fn() };
vi.mock("@/lib/portal/session", () => session);
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("react-dom", async (actual) => ({ ...(await actual<typeof import("react-dom")>()), useFormStatus: () => ({ pending: false }) }));

process.env.STRIPE_SECRET_KEY = "sk_test_pay_page";
const { default: PayPage } = await import("@/app/(site)/pay/[jobId]/[sig]/page");
const { payFromLinkAction } = await import("@/app/(site)/pay/actions");
const { payPath } = await import("@/lib/payments/pay-link");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const SIG = payPath(JOB)!.split("/").at(-1)!;
const job = { id: JOB, name: "Maria Lopez", email: "maria@example.com", projectNo: 1048, status: "signed" };
const due = { jobStatus: "signed", versionStatus: "signed", amountCents: 92417, soldCents: 184833, paid: null, pending: null, refunded: null };

const page = async (sig = SIG, query: Record<string, string> = {}, jobId = JOB) =>
  render((await PayPage({ params: Promise.resolve({ jobId, sig }), searchParams: Promise.resolve(query) })) as ReactElement);

beforeEach(() => {
  jobs.getJob.mockReset().mockResolvedValue(job);
  deposits.depositState.mockReset().mockResolvedValue(due);
  checkout.openDepositCheckout.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/c/cs_1" });
  session.getCustomer.mockReset().mockResolvedValue(null);
  redirect.mockClear();
});

describe("the pay page", () => {
  it("shows the deposit and one Pay by card button, with no sign-in", async () => {
    await page();
    expect(screen.getByText("The 50% deposit for PSS-1048 is $924.17.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay $924.17 by card" })).toBeInTheDocument();
    expect(session.getCustomer).not.toHaveBeenCalled();
  });

  it("shows no client name or email, since a forwarded link would show them to anyone", async () => {
    const { container } = await page();
    expect(container.textContent).not.toMatch(/Maria|maria@/);
  });

  it("reads nothing for a link whose signature doesn't match", async () => {
    await page(`${SIG.slice(0, 21)}A` === SIG ? `${SIG.slice(0, 21)}B` : `${SIG.slice(0, 21)}A`);
    expect(screen.getByRole("heading", { name: "This payment link isn’t working." })).toBeInTheDocument();
    expect(jobs.getJob).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a paid deposit is paid, with no button", async () => {
    deposits.depositState.mockResolvedValue({ ...due, paid: { amountCents: 92417 } });
    await page();
    expect(screen.getByRole("heading", { name: "Your deposit is paid. Thank you." })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers no button on a job that doesn't owe a deposit", async () => {
    jobs.getJob.mockResolvedValue({ ...job, status: "approved" });
    await page();
    expect(screen.getByRole("heading", { name: "There’s nothing to pay right now." })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    jobs.getJob.mockResolvedValue(job);
    deposits.depositState.mockResolvedValue({ ...due, versionStatus: "sent" });
    await page();
    expect(screen.getAllByRole("heading", { name: "There’s nothing to pay right now." })).toHaveLength(2);
  });

  it("back from Stripe before the webhook, says the payment is going through, not paid", async () => {
    await page(SIG, { paid: "1" });
    expect(screen.getByRole("heading", { name: "Thank you. Your payment is going through." })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("back from Stripe, sends a client signed in to this job on to their project page", async () => {
    session.getCustomer.mockResolvedValue({ email: "maria@example.com", jobs: [job] });
    await expect(page(SIG, { paid: "1" })).rejects.toThrow(`NEXT_REDIRECT /project/${JOB}?deposit=done`);
    session.getCustomer.mockResolvedValue({ email: "someone@example.com", jobs: [{ ...job, id: "other" }] });
    await page(SIG, { paid: "1" });
    expect(screen.getByRole("heading", { name: "Thank you. Your payment is going through." })).toBeInTheDocument();
  });

  it("shows a refused tap's hint, and ignores an unknown one", async () => {
    await page(SIG, { status: "unavailable" });
    expect(screen.getByRole("status")).toHaveTextContent("Card payment isn’t available right now.");
    await page(SIG, { status: "<script>" });
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("payFromLinkAction", () => {
  it("opens Stripe Checkout for the job the link signs", async () => {
    await expect(payFromLinkAction(JOB, SIG)).rejects.toThrow("NEXT_REDIRECT https://checkout.stripe.test/c/cs_1");
    expect(checkout.openDepositCheckout).toHaveBeenCalledWith(job);
  });

  it("opens nothing for an altered job id or signature", async () => {
    const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    await expect(payFromLinkAction(OTHER, SIG)).rejects.toThrow(`NEXT_REDIRECT /pay/${OTHER}/${SIG}`);
    await expect(payFromLinkAction("not-a-uuid", SIG)).rejects.toThrow("NEXT_REDIRECT");
    expect(jobs.getJob).not.toHaveBeenCalled();
    expect(checkout.openDepositCheckout).not.toHaveBeenCalled();
  });

  it("comes back to the page with the reason when checkout is refused", async () => {
    checkout.openDepositCheckout.mockResolvedValue("processing");
    await expect(payFromLinkAction(JOB, SIG)).rejects.toThrow(`NEXT_REDIRECT /pay/${JOB}/${SIG}?status=processing`);
    checkout.openDepositCheckout.mockResolvedValue("changed");
    await expect(payFromLinkAction(JOB, SIG)).rejects.toThrow(new RegExp(`NEXT_REDIRECT /pay/${JOB}/${SIG}$`));
  });
});
