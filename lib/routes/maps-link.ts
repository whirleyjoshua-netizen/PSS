/** Google Maps turn-by-turn for the whole day, stops in order. */
export function mapsDirectionsUrl(points: { lat: number; lng: number }[]): string | null {
  if (!points.length) return null;
  return `https://www.google.com/maps/dir/${points.map((p) => `${p.lat},${p.lng}`).join("/")}`;
}
