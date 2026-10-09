"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { RESOURCE_MAX_BYTES } from "@/lib/admin/resource-rules";
import { taskFilePathname, type PendingUpload, type ResourceOption } from "@/lib/admin/task-file-rules";

type Item = { key: string; name: string; percent: number; status: "uploading" | "failed"; message?: string };

const TOO_BIG = "Files must be 200 MB or smaller.";
const EMPTY = "That file is empty.";
const FAILED = "Upload failed. Check your connection and try again.";
const NOT_SAVED = "The file couldn't be saved. Try again.";
const CONTROL = "inline-flex min-h-11 cursor-pointer items-center border border-charcoal px-4 text-sm";

/**
 * Upload files and Add from Resources, for one task (spec: docs/superpowers/specs/2026-10-09-task-files-design.md).
 * Each file goes straight to private storage under the task, then `onUploaded` records it (or holds it, on the
 * new-task form) and answers an error to show, or null. A file that's done leaves this list: the caller lists it.
 * `onBusyChange` hears whether any upload is still running.
 */
export function FilePicker({ taskId, resources, attachedResourceIds, onUploaded, onPickResource, onBusyChange, idPrefix }: {
  taskId: string;
  resources: ResourceOption[];
  attachedResourceIds: string[];
  onUploaded: (upload: PendingUpload) => Promise<string | null>;
  onPickResource: (resource: ResourceOption) => Promise<string | null>;
  onBusyChange?: (busy: boolean) => void;
  idPrefix: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState("");
  const [pickError, setPickError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const update = (key: string, change: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));
  const busy = items.some((item) => item.status === "uploading");
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  async function send(file: File) {
    // The file's own id: its folder in storage and, once recorded, its row.
    const key = crypto.randomUUID();
    if (file.size < 1 || file.size > RESOURCE_MAX_BYTES) {
      setItems((all) => [...all, { key, name: file.name, percent: 0, status: "failed", message: file.size < 1 ? EMPTY : TOO_BIG }]);
      return;
    }
    setItems((all) => [...all, { key, name: file.name, percent: 0, status: "uploading" }]);
    const pathname = taskFilePathname(taskId, key, file.name);
    try {
      await upload(pathname, file, {
        access: "private", handleUploadUrl: "/admin/tasks/upload", multipart: true,
        onUploadProgress: ({ percentage }) => update(key, { percent: Math.round(percentage) }),
      });
    } catch {
      update(key, { status: "failed", message: FAILED });
      return;
    }
    let error: string | null;
    try {
      error = await onUploaded({ pathname, name: file.name });
    } catch {
      error = NOT_SAVED;
    }
    if (error) update(key, { status: "failed", message: error });
    else setItems((all) => all.filter((i) => i.key !== key));
  }

  async function pick(resource: ResourceOption) {
    setPicking(resource.id);
    let error: string | null;
    try {
      error = await onPickResource(resource);
    } catch {
      error = "That didn't save. Try again.";
    }
    setPicking(null);
    setPickError(error);
  }

  const q = query.trim().toLowerCase();
  const shown = q ? resources.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)) : resources;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <label className={`${CONTROL} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-champagne-ink`}>
          Upload files
          <input type="file" multiple className="sr-only" aria-label="Upload files"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              // Each file settles on its own: one failure never stops the others.
              for (const file of files) void send(file);
            }} />
        </label>
        <button type="button" className={CONTROL} aria-expanded={browsing} aria-controls={`${idPrefix}-resources`}
          onClick={() => { setBrowsing(!browsing); setPickError(null); }}>
          Add from Resources
        </button>
      </div>
      <p className="text-sm text-ink-soft">Any file, up to 200 MB each. PDFs and photos open in the browser; other files download.</p>
      <div aria-live="polite">
        {items.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {items.map((item) => (
              <li key={item.key} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{item.name}</span>
                  <span className={item.status === "failed" ? "text-red-700" : ""}>
                    {item.status === "uploading" ? `${item.percent}%` : item.message}
                  </span>
                </div>
                {item.status === "uploading"
                  ? <progress max={100} value={item.percent} className="h-1 w-full" aria-label={`Uploading ${item.name}`} />
                  : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {browsing ? (
        <div id={`${idPrefix}-resources`} className="flex flex-col gap-2 border border-rule p-3">
          {resources.length === 0 ? (
            <p className="text-sm text-ink-soft">Resources has no files yet.</p>
          ) : (
            <>
              <input type="search" aria-label="Search Resources" placeholder="Search Resources" value={query}
                onChange={(e) => setQuery(e.target.value)} className="min-h-11 max-w-sm border border-rule bg-white px-3 text-sm" />
              {shown.length === 0 ? <p className="text-sm text-ink-soft">No files match.</p> : (
                <ul className="flex max-h-72 flex-col divide-y divide-rule overflow-y-auto">
                  {shown.map((resource) => {
                    const attached = attachedResourceIds.includes(resource.id);
                    return (
                      <li key={resource.id} className="flex items-center justify-between gap-3 py-1 text-sm">
                        <span className="break-all">
                          {resource.name} <span className="text-ink-soft">· {resource.category}</span>
                        </span>
                        <button type="button" disabled={attached || picking !== null} aria-label={`Attach ${resource.name}`}
                          className="min-h-11 shrink-0 px-3 underline underline-offset-4 disabled:no-underline disabled:opacity-60"
                          onClick={() => void pick(resource)}>
                          {attached ? "Attached" : picking === resource.id ? "Attaching…" : "Attach"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
          {pickError ? <p role="alert" className="text-sm text-red-700">{pickError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
