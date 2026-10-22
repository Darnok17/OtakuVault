import { connection } from "next/server";
import { browseTitles, getSeasonalLineup, getTrendingNow } from "@/lib/anilist";
import { getRecommendationsAction, type Recommendations } from "@/app/actions/anilist";
import { SEASON_INFO, badgeFor, glyphFor, hueFor, hueToVar, seasonOf, type Title } from "@/lib/anilist-shared";
import { RecRow } from "./posters";

// Server-rendered Index sections. Each one streams in behind its own <Suspense> in page.tsx.

const UNREACHABLE = "> AniList is unreachable right now — try again in a moment.";

/* ---------- Seasonal lineup ---------- */

function SeasonalCard({ t }: { t: Title }) {
  const art = t.banner ?? t.cover;
  const eps = t.episodes ? `${t.episodes} eps` : t.status === "NOT_YET_RELEASED" ? "upcoming" : "ongoing";
  return (
    <div className="idx-seasonal-card" style={{ "--card-accent": `var(--${hueToVar(hueFor(t))})` } as React.CSSProperties} role="button" tabIndex={0}>
      {/* A background image (not <img>) so art that fails to load leaves the glyph card, not a broken icon. */}
      {art && <div className="idx-seasonal-img" style={{ backgroundImage: `url(${JSON.stringify(art)})` }} aria-hidden="true" />}
      <div className="idx-seasonal-glyph">{glyphFor(t)}</div>
      <div className="idx-seasonal-info">
        <span className="idx-seasonal-badge">{badgeFor(t)}</span>
        <div className="idx-seasonal-title">{t.title}</div>
        <div className="idx-seasonal-sub">{t.season ? SEASON_INFO[t.season].label : ""} {t.seasonYear} · {eps}</div>
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
      {page
        ? <div className="idx-seasonal-track">{page.items.map((t) => <SeasonalCard key={t.anilistId} t={t} />)}</div>
        : <div className="idx-similar-note">{UNREACHABLE}</div>}
    </div>
  );
}

export function SeasonalFallback() {
  return (
    <div className="idx-section" data-accent="violet">
      <div className="idx-section-header">
        <div className="idx-section-title">This Season <span className="idx-section-kanji">今期アニメ</span></div>
        <div className="idx-section-meta">LOADING…</div>
      </div>
      <div className="idx-seasonal-track" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="idx-seasonal-card idx-seasonal-skeleton" aria-hidden="true" />)}
      </div>
    </div>
  );
}

/* ---------- Trending ---------- */

export async function TrendingRow() {
  await connection();
  const page = await getTrendingNow().catch(() => null);
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

export async function RecommendationsBody() {
  await connection();
  const recs: Recommendations | null = await getRecommendationsAction().catch(() => null);

  if (recs?.status === "ok" && recs.items.length) {
    return <>
      <div className="idx-similar-note">
        Recommendations drawn from your <strong>top-rated titles</strong> — {recs.basis.join(" · ")}. Add more entries to Your Collection to sharpen the match.
      </div>
      <RecRow items={recs.items} accent="crimson" />
    </>;
  }

  // No personal signal yet: explain how to get one, and show all-time favorites meanwhile.
  const fallback = await browseTitles().catch(() => null);
  const note =
    !recs ? <>{UNREACHABLE}</> :
    recs.status === "signin" ? <>Log in and rate a few titles to get recommendations drawn from your <strong>top-rated titles</strong>. Until then, the all-time favorites:</> :
    <>Rate a few entries in Your Collection to get recommendations drawn from your <strong>top-rated titles</strong>. Until then, the all-time favorites:</>;
  return <>
    <div className="idx-similar-note">{note}</div>
    {recs && fallback && <RecRow items={fallback.items.slice(0, 12)} accent="crimson" />}
  </>;
}
