import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { guideInstallRate } from "@/lib/admin/shutter-pricing";
import { getShutterRates } from "@/lib/admin/shutter-rates";
import { ShutterQuote } from "./ShutterQuote";

/** Quick shutter quoting from the owners' Norman and Onyx costs. Team only: it shows dealer cost. */
export default async function ShutterPricingPage() {
  await requireAdmin();
  const rates = await getShutterRates();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/resources" className="text-sm underline underline-offset-4">Resources</Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold">Shutter pricing</h1>
          <Link href="/admin/resources/shutters/rates" className="min-h-11 py-2 text-sm underline underline-offset-4">Rates</Link>
        </div>
        <p className="text-sm text-ink-soft">A quick price from your Norman and Onyx costs. Nothing here is saved or shown to clients.</p>
      </div>
      <ShutterQuote rates={rates} install={guideInstallRate(rates)} />
    </div>
  );
}
