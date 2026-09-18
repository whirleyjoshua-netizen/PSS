/**
 * The marker that says a service request came from an installation acknowledgement.
 *
 * It travels on the URL of the link in the acknowledgement — `?from=acknowledgement` — and is
 * handled exactly as `?delete=blocked` is on the admin side (see `isDeleteBlocked` in
 * app/admin/jobs/[id]/tabs.ts): matched against this one known value and passed onwards as a
 * boolean. It is never rendered, and it never picks a status or a stage.
 *
 * What it selects is which server action the form is given, and nothing else. Provenance is
 * therefore decided by the route the customer came through, never by a field in the post:
 * `fromAcknowledgement` is deliberately NOT part of serviceRequestSchema, because its effect is
 * to mute the owners' review email and a crafted post must not be able to assert it.
 *
 * Client-safe on purpose — no `server-only`, no db import — so the page that reads the marker
 * and the tests that pin it share one definition.
 */
export const ACKNOWLEDGEMENT_MARKER = "acknowledgement";

/** The URL the "Something is not right" answer points at. */
export const serviceFromAcknowledgementHref = (jobId: string): string =>
  `/project/${encodeURIComponent(jobId)}/service?from=${ACKNOWLEDGEMENT_MARKER}`;

/**
 * True only for the one marker the acknowledgement link sets.
 *
 * A repeated parameter is read first-value-only, like `firstParam` on the admin side, so a
 * second `from=` smuggled onto the query string cannot override the first.
 */
export const isFromAcknowledgement = (value: string | string[] | undefined): boolean =>
  (Array.isArray(value) ? value[0] : value) === ACKNOWLEDGEMENT_MARKER;
