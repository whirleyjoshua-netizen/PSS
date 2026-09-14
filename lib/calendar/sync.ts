import "server-only";
import { formatWhen } from "@/lib/admin/time";
import { portalOrigin } from "@/lib/portal/login";
import { calendarConfig, calendarEnabled } from "./config";
import { movedTimes, newEventBody, sameValue, trackerValue, type GraphEvent, type Kind } from "./events";
import { GraphError, graphFetch } from "./graph";
import * as store from "./store";

const KINDS: Kind[] = ["visit", "install"];
const LABEL: Record<Kind, string> = { visit: "Visit", install: "Install" };

export const jobUrl = (id: string): string => `${portalOrigin()}/admin?job=${id}`;

const formatDate = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

async function expectOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new GraphError(`Outlook ${what} failed (${response.status})`, response.status);
  return response;
}

/** Brings one job's visit and install events in line. "push": the tracker wins. "auto": the side whose changeKey moved wins. */
export async function reconcileJob(leadId: string, mode: "push" | "auto"): Promise<void> {
  const mailbox = calendarConfig()!.mailbox;
  const events = `users/${mailbox}/events`;
  const job = await store.getCalendarJob(leadId);
  const links = await store.getLinks(leadId);

  for (const kind of KINDS) {
    const link = links.find((l) => l.kind === kind) ?? null;
    const current = kind === "visit" ? job?.visitAt ?? null : job?.installOn ?? null;
    const wanted = job && job.status !== "lost" ? current : null;

    const create = async () => {
      if (!job || wanted === null) return;
      const response = await expectOk(
        await graphFetch(events, { method: "POST", body: newEventBody(kind, job, wanted, jobUrl(job.id)) }), "create",
      );
      const created = (await response.json()) as { id: string; changeKey: string };
      await store.saveLink({ leadId, kind, eventId: created.id, changeKey: created.changeKey });
    };

    if (!link) {
      await create();
      continue;
    }

    const got = await graphFetch(`${events}/${link.eventId}`);
    if (got.status === 404) {
      await store.deleteLink(leadId, kind);
      if (mode === "push") await create();
      else if (current !== null) await store.setJobDate(leadId, kind, null, `${LABEL[kind]} removed in Outlook`);
      continue;
    }
    const event = (await (await expectOk(got, "read")).json()) as GraphEvent;

    if (wanted === null) {
      const removed = await graphFetch(`${events}/${link.eventId}`, { method: "DELETE" });
      if (removed.status !== 404) await expectOk(removed, "delete");
      await store.deleteLink(leadId, kind);
      continue;
    }

    if (mode === "auto" && event.changeKey !== link.changeKey) {
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
        await graphFetch(`${events}/${link.eventId}`, { method: "PATCH", body: movedTimes(kind, wanted, event) }), "update",
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

/** Called after a tracker save. Never throws, and does nothing when Outlook is not connected. */
export async function syncJobCalendar(leadId: string): Promise<void> {
  if (!calendarEnabled()) return;
  try {
    await reconcileJob(leadId, "push");
  } catch (error) {
    await record(error);
  }
}

/** A Graph notification for one event. Only job events matter; the rest are ignored. */
export async function applyOutlookChange(eventId: string): Promise<void> {
  try {
    const link = await store.getLinkByEvent(eventId);
    if (!link) return;
    await reconcileJob(link.leadId, "auto");
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
      await reconcileJob(id, "auto");
    } catch (error) {
      failed += 1;
      await record(error);
    }
  }
  if (failed === 0) await store.clearError();
  return { jobs: ids.length, failed };
}
