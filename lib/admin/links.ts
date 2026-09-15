/** The board URL: keeps the search and the job list's filter, and optionally opens a job's panel. */
export function boardHref({ q, list, job }: { q?: string | null; list?: string | null; job?: string | null }): string {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (list) params.set("list", list);
  if (job) params.set("job", job);
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `/admin?${query}` : "/admin";
}

export const mapsHref = (address: string | null, city: string): string =>
  `https://maps.google.com/?q=${encodeURIComponent([address, city, "NV"].filter(Boolean).join(", "))}`;
