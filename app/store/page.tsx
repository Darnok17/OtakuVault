import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { SEASON_INFO, seasonOf } from "@/lib/anilist-shared";
import { categoryCounts, listProducts, recommendProducts } from "@/lib/shop";
import { STORE_CATEGORIES } from "@/lib/store-shared";
import ProductCard from "./_components/ProductCard";
import { CartLink, Rail } from "./_components/StoreBits";

export const metadata: Metadata = { title: "Store · OtakuVault", description: "Merch for the series in your collection." };

const SEASON_GLYPH = { WINTER: "冬", SPRING: "春", SUMMER: "夏", FALL: "秋" } as const;
const SEASON_LINE = {
  WINTER: "Heavy fleece, long reads and things to keep on the shelf until the thaw.",
  SPRING: "New season, new shelf. Prints, pins and lighter layers for the spring premieres.",
  SUMMER: "Tees, caps and plushies that travel well. Convention season is here.",
  FALL: "Hoodies, haori cardigans and art books for the long evenings of the fall season.",
} as const;

function RowSkeleton() {
  return <div className="store-row-scroll" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="product product-skeleton" aria-hidden="true"><div className="product-img" /></div>)}</div>;
}

// The seasonal banner depends on today's date, so it renders at request time.
async function SeasonBanner() {
  await connection();
  const { year, season } = seasonOf(new Date());
  return (
    <div className="store-featured">
      <div className="store-featured-card">
        <div className="store-featured-info">
          <span className="store-featured-tag">{SEASON_INFO[season].months} {year}</span>
          <h2 className="store-featured-title">The {SEASON_INFO[season].label} {year} Collection</h2>
          <p className="store-featured-sub">{SEASON_LINE[season]}</p>
          <Link className="store-featured-cta" href="/store/categories?sort=newest">Shop the collection</Link>
        </div>
        <div className="store-featured-visual"><div className="store-featured-glyph ov-glyph" data-latin={SEASON_INFO[season].label}>{SEASON_GLYPH[season]}</div></div>
      </div>
    </div>
  );
}

async function Featured() {
  await connection();
  const items = (await listProducts({ sort: "featured" }).catch(() => [])).filter((p) => p.featured);
  if (!items.length) return <div className="ov-empty store-pad"><strong>The shelves are being stocked</strong>Check back soon.</div>;
  return <Rail label="featured products">{items.map((p) => <ProductCard key={p.id} p={p} />)}</Rail>;
}

async function Recommended() {
  const session = await auth.api.getSession({ headers: await headers() });
  const recs = await recommendProducts(session?.user.id ?? null).catch(() => null);
  if (!recs?.items.length) return <div className="ov-empty store-pad"><strong>Nothing to recommend yet</strong>Check back soon.</div>;
  return (
    <>
      <div className="store-rec-note">
        {recs.personal
          ? <>Picked from your collection{recs.basis.length > 0 && <>: {recs.basis.map((t) => <span key={t} className="series-pill">{t}</span>)}</>}. Rate and pin more titles to sharpen it.</>
          : session
            ? <>Rate a few titles 4 stars or higher in <Link className="ov-link" href="/collection">Your Collection</Link> and this row will follow your taste. Until then, what&apos;s popular:</>
            : <><Link className="ov-link" href="/login?redirect=/store">Log in</Link> to get picks based on your collection. Until then, what&apos;s popular:</>}
      </div>
      <Rail label="recommended products">{recs.items.map((p) => <ProductCard key={p.id} p={p} />)}</Rail>
    </>
  );
}

async function Categories() {
  await connection();
  const counts = await categoryCounts().catch(() => ({} as Record<string, number>));
  return (
    <div className="store-cats">
      {STORE_CATEGORIES.map((c) => (
        <Link key={c.id} className="store-cat ov-panel" href={`/store/categories?cat=${c.id}`}>
          <span className="store-cat-glyph ov-glyph" aria-hidden="true">{c.kanji}</span>
          <span className="store-cat-name">{c.label}</span>
          <span className="store-cat-blurb">{c.blurb}</span>
          <span className="ov-meta">{counts[c.id] ?? 0} item{counts[c.id] === 1 ? "" : "s"}</span>
        </Link>
      ))}
    </div>
  );
}

export default function StorePage() {
  return (
    <section className="site-page active" id="page-store" data-page="store">
      <div className="store-hero">
        <div className="store-hero-inner">
          <h1 className="store-title">The <span className="accent">Store</span></h1>
          <div className="store-kanji" data-latin="Emporium">商店</div>
          <p className="store-lede">Merch for the series on your shelf. Browse now; checkout opens soon.</p>
          <div className="store-hero-actions">
            <Link className="btn btn-primary" href="/store/categories">Browse everything</Link>
            <CartLink />
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="store-featured"><div className="store-featured-card store-featured-skeleton" aria-busy="true" /></div>}>
        <SeasonBanner />
      </Suspense>

      <div className="store-section" data-accent="gold">
        <div className="store-section-header">
          <h2 className="store-section-title">Featured <span className="store-section-kanji" data-latin="Featured">注目</span></h2>
          <Link className="ov-see-more" href="/store/categories">See everything</Link>
        </div>
        <Suspense fallback={<RowSkeleton />}><Featured /></Suspense>
      </div>

      <div className="store-section" data-accent="crimson">
        <div className="store-section-header">
          <h2 className="store-section-title">Recommended for You <span className="store-section-kanji" data-latin="For you">あなた向け</span></h2>
        </div>
        <Suspense fallback={<RowSkeleton />}><Recommended /></Suspense>
      </div>

      <div className="store-section" data-accent="teal">
        <div className="store-section-header">
          <h2 className="store-section-title">Browse by Category <span className="store-section-kanji" data-latin="Categories">分類</span></h2>
        </div>
        <Suspense fallback={<div className="store-cats" aria-busy="true" />}><Categories /></Suspense>
      </div>
    </section>
  );
}
