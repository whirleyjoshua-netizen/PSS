"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { FINISH_OPTIONS } from "@/lib/leads/finish";
import type { QuestionnaireAnswers, QuestionnaireState } from "@/lib/leads/questionnaire-schema";
import { TREATMENT_TYPES } from "@/lib/leads/treatment-types";
import { WINDOW_EXACT_OPTIONS } from "@/lib/leads/window-count";
import { submitQuestionnaire } from "./actions";

const LEGEND = "font-display text-xs font-medium uppercase tracking-[0.16em] text-ink-soft";
const CHOICE = "flex min-h-11 cursor-pointer items-center gap-3 border border-rule px-4 py-2 text-sm text-charcoal transition-colors hover:border-champagne-ink";
const BOX = "size-4 shrink-0 accent-[var(--color-champagne-ink)]";

export function Questionnaire({ initial, windowRange }: { initial: QuestionnaireAnswers; windowRange: string | null }) {
  const [state, action, pending] = useActionState<QuestionnaireState, FormData>(submitQuestionnaire, {});
  const values = state.values;
  // After any submit, the submitted values are the defaults; before, the saved answers are.
  const text = (name: string, fallback: string) => {
    if (!values) return fallback;
    const value = values[name];
    return typeof value === "string" ? value : "";
  };
  const picked = (name: string, fallback: readonly string[]) => {
    if (!values) return fallback;
    const value = values[name];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  };
  const types = picked("treatmentTypes", initial.treatmentTypes);
  const motorized = values ? values.motorized === "on" : initial.motorized;
  const finish = text("finish", initial.finish ?? "");

  return (
    <section aria-labelledby="questionnaire-heading" className="border border-rule bg-sand/40 p-6 sm:p-8">
      <h2 id="questionnaire-heading" className="font-display text-2xl font-light text-charcoal">Help us come prepared.</h2>
      <p className="mt-1 text-sm text-ink-soft">Optional · about 2 minutes</p>

      <form key={values ? JSON.stringify(values) : "initial"} action={action} className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="q-windows">How many windows?</Label>
          <select id="q-windows" name="windowCountExact" className={CONTROL}
            defaultValue={text("windowCountExact", initial.windowCountExact ? String(initial.windowCountExact) : "")}>
            <option value="">—</option>
            {WINDOW_EXACT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {windowRange ? <p className="text-sm text-ink-soft">You said {windowRange} earlier.</p> : null}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className={LEGEND}>What are you interested in?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TREATMENT_TYPES.map((type) => (
              <label key={type.key} htmlFor={`q-type-${type.key}`} className={CHOICE}>
                <input id={`q-type-${type.key}`} type="checkbox" name="treatmentTypes" value={type.key}
                  defaultChecked={types.includes(type.key)} className={BOX} />
                {type.label}
              </label>
            ))}
          </div>
          <label htmlFor="q-motorized" className={CHOICE}>
            <input id="q-motorized" type="checkbox" name="motorized" defaultChecked={motorized} className={BOX} />
            <span>Motorized <span className="text-ink-soft">(control with a remote or app)</span></span>
          </label>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="q-address">Street address</Label>
          <input id="q-address" name="address" autoComplete="street-address" maxLength={200} className={CONTROL}
            defaultValue={text("address", initial.address ?? "")} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className={LEGEND}>What kind of finish are you picturing?</legend>
          <div className="grid gap-2">
            {FINISH_OPTIONS.map((option) => (
              <label key={option.value} htmlFor={`q-finish-${option.value}`} className={CHOICE}>
                <input id={`q-finish-${option.value}`} type="radio" name="finish" value={option.value}
                  defaultChecked={finish === option.value} className={BOX} />
                <span>
                  {option.label}
                  {option.description ? <>{" "}<span className="text-ink-soft">— {option.description}</span></> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          {state.error ? <p role="alert" className="text-sm text-charcoal">{state.error}</p> : null}
        </div>
      </form>
    </section>
  );
}
