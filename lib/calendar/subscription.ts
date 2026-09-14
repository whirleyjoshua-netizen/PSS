import "server-only";
import { portalOrigin } from "@/lib/portal/login";
import { calendarConfig } from "./config";
import { GraphError, graphFetch } from "./graph";
import { getSyncState, saveSubscription } from "./store";

export const NOTIFICATION_PATH = "/api/calendar/notifications";
const HOUR = 3_600_000;
const RENEW_WITHIN = 3 * 24 * HOUR;
const LIFETIME = (6 * 24 + 23) * HOUR; // Graph allows under 7 days for Outlook events

type Sub = { id: string; expirationDateTime: string; resource?: string; notificationUrl?: string };

async function saved(sub: Sub) {
  const expiresAt = new Date(sub.expirationDateTime);
  await saveSubscription(sub.id, expiresAt);
  return { id: sub.id, expiresAt };
}

async function renew(id: string): Promise<Response> {
  return graphFetch(`subscriptions/${id}`, {
    method: "PATCH", body: { expirationDateTime: new Date(Date.now() + LIFETIME).toISOString() },
  });
}

/** Keeps the one Graph subscription on the shared calendar alive, creating or adopting it as needed. */
export async function ensureSubscription(force = false): Promise<{ id: string; expiresAt: Date }> {
  const config = calendarConfig()!;
  const state = await getSyncState();
  if (state.subscriptionId && state.expiresAt && !force && state.expiresAt.getTime() - Date.now() > RENEW_WITHIN) {
    return { id: state.subscriptionId, expiresAt: state.expiresAt };
  }
  if (state.subscriptionId) {
    const renewed = await renew(state.subscriptionId);
    if (renewed.ok) return saved((await renewed.json()) as Sub);
    if (renewed.status !== 404) throw new GraphError(`Graph PATCH failed (${renewed.status})`, renewed.status);
  }
  const resource = `users/${config.mailbox}/events`;
  const url = `${portalOrigin()}${NOTIFICATION_PATH}`;
  const created = await graphFetch("subscriptions", {
    method: "POST",
    body: {
      changeType: "created,updated,deleted", notificationUrl: url, lifecycleNotificationUrl: url,
      resource, expirationDateTime: new Date(Date.now() + LIFETIME).toISOString(), clientState: config.clientState,
    },
  });
  if (created.ok) return saved((await created.json()) as Sub);
  if (created.status === 409) {
    const list = await graphFetch("subscriptions");
    const { value } = (await list.json()) as { value: Sub[] };
    const mine = value.find((s) => s.resource?.toLowerCase() === resource.toLowerCase() && s.notificationUrl === url);
    if (mine) {
      const adopted = await renew(mine.id);
      if (adopted.ok) return saved((await adopted.json()) as Sub);
    }
  }
  throw new GraphError(`Graph POST failed (${created.status})`, created.status);
}
