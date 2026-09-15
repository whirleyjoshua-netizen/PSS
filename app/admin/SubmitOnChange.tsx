"use client";

/** A stage dropdown that submits its form when changed. The form's own button covers no-JS. */
export function SubmitOnChange({ id, name, defaultValue, children }: {
  id: string;
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="min-h-11 rounded-lg border border-rule bg-ivory px-3 text-sm"
    >
      {children}
    </select>
  );
}
