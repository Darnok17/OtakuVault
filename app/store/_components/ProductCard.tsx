import Link from "next/link";
import PinButton from "@/app/_components/PinButton";
import { formatPrice, hueToken, type ProductView } from "@/lib/store-shared";
import ProductArt from "./ProductArt";
import { QuickAdd } from "./StoreBits";

export default function ProductCard({ p }: { p: ProductView }) {
  return (
    <div className="product" style={{ "--prod-accent": `var(--${hueToken(p.hue)})` } as React.CSSProperties}>
      {/* A stretched link rather than a wrapping one: buttons can't legally sit inside an <a>. */}
      <Link className="td-card-link" href={`/store/${p.id}`} aria-label={p.title} />
      <div className="product-img">
        <ProductArt cat={p.cat} glyph={p.glyph} imageUrl={p.imageUrl} />
        {p.badge && <div className={`product-badge ${p.badge}`}>{p.badge === "ltd" ? "Limited" : p.badge}</div>}
      </div>
      <PinButton kind="product" targetId={p.id} label={p.title} className="product-pin ov-icon-btn" />
      <div className="product-info">
        <div className="product-brand">{p.brand}</div>
        <div className="product-name">{p.title}</div>
        <div className="product-series">{p.series}</div>
        <div className="product-footer">
          <span className="product-price">{p.hasVariants && <span className="product-from">from </span>}{formatPrice(p.price)}</span>
          <QuickAdd p={p} />
        </div>
      </div>
    </div>
  );
}
