/** Small stroke icons for the admin. Decorative only: every control keeps a text label. */
const PATHS = {
  jobs: "M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16",
  plus: "M12 5v14M5 12h14",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .3-1.3-1.3.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L6 7.3 4 7l-1 3 2 1v2l-2 1 1 3 2-.3 1.3 1.3-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .3 1-3-2-1z",
  signout: "M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 16l4-4-4-4M14 12H4",
  search: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4.5-4.5",
  pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  chevron: "M9 6l6 6-6 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  lead: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M17 13a6 6 0 0 1 4 6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  calendar: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
  document: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  folder: "M3 6h6l2 2h10v11H3zM3 10h18",
  cart: "M4 5h2l2 10h10l2-7H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  box: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  ruler: "M3 14l7-7 7 7-7 7zM8 9l2 2M11 6l2 2M14 9l2 2",
  pen: "M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3",
  wrench: "M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z",
  check: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 12.5l2.5 2.5 4.5-5",
  lost: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9 9l6 6M15 9l-6 6",
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-4"}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
