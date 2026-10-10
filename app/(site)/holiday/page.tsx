import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HolidayLanding } from "@/components/holiday/HolidayLanding";
import { holidayStage } from "@/content/holiday";

/**
 * The holiday ad landing page (spec 2026-10-10). Kept out of search like /consultation. It is rebuilt at most a
 * minute after a request, so it follows the banner's dates without a redeploy; after Dec 24 it hands off to
 * /consultation so a stale ad never lands on a dead page.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Holiday Special | Premier Shade Solutions",
  description:
    "Get your Las Vegas home ready for the holidays. Free in-home consultation, every window measured and guaranteed.",
  robots: { index: false, follow: true },
};

export default function HolidayPage() {
  const stage = holidayStage(new Date());
  if (stage === "over") redirect("/consultation");
  return <HolidayLanding stage={stage} />;
}
