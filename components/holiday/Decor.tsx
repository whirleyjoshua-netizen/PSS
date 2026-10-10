import type { CSSProperties, ReactNode } from "react";

/**
 * The holiday page's decorations: snow, string lights, garland, sparkles, a bow, a gift-tag seal and ornaments.
 * All are decorative (aria-hidden), drawn in code, and animated by the .holiday-* classes in app/globals.css,
 * which reduced motion switches off. Positions come from a seeded generator, so every build draws the same snow.
 */

type Vars = CSSProperties & Record<`--${string}`, string>;

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

export function Snowfall({ count = 44, seed = 7, className = "" }: { count?: number; seed?: number; className?: string }) {
  const random = seeded(seed);
  const flakes = Array.from({ length: count }, () => ({
    left: round(random() * 100),
    size: round(2 + random() * 4.5),
    duration: round(9 + random() * 11),
    delay: round(-random() * 20),
    drift: round((random() - 0.5) * 90),
    opacity: round(0.45 + random() * 0.5),
  }));
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {flakes.map((flake, index) => (
        <span
          key={index}
          className="holiday-flake"
          style={
            {
              left: `${flake.left}%`,
              width: flake.size,
              height: flake.size,
              opacity: flake.opacity,
              "--dur": `${flake.duration}s`,
              "--delay": `${flake.delay}s`,
              "--drift": `${flake.drift}px`,
            } as Vars
          }
        />
      ))}
    </div>
  );
}

const BULBS = ["#E5483F", "#F3C64C", "#47B864", "#FFF8EE", "#5B9BE8"];
const BAUBLES = ["#B3262F", "#D4AF5A", "#1F4D2E", "#B3262F", "#E9D9B0"];

/** Points along a row of scallops, as percentages of a box `height` units tall. */
function scallopPoints(scallops: number, perScallop: number, sag: number, height: number) {
  const width = 100 / scallops;
  const points: { x: number; y: number; index: number }[] = [];
  for (let s = 0; s < scallops; s++) {
    for (let j = 0; j < perScallop; j++) {
      const t = (j + 0.5) / perScallop;
      points.push({ x: round(s * width + t * width), y: round(((2 + 4 * sag * t * (1 - t)) / height) * 100), index: points.length });
    }
  }
  const path = Array.from({ length: scallops }, (_, s) => {
    const x0 = s * width;
    return `Q ${round(x0 + width / 2)} ${2 + 2 * sag} ${round(x0 + width)} 2`;
  }).join(" ");
  return { points, path: `M0 2 ${path}` };
}

