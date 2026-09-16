import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";

export type GeocodeResult = { status: "ok"; lat: number; lng: number } | { status: "not_found" } | { status: "error" };

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

export const geocodeQuery = (address: string, city: string): string => `${address.trim()}, ${city.trim()}, NV`;

export async function geocodeAddress(address: string | null, city: string): Promise<GeocodeResult> {
  if (!address?.trim()) return { status: "not_found" };
  const key = process.env.GOOGLE_GEOCODING_KEY;
  if (!key) {
    console.error("Geocoding skipped: GOOGLE_GEOCODING_KEY is not set");
    return { status: "error" };
  }
  const url = new URL(ENDPOINT);
  url.searchParams.set("address", geocodeQuery(address, city));
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const body = (await response.json()) as { status: string; results?: { geometry: { location: { lat: number; lng: number } } }[] };
    if (body.status === "OK" && body.results?.[0]) {
      const { lat, lng } = body.results[0].geometry.location;
      return { status: "ok", lat, lng };
    }
    if (body.status === "ZERO_RESULTS") return { status: "not_found" };
    console.error("Geocoding failed", body.status);
    return { status: "error" };
  } catch (error) {
    console.error("Geocoding failed", error);
    return { status: "error" };
  }
}

/** Looks the job's address up and stores only coordinates. Runs inside after(), so it never throws. */
export async function geocodeLead(id: string): Promise<void> {
  if (!isUuid(id)) return;
  try {
    const [lead] = await db()`select address, city from leads where id = ${id}`;
    if (!lead) return;
    const result = await geocodeAddress(lead.address as string | null, lead.city as string);
    const lat = result.status === "ok" ? result.lat : null;
    const lng = result.status === "ok" ? result.lng : null;
    await db()`update leads set lat = ${lat}, lng = ${lng}, geocode_status = ${result.status}, geocoded_at = now()
      where id = ${id} and address is not distinct from ${lead.address}::text and city is not distinct from ${lead.city}::text`;
  } catch (error) {
    console.error("Could not geocode job", id, error);
  }
}
