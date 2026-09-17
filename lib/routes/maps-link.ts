type Point = { lat: number; lng: number };

/** Google Maps turn-by-turn for the whole day, stops in order. */
export function mapsDirectionsUrl(points: Point[]): string | null {
  if (!points.length) return null;
  return `https://www.google.com/maps/dir/${points.map((p) => `${p.lat},${p.lng}`).join("/")}`;
}

/** Google silently drops points past this many in one directions link. */
export const MAPS_POINTS_PER_LINK = 10;

/** Directions links of at most 10 points each; every part starts at the previous part's last stop. */
export function mapsDirectionsUrls(points: Point[]): string[] {
  if (!points.length) return [];
  const urls: string[] = [];
  for (let start = 0; ; start += MAPS_POINTS_PER_LINK - 1) {
    urls.push(mapsDirectionsUrl(points.slice(start, start + MAPS_POINTS_PER_LINK))!);
    if (start + MAPS_POINTS_PER_LINK >= points.length) return urls;
  }
}
