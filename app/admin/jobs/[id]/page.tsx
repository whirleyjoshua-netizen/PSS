import { notFound } from "next/navigation";
import { getEvents, getJob } from "@/lib/admin/jobs";
import { listFiles } from "@/lib/admin/files";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { listReferrals } from "@/lib/referrals/db";
import { ActivityTab } from "./ActivityTab";
import { JobFiles } from "./JobFiles";
import { JobHeader } from "./JobHeader";
import { JobTabs } from "./JobTabs";
import { MeasurementsTab } from "./MeasurementsTab";
import { OverviewTab } from "./OverviewTab";
import { firstParam, parseJobTab } from "./tabs";

export default async function JobPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; edit?: string | string[] }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [query, events, referrals, referrer, measurements, files] = await Promise.all([
    searchParams,
    getEvents(id),
    listReferrals(id),
    job.referredBy ? getJob(job.referredBy) : Promise.resolve(null),
    listMeasurements(id),
    listFiles(id),
  ]);
  const tab = parseJobTab(query.tab);
  const editing = tab === "overview" && firstParam(query.edit) === "details";
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <JobHeader job={job} now={now} />
      <JobTabs jobId={job.id} active={tab} counts={{ measurements: measurements.length, files: files.length }} />
      {tab === "overview" ? (
        <OverviewTab job={job} editing={editing} now={now} measurements={measurements} files={files}
          events={events} referrals={referrals} referrer={referrer} />
      ) : null}
      {tab === "measurements" ? <MeasurementsTab jobId={job.id} measurements={measurements} files={files} /> : null}
      {tab === "files" ? <JobFiles jobId={job.id} measurements={measurements} files={files} showMeasurements={false} /> : null}
      {tab === "activity" ? <ActivityTab jobId={job.id} events={events} now={now} /> : null}
    </div>
  );
}
