"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { DocText } from "@/components/docs/DocText";
import { insertText, prefixLines, wrapBold, type EditState } from "@/lib/docs/edit";
import { FIELDS, type FieldKey } from "@/lib/docs/fields";
import { parseDocText, remainingMarkers, unknownFields } from "@/lib/docs/parse";

const TOOL = "inline-flex min-h-11 items-center border border-rule px-3 text-sm hover:border-charcoal";

/**
 * The simple formatted editor (spec §5): a text area with a toolbar that writes doc text, and a
 * live preview from the same parser as the PDF. It sits inside the caller's form: the text area
 * posts as `name`. Preview PDF posts the current text to /admin/documents/preview in a new tab.
 */
export function DocEditor({ name, label, defaultValue, mode, allowedFields = [], titleField, previewExtras = {}, onChange }: {
  name: string;
  label: string;
  defaultValue: string;
  mode: "template" | "document";
  allowedFields?: readonly FieldKey[];
  /** The enclosing form's input whose value titles the preview PDF. */
  titleField: string;
  previewExtras?: Record<string, string>;
  onChange?: (value: string) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number } | null>(null);
  const [value, setValue] = useState(defaultValue);

  useLayoutEffect(() => {
    const selection = pending.current;
    if (!selection || !area.current) return;
    pending.current = null;
    area.current.focus();
    area.current.setSelectionRange(selection.start, selection.end);
  }, [value]);

  const change = (next: string) => {
    setValue(next);
    onChange?.(next);
  };
  const current = (): EditState => ({
    text: value,
    start: area.current?.selectionStart ?? value.length,
    end: area.current?.selectionEnd ?? value.length,
  });
  const apply = (next: EditState) => {
    pending.current = { start: next.start, end: next.end };
    change(next.text);
  };

  const openPdf = (button: HTMLButtonElement) => {
    const titleInput = button.form?.elements.namedItem(titleField);
    const title = titleInput instanceof HTMLInputElement ? titleInput.value : "";
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/admin/documents/preview";
    form.target = "_blank";
    for (const [key, v] of Object.entries({ ...previewExtras, title, body: value })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = v;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
    form.remove();
  };

  const problems = mode === "template" ? unknownFields(value, allowedFields).map((key) => `{{${key}}} can't be used here.`) : [];
  const markers = mode === "document" ? remainingMarkers(value) : [];
  const offered = FIELDS.filter((field) => allowedFields.includes(field.key));

  return (
    <div className="flex flex-col gap-3">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-2">
        <button type="button" className={TOOL} onClick={() => apply(prefixLines(current(), "## "))}>Heading</button>
        <button type="button" className={TOOL} onClick={() => apply(prefixLines(current(), "### "))}>Subheading</button>
        <button type="button" className={`${TOOL} font-semibold`} onClick={() => apply(wrapBold(current()))}>Bold</button>
        <button type="button" className={TOOL} onClick={() => apply(prefixLines(current(), "- "))}>Bullet</button>
        {mode === "template" && offered.length > 0 ? (
          <select
            aria-label="Insert field"
            value=""
            className="min-h-11 border border-rule px-2 text-sm"
            onChange={(event) => {
              if (event.target.value) apply(insertText(current(), `{{${event.target.value}}}`));
            }}
          >
            <option value="">Insert field…</option>
            {offered.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
          </select>
        ) : null}
        <button type="button" className={TOOL} onClick={(event) => openPdf(event.currentTarget)}>Preview PDF</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          ref={area}
          name={name}
          aria-label={label}
          value={value}
          onChange={(event) => change(event.target.value)}
          rows={20}
          className="min-h-80 w-full border border-rule bg-ivory p-3 font-mono text-sm"
        />
        <section aria-label="Preview" className="min-h-40 overflow-x-auto border border-rule bg-ivory p-4">
          {value.trim() ? <DocText blocks={parseDocText(value)} highlightFields /> : <p className="text-sm text-ink-soft">The preview appears here.</p>}
        </section>
      </div>
      {problems.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-overdue">
          {problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      ) : null}
      {markers.length > 0 ? <p className="text-sm text-overdue">Replace before sending: {markers.join(", ")}</p> : null}
    </div>
  );
}
