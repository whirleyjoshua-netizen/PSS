import { FIELD_KEYS, TERMS_FIELDS, type FieldKey } from "./fields";

/**
 * Template kinds, in the order the New template menu shows them. These values match the
 * document_templates.kind check in db/migrations/026_documents.sql; change both together.
 */
export const TEMPLATE_KINDS = [
  { value: "terms", label: "Contract terms", group: "terms" },
  { value: "service_agreement", label: "Service agreement", group: "client" },
  { value: "change_order", label: "Change order", group: "client" },
  { value: "other", label: "Other document", group: "client" },
  { value: "guide_install", label: "Getting ready for your install", group: "guide" },
  { value: "guide_care", label: "Caring for your shades", group: "guide" },
] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number]["value"];
export type ClientDocKind = "service_agreement" | "change_order" | "other";
export type SingletonKind = "terms" | "guide_install" | "guide_care";
export type TemplateGroup = "terms" | "client" | "guide";

export const CLIENT_DOC_KINDS: readonly ClientDocKind[] = ["service_agreement", "change_order", "other"];
/** At most one live template of each (the unique partial index in migration 026). Always response 'view'. */
export const SINGLETON_KINDS: readonly SingletonKind[] = ["terms", "guide_install", "guide_care"];

export const TEMPLATE_GROUPS: readonly { value: TemplateGroup; label: string }[] = [
  { value: "terms", label: "Contract terms" },
  { value: "client", label: "Client documents" },
  { value: "guide", label: "Portal guides" },
];

export const isTemplateKind = (value: unknown): value is TemplateKind =>
  TEMPLATE_KINDS.some((kind) => kind.value === value);
export const isClientDocKind = (value: unknown): value is ClientDocKind =>
  (CLIENT_DOC_KINDS as readonly unknown[]).includes(value);
export const isSingletonKind = (value: unknown): value is SingletonKind =>
  (SINGLETON_KINDS as readonly unknown[]).includes(value);

export const templateKindLabel = (kind: TemplateKind): string => TEMPLATE_KINDS.find((k) => k.value === kind)!.label;
export const templateGroup = (kind: TemplateKind): TemplateGroup => TEMPLATE_KINDS.find((k) => k.value === kind)!.group;

export const DOC_RESPONSES = [
  { value: "sign", label: "Sign" },
  { value: "acknowledge", label: "Acknowledge" },
  { value: "view", label: "View" },
] as const;

export type DocResponse = (typeof DOC_RESPONSES)[number]["value"];
export const isDocResponse = (value: unknown): value is DocResponse => DOC_RESPONSES.some((r) => r.value === value);
export const docResponseLabel = (response: DocResponse): string => DOC_RESPONSES.find((r) => r.value === response)!.label;

export type DocStatus = "draft" | "sent" | "completed" | "void";

/** Terms: only contract-time fields. Guides: none (the same for every client). Client documents: all. */
export function allowedFields(kind: TemplateKind): readonly FieldKey[] {
  if (kind === "terms") return TERMS_FIELDS;
  if (kind === "guide_install" || kind === "guide_care") return [];
  return FIELD_KEYS;
}
