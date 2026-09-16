/** The board URL: keeps the search and the job list's filter. */
export function boardHref({ q, list }: { q?: string | null; list?: string | null }): string {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (list) params.set("list", list);
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `/admin?${query}` : "/admin";
}

export const mapsHref = (address: string | null, city: string): string =>
  `https://maps.google.com/?q=${encodeURIComponent([address, city, "NV"].filter(Boolean).join(", "))}`;
