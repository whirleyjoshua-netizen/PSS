import { isFieldKey, markerPattern } from "./fields";
import { allowedFields, isDocResponse, isSingletonKind, isTemplateKind, templateKindLabel } from "./kinds";

export const NAME_MAX = 120;
export const BODY_MAX = 100_000;

/** Raw form values: every field is a string, and none is trusted. */
export type TemplateInput = { name: string; kind: string; response: string; body: string };

/** Everything that stops a template being saved (spec §5), in the order the form shows them. */
export function templateErrors(input: TemplateInput): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push("Give the template a name.");
  else if (name.length > NAME_MAX) errors.push(`Name must be ${NAME_MAX} characters or fewer.`);
  if (!isTemplateKind(input.kind)) errors.push("Choose what kind of template this is.");
  if (!isDocResponse(input.response)) errors.push("Choose how the client responds: sign, acknowledge or view.");
  else if (isSingletonKind(input.kind) && input.response !== "view") errors.push("Contract terms and portal guides are view only.");
  if (!input.body.trim()) errors.push("The template is empty.");
  else if (input.body.length > BODY_MAX) errors.push("The template is too long.");
  if (isTemplateKind(input.kind)) {
    const allowed = allowedFields(input.kind);
    // The parser reads line by line, so a marker split across lines renders as literal text
    // while remainingMarkers still counts it: refuse it here, where the owner can see why.
    for (const match of input.body.matchAll(markerPattern())) {
      const key = match[1].trim();
      if (/[\r\n]/.test(match[1])) errors.push(`Field {{${key}}} must be on one line.`);
      else if (!isFieldKey(key)) errors.push(`Unknown field {{${key}}}.`);
      else if (!allowed.includes(key)) errors.push(`{{${key}}} can't be used in ${templateKindLabel(input.kind)}.`);
    }
  }
  return [...new Set(errors)];
}
