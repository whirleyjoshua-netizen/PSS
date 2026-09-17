import "server-only";
import { after } from "next/server";
import { createFile } from "@/lib/admin/files";
import { createJob } from "@/lib/admin/jobs";
import { describe as describeWindow, listMeasurements } from "@/lib/admin/measurements";
import { isInstalled } from "@/lib/admin/stages";
import { notifyOwnersOfServiceRequest } from "./send-service-email";
import { issueLabel, PHOTO_MAX_BYTES, type ServiceRequestInput } from "./service-schema";
import { requireCustomer } from "./session";

/** Everything the form collects: the validated answers, plus the one optional image. */
export type ServiceRequest = ServiceRequestInput & { photo?: File | null };

/** "not-found" is also the answer for a job that exists but is not the caller's. */
export type ServiceRequestResult = "created" | "not-found";

const usable = (photo: File | null | undefined): photo is File =>
  photo instanceof File &&
  photo.size > 0 &&
  photo.size <= PHOTO_MAX_BYTES &&
  photo.type.startsWith("image/");

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
 */
export async function requestService(jobId: string, input: ServiceRequest): Promise<ServiceRequestResult> {
  const { email, jobs } = await requireCustomer();
  const parent = jobs.find((candidate) => candidate.id === jobId);
  if (!parent) return "not-found";
  if (!isInstalled(parent.status)) return "not-found";

  // The picker only ever offers this job's own windows, so an id that is not among them is
  // tampering: it is dropped rather than recorded, and the typed answer stands instead.
  const measured = input.windowId
    ? (await listMeasurements(jobId)).find((window) => window.id === input.windowId)
    : undefined;
  const windowText = measured ? describeWindow(measured) : (input.windowText ?? "").trim();
  const window = windowText || "Not specified";
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
    { parentJobId: jobId, eventBody: "Service requested by the customer" },
  );

  // The job exists from here on. Nothing below may throw its way out.
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
    }).catch(console.error);
  });

  return "created";
}
