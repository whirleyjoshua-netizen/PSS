import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { PageHero } from "@/components/product/ProductParts";
import { business } from "@/content/business";
import { addSuppression } from "@/lib/agents/store";
import { UNSUBSCRIBE_TOKEN } from "@/lib/column/rules";
import { addressForToken } from "@/lib/column/store";

/**
 * Where the unsubscribe link in a marketing email lands. Opening the page changes nothing (mail scanners open
 * links), the button does. The address is partly hidden, so a forwarded link doesn't show it in full.
 */
export const metadata: Metadata = {
  title: `Unsubscribe | ${business.name}`,
  robots: { index: false, follow: false },
};

const masked = (address: string) => {
  const [user, domain] = address.split("@");
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
};

async function lookup(token: string): Promise<string | null> {
  if (!UNSUBSCRIBE_TOKEN.test(token)) return null;
  try {
    return await addressForToken(token);
  } catch (error) {
    console.error("Unsubscribe lookup failed", error);
    return null;
  }
}

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const done = (await searchParams).done === "1";
  const address = await lookup(token);

  async function unsubscribe() {
    "use server";
    const found = await lookup(token);
    if (found) await addSuppression(found, "Unsubscribed from an email", "link");
    redirect(`/unsubscribe/${token}?done=1`);
  }

  const trail = [{ name: "Unsubscribe", url: `/unsubscribe/${token}` }];
  if (!address) {
    return (
      <PageHero
        eyebrow="Unsubscribe"
        title="This link isn’t working"
        lead={`To stop emails from us, reply to any of them with “unsubscribe”, or email ${business.email}.`}
        trail={trail}
      />
    );
  }
  if (done) {
    return (
      <PageHero
        eyebrow="Unsubscribe"
        title="You’re unsubscribed"
        lead={`We won’t send marketing emails to ${masked(address)} again. You may still hear from us about a job you have with us.`}
        trail={trail}
      />
    );
  }
  return (
    <>
      <PageHero eyebrow="Unsubscribe" title="Stop marketing emails?" lead={`From ${business.name} to ${masked(address)}.`} trail={trail} />
      <Section tone="ivory">
        <form action={unsubscribe}>
          <Button type="submit">Unsubscribe</Button>
        </form>
      </Section>
    </>
  );
}
