/**
 * The Premier Shade Solutions mark, rebuilt as vector.
 *
 * The supplied brand files are PNGs with baked-in backgrounds, which cannot sit
 * on an ivory page. The mark is pure geometry — four sheared panels of
 * decreasing height, read as hanging shades seen at an angle — so it is
 * reproduced here, from lib/brand/logo-geometry.ts — the same geometry the
 * print master (public/brand/logo-master.pdf) is drawn from.
 *
 * The wordmark is set in the display face rather than traced, so it stays
 * selectable text, scales cleanly, and needs no font outlines.
 */

import { LOCKUP, MARK_VIEWBOX, PANELS, panelPoints, pathData, rimColor, rimPoints, type Tone } from "@/lib/brand/logo-geometry";

type Variant = "lockup" | "mark" | "wordmark" | "stacked";

function Mark({ tone, className }: { tone: Tone; className?: string }) {
  const key = tone === "dark" ? "dark" : "light";

  return (
    <svg
      viewBox={`0 0 ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PANELS.map((panel) => (
        <g key={panel.x}>
          <path d={pathData(panelPoints(panel))} fill={panel[key]} />
          <path d={pathData(rimPoints(panel))} fill={rimColor(panel, "css")} />
        </g>
      ))}
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
        style={{ fontSize: "1em", letterSpacing: `${LOCKUP.premierTracking}em` }}
      >
        PREMIER
      </span>
      <span className="mt-[0.28em] flex items-center gap-[0.4em]" aria-hidden="true">
        <span className={`h-px w-[0.9em] ${rule} opacity-80`} />
        <span
          className={`font-display leading-none ${accent}`}
          style={{ fontSize: `${LOCKUP.subSize}em`, letterSpacing: `${LOCKUP.subTracking}em` }}
        >
          SHADE SOLUTIONS
        </span>
        <span className={`h-px flex-1 ${rule} opacity-80`} />
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
