/** How the owners reached a client. Logged on the job page; never a stage. */
export const CONTACT_METHODS = [
  { key: "called", label: "Called" },
  { key: "texted", label: "Texted" },
  { key: "voicemail", label: "Voicemail" },
  { key: "email", label: "Email" },
] as const;

export type ContactMethod = (typeof CONTACT_METHODS)[number]["key"];
export const CONTACT_METHOD_KEYS = CONTACT_METHODS.map((m) => m.key) as [ContactMethod, ...ContactMethod[]];
export const CONTACT_NOTE_MAX = 500;

/** "Contacted · Called, Texted — note". Methods in list order. */
export function contactBody(methods: readonly ContactMethod[], note: string | null): string {
  const labels = CONTACT_METHODS.filter((m) => methods.includes(m.key)).map((m) => m.label).join(", ");
  return `Contacted · ${labels}${note ? ` — ${note}` : ""}`;
}
