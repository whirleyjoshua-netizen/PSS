"use client";

/** Shared field chrome so every input is labelled and styled identically. */

export const CONTROL =
  "w-full min-h-11 border border-rule bg-ivory px-4 py-3 text-charcoal " +
  "placeholder:text-taupe/60 transition-shadow duration-200 focus:border-champagne-ink focus:outline-none " +
  "focus:ring-3 focus:ring-champagne/40";

export function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-display text-xs font-medium uppercase tracking-[0.16em] text-ink-soft"
    >
      {children}
    </label>
  );
}

export function TextField({
  id,
  name,
  label,
  type = "text",
  required,
  autoComplete,
  inputMode,
  placeholder,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "numeric" | "decimal";
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={CONTROL}
      />
    </div>
  );
}

export function SelectField({
  id,
  name,
  label,
  options,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  options: readonly string[];
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} defaultValue={defaultValue} className={CONTROL}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextAreaField({
  id,
  name,
  label,
  rows = 4,
  placeholder,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} name={name} rows={rows} placeholder={placeholder} defaultValue={defaultValue} className={CONTROL} />
    </div>
  );
}

/**
 * Offscreen rather than display:none. A hidden-by-display field is a known
 * tell that bots skip; one positioned out of the viewport still gets filled.
 */
export function Honeypot() {
  return (
    <input
      type="text"
      name="company"
      tabIndex={-1}
      aria-hidden="true"
      autoComplete="off"
      defaultValue=""
      className="absolute left-[-9999px] size-px opacity-0"
    />
  );
}

export function FormMessage({
  state,
  error,
  phone,
  successTitle,
  successBody,
}: {
  state: string;
  error: string | null;
  phone: { display: string; href: string };
  successTitle: string;
  successBody: string;
}) {
  if (state === "success") {
    return (
      <div role="status" className="border border-champagne bg-sand/60 p-5">
        <p className="font-display text-sm uppercase tracking-[0.16em] text-charcoal">
          {successTitle}
        </p>
        <p className="mt-2 text-sm text-ink-soft">{successBody}</p>
      </div>
    );
  }

  if (state === "error" && error) {
    return (
      <div role="alert" className="border border-rule bg-sand/60 p-4 text-sm text-charcoal">
        <p>{error}</p>
        <p className="mt-2">
          You can also reach us at{" "}
          <a href={phone.href} className="underline underline-offset-2">
            {phone.display}
          </a>
          .
        </p>
      </div>
    );
  }

  return null;
}
