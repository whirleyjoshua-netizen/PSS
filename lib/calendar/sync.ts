import "server-only";
import { formatWhen, lasVegasDate } from "@/lib/admin/time";
import { portalOrigin } from "@/lib/portal/login";
import { calendarConfig, calendarEnabled } from "./config";
import { movedTimes, newEventBody, sameValue, trackerValue, type GraphEvent, type Kind } from "./events";
import { GraphError, graphFetch } from "./graph";
import * as store from "./store";

const KINDS: Kind[] = ["visit", "install"];
const LABEL: Record<Kind, string> = { visit: "Visit", install: "Install" };
/** A claim older than this was left by a sync that died mid-create, so it may be taken over. */
const CLAIM_TIMEOUT_MS = 10 * 60_000;

export const jobUrl = (id: string): string => `${portalOrigin()}/admin?job=${id}`;

const formatDate = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/** A visit that has started, or an install before today in Las Vegas: history, not something to clear. */
const isPast = (kind: Kind, value: Date | string): boolean =>
  kind === "visit" ? (value as Date).getTime() < Date.now() : (value as string) < lasVegasDate(new Date());

async function expectOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new GraphError(`Outlook ${what} failed (${response.status})`, response.status);
  return response;
}

/**
 * Brings one job's visit and install events in line. A kind in pushKinds is one the tracker just changed,
 * so the tracker wins and a missing event is re-created. Every other kind is "auto": the side whose
 * changeKey moved wins, and an event deleted in Outlook clears the tracker date.
 */
export async function reconcileJob(leadId: string, pushKinds: readonly Kind[] = []): Promise<void> {
  const mailbox = calendarConfig()!.mailbox;
  const events = `users/${mailbox}/events`;
  const job = await store.getCalendarJob(leadId);
  const links = await store.getLinks(leadId);

  for (const kind of KINDS) {
    const push = pushKinds.includes(kind);
    let link = links.find((l) => l.kind === kind) ?? null;
    const current = kind === "visit" ? job?.visitAt ?? null : job?.installOn ?? null;
    const wanted = job && job.status !== "lost" ? current : null;

    // Only the sync that wins the claim creates the event; a failed create gives the claim back.
    const create = async () => {
      if (!job || wanted === null) return;
      if (!(await store.claimLink(leadId, kind))) return;
      let created: { id: string; changeKey: string };
      try {
        const response = await expectOk(
          await graphFetch(events, { method: "POST", body: newEventBody(kind, job, wanted, jobUrl(job.id)) }), "create",
        );
        created = (await response.json()) as { id: string; changeKey: string };
      } catch (error) {
        await store.deleteLink(leadId, kind);
        throw error;
      }
      await store.saveLink({ leadId, kind, eventId: created.id, changeKey: created.changeKey });
    };

    if (link?.eventId.startsWith("pending:")) {
      const age = Date.now() - (link.syncedAt?.getTime() ?? 0);
      if (age < CLAIM_TIMEOUT_MS) continue; // another sync is creating this event right now
      await store.deleteLink(leadId, kind);
      link = null;
    }

    if (!link) {
      await create();
      continue;
    }

    const eventPath = `${events}/${encodeURIComponent(link.eventId)}`;
    const got = await graphFetch(eventPath);
    if (got.status === 404) {
      await store.deleteLink(leadId, kind);
      if (push) await create();
      // Outlook drops old appointments on its own; a past date stays in the tracker as history.
      else if (current !== null && !isPast(kind, current)) {
        await store.setJobDate(leadId, kind, null, `${LABEL[kind]} removed in Outlook`);
      }
      continue;
    }
    const event = (await (await expectOk(got, "read")).json()) as GraphEvent;

    if (wanted === null) {
      const removed = await graphFetch(eventPath, { method: "DELETE" });
      if (removed.status !== 404) await expectOk(removed, "delete");
      await store.deleteLink(leadId, kind);
      continue;
    }

    if (!push && event.changeKey !== link.changeKey) {
      const value = trackerValue(kind, event);
      if (!sameValue(kind, value, current)) {
        const when = kind === "visit" ? formatWhen(value as Date) : formatDate(value as string);
        await store.setJobDate(leadId, kind, value, `${LABEL[kind]} moved in Outlook to ${when}`);
      }
      await store.saveLink({ ...link, changeKey: event.changeKey });
      continue;
    }

    if (!sameValue(kind, trackerValue(kind, event), wanted)) {
      const patched = await expectOk(
        await graphFetch(eventPath, { method: "PATCH", body: movedTimes(kind, wanted, event) }), "update",
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

/** The daily catch-up: every recently dated job and every linked one, one at a time. */
export async function reconcileCalendar(): Promise<{ jobs: number; failed: number }> {
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
  if (failed === 0) await store.clearError();
  return { jobs: ids.length, failed };
}
