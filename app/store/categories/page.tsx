import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { listProducts } from "@/lib/shop";
import { STORE_CATEGORIES, isStoreCategory, isStoreSort } from "@/lib/store-shared";
import ProductCard from "../_components/ProductCard";
import { CartLink, SortSelect } from "../_components/StoreBits";

export const metadata: Metadata = { title: "Categories · Store · OtakuVault" };

async function Browse({ searchParams }: Pick<PageProps<"/store/categories">, "searchParams">) {
  const query = await searchParams;
  const cat = isStoreCategory(query.cat) ? query.cat : null;
  const sort = isStoreSort(query.sort) ? query.sort : "featured";
  const items = await listProducts({ cat: cat ?? undefined, sort }).catch(() => null);
  const href = (c: string | null) => {
    const q = new URLSearchParams();
    if (c) q.set("cat", c);
    if (sort !== "featured") q.set("sort", sort);
    const qs = q.toString();
    return qs ? `/store/categories?${qs}` : "/store/categories";
  };
  const current = STORE_CATEGORIES.find((c) => c.id === cat);
  return (
    <>
      <nav className="store-cat-chips sc-chips" aria-label="Categories">
        <Link className={`store-cat-chip${cat ? "" : " active"}`} href={href(null)} aria-current={cat ? undefined : "page"}>All</Link>
        {STORE_CATEGORIES.map((c) => (
          <Link key={c.id} className={`store-cat-chip${cat === c.id ? " active" : ""}`} href={href(c.id)} aria-current={cat === c.id ? "page" : undefined}>{c.label}</Link>
        ))}
      </nav>
      <div className="store-browse-toolbar sc-toolbar">
        <div className="store-result-count"><strong>{items?.length ?? 0}</strong> product{items?.length === 1 ? "" : "s"}{current ? ` in ${current.label}` : ""}</div>
        <div className="store-sort-wrap"><span className="store-sort-label">Sort</span><SortSelect value={sort} /></div>
      </div>
      {!items ? <div className="ov-error" role="alert">The catalogue couldn&apos;t be loaded. Refresh to try again.</div>
        : items.length ? <div className="store-grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        : <div className="ov-empty"><strong>Nothing in {current?.label ?? "the store"} yet</strong><Link className="ov-link" href="/store/categories">See every category</Link>.</div>}
    </>
  );
}

export default function CategoriesPage({ searchParams }: PageProps<"/store/categories">) {
  return (
    <main className="ov-page wide">
      <div className="ov-page-head">
        <div className="ov-row between">
          <nav className="ov-crumbs" aria-label="Breadcrumb"><Link href="/store">Store</Link><span aria-hidden="true">/</span><span aria-current="page">Categories</span></nav>
          <CartLink />
        </div>
        <h1 className="ov-masthead">Categories</h1>
        <div className="ov-kanji" data-latin="Catalogue">分類</div>
      </div>
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading the catalogue…</p></div>}>
        <Browse searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
