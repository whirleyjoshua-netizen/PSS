"use client";

import { useState, useTransition } from "react";
import { CATEGORY_MAX, shownCategories, UNCATEGORIZED, type Category } from "@/lib/admin/resource-rules";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction, type ResourceResult } from "./actions";

const BUTTON = "min-h-11 px-3 text-sm underline underline-offset-4";
const INPUT = "min-h-11 border border-rule bg-white px-3 text-sm";
const SAVE = "min-h-11 bg-charcoal px-4 text-sm text-ivory disabled:opacity-40";

/** Runs an action, answering its error (or a generic one when it throws) and null on success. */
async function attempt(action: () => Promise<ResourceResult>): Promise<string | null> {
  try {
    const result = await action();
    return "error" in result ? result.error : null;
  } catch {
    return "That didn't save. Try again.";
  }
}

const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;

function Row({ category }: { category: Category }) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ResourceResult>) => start(async () => {
    const failed = await attempt(action);
    setError(failed);
    if (!failed) setMode("view");
  });
  const fixed = category.name === UNCATEGORIZED;

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold break-all">{category.name}</span>
        <span className="text-sm text-ink-soft">{files(category.fileCount)}</span>
      </div>
      {mode === "view" ? (
        fixed ? <p className="text-sm text-ink-soft">Files from deleted categories land here.</p> : (
          <div key="view" className="flex flex-wrap gap-1">
            <button type="button" className={BUTTON} aria-label={`Rename category ${category.name}`}
              onClick={() => { setMode("rename"); setValue(category.name); setError(null); }}>Rename</button>
            <button type="button" className={BUTTON} aria-label={`Delete category ${category.name}`}
              onClick={() => { setMode("delete"); setError(null); }}>Delete</button>
          </div>
        )
      ) : mode === "delete" ? (
        <div key="delete" className="flex flex-wrap items-center gap-2 text-sm">
          <span>{category.fileCount > 0
            ? `Delete ${category.name}? Its ${files(category.fileCount)} move to ${UNCATEGORIZED}.`
            : `Delete ${category.name}?`}</span>
          <button type="button" autoFocus disabled={pending} className={`${BUTTON} text-red-700`}
            onClick={() => run(() => deleteCategoryAction(category.name))}>Yes, delete</button>
          <button type="button" disabled={pending} className={BUTTON} onClick={() => setMode("view")}>No</button>
        </div>
      ) : (
        <form key="rename" className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); run(() => renameCategoryAction(category.name, value)); }}>
          <label className="flex flex-col gap-1 text-sm">
            New name
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={CATEGORY_MAX} className={INPUT} />
          </label>
          <button type="submit" disabled={pending} className={SAVE}>Save</button>
          <button type="button" disabled={pending} className={BUTTON} onClick={() => setMode("view")}>Cancel</button>
        </form>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </li>
  );
}

/** Add, rename and delete categories (spec 2026-10-07). Uncategorized is listed only while it holds files. */
export function CategoryManager({ categories }: { categories: Category[] }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = shownCategories(categories);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Categories</h2>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const failed = await attempt(() => addCategoryAction(name));
          setError(failed);
          if (!failed) setName("");
        });
      }}>
        <label className="flex flex-col gap-1 text-sm">
          New category
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={CATEGORY_MAX} className={INPUT} />
        </label>
        <button type="submit" disabled={pending} className={SAVE}>Add category</button>
      </form>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {shown.length > 0 ? (
        <ul aria-label="Categories" className="flex flex-col divide-y divide-rule border border-rule">
          {shown.map((c) => <Row key={c.name} category={c} />)}
        </ul>
      ) : <p className="text-sm text-ink-soft">No categories yet. Add one to start filing.</p>}
    </div>
  );
}
