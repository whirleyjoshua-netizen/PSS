/** One colour per installer, as literal hex for map pins and lines (not Tailwind classes). */
export const ROUTE_COLORS: readonly string[] = ["#8a6d3b", "#2f5d62", "#7a3e48", "#4a5a2f", "#3d4f7a", "#6b4e7a"];

export const routeColor = (index: number): string =>
  ROUTE_COLORS[((index % ROUTE_COLORS.length) + ROUTE_COLORS.length) % ROUTE_COLORS.length];
