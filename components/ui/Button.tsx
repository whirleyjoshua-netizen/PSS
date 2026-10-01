import Link from "next/link";

/**
 * Champagne fills carry charcoal text, never white — champagne on white fails
 * WCAG AA. See the palette note in app/globals.css.
 */
const VARIANTS = {
  primary: "bg-champagne text-charcoal hover:-translate-y-0.5 hover:bg-charcoal hover:text-ivory hover:shadow-lg",
  outline: "border border-charcoal text-charcoal hover:bg-charcoal hover:text-ivory",
  outlineLight: "border border-ivory/40 text-ivory hover:bg-ivory hover:text-charcoal",
  /** Charcoal fill with ivory text; inside .admin-theme this is charcoal on the brand palette. */
  solid: "bg-charcoal text-ivory hover:bg-ink-soft",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 px-6 py-3 font-display text-sm " +
  "font-medium uppercase tracking-[0.14em] transition-[color,background-color,border-color,box-shadow,transform] duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2";

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className ?? ""}`}>
      {children}
    </Link>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`${BASE} ${VARIANTS[variant]} disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
