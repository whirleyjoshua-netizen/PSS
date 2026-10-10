/** Decoration only: the holiday strip's and the hero's snowflake. Colour comes from `currentColor`. */
export function Snowflake({ className = "", size }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width={size} height={size} className={`shrink-0 ${className}`}>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M10 1v18M2.2 5.5l15.6 9M2.2 14.5l15.6-9" />
        <path d="M7.5 2.8 10 5l2.5-2.2M7.5 17.2 10 15l2.5 2.2" />
      </g>
    </svg>
  );
}
