import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/site";

// Only the real domain is indexable; local, preview and staging builds ask crawlers to stay out.
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/settings", "/notifications", "/collection", "/profile/edit", "/store/cart", "/store/checkout",
        // Filtered/sorted/paginated index views: endless combinations, each a dynamic render with
        // database reads. Crawlers hammering them used up the Neon compute quota (Nov 2026).
        "/index-page?", "/index-page/*?"],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
