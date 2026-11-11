import { Suspense } from "react";
import { connection } from "next/server";
import { browseTitles, getTypeCounts } from "@/lib/anilist";
import { filtersFromParams, toUrlParams, type RawSearchParams } from "@/lib/index-filters";
import Link from "next/link";
import { browseHref, trendingSection } from "@/lib/browse-sections";
import type { EntryType } from "@/lib/types";
import IndexBrowse, { BrowseFallback, type BrowseInitial } from "./IndexBrowse";
import { LINEUPS, LineupSection, RecommendationsBody, RowSkeleton, SeasonalFallback, SeasonalSection, TrendingRow } from "./sections";

// The sections below the hero, shared by every Index route. `type` is what a sub-route commits
// to; the All overview leaves it out.

type Copy = { trending: string; browse?: [title: string, kanji: string] };

const ALL_COPY: Copy = { trending: "Trending Now" };
const TYPE_COPY: Record<EntryType, Copy> = {
  anime:   { trending: "Trending Anime",  browse: ["Browse Anime", "アニメ一覧"] },
  manga:   { trending: "Trending",        browse: ["Browse Manga", "漫画一覧"] },
  webtoon: { trending: "Trending",        browse: ["Browse Webtoons", "ウェブトゥーン"] },
  novel:   { trending: "Trending Novels", browse: ["Browse Novels", "小説一覧"] },
};

// First page of the browse grid, for the filters in the URL. Not awaited by the page: the promise
// streams to the client grid, which unwraps it behind its own Suspense boundary.
async function loadInitialBrowse(type: EntryType | undefined, searchParams: Promise<RawSearchParams>): Promise<BrowseInitial> {
  await connection();
  const filters = filtersFromParams(toUrlParams(await searchParams), type);
  const [page, counts] = await Promise.all([browseTitles(filters).catch(() => null), getTypeCounts()]);
  return { page, counts };
}

export default function IndexSections({ type, searchParams }: { type?: EntryType; searchParams: Promise<RawSearchParams> }) {
  const initialBrowse = loadInitialBrowse(type, searchParams);
  const copy = type ? TYPE_COPY[type] : ALL_COPY;

  return (
    <>
      {/* Seasonal lineup, or the type's featured lineup */}
      {type && type !== "anime"
        ? <Suspense fallback={<SeasonalFallback title={LINEUPS[type].title} kanji={LINEUPS[type].kanji} />}><LineupSection type={type} /></Suspense>
        : <Suspense fallback={<SeasonalFallback />}><SeasonalSection /></Suspense>}

      {/* Trending */}
      <div className="idx-section" data-accent="crimson">
        <div className="idx-section-header">
          <div className="idx-section-title">{copy.trending} <span className="idx-section-kanji" data-latin="Trending">話題</span></div>
          <div className="idx-section-side">
            <div className="idx-section-meta">UPDATED HOURLY</div>
            <Link className="ov-see-more" href={browseHref(trendingSection(type))}>See more</Link>
          </div>
        </div>
        <Suspense fallback={<RowSkeleton />}>
          <TrendingRow type={type} />
        </Suspense>
      </div>

      {/* Browse: filters + grid */}
      {copy.browse && (
        <div className="idx-section idx-section-browse" data-accent="teal">
          <div className="idx-section-header">
            <div className="idx-section-title">{copy.browse[0]} <span className="idx-section-kanji" data-latin="❧">{copy.browse[1]}</span></div>
          </div>
        </div>
      )}
      <Suspense fallback={<BrowseFallback />}>
        <IndexBrowse initial={initialBrowse} type={type} />
      </Suspense>

      {/* Because you liked */}
      <div className="idx-section" data-accent="crimson">
        <div className="idx-section-header">
          <div className="idx-section-title">Because You Liked... <span className="idx-section-kanji" data-latin="For you">類似作品</span></div>
          <div className="idx-section-meta">BASED ON YOUR COLLECTION</div>
        </div>
        <Suspense fallback={<><div className="idx-similar-note">Matching your top-rated titles…</div><RowSkeleton /></>}>
          <RecommendationsBody type={type} />
        </Suspense>
      </div>
    </>
  );
}
