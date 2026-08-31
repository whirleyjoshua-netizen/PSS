import { cities, type City } from "@/content/cities";

/** "North Las Vegas" -> "north-las-vegas" */
export const citySlug = (city: string): string =>
  city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "North Las Vegas" -> "/service-area/north-las-vegas" */
export const cityPath = (city: string): string => `/service-area/${citySlug(city)}`;

export const getCity = (slug: string): City | undefined =>
  cities.find((city) => city.slug === slug);

export const allCityPaths = (): { city: string }[] =>
  cities.map((city) => ({ city: city.slug }));
