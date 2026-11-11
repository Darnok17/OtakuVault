import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadBrowsePage } from "@/app/actions/browse";
import { BROWSE_SECTIONS, parseSeasonSlug, seasonTitle, type BrowseSection, type BrowseSectionId } from "@/lib/browse-sections";
import BrowseGrid from "./BrowseGrid";

// The one implementation behind every "See more" route. Static sections render their header
// straight away; the seasonal one learns its season from the URL first.

function GridSkeleton() {
  return (
    <div className="ov-grid" aria-busy="true">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="rec-poster rec-poster-skeleton" aria-hidden="true"><div className="rec-poster-cover" /></div>
      ))}
    </div>
  );
}

async function GridData({ section, param }: { section: BrowseSectionId; param?: string }) {
  await connection();
  const first = await loadBrowsePage(section, 1, param);
  if (!first) return <div className="ov-empty"><strong>AniList is unreachable right now</strong>Give it a moment and reload the page.</div>;
  return <BrowseGrid section={section} param={param} first={first} />;
}

function BrowseView({ section, param, title }: { section: BrowseSectionId; param?: string; title?: string }) {
  const s: BrowseSection = BROWSE_SECTIONS[section];
  return (
    <main className="ov-page wide browse-page">
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          <Link href="/index-page">Index</Link><span aria-hidden="true">/</span>
          {s.crumb[1] !== "/index-page" && <><Link href={s.crumb[1]}>{s.crumb[0]}</Link><span aria-hidden="true">/</span></>}
          <span aria-current="page">{title ?? s.title}</span>
        </nav>
        <h1 className="ov-masthead">{title ?? s.title}</h1>
        <div className="ov-kanji" data-latin={s.latin}>{s.kanji}</div>
        <p className="ov-lede">{s.blurb}</p>
      </div>
      <Suspense fallback={<GridSkeleton />}>
        <GridData section={section} param={param} />
      </Suspense>
    </main>
  );
}

export default function BrowsePage({ section }: { section: Exclude<BrowseSectionId, "anime/seasonal"> }) {
  return <BrowseView section={section} />;
}

async function SeasonalView({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) notFound();
  return <BrowseView section="anime/seasonal" param={slug} title={seasonTitle(parsed.year, parsed.season)} />;
}

export function SeasonalBrowsePage({ params }: { params: Promise<{ season: string }> }) {
  return (
    <Suspense fallback={<main className="ov-page wide browse-page"><GridSkeleton /></main>}>
      <SeasonalView params={params} />
    </Suspense>
  );
}
