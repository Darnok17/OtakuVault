import Link from "next/link";
import { connection } from "next/server";
import { browseTitles, getSeasonalLineup, getTrendingNow } from "@/lib/anilist";
import { getRecommendationsAction, type Recommendations } from "@/app/actions/anilist";
import { DEFAULT_FILTERS, SEASON_INFO, badgeFor, glyphFor, hueFor, hueToVar, lengthFor, seasonOf, titleHref, type BrowseFilters, type Title } from "@/lib/anilist-shared";
import type { EntryType } from "@/lib/types";
import { RecRow } from "./posters";

// Server-rendered Index sections. Each one streams in behind its own <Suspense> in IndexSections.
// Sections take the route's type; without one they show every type.

const UNREACHABLE = "> AniList is unreachable right now — try again in a moment.";

/* ---------- Seasonal lineup ---------- */

function SeasonalCard({ t }: { t: Title }) {
  const art = t.banner ?? t.cover;
  const eps = t.episodes ? `${t.episodes} eps` : t.status === "NOT_YET_RELEASED" ? "upcoming" : "ongoing";
  // Only anime has seasons; print runs show their start year and chapter/volume count instead.
  const sub = t.kind === "ANIME"
    ? `${t.season ? SEASON_INFO[t.season].label : ""} ${t.seasonYear} · ${eps}`
    : [t.startYear, lengthFor(t).label || eps].filter(Boolean).join(" · ");
  return (
    <div className="idx-seasonal-card" style={{ "--card-accent": `var(--${hueToVar(hueFor(t))})` } as React.CSSProperties}>
      <Link className="td-card-link" href={titleHref(t.entryType, t.anilistId)} aria-label={t.title} />
      {/* A background image (not <img>) so art that fails to load leaves the glyph card, not a broken icon. */}
      {art && <div className="idx-seasonal-img" style={{ backgroundImage: `url(${JSON.stringify(art)})` }} aria-hidden="true" />}
      <div className="idx-seasonal-glyph">{glyphFor(t)}</div>
      <div className="idx-seasonal-info">
        <span className="idx-seasonal-badge">{badgeFor(t)}</span>
        <div className="idx-seasonal-title">{t.title}</div>
        <div className="idx-seasonal-sub">{sub}</div>
      </div>
    </div>
  );
}

export async function SeasonalSection() {
  await connection(); // the current season depends on today's date
  const { year, season } = seasonOf(new Date());
  const info = SEASON_INFO[season];
  const page = await getSeasonalLineup(year, season).catch(() => null);
  return (
    <div className="idx-section" data-accent="violet">
      <div className="idx-section-header">
        <div className="idx-section-title">{info.label} {year} Season <span className="idx-section-kanji">{info.kanji}</span></div>
        <div className="idx-section-meta">{info.months} {year}{page ? ` · ${page.total} TITLES` : ""}</div>
      </div>
      <FeaturedRail items={page?.items} />
    </div>
  );
}

function FeaturedRail({ items }: { items?: Title[] }) {
  if (!items) return <div className="idx-similar-note">{UNREACHABLE}</div>;
  return (
    <RecRow accent="violet" scrollClassName="idx-seasonal-track">
      {items.map((t) => <SeasonalCard key={t.anilistId} t={t} />)}
    </RecRow>
  );
}

/* ---------- Featured lineup (the seasonal slot on print types, which have no seasons) ---------- */

type LineupType = Exclude<EntryType, "anime">;

// AniList tracks neither translation dates nor a weekly release feed, so the webtoon and novel
// lineups are the newest titles still releasing.
export const LINEUPS: Record<LineupType, { title: string; kanji: string; meta: string; filters: Partial<BrowseFilters> }> = {
  manga:   { title: "Hot Ongoing Manga",      kanji: "連載中", meta: "ONGOING", filters: { statuses: ["RELEASING"], sort: "popularity" } },
  webtoon: { title: "New Webtoons This Week", kanji: "新着",   meta: "NEWEST",  filters: { statuses: ["RELEASING"], sort: "newest" } },
  novel:   { title: "Recently Translated",    kanji: "新訳",   meta: "NEWEST",  filters: { statuses: ["RELEASING"], sort: "newest" } },
};

export async function LineupSection({ type }: { type: LineupType }) {
  await connection();
  const { title, kanji, meta, filters } = LINEUPS[type];
  const page = await browseTitles({ ...DEFAULT_FILTERS, ...filters, types: [type] }).catch(() => null);
  return (
    <div className="idx-section" data-accent="violet">
      <div className="idx-section-header">
        <div className="idx-section-title">{title} <span className="idx-section-kanji">{kanji}</span></div>
        <div className="idx-section-meta">{meta}{page ? ` · ${page.total} TITLES` : ""}</div>
      </div>
      <FeaturedRail items={page?.items} />
    </div>
  );
}

export function SeasonalFallback({ title = "This Season", kanji = "今期アニメ" }: { title?: string; kanji?: string }) {
  return (
    <div className="idx-section" data-accent="violet">
      <div className="idx-section-header">
        <div className="idx-section-title">{title} <span className="idx-section-kanji">{kanji}</span></div>
        <div className="idx-section-meta">LOADING…</div>
      </div>
      <div className="idx-seasonal-track" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="idx-seasonal-card idx-seasonal-skeleton" aria-hidden="true" />)}
      </div>
    </div>
  );
}

/* ---------- Trending ---------- */

export async function TrendingRow({ type }: { type?: EntryType }) {
  await connection();
  const page = await getTrendingNow(type).catch(() => null);
  return page ? <RecRow items={page.items} accent="crimson" /> : <div className="idx-similar-note">{UNREACHABLE}</div>;
}

export function RowSkeleton() {
  return (
    <div className="rec-row" data-accent="crimson" aria-busy="true">
      <div className="rec-row-track">
        <div className="rec-row-scroll">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rec-poster rec-poster-skeleton" aria-hidden="true"><div className="rec-poster-cover" /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Because You Liked... ---------- */

const RATE_NOUN: Record<EntryType, string> = { anime: "anime", manga: "manga", webtoon: "webtoons", novel: "novels" };

export async function RecommendationsBody({ type }: { type?: EntryType }) {
  await connection();
  const recs: Recommendations | null = await getRecommendationsAction(type).catch(() => null);

  if (recs?.status === "ok" && recs.items.length) {
    return <>
      <div className="idx-similar-note">
        Recommendations drawn from your <strong>top-rated titles</strong> — {recs.basis.join(" · ")}. Add more entries to Your Collection to sharpen the match.
      </div>
      <RecRow items={recs.items} accent="crimson" />
    </>;
  }

  // No personal signal yet: explain how to get one, and show all-time favorites meanwhile.
  const fallback = await browseTitles(type ? { ...DEFAULT_FILTERS, types: [type] } : DEFAULT_FILTERS).catch(() => null);
  const note =
    !recs ? <>{UNREACHABLE}</> :
    recs.status === "signin" ? <>Log in and rate a few titles to get recommendations drawn from your <strong>top-rated titles</strong>. Until then, the all-time favorites:</> :
    <>Rate a few {type ? RATE_NOUN[type] : "entries"} in Your Collection to get recommendations drawn from your <strong>top-rated titles</strong>. Until then, the all-time favorites:</>;
  return <>
    <div className="idx-similar-note">{note}</div>
    {recs && fallback && <RecRow items={fallback.items.slice(0, 12)} accent="crimson" />}
  </>;
}
