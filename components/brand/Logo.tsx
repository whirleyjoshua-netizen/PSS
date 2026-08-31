/**
 * The Premier Shade Solutions mark, rebuilt as vector.
 *
 * The supplied brand files are PNGs with baked-in backgrounds, which cannot sit
 * on an ivory page. The mark is pure geometry — four sheared panels of
 * decreasing height, read as hanging shades seen at an angle — so it is
 * reproduced here. Proportions are measured from
 * logofiles/ChatGPT Image Aug 26, 2026, 12_32_40 AM.png.
 *
 * The wordmark is set in the display face rather than traced, so it stays
 * selectable text, scales cleanly, and needs no font outlines.
 */

type Tone = "light" | "dark";
type Variant = "lockup" | "mark" | "wordmark" | "stacked";

/** x = left edge, top = upper-left y, bottom = lower-left y. Shear applied below. */
const PANELS = [
  { x: 0, top: 0, bottom: 100, light: "var(--color-charcoal)", dark: "var(--color-ivory)" },
  { x: 18, top: 12, bottom: 94, light: "var(--color-taupe)", dark: "#B3AAA0" },
  { x: 36, top: 23, bottom: 90, light: "var(--color-champagne)", dark: "var(--color-champagne)" },
  { x: 54, top: 35, bottom: 86, light: "var(--color-sand)", dark: "#8A8377" },
];

const PANEL_WIDTH = 22;
/** Vertical shear across each panel's width — what reads as perspective. */
const SHEAR = 6;
/** The lit edge down the right of each panel, as in the reference artwork. */
const RIM = 2.4;

function Mark({ tone, className }: { tone: Tone; className?: string }) {
  const key = tone === "dark" ? "dark" : "light";

  return (
    <svg
      viewBox="0 0 76 106"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PANELS.map((panel) => {
        const x2 = panel.x + PANEL_WIDTH;
        const rimX = x2 - RIM;
        const rimTop = panel.top + SHEAR - (RIM * SHEAR) / PANEL_WIDTH;
        const rimBottom = panel.bottom + SHEAR - (RIM * SHEAR) / PANEL_WIDTH;

        return (
          <g key={panel.x}>
            <path
              d={[
                `M${panel.x} ${panel.top}`,
                `L${x2} ${panel.top + SHEAR}`,
                `L${x2} ${panel.bottom + SHEAR}`,
                `L${panel.x} ${panel.bottom}`,
                "Z",
              ].join(" ")}
              fill={panel[key]}
            />
            {/* Champagne rim separates each panel from the one behind it and
                keeps the lightest panel visible on an ivory ground. */}
            <path
              d={[
                `M${rimX} ${rimTop}`,
                `L${x2} ${panel.top + SHEAR}`,
                `L${x2} ${panel.bottom + SHEAR}`,
                `L${rimX} ${rimBottom}`,
                "Z",
              ].join(" ")}
              fill={panel.x >= 36 ? "#A8863F" : "var(--color-champagne)"}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function Logo({
  variant = "lockup",
  tone = "light",
  className,
}: {
  variant?: Variant;
  tone?: Tone;
  className?: string;
}) {
  const ink = tone === "dark" ? "text-ivory" : "text-charcoal";
  const accent = tone === "dark" ? "text-champagne" : "text-champagne-ink";
  const rule = tone === "dark" ? "bg-champagne" : "bg-champagne-ink";

  if (variant === "mark") {
    return (
      <span className={className} role="img" aria-label="Premier Shade Solutions">
        <Mark tone={tone} className="h-full w-auto" />
      </span>
    );
  }

  const wordmark = (
    <span className="flex flex-col">
      <span
        className={`font-display font-light leading-none ${ink}`}
        style={{ fontSize: "1em", letterSpacing: "0.24em" }}
      >
        PREMIER
      </span>
      <span className="mt-[0.28em] flex items-center gap-[0.4em]" aria-hidden="true">
        <span className={`h-px w-[0.9em] ${rule} opacity-70`} />
        <span
          className={`font-display leading-none ${accent}`}
          style={{ fontSize: "0.33em", letterSpacing: "0.28em" }}
        >
          SHADE SOLUTIONS
        </span>
        <span className={`h-px flex-1 ${rule} opacity-70`} />
      </span>
    </span>
  );

  if (variant === "wordmark") {
    return (
      <span className={className} role="img" aria-label="Premier Shade Solutions">
        {wordmark}
      </span>
    );
  }

  if (variant === "stacked") {
    return (
      <span
        className={`flex flex-col items-center gap-[0.5em] ${className ?? ""}`}
        role="img"
        aria-label="Premier Shade Solutions"
      >
        <Mark tone={tone} className="h-[2.4em] w-auto" />
        {wordmark}
      </span>
    );
  }

  return (
    <span
      className={`flex items-center gap-[0.5em] ${className ?? ""}`}
      role="img"
      aria-label="Premier Shade Solutions"
    >
      <Mark tone={tone} className="h-[2.05em] w-auto shrink-0" />
      {wordmark}
    </span>
  );
}
