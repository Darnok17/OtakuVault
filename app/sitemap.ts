import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Static public pages. Later: products and public forum threads from the database.
const PATHS = ["/", "/index-page", "/forum", "/store", "/store/categories", "/terms", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "daily" }));
}
