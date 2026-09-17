"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  DETAILS_MAX,
  ISSUES,
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
        <input
          id="service-photo"
          name="photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="text-base"
        />
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
