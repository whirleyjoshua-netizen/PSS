/**
 * The type labels an owner can put on a document. Safe to import from client
 * components: this module imports nothing that reaches the database, so it must
 * stay free of imports that run only on the server. The values match the
 * job_files.doc_type check constraint in db/migrations/016_project_page.sql;
 * changing one without the other fails at write time.
 */
export const DOC_TYPES = [
  { value: "quote", label: "Quote" },
  { value: "po", label: "PO" },
  { value: "invoice", label: "Invoice" },
  { value: "other", label: "Other" },
] as const satisfies readonly { value: string; label: string }[];

export type DocType = (typeof DOC_TYPES)[number]["value"];

export const isDocType = (value: unknown): value is DocType =>
  DOC_TYPES.some((type) => type.value === value);

// Typed from DOC_TYPES, so a type added there without a label here fails typecheck.
const DOC_TYPE_LABELS: { [K in DocType]: Extract<(typeof DOC_TYPES)[number], { value: K }>["label"] } = {
  quote: "Quote",
  po: "PO",
  invoice: "Invoice",
  other: "Other",
};

export const docTypeLabel = (type: DocType): string => DOC_TYPE_LABELS[type];
