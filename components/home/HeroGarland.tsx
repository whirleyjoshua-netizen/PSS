import type { CSSProperties } from "react";

const SWAGS = 20; // 20 × 160px covers a 3200px-wide screen; the rest is clipped.
const LIGHTS = [
  { x: 30, y: 18 },
  { x: 60, y: 21 },
  { x: 90, y: 18 },
];
const COLORS = ["var(--color-holiday-red)", "var(--color-champagne)", "var(--color-holiday-snow)"];

/**
 * An evergreen garland swagged along the hero's bottom edge, with a bow at each hook and slowly twinkling lights in
 * the holiday strip's colours (owner, 2026-10-09). Twinkle lives in globals.css ("Hero snow").
 */
export function HeroGarland() {
  return (
    <div
      aria-hidden="true"
      data-holiday-decor
      data-holiday-garland
      className="pointer-events-none absolute inset-x-0 bottom-0 flex overflow-hidden"
    >
      {Array.from({ length: SWAGS }, (_, swag) => (
        <svg key={swag} viewBox="0 0 120 30" className="h-10 w-40 shrink-0 overflow-visible">
          <path d="M0 4 Q60 34 120 4" fill="none" stroke="var(--color-holiday-green)" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M0 4 Q60 34 120 4"
            fill="none"
            stroke="var(--color-charcoal)"
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeDasharray="2 4"
          />
          {LIGHTS.map((light, j) => {
            const n = swag * LIGHTS.length + j;
            return (
              <g key={j}>
                <rect x={light.x - 1.5} y={light.y - 2} width="3" height="3" fill="var(--color-champagne)" />
                <circle
                  className="garland-light"
                  cx={light.x}
                  cy={light.y + 3.5}
                  r="3.2"
                  fill={COLORS[n % COLORS.length]}
                  style={{ "--delay": `${-((n * 0.7) % 2.4).toFixed(1)}s` } as CSSProperties}
                />
              </g>
            );
          })}
          <g fill="var(--color-holiday-red)">
            <path d="M0 4 -7 0v8Z M0 4 7 0v8Z" />
            <circle cx="0" cy="4" r="2" />
          </g>
        </svg>
      ))}
    </div>
  );
}
