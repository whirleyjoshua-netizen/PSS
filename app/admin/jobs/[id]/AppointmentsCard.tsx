import { Icon } from "@/components/admin/icons";
import type { Appointment } from "@/lib/admin/appointments";
import { APPOINTMENT_STYLE, kindLabel, type AppointmentKind } from "@/lib/admin/appointment-kinds";
import { formatShortDate, formatWhen, toLocalInput } from "@/lib/admin/time";
import { hoursLabel, windowLabel } from "@/lib/routes/window";
import { CancelAppointmentButton, ConfirmScheduleButton } from "./AppointmentActions";
import { StatusCard } from "./OverviewCards";
import { ScheduleDialog } from "./ScheduleDialog";

/**
 * Every appointment on the job, and what each one still needs. A booking is only a plan until
 * Confirm schedule puts it on the calendar and tells the customer.
 */
export function AppointmentsCard({ jobId, appointments, defaultMinutes }: {
  jobId: string; appointments: Appointment[]; defaultMinutes: Record<AppointmentKind, number>;
}) {
  return (
    <StatusCard title="Appointments" value={null} empty={appointments.length ? undefined : "Nothing scheduled"}>
      {appointments.length ? (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => <Row key={appointment.id} jobId={jobId} appointment={appointment} defaultMinutes={defaultMinutes} />)}
        </ul>
      ) : null}
      {appointments.length ? null : <ScheduleDialog jobId={jobId} defaultMinutes={defaultMinutes} />}
    </StatusCard>
  );
}

function Row({ jobId, appointment, defaultMinutes }: {
  jobId: string; appointment: Appointment; defaultMinutes: Record<AppointmentKind, number>;
}) {
  const style = APPOINTMENT_STYLE[appointment.kind];
  const confirmed = appointment.confirmedAt !== null;
  const arrives = windowLabel(appointment.windowStart, appointment.windowEnd);
  const when = appointment.allDay ? formatShortDate(appointment.startsAt) : formatWhen(appointment.startsAt);

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 pl-3 ${style.left}`}>
      <span className={`inline-flex items-center gap-1.5 border border-rule bg-sand px-2 py-0.5 text-xs uppercase tracking-wide ${style.tint}`}>
        <Icon name={style.icon} className="size-3.5" />
        {kindLabel(appointment.kind)}
      </span>
      <span className="font-display text-base">{when}</span>
      {arrives ? <span className="text-xs text-ink-soft">Arrives {arrives}</span> : null}
      {appointment.durationMinutes ? <span className="text-xs text-ink-soft">{hoursLabel(appointment.durationMinutes)} h</span> : null}
      <span className="text-xs text-ink-soft">{confirmed ? "Confirmed" : "Pending confirmation"}</span>
      {/* A div, not a span: these hold forms, which a span may not contain. */}
      <div className="flex w-full flex-wrap items-center gap-2">
        {confirmed ? null : <ConfirmScheduleButton appointmentId={appointment.id} jobId={jobId} />}
        <ScheduleDialog jobId={jobId} label="Reschedule" kind={appointment.kind} allDay={appointment.allDay}
          startsAt={toLocalInput(appointment.startsAt)} windowStart={appointment.windowStart}
          windowEnd={appointment.windowEnd} durationMinutes={appointment.durationMinutes} defaultMinutes={defaultMinutes} />
        {confirmed ? <CancelAppointmentButton appointmentId={appointment.id} jobId={jobId} /> : null}
      </div>
    </li>
  );
}
