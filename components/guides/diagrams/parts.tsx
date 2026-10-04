import { useId } from "react";

/** Every guide diagram shares one 200×200 canvas so parts line up across guides. */
export function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label} className="mx-auto block w-full max-w-[220px]">
      {children}
    </svg>
  );
}

/**
 * The pleated-fabric fill. useId keeps two diagrams on one page from sharing
 * an id; colons and other punctuation are stripped so url(#…) always parses.
 */
export function usePleatId(): string {
  return `pleat-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function PleatPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" className="fill-champagne" />
        <line x1="0" y1="7.5" x2="8" y2="7.5" className="stroke-taupe" strokeOpacity="0.5" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

export function WindowPane() {
  return <rect x="20" y="8" width="160" height="184" className="fill-white stroke-rule" strokeWidth="2" />;
}

export function Headrail({ x, y, width }: { x: number; y: number; width: number }) {
  return <rect x={x} y={y} width={width} height="10" rx="2" className="fill-charcoal" />;
}

export function Wall() {
  return (
    <>
      <line x1="50" y1="6" x2="50" y2="194" className="stroke-taupe" strokeWidth="3" />
      <Label x={14} y={100}>wall</Label>
    </>
  );
}

export function Label({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <text x={x} y={y} className="fill-champagne-ink font-display text-[12px] font-semibold">
      {children}
    </text>
  );
}