/** A wire of twinkling bulbs hung in scallops across the top of a section. */
export function StringLights({ scallops = 4, perScallop = 6, className = "" }: { scallops?: number; perScallop?: number; className?: string }) {
  const { points, path } = scallopPoints(scallops, perScallop, 9, 28);
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-10 sm:h-14 ${className}`}>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={path} fill="none" stroke="#1b1b1b" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} />
      </svg>
      {points.map(({ x, y, index }) => {
        const color = BULBS[index % BULBS.length]!;
        return (
          <span key={index} className="absolute -translate-x-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="mx-auto block h-1.5 w-1.5 bg-[#2a2a2a]" />
            <span
              className="holiday-bulb block h-3.5 w-2.5 rounded-b-full rounded-t-[40%] sm:h-4 sm:w-3"
              style={{ color, background: color, "--dur": `${round(1.2 + (index % 5) * 0.35)}s`, "--delay": `${round((index % 7) * -0.4)}s` } as Vars}
            />
          </span>
        );
      })}
    </div>
  );
}

/** An evergreen garland swag with baubles hanging at each low point; a divider between sections. */
export function Garland({ scallops = 5, className = "" }: { scallops?: number; className?: string }) {
  const { path } = scallopPoints(scallops, 1, 9, 28);
  const lows = Array.from({ length: scallops }, (_, s) => round(((s + 0.5) / scallops) * 100));
  return (
    <div aria-hidden="true" className={`pointer-events-none relative h-14 w-full sm:h-20 ${className}`}>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={path} fill="none" stroke="#173d24" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 14 }} strokeLinecap="round" />
        <path d={path} fill="none" stroke="#2f6b3f" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 9, strokeDasharray: "2 5" }} strokeLinecap="round" />
        <path d={path} fill="none" stroke="#4f8f5c" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 4, strokeDasharray: "1 7" }} strokeLinecap="round" />
        <path d={path} fill="none" stroke="#D4AF5A" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.5, strokeDasharray: "6 4" }} />
      </svg>
      {lows.map((x, index) => (
        <span key={x} className="absolute -translate-x-1/2" style={{ left: `${x}%`, top: "62%" }}>
          <span className="holiday-sway flex flex-col items-center" style={{ "--dur": `${3 + index * 0.4}s`, "--delay": `${index * -0.7}s` } as Vars}>
            <span className="block h-3 w-px bg-[#8a7340]" />
            <Bauble color={BAUBLES[index % BAUBLES.length]!} size={18} />
          </span>
        </span>
      ))}
    </div>
  );
}

function Bauble({ color, size, children }: { color: string; size: number; children?: ReactNode }) {
  return (
    <span className="relative flex flex-col items-center">
      <span className="block h-1.5 rounded-t-sm bg-gradient-to-b from-[#f3dc94] to-[#a8852f]" style={{ width: size * 0.4 }} />
      <span
        className="relative flex items-center justify-center rounded-full shadow-[inset_-4px_-6px_12px_rgb(0_0_0/0.35),0_6px_14px_-6px_rgb(0_0_0/0.5)]"
        style={{ width: size, height: size, background: `radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.75), ${color} 38%, ${color})` }}
      >
        {children}
      </span>
    </span>
  );
}

/** A swinging ornament carrying an icon: the flyer's three promises hang from the garland. */
export function Ornament({ color, delay, children }: { color: string; delay: number; children: ReactNode }) {
  return (
    <span className="holiday-sway flex flex-col items-center" style={{ "--delay": `${delay}s`, "--dur": "3.6s" } as Vars}>
      <span className="block h-8 w-px bg-[#8a7340] sm:h-12" />
      <Bauble color={color} size={68}>
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-holiday-snow stroke-[1.6]">
          {children}
        </svg>
      </Bauble>
    </span>
  );
}

/** Twinkling four-point stars scattered over a section. */
export function Sparkles({ count = 14, seed = 3, className = "" }: { count?: number; seed?: number; className?: string }) {
  const random = seeded(seed);
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {Array.from({ length: count }, (_, index) => {
        const size = round(8 + random() * 14);
        return (
          <svg
            key={index}
            viewBox="0 0 24 24"
            className="holiday-sparkle absolute fill-[#f3dc94]"
            style={{ left: `${round(random() * 96)}%`, top: `${round(random() * 92)}%`, width: size, height: size, "--dur": `${round(2.2 + random() * 3)}s`, "--delay": `${round(-random() * 4)}s` } as Vars}
          >
            <path d="M12 0c.8 6.9 4.3 10.4 12 12-7.7 1.6-11.2 5.1-12 12-.8-6.9-4.3-10.4-12-12C7.7 10.4 11.2 6.9 12 0Z" />
          </svg>
        );
      })}
    </div>
  );
}

/** A red satin bow, for the top of the form card and the gift boxes. */
export function Bow({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 64" className={className}>
      <defs>
        <linearGradient id="holiday-bow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6404a" />
          <stop offset="1" stopColor="#8E1B25" />
        </linearGradient>
      </defs>
      <path d="M56 34 30 62l-4-12-12 2 30-22Z" fill="#7a1720" />
      <path d="M64 34l26 28 4-12 12 2-30-22Z" fill="#7a1720" />
      <path d="M58 28C40 2 8 6 14 26c4 13 26 12 44 4Z" fill="url(#holiday-bow)" />
      <path d="M62 28C80 2 112 6 106 26c-4 13-26 12-44 4Z" fill="url(#holiday-bow)" />
      <path d="M24 20c8-6 20-2 30 6" fill="none" stroke="#f08d93" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M96 20c-8-6-20-2-30 6" fill="none" stroke="#f08d93" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <rect x="50" y="20" width="20" height="18" rx="6" fill="#a8222c" />
    </svg>
  );
}

/** A slowly turning gold starburst with a fixed label: the "10% OFF" gift tag. `className` must position it (relative or absolute). */
export function Seal({ top, bottom, className = "" }: { top: string; bottom: string; className?: string }) {
  const points = Array.from({ length: 48 }, (_, i) => {
    const radius = i % 2 === 0 ? 50 : 44;
    const angle = (Math.PI * 2 * i) / 48;
    return `${round(50 + radius * Math.cos(angle))},${round(50 + radius * Math.sin(angle))}`;
  }).join(" ");
  return (
    <div aria-hidden="true" className={className}>
      <svg viewBox="0 0 100 100" className="holiday-spin absolute inset-0 h-full w-full drop-shadow-[0_10px_18px_rgb(0_0_0/0.35)]">
        <defs>
          <linearGradient id="holiday-seal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3dc94" />
            <stop offset="0.5" stopColor="#c9a24a" />
            <stop offset="1" stopColor="#8a6a24" />
          </linearGradient>
        </defs>
        <polygon points={points} fill="url(#holiday-seal)" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#fff6d8" strokeWidth="0.8" strokeDasharray="2 2" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-[#3b2a07]">
        <span className="holiday-display text-3xl font-black leading-none">{top}</span>
        <span className="mt-1 font-display text-[0.6rem] font-medium uppercase tracking-[0.2em]">{bottom}</span>
      </div>
    </div>
  );
}
