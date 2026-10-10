import type { CSSProperties } from "react";
import { Snowflake } from "@/components/ui/Snowflake";

/** A fixed pseudo-random value in [0, 1) for flake `i` and stream `seed`, so every render draws the same sky. */
const pick = (i: number, seed: number) => {
  const x = Math.sin((i + 1) * seed) * 10_000;
  return x - Math.floor(x);
};
const round = (n: number) => Math.round(n * 100) / 100;

const FLAKES = Array.from({ length: 44 }, (_, i) => ({
  left: round(pick(i, 12.9898) * 100),
  size: round(3 + pick(i, 78.233) * 6),
  fall: round(10 + pick(i, 39.425) * 10),
  delay: round(-pick(i, 93.989) * 20),
  // Where the flake rests when the visitor asks for reduced motion: a still snowfall instead of none.
  rest: round(5 + pick(i, 23.14) * 85),
  opacity: round(0.45 + pick(i, 57.31) * 0.45),
  sway: round(6 + pick(i, 11.7) * 14),
}));

/**
 * Snow falling over the hero photo (owner, 2026-10-09). It sits under the hero's content, so it drifts behind the
 * headline and the form rather than across them. Pure CSS (globals.css, "Hero snow"); every other flake is skipped
 * on phones.
 */
export function HeroSnow() {
  return (
    <div
      aria-hidden="true"
      data-holiday-decor
      data-holiday-snow
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {FLAKES.map((flake, i) => (
        <span
          key={i}
          className={`hero-snow-fall absolute top-0 h-full ${i % 2 ? "hidden sm:block" : ""}`}
          style={
            {
              left: `${flake.left}%`,
              "--fall": `${flake.fall}s`,
              "--delay": `${flake.delay}s`,
              "--rest": `${flake.rest}%`,
            } as CSSProperties
          }
        >
          {/* Every fifth flake is a crystal, twice the size of a dot of snow. */}
          {i % 5 === 0 ? (
            <span
              className="hero-snow-flake block text-holiday-snow"
              style={{ opacity: flake.opacity, "--sway": `${flake.sway}px` } as CSSProperties}
            >
              <Snowflake className="block" size={flake.size * 2} />
            </span>
          ) : (
            <span
              className="hero-snow-flake block rounded-full bg-holiday-snow shadow-[0_0_6px_var(--color-holiday-snow)]"
              style={
                {
                  width: `${flake.size}px`,
                  height: `${flake.size}px`,
                  opacity: flake.opacity,
                  "--sway": `${flake.sway}px`,
                } as CSSProperties
              }
            />
          )}
        </span>
      ))}
    </div>
  );
}
