import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { getShutterRates } from "@/lib/admin/shutter-rates";
import { RatesEditor } from "./RatesEditor";

export default async function ShutterRatesPage() {
  await requireAdmin();
  const rates = await getShutterRates();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/resources/shutters" className="text-sm underline underline-offset-4">Shutter pricing</Link>
        <h1 className="text-2xl font-semibold">Shutter rates</h1>
        <p className="text-sm text-ink-soft">
          Your cost from each supplier. Update these when a new price list arrives. Installation is set in Settings → Installation rates.
        </p>
      </div>
      <RatesEditor rates={rates} />
    </div>
  );
}
