import { notFound } from "next/navigation";
import { listAppointments } from "@/lib/admin/appointments";
import { getEvents, getJob } from "@/lib/admin/jobs";
import { listFiles } from "@/lib/admin/files";
import { getMeasureSet } from "@/lib/admin/measurements";
import { workingSource, workingWindows } from "@/lib/admin/measure-kinds";
import { windowCount } from "@/lib/admin/measure-units";
import { requireAdmin } from "@/lib/admin/session";
import { listTeam } from "@/lib/admin/team";
import { listReferrals } from "@/lib/referrals/db";
import { getRouteSettings } from "@/lib/routes/settings";
import { ActivityTab } from "./ActivityTab";
import { DocumentsTab, parseSentNotice } from "./DocumentsTab";
import { JobFiles } from "./JobFiles";
import { InstallTab } from "./InstallTab";
import { JobHeader } from "./JobHeader";
import { JobTabs } from "./JobTabs";
import { MeasurementsTab } from "./MeasurementsTab";
import { OverviewTab } from "./OverviewTab";
import { QuoteTab } from "./QuoteTab";
import { firstParam, isDeleteBlocked, parseJobTab } from "./tabs";
import { HEADING } from "./ui";

export default async function JobPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string | string[]; edit?: string | string[]; delete?: string | string[]; doc?: string | string[]; sent?: string | string[];
  }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [query, events, referrals, referrer, parent, measureSet, files, team, appointments, routeSettings] = await Promise.all([
    searchParams,
    getEvents(id),
    listReferrals(id),
    job.referredBy ? getJob(job.referredBy) : Promise.resolve(null),
    job.parentJobId ? getJob(job.parentJobId) : Promise.resolve(null),
    getMeasureSet(id),
    listFiles(id),
    listTeam(),
    listAppointments(id),
    getRouteSettings(),
  ]);
  const working = workingWindows(measureSet);
  const tab = parseJobTab(query.tab);
  const editing = tab === "overview" && firstParam(query.edit) === "details";
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <JobHeader job={job} now={now} team={team} defaultMinutes={routeSettings.minutes} parent={parent}
        deleteBlocked={isDeleteBlocked(query.delete)} />
      <JobTabs jobId={job.id} active={tab} counts={{ measurements: windowCount(working), files: files.length }} />
      {tab === "overview" ? (
        <OverviewTab job={job} editing={editing} now={now} measurements={working} allWindows={measureSet.windows}
          measureSource={workingSource(measureSet)} files={files}
          events={events} referrals={referrals} referrer={referrer} appointments={appointments}
          defaultMinutes={routeSettings.minutes} />
      ) : null}
      {tab === "measurements" ? <MeasurementsTab jobId={job.id} set={measureSet} files={files} /> : null}
      {tab === "files" ? (
        <div className="flex flex-col gap-4">
          <h2 className={HEADING}>Files</h2>
          <JobFiles jobId={job.id} measurements={measureSet.windows} files={files} />
        </div>
      ) : null}
      {tab === "documents" ? (
        <DocumentsTab job={job} selectedId={firstParam(query.doc) ?? null} sentNotice={parseSentNotice(query.sent)} />
      ) : null}
      {tab === "quote" ? <QuoteTab job={job} /> : null}
      {tab === "install" ? <InstallTab jobId={job.id} measurements={working} /> : null}
      {tab === "activity" ? <ActivityTab jobId={job.id} events={events} now={now} /> : null}
    </div>
  );
}
