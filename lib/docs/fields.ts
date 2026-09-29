/**
 * The fill-in fields of spec §3, in the order the editor offers them. No imports: this runs in the
 * browser (the editor) as well as on the server. Unknown keys are rejected everywhere.
 */
export const FIELDS = [
  { key: "client_name", label: "Client name" },
  { key: "client_first_name", label: "Client first name" },
  { key: "client_email", label: "Client email" },
  { key: "client_phone", label: "Client phone" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "project_no", label: "Project number (PSS-####)" },
  { key: "today", label: "Today's date" },
  { key: "contract_total", label: "Contract total" },
  { key: "deposit", label: "Deposit" },
  { key: "balance_due", label: "Balance due" },
  { key: "install_date", label: "Install date" },
  { key: "company_name", label: "Company name" },
  { key: "company_phone", label: "Company phone" },
  { key: "company_email", label: "Company email" },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];

export const FIELD_KEYS: readonly FieldKey[] = FIELDS.map((field) => field.key);

export const isFieldKey = (value: unknown): value is FieldKey =>
  typeof value === "string" && (FIELD_KEYS as readonly string[]).includes(value);

export const fieldLabel = (key: FieldKey): string => FIELDS.find((field) => field.key === key)!.label;

/** Terms are printed inside every contract, so they may use only what exists at contract time. */
export const TERMS_FIELDS: readonly FieldKey[] = [
  "client_name", "project_no", "today", "company_name", "company_phone", "company_email",
];

/**
 * One marker: `{{`, anything but braces, `}}`. Capture 1 is the key, untrimmed. The same source is
 * bound into SQL (`body !~ $n`) by lib/docs/job-documents.ts, so the app and the database agree on
 * what "a marker remains" means. Postgres's regex dialect reads it identically.
 */
export const MARKER_SOURCE = "\\{\\{([^{}]*)\\}\\}";

/** A fresh global regex each call: a shared `g` regex carries lastIndex between uses. */
export const markerPattern = (): RegExp => new RegExp(MARKER_SOURCE, "g");
