"use client";

import { useState, useTransition } from "react";
import { displayName } from "@/lib/admin/task-rules";
import { formatWhen } from "@/lib/admin/time";
import { formatBytes, groupResources, NAME_MAX, type Resource } from "@/lib/admin/resource-rules";
import { deleteResourceAction, recategorizeResourceAction, renameResourceAction, type ResourceResult } from "./actions";

const BUTTON = "min-h-11 px-3 text-sm underline underline-offset-4";
const INPUT = "min-h-11 border border-rule bg-white px-3 text-sm";

type Mode = "view" | "rename" | "move" | "delete";

function Row({ file, categories }: { file: Resource; categories: string[] }) {
  const [mode, setMode] = useState<Mode>("view");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ResourceResult>) =>
    start(async () => {
      let result: ResourceResult;
      try {
        result = await action();
      } catch {
        result = { error: "That didn't save. Try again." };
      }
      if ("error" in result) setError(result.error);
      else { setError(null); setMode("view"); }
    });
  const open = (next: Mode, initial = "") => { setMode(next); setValue(initial); setError(null); };

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a href={`/admin/resources/${file.id}`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4 break-all">{file.name}</a>
        <span className="text-sm text-ink-soft">{formatBytes(file.sizeBytes)} · {displayName(file.uploadedBy)} · {formatWhen(file.createdAt)}</span>
      </div>
      {/* Keyed by mode, so each mounts fresh: React would otherwise reuse the view's buttons and skip autoFocus. */}
      {mode === "view" ? (
        <div key="view" className="flex flex-wrap gap-1">
          <button type="button" className={BUTTON} aria-label={`Rename ${file.name}`} onClick={() => open("rename", file.name)}>Rename</button>
          <button type="button" className={BUTTON} aria-label={`Move ${file.name}`} onClick={() => open("move", file.category)}>Move</button>
          <button type="button" className={BUTTON} aria-label={`Delete ${file.name}`} onClick={() => open("delete")}>Delete</button>
        </div>
      ) : mode === "delete" ? (
        <div key="delete" className="flex flex-wrap items-center gap-2 text-sm">
          <span>{`Delete ${file.name}? This can't be undone.`}</span>
          <button type="button" autoFocus disabled={pending} className={`${BUTTON} text-red-700`} onClick={() => run(() => deleteResourceAction(file.id))}>Yes, delete</button>
          <button type="button" disabled={pending} className={BUTTON} onClick={() => setMode("view")}>No</button>
        </div>
      ) : (
        <form key={mode} className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          run(() => (mode === "rename" ? renameResourceAction(file.id, value) : recategorizeResourceAction(file.id, value)));
        }}>
          <label className="flex flex-col gap-1 text-sm">
            {mode === "rename" ? "New name" : "Category"}
            {mode === "rename"
              ? <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={INPUT} maxLength={NAME_MAX} />
              : (
                <select autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={INPUT}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
          </label>
          <button type="submit" disabled={pending} className="min-h-11 bg-charcoal px-4 text-sm text-ivory disabled:opacity-40">Save</button>
          <button type="button" disabled={pending} className={BUTTON} onClick={() => setMode("view")}>Cancel</button>
        </form>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </li>
  );
}

/**
 * The library by category, with a search over names and categories (spec Part B3). `categories` is
 * categoryChoices(): Move offers them, and every one but an empty Uncategorized is listed, empty ones too.
 */
export function ResourceList({ resources, categories }: { resources: Resource[]; categories: string[] }) {
  const [query, setQuery] = useState("");
  if (resources.length === 0) {
    return <p className="text-sm text-ink-soft">No files yet. Upload price sheets, spec books, certificates — anything you want on hand.</p>;
  }
  const groups = groupResources(resources, query, categories);
  return (
    <div className="flex flex-col gap-6">
      <input type="search" aria-label="Search files" placeholder="Search files" value={query}
        onChange={(e) => setQuery(e.target.value)} className={`${INPUT} max-w-sm`} />
      {groups.length === 0 ? <p className="text-sm text-ink-soft">No files match.</p> : groups.map((group, i) => (
        <section key={group.category} aria-labelledby={`resource-group-${i}`} className="flex flex-col gap-2">
          <h2 id={`resource-group-${i}`} className="text-lg font-semibold">{`${group.category} (${group.files.length})`}</h2>
          {group.files.length === 0 ? <p className="text-sm text-ink-soft">No files yet.</p> : (
            <ul className="flex flex-col divide-y divide-rule border border-rule">
              {group.files.map((file) => <Row key={file.id} file={file} categories={categories} />)}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
