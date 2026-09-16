import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { listInstallQuotes } from "@/lib/admin/install-quotes";
import { InstallCalculator, type MeasuredWindow } from "./InstallCalculator";

export async function InstallTab({ jobId, measurements }: { jobId: string; measurements: MeasuredWindow[] }) {
  const [rates, settings, saved] = await Promise.all([
    listInstallRates(),
    getInstallSettings(),
    listInstallQuotes(jobId),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Installation price</h2>
      <InstallCalculator jobId={jobId} rates={rates} settings={settings} saved={saved} measurements={measurements} />
    </div>
  );
}
