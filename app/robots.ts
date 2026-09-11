import type { MetadataRoute } from "next";
import { business } from "@/content/business";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] }],
    sitemap: `${business.domain}/sitemap.xml`,
  };
}
