import { notFound } from "next/navigation";
import { listAppointments } from "@/lib/admin/appointments";
import { getEvents, getJob } from "@/lib/admin/jobs";
import { listFiles } from "@/lib/admin/files";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { listTeam } from "@/lib/admin/team";
import { listReferrals } from "@/lib/referrals/db";
import { getRouteSettings } from "@/lib/routes/settings";
import { ActivityTab } from "./ActivityTab";
import { JobFiles } from "./JobFiles";
import { InstallTab } from "./InstallTab";
import { JobHeader } from "./JobHeader";
import { JobTabs } from "./JobTabs";
import { MeasurementsTab } from "./MeasurementsTab";
import { OverviewTab } from "./OverviewTab";
import { firstParam, parseJobTab } from "./tabs";
import { HEADING } from "./ui";

export default async function JobPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; edit?: string | string[] }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [query, events, referrals, referrer, measurements, files, team, appointments, routeSettings] = await Promise.all([
    searchParams,
    getEvents(id),
    listReferrals(id),
    job.referredBy ? getJob(job.referredBy) : Promise.resolve(null),
    listMeasurements(id),
    listFiles(id),
    listTeam(),
    listAppointments(id),
    getRouteSettings(),
  ]);
  const tab = parseJobTab(query.tab);
  const editing = tab === "overview" && firstParam(query.edit) === "details";
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <JobHeader job={job} now={now} team={team} defaultMinutes={routeSettings.minutes} />
      <JobTabs jobId={job.id} active={tab} counts={{ measurements: measurements.length, files: files.length }} />
      {tab === "overview" ? (
        <OverviewTab job={job} editing={editing} now={now} measurements={measurements} files={files}
          events={events} referrals={referrals} referrer={referrer} appointments={appointments}
          defaultMinutes={routeSettings.minutes} />
      ) : null}
      {tab === "measurements" ? <MeasurementsTab jobId={job.id} measurements={measurements} files={files} /> : null}
      {tab === "files" ? (
        <div className="flex flex-col gap-4">
          <h2 className={HEADING}>Files</h2>
          <JobFiles jobId={job.id} measurements={measurements} files={files} />
        </div>
      ) : null}
      {tab === "install" ? <InstallTab jobId={job.id} measurements={measurements} /> : null}
      {tab === "activity" ? <ActivityTab jobId={job.id} events={events} now={now} /> : null}
    </div>
  );
}
