"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  DETAILS_MAX,
  ISSUES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_MB,
  WINDOW_TEXT_MAX,
} from "@/lib/portal/service-schema";
import { requestServiceAction, type ServiceFormState } from "../../actions";

const field = "w-full max-w-full border border-rule bg-white p-3 text-base";
const label = "text-sm font-semibold";

/**
 * Two required answers and two optional ones. Nothing here is a trade form: a homeowner knows
 * no part numbers, and anything asked that they cannot confidently answer costs a submission.
 *
 * It works with JavaScript off. The window picker is a plain `<select>` and the "somewhere
 * else" box is always on the page rather than revealed by script, so no answer depends on a
 * click. Everything typed comes back on a rejected post.
 */
export function ServiceForm({
  jobId,
  windows,
}: {
  jobId: string;
  windows: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ServiceFormState, FormData>(
    requestServiceAction,
    { status: "idle" },
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);

  /**
   * Catches an oversized photo here, before the post.
   *
   * The framework rejects a request body over its own limit before any of our code runs, so a
   * very large image would take the customer's words, their window and their description down
   * with it — the one outcome the whole feature is built to avoid. Clearing the input lets them
   * send the request without the photo rather than losing it.
   */
  const checkPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file && file.size > PHOTO_MAX_BYTES) {
      setPhotoProblem(
        `That photo is about ${Math.round(file.size / 1024 / 1024)} MB, over the ${PHOTO_MAX_MB} MB limit. ` +
          "Choose a smaller one, or send the request without a photo and we will ask for it.",
      );
      event.currentTarget.value = "";
      return;
    }
    setPhotoProblem(null);
  };

  return (
    <form action={action} encType="multipart/form-data" className="flex flex-col gap-6">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="flex flex-col gap-2">
        <label htmlFor="service-window" className={label}>
          Which window?
        </label>
        {windows.length > 0 ? (
          <select id="service-window" name="windowId" defaultValue={values.windowId ?? ""} className={field}>
            <option value="">Somewhere else</option>
            {windows.map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
          </select>
        ) : null}
        <label htmlFor="service-window-text" className="text-sm text-ink-soft">
          {windows.length > 0
            ? "Somewhere else? Tell us where."
            : "Tell us which window or room."}
        </label>
        <input
          id="service-window-text"
          name="windowText"
          type="text"
          maxLength={WINDOW_TEXT_MAX}
          defaultValue={values.windowText}
          className={field}
        />
        {errors.windowText ? (
          <p role="alert" className="text-sm text-charcoal">{errors.windowText}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="service-issue" className={label}>
          What is happening?
        </label>
        <select id="service-issue" name="issue" defaultValue={values.issue ?? ""} required className={field}>
          <option value="" disabled>
            Choose one
          </option>
          {ISSUES.map((issue) => (
            <option key={issue.value} value={issue.value}>
              {issue.label}
            </option>
          ))}
        </select>
        {errors.issue ? <p role="alert" className="text-sm text-charcoal">{errors.issue}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="service-details" className={label}>
          Anything else we should know? (optional)
        </label>
        <textarea
          id="service-details"
          name="details"
          rows={4}
          maxLength={DETAILS_MAX}
          defaultValue={values.details}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="service-photo" className={label}>
          A photo (optional)
        </label>
        <p className="text-sm text-ink-soft">
          A photo usually means we can bring the right part the first time. One image, up to{" "}
          {PHOTO_MAX_MB} MB.
        </p>
        {/* No `capture`: a customer who already photographed the broken blind should be able to
            pick it from their library, which `capture` overrides into opening the camera on
            several phones. HEIC is named explicitly because an iPhone photo does not always
            match image/* in every browser's file picker. */}
        <input
          id="service-photo"
          name="photo"
          type="file"
          accept="image/*,.heic,.heif"
          onChange={checkPhoto}
          className="text-base"
        />
        {photoProblem ? (
          <p role="alert" className="text-sm text-charcoal">{photoProblem}</p>
        ) : null}
      </div>

      {state.status === "not-found" ? (
        <p role="alert" className="text-sm text-charcoal">
          We could not find that project. Please call us and we will sort it out.
        </p>
      ) : null}

      <Button type="submit" variant="solid" disabled={pending}>
        {pending ? "Sending…" : "Request a service"}
      </Button>
    </form>
  );
}
