"use server";

import { browseTitles, getSeasonalPage, getTrendingPage } from "@/lib/anilist";
import { DEFAULT_FILTERS, type TitlePage } from "@/lib/anilist-shared";
import { BROWSE_MAX_PAGE, BROWSE_SECTIONS, isBrowseSectionId, parseSeasonSlug, type BrowseSection } from "@/lib/browse-sections";

// One page (24 titles) of a "See more" section. A public endpoint that can trigger an AniList
// request, so the section id, page and season are all validated first. Returns null when
// AniList can't be reached, so the page can say so instead of crashing.
export async function loadBrowsePage(sectionId: string, page: number, param?: string): Promise<TitlePage | null> {
  if (!isBrowseSectionId(sectionId)) throw new Error("Unknown section");
  if (!Number.isInteger(page) || page < 1 || page > BROWSE_MAX_PAGE) throw new Error("Invalid page");
  const { source }: BrowseSection = BROWSE_SECTIONS[sectionId];
  try {
    if (source.kind === "trending") return await getTrendingPage(source.type, page);
    if (source.kind === "seasonal") {
      const parsed = typeof param === "string" ? parseSeasonSlug(param) : null;
      if (!parsed) throw new Error("Invalid season");
      return await getSeasonalPage(parsed.year, parsed.season, page);
    }
    return await browseTitles({ ...DEFAULT_FILTERS, ...source.filters, types: [source.type] }, page);
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid season") throw err;
    return null;
  }
}
