import { Container } from "./Container";

const TONES = {
  ivory: "bg-ivory text-charcoal",
  sand: "bg-sand text-charcoal",
  charcoal: "bg-charcoal text-ivory",
} as const;

export type SectionTone = keyof typeof TONES;

export function Section({
  children,
  tone = "ivory",
  className,
  containerWidth = "default",
  id,
}: {
  children: React.ReactNode;
  tone?: SectionTone;
  className?: string;
  containerWidth?: "default" | "wide" | "prose";
  id?: string;
}) {
  return (
    <section id={id} className={`${TONES[tone]} py-20 md:py-28 ${className ?? ""}`}>
      <Container width={containerWidth}>{children}</Container>
    </section>
  );
}

/** Eyebrow label. Uppercase, tracked, champagne — the recurring section marker. */
export function Eyebrow({
  children,
  tone = "light",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <p
      className={`font-display text-xs font-medium uppercase tracking-[0.22em] ${
        tone === "dark" ? "text-champagne" : "text-champagne-ink"
      }`}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  tone = "light",
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  tone?: "light" | "dark";
  align?: "left" | "center";
}) {
  return (
    <div className={`flex flex-col gap-4 ${align === "center" ? "items-center text-center" : ""}`}>
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2 className="max-w-2xl text-3xl font-light tracking-tight md:text-4xl">{title}</h2>
      {lead ? (
        <p
          className={`max-w-2xl text-lg ${
            tone === "dark" ? "text-sand/80" : "text-ink-soft"
          }`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
