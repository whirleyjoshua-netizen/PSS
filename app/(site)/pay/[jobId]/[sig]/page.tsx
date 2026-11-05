import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/product/ProductParts";
import { Section } from "@/components/ui/Section";
import { business } from "@/content/business";
import { getJob } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import { isUuid } from "@/lib/admin/ids";
import { depositState, type DepositState } from "@/lib/payments/deposits";
import { verifyPayLink } from "@/lib/payments/pay-link";
import { formatProjectNo } from "@/lib/portal/project-no";
import { getCustomer } from "@/lib/portal/session";
import { PayDepositButton } from "../../../project/PayDepositButton";
import { payFromLinkAction } from "../../actions";

/**
 * The deposit payment link (owner 2026-11-04): a client who can't manage the project page pays from here,
 * with no sign-in, and the owner opens the same page to type a card in on the phone. Opening the page
 * changes nothing (mail scanners open links); only the button opens Stripe Checkout.
 */
export const metadata: Metadata = {
  title: `Pay your deposit | ${business.name}`,
  robots: { index: false, follow: false },
};

const CALL = `Questions? Call us at ${business.phone.display}.`;

/** The same test openDepositCheckout makes, so the page never offers a button that would be refused. */
const isDue = (status: string, state: DepositState | null): state is DepositState =>
  status === "signed" && state !== null && state.paid === null && state.versionStatus === "signed" && state.jobStatus === "signed";

/** Hints from a refused tap. Unvalidated: an unknown value shows nothing. */
const HINTS: Record<string, string> = {
  processing: "Your card payment is already going through. We’ll email your receipt as soon as it clears.",
  unavailable: `Card payment isn’t available right now. Please try again in a few minutes, or call us at ${business.phone.display}.`,
  "not-due": "There’s nothing to pay on this link right now.",
  paid: "Your deposit is already paid. Thank you.",
};

type Props = {
  params: Promise<{ jobId: string; sig: string }>;
  searchParams: Promise<{ paid?: string; status?: string }>;
};

export default async function PayPage({ params, searchParams }: Props) {
  const { jobId, sig } = await params;
  const query = await searchParams;
  const trail = [{ name: "Payment", url: `/pay/${jobId}/${sig}` }];
  const valid = isUuid(jobId) && verifyPayLink(jobId, sig);
  const job = valid ? await getJob(jobId) : null;
  if (!job) {
    return <PageHero eyebrow="Payment" title="This payment link isn’t working." lead={`Please call us at ${business.phone.display} and we’ll help you pay.`} trail={trail} />;
  }

  if (query.paid === "1") {
    // Back from Stripe. A client signed in to their project page goes on to it, as before the pay link existed.
    const customer = await getCustomer();
    if (customer?.jobs.some((candidate) => candidate.id === job.id)) redirect(`/project/${job.id}?deposit=done`);
  }

  const state = await depositState(job.id);
  const projectNo = formatProjectNo(job.projectNo) ?? "your project";
  if (state?.paid) {
    return (
      <PageHero
        eyebrow="Payment"
        title="Your deposit is paid. Thank you."
        lead={`We received ${formatCents(state.paid.amountCents)} for ${projectNo}. Your receipt is on its way by email. ${CALL}`}
        trail={trail}
      />
    );
  }
  if (query.paid === "1") {
    // Stripe sent the client back before its webhook reached us: only the webhook marks a deposit paid.
    return (
      <PageHero
        eyebrow="Payment"
        title="Thank you. Your payment is going through."
        lead={`We’ll email your receipt as soon as it clears. ${CALL}`}
        trail={trail}
      />
    );
  }
  if (!isDue(job.status, state)) {
    return <PageHero eyebrow="Payment" title="There’s nothing to pay right now." lead={CALL} trail={trail} />;
  }

  const hint = query.status ? HINTS[query.status] : undefined;
  const amount = formatCents(state.amountCents);
  return (
    <>
      <PageHero eyebrow="Payment" title="Your deposit." lead={`The 50% deposit for ${projectNo} is ${amount}.`} trail={trail} />
      <Section tone="ivory">
        <div className="flex max-w-xl flex-col gap-5">
          {hint ? <p role="status" className="text-base">{hint}</p> : null}
          <form action={payFromLinkAction.bind(null, jobId, sig)}>
            <PayDepositButton label={`Pay ${amount} by card`} />
          </form>
          <p className="text-base text-ink-soft">
            You’ll type your card on Stripe’s secure payment page, and we’ll email your receipt. {CALL}
          </p>
        </div>
      </Section>
    </>
  );
}
