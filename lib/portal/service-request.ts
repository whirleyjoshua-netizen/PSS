import "server-only";
import { after } from "next/server";
import { createFile } from "@/lib/admin/files";
import { createJob, getJob } from "@/lib/admin/jobs";
import { describe as describeWindow, listMeasurements } from "@/lib/admin/measurements";
import { isInstalled } from "@/lib/admin/stages";
import { formatProjectNo } from "./project-no";
import { notifyOwnersOfServiceRequest } from "./send-service-email";
import { setReviewOptOut } from "@/lib/reviews/db";
import { issueLabel, looksLikeImage, PHOTO_MAX_BYTES, type ServiceRequestInput } from "./service-schema";
import { requireCustomer } from "./session";

/** Everything the form collects: the validated answers, plus the one optional image. */
export type ServiceRequest = ServiceRequestInput & { photo?: File | null };

/**
 * "not-found" is also the answer for a job that exists but is not the caller's.
 * "unknown-window" means the picked window is not one of this job's — a stale page or a
 * tampered id — and nothing was typed instead, so there is no window to record.
 */
export type ServiceRequestResult =
  | { status: "created"; jobId: string; projectNo: string | null }
  | { status: "not-found" }
  | { status: "unknown-window" };

/**
 * How the request got here, decided by the server from the route the customer used.
 *
 * This is a THIRD ARGUMENT and deliberately not a field on serviceRequestSchema. The schema
 * validates the customer's typed answers and is parsed from FormData, so anything in it is
 * something a crafted post can assert — and the effect of this flag is to mute the owners'
 * review email. Provenance must not be assertable by the thing whose provenance is in
 * question. Do not "tidy" it into the schema.
 */
export type ServiceRequestOptions = {
  /** True only when the customer reached the form from their installation acknowledgement. */
  fromAcknowledgement?: boolean;
};

const usable = (photo: File | null | undefined): photo is File =>
  photo instanceof File &&
  photo.size > 0 &&
  photo.size <= PHOTO_MAX_BYTES &&
  looksLikeImage(photo.name, photo.type);

/**
 * Turns a customer's service request into a real job on the owners' board.
 *
 * Ownership first, then status. The jobs are re-derived from the session on every call, and a
 * jobId that is not among them is refused with exactly the answer a job that does not exist
 * gets — the caller learns nothing about what exists. A job whose work is not installed yet is
 * refused the same way: there is no finished work to come back out to.
 *
 * The row is created through createJob() and never by a direct insert into `leads`. Validation,
 * the opening event and geocoding all hang off that function; a service job that went around it
 * would carry a real address the owners must drive to and never be geocoded, sitting in
 * "Needs address" forever.
 *
 * The photo is attached afterwards, inside its own try/catch, so the request survives a failed
 * upload: a customer whose repair request vanished because their image was too large will
 * simply not try again. The owners are told the photo did not arrive instead.
 *
 * A request that came from an installation acknowledgement additionally mutes the parent job's
 * review request, and says so in the owners' email. The review cron emails installed customers
 * within 14 days; without the mute, a customer who has just told us something is wrong would be
 * asked days later to leave a public review (spec §5). The job itself does NOT move — it stays
 * installed until the owners have put it right.
 */
export async function requestService(
  jobId: string,
  input: ServiceRequest,
  options?: ServiceRequestOptions,
): Promise<ServiceRequestResult> {
  const fromAcknowledgement = options?.fromAcknowledgement === true;
  const { email, jobs } = await requireCustomer();
  const parent = jobs.find((candidate) => candidate.id === jobId);
  if (!parent) return { status: "not-found" };
  if (!isInstalled(parent.status)) return { status: "not-found" };

  // The picker only ever offers this job's own windows, so an id that is not among them is a
  // stale page or tampering: it is dropped rather than recorded, and the typed answer stands
  // instead. With nothing typed either there is no window at all, and a job whose note said
  // "Not specified" would send the owners out knowing no more than we do — so we ask again.
  const measured = input.windowId
    ? (await listMeasurements(jobId)).find((window) => window.id === input.windowId)
    : undefined;
  const typed = (input.windowText ?? "").trim();
  if (input.windowId && !measured && !typed) return { status: "unknown-window" };
  const window = measured ? describeWindow(measured) : typed;
  const details = (input.details ?? "").trim();

  const notes = [
    "Service request from the customer",
    "",
    `Window: ${window}${measured ? ` (window id ${measured.id})` : ""}`,
    `What is happening: ${issueLabel(input.issue)}`,
    details ? `Details: ${details}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const newJobId = await createJob(
    {
      name: parent.name,
      phone: parent.phone,
      email: parent.email ?? undefined,
      address: parent.address ?? undefined,
      city: parent.city,
      notes,
      source: "service",
      stage: "new",
    },
    email,
    { parentJobId: jobId, eventBody: "Service requested by the customer", eventKind: "service" },
  );

  // The job exists from here on. Nothing below may throw its way out.

  // The PARENT job is what gets muted: it is the one whose install the review cron would ask
  // about. Its own try/catch, for the same reason as the photo's — the repair request is
  // already on the owners' board, and losing it over a failed flag would be the worse outcome
  // by far. The owners can untick the flag themselves; they cannot recover a lost request.
  if (fromAcknowledgement) {
    try {
      await setReviewOptOut(jobId, true, email);
    } catch (error) {
      console.error("Could not mute the review request for an acknowledged fault", error);
    }
  }

  let photoFailed = false;
  if (input.photo instanceof File && input.photo.size > 0) {
    if (!usable(input.photo)) {
      photoFailed = true;
    } else {
      try {
        await createFile({
          leadId: newJobId,
          kind: "photo",
          name: input.photo.name,
          contentType: input.photo.type,
          body: input.photo,
          actor: email,
        });
      } catch (error) {
        photoFailed = true;
        console.error("Service request photo failed", error);
      }
    }
  }

  after(() => {
    void notifyOwnersOfServiceRequest({
      jobId: newJobId,
      parent: { id: parent.id, name: parent.name, projectNo: parent.projectNo ?? null },
      issue: input.issue,
      window,
      details,
      replyTo: email,
      photoFailed,
      fromAcknowledgement,
    }).catch(console.error);
  });

  // The number the customer quotes when they call. It is assigned by the column's own sequence,
  // so it has to be read back — and like the photo, failing to get it must not cost the request.
  let projectNo: string | null = null;
  try {
    projectNo = formatProjectNo((await getJob(newJobId))?.projectNo ?? null);
  } catch (error) {
    console.error("Could not read the new service job's project number", error);
  }

  return { status: "created", jobId: newJobId, projectNo };
}
