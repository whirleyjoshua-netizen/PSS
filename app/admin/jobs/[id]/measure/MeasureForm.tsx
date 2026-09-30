"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { FormState } from "@/app/admin/jobs/actions";
import { removeFile, saveMeasurement } from "@/app/admin/jobs/measure-actions";
import { postFile, resizePhoto } from "@/lib/admin/client-upload";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { EIGHTH_OPTIONS, MAX_QUANTITY, REQUIREMENTS, ROOMS, splitEighths } from "@/lib/admin/measure-units";

const CONTROL = "min-h-12 w-full border border-rule bg-ivory px-3 text-base";

function Dimension({ name, label, value }: { name: "width" | "height" | "depth"; label: string; value: number | null }) {
  const parts = value === null ? null : splitEighths(value);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <label className="sr-only" htmlFor={`${name}In`}>{label} inches</label>
        <input id={`${name}In`} name={`${name}In`} type="number" inputMode="numeric" min={0} max={600}
          placeholder="inches" defaultValue={parts?.inches ?? ""} className={CONTROL} />
        <label className="sr-only" htmlFor={`${name}Eighth`}>{label} eighths</label>
        <select id={`${name}Eighth`} name={`${name}Eighth`} defaultValue={parts?.eighth ?? 0} className={CONTROL}>
          {EIGHTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

/**
 * How many identical windows this line stands for. The buttons are for a thumb on site; the box
 * still takes a typed number, and the server is the one that refuses anything out of range.
 */
function Quantity({ value }: { value: number }) {
  const [quantity, setQuantity] = useState(String(value));
  // Reads the box the way the server does: digits only, and blank means 1.
  const step = (by: number) =>
    setQuantity((current) => {
      const now = /^\d+$/.test(current.trim()) ? Number(current) : 1;
      return String(Math.min(MAX_QUANTITY, Math.max(1, now + by)));
    });
  const stepper = "min-h-12 w-12 shrink-0 border border-rule text-xl";
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="quantity" className="text-sm font-semibold">Quantity (identical windows)</label>
      <div className="flex gap-2">
        <button type="button" aria-label="One fewer" onClick={() => step(-1)} className={stepper}>−</button>
        <input id="quantity" name="quantity" type="number" inputMode="numeric" min={1} max={MAX_QUANTITY} required
          value={quantity} onChange={(e) => setQuantity(e.target.value)}
          onBlur={() => setQuantity((current) => (current.trim() === "" ? "1" : current))}
          className={`${CONTROL} text-center`} />
        <button type="button" aria-label="One more" onClick={() => step(1)} className={stepper}>+</button>
      </div>
    </div>
  );
}

/**
 * One window at a time. Submits through a transition rather than a form
 * action, so a failed save never resets what was typed on the phone.
 */
export function MeasureForm({ jobId, window, defaultRoom }: {
  jobId: string;
  window: WindowMeasurement | null;
  defaultRoom: string;
}) {
  const router = useRouter();
  const [room, setRoom] = useState(window?.room ?? defaultRoom);
  const [state, setState] = useState<FormState & { saved?: number }>({});
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();
  // Remembers the last uploaded photo so a retry after a failed save (same
  // file still selected) reuses its id instead of uploading it again.
  const uploadedPhoto = useRef<{ file: File; id: string } | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("room", room);
    // Read the selected file from the input directly rather than through the
    // FormData entry: some environments hand back an empty File from
    // FormData(form) for a file input, while input.files always holds the
    // real selection.
    const photo = event.currentTarget.querySelector<HTMLInputElement>('input[name="photo"]')?.files?.[0] ?? null;
    data.delete("photo");

    startTransition(async () => {
      if (photo instanceof File && photo.size > 0) {
        if (uploadedPhoto.current && uploadedPhoto.current.file === photo) {
          data.set("photoFileId", uploadedPhoto.current.id);
        } else {
          if (uploadedPhoto.current) {
            // A different photo was uploaded on an earlier failed save.
            // It would otherwise be orphaned (Files only lists documents,
            // so the owner has no way to see or remove it).
            void removeFile(jobId, uploadedPhoto.current.id);
            uploadedPhoto.current = null;
          }
          const uploaded = await resizePhoto(photo)
            .then((blob) => postFile(jobId, blob, photo.name.replace(/\.\w+$/, "") + ".jpg", "photo"))
            .catch((error: Error) => ({ error: error.message }));
          if ("error" in uploaded) {
            setState({ error: uploaded.error });
            return;
          }
          uploadedPhoto.current = { file: photo, id: uploaded.id };
          data.set("photoFileId", uploaded.id);
        }
      }

      const result = await saveMeasurement(jobId, window?.id ?? null, data);
      if (result.error) {
        setState(result);
        return;
      }
      if (window) {
        router.push(`/admin/jobs/${jobId}?tab=measurements`);
        return;
      }
      uploadedPhoto.current = null;
      setState({ saved: Date.now() });
      setFormKey((key) => key + 1); // a fresh form, keeping the room
      router.refresh(); // updates the "N windows so far" count above the form
    });
  }

  return (
    <form key={formKey} onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="room" className="text-sm font-semibold">Room</label>
        <div className="flex flex-wrap gap-2">
          {ROOMS.map((option) => (
            <button key={option} type="button" onClick={() => setRoom(option)} aria-pressed={room === option}
              className={`min-h-11 border px-3 text-sm ${room === option ? "border-charcoal bg-charcoal text-ivory" : "border-rule"}`}>
              {option}
            </button>
          ))}
        </div>
        <input id="room" name="room" value={room} onChange={(e) => setRoom(e.target.value)}
          placeholder="Or type a room" className={CONTROL} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="label" className="text-sm font-semibold">Window label (optional)</label>
        <input id="label" name="label" defaultValue={window?.label ?? ""} placeholder="e.g. Left of fireplace" className={CONTROL} />
      </div>

      <Quantity value={window?.quantity ?? 1} />

      <Dimension name="width" label="Width" value={window?.widthEighths ?? null} />
      <Dimension name="height" label="Height" value={window?.heightEighths ?? null} />
      <Dimension name="depth" label="Depth (optional)" value={window?.depthEighths ?? null} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Mount</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["inside", "outside"] as const).map((mount) => (
            <label key={mount} className="flex min-h-12 items-center gap-2 border border-rule px-3">
              <input type="radio" name="mount" value={mount} defaultChecked={window?.mount === mount} />
              {mount === "inside" ? "Inside" : "Outside"}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Special requirements</legend>
        <div className="flex flex-wrap gap-2">
          {REQUIREMENTS.map((req) => (
            <label key={req.value} className="flex min-h-12 items-center gap-2 border border-rule px-3">
              <input type="checkbox" name="requirements" value={req.value}
                defaultChecked={window?.requirements.includes(req.value)} />
              {req.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-sm font-semibold">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={window?.notes ?? ""} className="w-full border border-rule bg-ivory p-3 text-base" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="photo" className="text-sm font-semibold">
          Photo {window?.photoFileId ? "(replaces the current one)" : "(optional)"}
        </label>
        <input id="photo" name="photo" type="file" accept="image/*" capture="environment" className="text-base" />
      </div>

      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-ink-soft">Saved. Next window.</p> : null}

      <Button type="submit" variant="solid" disabled={pending} className="w-full">
        {pending ? "Saving…" : window ? "Save window" : "Save and next window"}
      </Button>
    </form>
  );
}
