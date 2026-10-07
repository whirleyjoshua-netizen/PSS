"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { RESOURCE_MAX_BYTES, resourcePathname, UNCATEGORIZED } from "@/lib/admin/resource-rules";
import { saveResourceAction } from "./actions";

type Item = { key: string; name: string; percent: number; status: "uploading" | "saved" | "failed"; message?: string };

const TOO_BIG = "Files must be 200 MB or smaller.";
const FAILED = "Upload failed. Check your connection and try again.";
const EMPTY = "That file is empty.";
const NOT_SAVED = "The file couldn't be saved. Try again.";

/**
 * Picks files and sends each straight to private storage (spec Part B2), so big spec books never
 * pass through a function, then records it under the chosen category. `categories` is categoryChoices():
 * the select starts on General when there is one, else the first.
 */
export function ResourceUploader({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [picked, setCategory] = useState<string | null>(null);
  // A category deleted since it was picked falls back to the default, so the select never shows one that's gone.
  const category = picked && categories.includes(picked) ? picked : categories.includes("General") ? "General" : categories[0] ?? UNCATEGORIZED;
  const [items, setItems] = useState<Item[]>([]);
  const update = (key: string, change: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));

  async function send(file: File, chosen: string) {
    const key = crypto.randomUUID();
    if (file.size < 1 || file.size > RESOURCE_MAX_BYTES) {
      setItems((all) => [...all, { key, name: file.name, percent: 0, status: "failed", message: file.size < 1 ? EMPTY : TOO_BIG }]);
      return;
    }
    setItems((all) => [...all, { key, name: file.name, percent: 0, status: "uploading" }]);
    const pathname = resourcePathname(key, file.name);
    try {
      await upload(pathname, file, {
        access: "private", handleUploadUrl: "/admin/resources/upload", multipart: true,
        onUploadProgress: ({ percentage }) => update(key, { percent: Math.round(percentage) }),
      });
    } catch {
      update(key, { status: "failed", message: FAILED });
      return;
    }
    try {
      const result = await saveResourceAction({ pathname, name: file.name, category: chosen });
      update(key, "error" in result ? { status: "failed", message: result.error } : { status: "saved", percent: 100 });
    } catch {
      update(key, { status: "failed", message: NOT_SAVED });
    }
  }

  async function pick(files: File[]) {
    // Each file settles on its own: one failure never stops the others or the refresh.
    await Promise.allSettled(files.map((file) => send(file, category)));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-11 border border-rule bg-white px-3">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center border border-charcoal px-4 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-champagne-ink">
          Choose files
          <input type="file" multiple className="sr-only" aria-label="Choose files"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length > 0) void pick(files);
            }} />
        </label>
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
                  {item.status === "uploading" ? `${item.percent}%` : item.status === "saved" ? "Saved" : item.message}
                </span>
              </div>
              {item.status === "uploading" ? <progress max={100} value={item.percent} className="h-1 w-full" aria-label={`Uploading ${item.name}`} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      </div>
    </div>
  );
}
