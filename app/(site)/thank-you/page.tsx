import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Section } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/product/ProductParts";
import { business } from "@/content/business";
import { findQuestionnaire } from "@/lib/leads/questionnaire";
import { QUESTIONNAIRE_COOKIE } from "@/lib/leads/questionnaire-cookie";
import { Questionnaire } from "./Questionnaire";

/**
 * Where both consultation forms land after a successful submit. Kept out of
 * search results and the sitemap: it only makes sense after a request, and a
 * single URL gives ads and analytics one clean conversion to count.
 *
 * Reading the questionnaire cookie makes it render per request. The key never
 * appears in the URL, so analytics never sees it.
 */
export const metadata: Metadata = {
  title: "Thank You | Premier Shade Solutions",
  description: "Your consultation request is in. Here is what happens next.",
  robots: { index: false, follow: true },
};

const STEPS = [
  {
    title: "We call you",
    body: "Expect a call within 3 business days to find a time that works for you.",
  },
  {
    title: "Your in-home visit",
    body: "We bring real samples to your windows, in your own light, measure each window, and can quote before we leave. No charge, no obligation.",
  },
  {
    title: "Made for your home",
    body: "If you choose to move forward, your window treatments are made to order, and we install them ourselves.",
  },
];

const PREP = [
  "Which rooms matter most to you.",
  "Whether glare, heat, or privacy is the main problem.",
  "Having everyone who is deciding at home for the visit.",
];

/** The visitor's questionnaire, if their cookie holds a live key. A lookup failure just hides it. */
async function loadQuestionnaire() {
  const key = (await cookies()).get(QUESTIONNAIRE_COOKIE)?.value;
  try {
    return await findQuestionnaire(key);
  } catch (error) {
    console.error("Questionnaire lookup failed", error);
    return null;
  }
}

export default async function ThankYouPage() {
  const questionnaire = await loadQuestionnaire();
  return (
    <>
      <PageHero
        eyebrow="Request received"
        title="Thank you, your request is in"
        lead="We have your details, and a copy of this is on its way to your inbox. Here is what happens next."
        trail={[{ name: "Thank you", url: "/thank-you" }]}
      />

      <Section tone="ivory">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
          <div className="flex flex-col gap-12">
            <ol className="flex flex-col gap-8">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-5">
                  <span
                    aria-hidden="true"
                    className="font-display text-3xl font-light leading-none text-champagne-ink"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="font-display text-lg text-charcoal">{step.title}</h2>
                    <p className="mt-2 max-w-xl text-ink-soft">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            {questionnaire ? <Questionnaire initial={questionnaire.answers} windowRange={questionnaire.windowRange} /> : null}

            <div>
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                Before your visit, it helps to think about
              </h2>
              <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-ink-soft">
                {PREP.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>

          <aside className="flex flex-col gap-8">
            <div className="border border-rule bg-sand/50 p-6">
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                Need us sooner?
              </h2>
              <a
                href={business.phone.href}
                className="mt-3 block font-display text-xl text-charcoal underline-offset-4 hover:underline"
              >
                {business.phone.display}
              </a>
              <a
                href={`mailto:${business.email}`}
                className="mt-2 block text-sm text-ink-soft underline-offset-4 hover:underline"
              >
                {business.email}
              </a>
              <p className="mt-4 text-sm text-ink-soft">{business.hours}</p>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">While you wait, see what we have installed.</p>
              <ButtonLink href="/gallery">View the gallery</ButtonLink>
              <ButtonLink href="/" variant="outline">
                Back to home
              </ButtonLink>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
