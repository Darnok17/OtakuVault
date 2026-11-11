import Link from "next/link";
import { connection } from "next/server";
import { getTitleById, getTitleDetails, getTrendingNow } from "@/lib/anilist";
import { glyphFor, hueFor, hueToVar, titleHref, type Title } from "@/lib/anilist-shared";
import HomeBoard from "./HomeBoard";

// Real AniList data for the home page's feature sections. Each of these streams in behind its
// own <Suspense> (see app/page.tsx), so the page shell is static and AniList being slow or down
// only costs the artwork, never the page.

// Attack on Titan, Jujutsu Kaisen, Demon Slayer, One Piece.
const TRACK_IDS = [16498, 113415, 101922, 21];
const TRACK_STARS = [5, 5, 4, 5];
const ONE_PIECE = 21;

const accentOf = (t: Title) => `var(--${hueToVar(hueFor(t))})`;
const bg = (url: string | null | undefined) => (url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined);

/* ---------- 01 Track ---------- */

function TrackGrid({ titles }: { titles: (Title | null)[] }) {
  return (
    <div className="demo-grid demo-grid-real">
      {titles.map((t, i) => t ? (
        <Link key={t.anilistId} href={titleHref(t.entryType, t.anilistId)} className="demo-card" style={{ "--c": accentOf(t) } as React.CSSProperties} aria-label={t.title}>
          <div className="demo-cover">{glyphFor(t)}</div>
          <div className="demo-art" style={bg(t.cover)} aria-hidden="true" />
          <div className="demo-rank">#{i + 1}</div>
          <div className="demo-name">{t.title}</div>
          <div className="demo-stars">{Array.from({ length: TRACK_STARS[i] }, (_, s) => <span key={s} />)}</div>
        </Link>
      ) : (
        <div key={i} className="demo-card" style={{ "--c": "var(--anime)" } as React.CSSProperties}><div className="demo-cover">—</div></div>
      ))}
    </div>
  );
}

export async function TrackTiles() {
  await connection();
  const titles = await Promise.all(TRACK_IDS.map((id) => getTitleById(id).catch(() => null)));
  return <TrackGrid titles={titles} />;
}

export function TrackFallback() {
  return (
    <div className="demo-grid demo-grid-real" aria-busy="true">
      {["進", "呪", "鬼", "海"].map((g, i) => (
        <div key={g} className="demo-card" style={{ "--c": ["var(--anime)", "var(--manga)", "var(--webtoon)", "var(--gold)"][i] } as React.CSSProperties}>
          <div className="demo-cover">{g}</div><div className="demo-rank">#{i + 1}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 02 Moodboards ---------- */

export async function BoardData() {
  await connection();
  const [title, details] = await Promise.all([
    getTitleById(ONE_PIECE).catch(() => null),
    getTitleDetails(ONE_PIECE, "anime").catch(() => null),
  ]);
  const cast = details?.status === "ok" ? details.details.characters : [];
  const luffy = cast.find((c) => /luffy/i.test(c.name)) ?? null;
  return <HomeBoard cover={title?.cover ?? null} portrait={luffy?.image ?? null} href={titleHref("anime", ONE_PIECE)} />;
}

export function BoardFallback() {
  return <HomeBoard cover={null} portrait={null} href={titleHref("anime", ONE_PIECE)} />;
}

/* ---------- 03 Discover ---------- */

const FAN_SIZE = 7;

export async function DiscoverFan() {
  await connection();
  const page = await getTrendingNow().catch(() => null);
  const titles = (page?.items ?? []).filter((t) => t.cover).slice(0, FAN_SIZE);
  if (titles.length < 3) return <DiscoverFallback />;
  const mid = (titles.length - 1) / 2;
  return (
    <div className="demo-fan demo-fan-real">
      {titles.map((t, i) => (
        <Link
          key={t.anilistId} href={titleHref(t.entryType, t.anilistId)} className="demo-fan-card"
          style={{ "--c": accentOf(t), "--i": i - mid, "--n": i } as React.CSSProperties}
        >
          <span className="demo-fan-art" style={bg(t.cover)} aria-hidden="true" />
          <span className="demo-fan-name">{t.title}</span>
        </Link>
      ))}
    </div>
  );
}

export function DiscoverFallback() {
  const glyphs = ["剣", "推", "葬", "食", "転"];
  const colors = ["var(--manga)", "var(--anime)", "var(--acc-3)", "var(--gold)", "var(--novel)"];
  return (
    <div className="demo-fan demo-fan-real" aria-busy="true">
      {glyphs.map((g, i) => (
        <div key={g} className="demo-fan-card" style={{ "--c": colors[i], "--i": i - 2, "--n": i } as React.CSSProperties}><span>{g}</span></div>
      ))}
    </div>
  );
}
