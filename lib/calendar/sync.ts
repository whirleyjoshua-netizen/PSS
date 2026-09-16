import "server-only";
import { formatWhen, lasVegasDate } from "@/lib/admin/time";
import { APPOINTMENT_KINDS, kindLabel } from "@/lib/admin/appointment-kinds";
import { portalOrigin } from "@/lib/portal/login";
import { calendarConfig, calendarEnabled } from "./config";
import { movedTimes, newEventBody, sameValue, trackerValue, type GraphEvent, type Kind } from "./events";
import { GraphError, graphFetch } from "./graph";
import * as store from "./store";

const KINDS: Kind[] = APPOINTMENT_KINDS.map((kind) => kind.value);
/** A claim older than this was left by a sync that died mid-create, so it may be taken over. */
const CLAIM_TIMEOUT_MS = 10 * 60_000;

/** Calendar events are opened from phones, so they link to the full job page, not the board panel. */
export const jobUrl = (id: string): string => `${portalOrigin()}/admin/jobs/${id}`;

const formatDate = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/**
 * A timed appointment that has started, or an all-day one before today in Las Vegas:
 * history, not something to clear.
 */
const isPast = (allDay: boolean, value: Date | string): boolean =>
  allDay ? (value as string) < lasVegasDate(new Date()) : (value as Date).getTime() < Date.now();

async function expectOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new GraphError(`Outlook ${what} failed (${response.status})`, response.status);
  return response;
}

/**
 * Brings one job's appointment events in line, one per kind. A kind in pushKinds is one the tracker just changed,
 * so the tracker wins and a missing event is re-created. Every other kind is "auto": the side whose
 * changeKey moved wins, and an event deleted in Outlook clears the tracker date.
 */
export async function reconcileJob(leadId: string, pushKinds: readonly Kind[] = []): Promise<void> {
  const config = calendarConfig();
  if (!config) throw new GraphError("Outlook is not configured", 0);
  const events = `users/${config.mailbox}/events`;
  const job = await store.getCalendarJob(leadId);
  const links = await store.getLinks(leadId);

  for (const kind of KINDS) {
    const push = pushKinds.includes(kind);
    let link = links.find((l) => l.kind === kind) ?? null;
    // Only confirmed appointments are returned, so an unconfirmed one reads exactly like no date at all.
    const appointment = job?.appointments.find((a) => a.kind === kind) ?? null;
    const allDay = appointment?.allDay ?? false;
    const current = appointment ? (allDay ? lasVegasDate(appointment.startsAt) : appointment.startsAt) : null;
    const wanted = job && job.status !== "lost" ? current : null;

    // Only the sync that wins the claim creates the event. A failed create gives back only its own claim,
    // never a link another sync has written since.
    const create = async () => {
      if (!job || wanted === null) return;
      const pendingId = await store.claimLink(leadId, kind);
      if (pendingId === null) return;
      let created: { id: string; changeKey: string };
      try {
        const response = await expectOk(
          await graphFetch(events, { method: "POST", body: newEventBody(kind, job, wanted, jobUrl(job.id), allDay) }), "create",
        );
        created = (await response.json()) as { id: string; changeKey: string };
      } catch (error) {
        await store.deleteLink(leadId, kind, pendingId).catch((e) => console.error("Calendar claim release failed", e));
        throw error;
      }
      try {
        await store.saveLink({ leadId, kind, eventId: created.id, changeKey: created.changeKey });
      } catch (error) {
        // Nothing would point at the new event, so the next sync would create a duplicate: remove it first.
        await graphFetch(`${events}/${encodeURIComponent(created.id)}`, { method: "DELETE" }).catch(() => {});
        await store.deleteLink(leadId, kind, pendingId).catch((e) => console.error("Calendar claim release failed", e));
        throw error;
      }
    };

    if (link?.eventId.startsWith("pending:")) {
      const age = Date.now() - (link.syncedAt?.getTime() ?? 0);
      if (age < CLAIM_TIMEOUT_MS) continue; // another sync is creating this event right now
      await store.deleteLink(leadId, kind, link.eventId);
      link = null;
    }

    if (!link) {
      await create();
      continue;
    }

    const eventPath = `${events}/${encodeURIComponent(link.eventId)}`;
    const got = await graphFetch(eventPath);
    if (got.status === 404) {
      await store.deleteLink(leadId, kind, link.eventId);
      if (push) await create();
      // Outlook drops old appointments on its own; a past date stays in the tracker as history.
      else if (current !== null && !isPast(allDay, current)) {
        await store.setJobDate(leadId, kind, null, `${kindLabel(kind)} removed in Outlook`);
      }
      continue;
    }
    const event = (await (await expectOk(got, "read")).json()) as GraphEvent;

    if (wanted === null) {
      const removed = await graphFetch(eventPath, { method: "DELETE" });
      if (removed.status !== 404) await expectOk(removed, "delete");
      await store.deleteLink(leadId, kind, link.eventId);
      continue;
    }

    if (!push && event.changeKey !== link.changeKey) {
      const value = trackerValue(allDay, event);
      if (!sameValue(allDay, value, current)) {
        const when = allDay ? formatDate(value as string) : formatWhen(value as Date);
        await store.setJobDate(leadId, kind, value, `${kindLabel(kind)} moved in Outlook to ${when}`);
      }
      await store.saveLink({ ...link, changeKey: event.changeKey });
      continue;
    }

    if (!sameValue(allDay, trackerValue(allDay, event), wanted)) {
      const patched = await expectOk(
        await graphFetch(eventPath, { method: "PATCH", body: movedTimes(allDay, wanted, event) }), "update",
      );
      const { changeKey } = (await patched.json()) as { changeKey: string };
      await store.saveLink({ ...link, changeKey });
    }
  }
}

async function record(error: unknown): Promise<void> {
  console.error("Calendar sync failed", error);
  try {
    await store.recordError(error instanceof Error ? error.message : String(error));
  } catch {
    // Best effort: never let error recording throw into the caller.
  }
}

/**
 * Called after a tracker save. pushKinds lists the dates this save changed; only those override Outlook.
 * Never throws, and does nothing when Outlook is not connected.
 */
export async function syncJobCalendar(leadId: string, pushKinds: Kind[] = []): Promise<void> {
  if (!calendarEnabled()) return;
  try {
    await reconcileJob(leadId, pushKinds);
  } catch (error) {
    await record(error);
  }
}

/** A Graph notification for one event. Only job events matter; the rest are ignored. */
export async function applyOutlookChange(eventId: string): Promise<void> {
  try {
    const link = await store.getLinkByEvent(eventId);
    if (!link) return;
    await reconcileJob(link.leadId);
  } catch (error) {
    await record(error);
  }
}

/**
 * The catch-up: every recently dated job and every linked one, one at a time. Only the daily cron passes
 * clearErrorWhenClean, since it is the run that owns the recorded error; another caller (the webhook's
 * "missed" catch-up) must not wipe an error such as a subscription failure the cron recorded.
 */
export async function reconcileCalendar(
  { clearErrorWhenClean = false }: { clearErrorWhenClean?: boolean } = {},
): Promise<{ jobs: number; failed: number }> {
  const ids = await store.reconcileTargets();
  let failed = 0;
  for (const id of ids) {
    try {
      await reconcileJob(id);
    } catch (error) {
      failed += 1;
      await record(error);
    }
  }
  if (failed === 0 && clearErrorWhenClean) await store.clearError();
  return { jobs: ids.length, failed };
}
