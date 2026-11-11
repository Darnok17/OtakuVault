import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getRelatedProducts } from "@/lib/shop";
import { STORE_CATEGORY_LABEL } from "@/lib/store-shared";
import ProductCard from "../_components/ProductCard";
import ProductDetailClient from "../_components/ProductDetailClient";
import { CartLink, Rail } from "../_components/StoreBits";

export const metadata: Metadata = { title: "Product · Store · OtakuVault" };

async function Product({ params }: PageProps<"/store/[productId]">) {
  const { productId } = await params;
  const product = await getProduct(productId);
  if (!product) notFound();
  const related = await getRelatedProducts(product).catch(() => []);
  return (
    <>
      <div className="ov-row between pd-top">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          <Link href="/store">Store</Link><span aria-hidden="true">/</span>
          <Link href={`/store/categories?cat=${product.cat}`}>{STORE_CATEGORY_LABEL[product.cat] ?? product.cat}</Link>
          <span aria-hidden="true">/</span><span aria-current="page">{product.title}</span>
        </nav>
        <CartLink />
      </div>
      <ProductDetailClient product={product} />
      {related.length > 0 && (
        <section className="pd-related">
          <div className="ov-section-head"><h2 className="ov-title">Goes with this <span className="ov-kanji inline" data-latin="Pairs with">関連</span></h2></div>
          <Rail label="related products">{related.map((p) => <ProductCard key={p.id} p={p} />)}</Rail>
        </section>
      )}
    </>
  );
}

export default function ProductPage(props: PageProps<"/store/[productId]">) {
  return (
    <main className="ov-page wide">
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading product…</p></div>}>
        <Product {...props} />
      </Suspense>
    </main>
  );
}
