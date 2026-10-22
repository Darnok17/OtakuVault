import { Suspense } from "react";
import { connection } from "next/server";
import { browseTitles, getTypeCounts } from "@/lib/anilist";
import IndexProvider from "./_components/IndexProvider";
import IndexHero from "./_components/IndexHero";
import IndexBrowse, { type BrowseInitial } from "./_components/IndexBrowse";
import { RecommendationsBody, RowSkeleton, SeasonalFallback, SeasonalSection, TrendingRow } from "./_components/sections";

// First page of the browse grid. Not awaited here: the promise streams to the client grid,
// which unwraps it behind its own Suspense boundary.
async function loadInitialBrowse(): Promise<BrowseInitial> {
  await connection();
  const [page, counts] = await Promise.all([browseTitles().catch(() => null), getTypeCounts()]);
  return { page, counts };
}

export default function IndexPage() {
  const initialBrowse = loadInitialBrowse();

  return (
    <section className="site-page active" id="page-index" data-page="index">
      <IndexProvider>
        <IndexHero />

        {/* Seasonal lineup */}
        <Suspense fallback={<SeasonalFallback />}>
          <SeasonalSection />
        </Suspense>

        {/* Trending */}
        <div className="idx-section" data-accent="crimson">
          <div className="idx-section-header">
            <div className="idx-section-title">Trending Now <span className="idx-section-kanji">話題</span></div>
            <div className="idx-section-meta">UPDATED HOURLY</div>
          </div>
          <Suspense fallback={<RowSkeleton />}>
            <TrendingRow />
          </Suspense>
        </div>

        {/* Browse: filters + grid */}
        <IndexBrowse initial={initialBrowse} />

        {/* Because you liked */}
        <div className="idx-section" data-accent="crimson">
          <div className="idx-section-header">
            <div className="idx-section-title">Because You Liked... <span className="idx-section-kanji">類似作品</span></div>
            <div className="idx-section-meta">BASED ON YOUR COLLECTION</div>
          </div>
          <Suspense fallback={<><div className="idx-similar-note">Matching your top-rated titles…</div><RowSkeleton /></>}>
            <RecommendationsBody />
          </Suspense>
        </div>
      </IndexProvider>
    </section>
  );
}
