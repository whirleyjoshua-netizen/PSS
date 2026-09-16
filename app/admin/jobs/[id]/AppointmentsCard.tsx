import { Icon } from "@/components/admin/icons";
import { Button } from "@/components/ui/Button";
import type { Appointment } from "@/lib/admin/appointments";
import { APPOINTMENT_STYLE, kindLabel } from "@/lib/admin/appointment-kinds";
import { formatShortDate, formatWhen, toLocalInput } from "@/lib/admin/time";
import { cancelAppointmentAction, confirmSchedule } from "../appointment-actions";
import { StatusCard } from "./OverviewCards";
import { ScheduleDialog } from "./ScheduleDialog";

/**
 * Every appointment on the job, and what each one still needs. A booking is only a plan until
 * Confirm schedule puts it on the calendar and tells the customer.
 */
export function AppointmentsCard({ jobId, appointments }: { jobId: string; appointments: Appointment[] }) {
  return (
    <StatusCard title="Appointments" value={null} empty={appointments.length ? undefined : "Nothing scheduled"}>
      {appointments.length ? (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => <Row key={appointment.id} jobId={jobId} appointment={appointment} />)}
        </ul>
      ) : null}
      {appointments.length ? null : <ScheduleDialog jobId={jobId} />}
    </StatusCard>
  );
}

function Row({ jobId, appointment }: { jobId: string; appointment: Appointment }) {
  const style = APPOINTMENT_STYLE[appointment.kind];
  const confirmed = appointment.confirmedAt !== null;
  const when = appointment.allDay ? formatShortDate(appointment.startsAt) : formatWhen(appointment.startsAt);

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 pl-3 ${style.left}`}>
      <span className={`inline-flex items-center gap-1.5 border border-rule bg-sand px-2 py-0.5 text-xs uppercase tracking-wide ${style.tint}`}>
        <Icon name={style.icon} className="size-3.5" />
        {kindLabel(appointment.kind)}
      </span>
      <span className="font-display text-base">{when}</span>
      <span className="text-xs text-ink-soft">{confirmed ? "Confirmed" : "Pending confirmation"}</span>
      <span className="flex w-full flex-wrap items-center gap-2">
        {confirmed ? null : (
          <form action={async () => {
            "use server";
            // The card shows no error of its own; the action refreshes the page either way.
            await confirmSchedule(appointment.id, jobId);
          }}>
            <Button type="submit" variant="solid" className="px-3">Confirm schedule</Button>
          </form>
        )}
        <ScheduleDialog jobId={jobId} label="Reschedule" kind={appointment.kind} allDay={appointment.allDay}
          startsAt={toLocalInput(appointment.startsAt)} />
        {confirmed ? (
          <form action={async () => {
            "use server";
            await cancelAppointmentAction(appointment.id, jobId);
          }}>
            <button type="submit" className="min-h-11 px-3 text-sm text-ink-soft underline underline-offset-4">Cancel</button>
          </form>
        ) : null}
      </span>
    </li>
  );
}
