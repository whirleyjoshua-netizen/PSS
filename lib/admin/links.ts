/** The board URL, keeping the lost toggle and optionally opening a job's panel. */
export function boardHref({ lost, job }: { lost: boolean; job?: string | null }): string {
  const params = new URLSearchParams();
  if (lost) params.set("lost", "1");
  if (job) params.set("job", job);
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `/admin?${query}` : "/admin";
}

export const mapsHref = (address: string | null, city: string): string =>
  `https://maps.google.com/?q=${encodeURIComponent([address, city, "NV"].filter(Boolean).join(", "))}`;
