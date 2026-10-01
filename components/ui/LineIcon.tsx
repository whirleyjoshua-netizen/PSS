import type { HighlightIcon } from "@/content/products";

/** 24×24 stroke paths, drawn in the same weight as the header's icons. */
export const ICON_PATHS: Record<HighlightIcon, string[]> = {
  sun: ["M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  droplet: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  window: ["M4 3h16v18H4z", "M12 3v18M4 12h16"],
  leaf: ["M5 19c0-8 6-14 15-14 0 9-6 15-14 15", "M5 19l7-7"],
  home: ["M3 11l9-7 9 7", "M5 10v10h14V10", "M10 20v-5h4v5"],
  ruler: ["M3 17L17 3l4 4L7 21z", "M7 13l2 2M10 10l2 2M13 7l2 2"],
  shield: ["M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"],
  thermometer: ["M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"],
  sofa: ["M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3", "M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z", "M5 18v2M19 18v2"],
  phone: ["M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M11 18h2"],
  clock: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M12 7v5l3 2"],
  battery: ["M3 7h15a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z", "M22 11v2M6 10v4M10 10v4"],
  "arrow-up": ["M12 20V4", "M5 11l7-7 7 7"],
};

/** A decorative line icon; the label beside it carries the meaning. */
export function LineIcon({ name, className }: { name: HighlightIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`fill-none stroke-champagne-ink stroke-[1.5] ${className ?? ""}`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
