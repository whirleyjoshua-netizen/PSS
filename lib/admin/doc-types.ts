/**
 * The type labels an owner can put on a document. Safe to import from client
 * components: this module imports nothing that reaches the database, so it must
 * stay free of imports that run only on the server. These values plus
 * DEALER_COPY match the job_files.doc_type check constraint last defined in
 * db/migrations/024_dc_quote_import.sql; changing one without the other fails
 * at write time. The migration lists the values in the order they were added to
 * the database; the order here is the order an owner sees in the menu.
 */
export const DOC_TYPES = [
  { value: "quote", label: "Quote" },
  { value: "po", label: "PO" },
  { value: "invoice", label: "Invoice" },
  { value: "contract", label: "Contract" },
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
  contract: "Contract",
  other: "Other",
};

export const docTypeLabel = (type: DocType): string => DOC_TYPE_LABELS[type];

/**
 * Set only by the Direct Connect import, never by an owner: the menu (DOC_TYPES) never offers it,
 * setDocType refuses it, and the database refuses to share it (job_files_dealer_copy_never_shared).
 */
export const DEALER_COPY = "dealer_copy" as const;
export type StoredDocType = DocType | typeof DEALER_COPY;

export const storedDocTypeLabel = (type: StoredDocType): string =>
  type === DEALER_COPY ? "Dealer copy (internal)" : docTypeLabel(type);
