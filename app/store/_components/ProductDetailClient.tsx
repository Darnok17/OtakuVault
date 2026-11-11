"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PinButton from "@/app/_components/PinButton";
import { useCartStore } from "@/lib/cart-store";
import { CART_MAX_QTY, cartKey, formatPrice, hueToken, type ProductDetail } from "@/lib/store-shared";
import ProductArt from "./ProductArt";

const uniq = <T,>(list: T[]) => [...new Set(list)];

export default function ProductDetailClient({ product: p }: { product: ProductDetail }) {
  const add = useCartStore((s) => s.add);
  const sizes = useMemo(() => uniq(p.variants.flatMap((v) => (v.size ? [v.size] : []))), [p.variants]);
  const colors = useMemo(() => uniq(p.variants.flatMap((v) => (v.color ? [v.color] : []))), [p.variants]);
  const firstInStock = p.variants.find((v) => v.stock > 0) ?? p.variants[0];
  const [size, setSize] = useState<string | null>(firstInStock?.size ?? null);
  const [color, setColor] = useState<string | null>(firstInStock?.color ?? null);
  const [qty, setQty] = useState(1);
  const [shot, setShot] = useState(0);
  const [added, setAdded] = useState(false);

  const variant = p.variants.find((v) => (v.size ?? null) === size && (v.color ?? null) === color) ?? null;
  const soldOut = p.variants.length > 0 && (!variant || variant.stock <= 0);
  const price = variant?.price ?? p.basePrice;
  const hex = p.variants.find((v) => v.color === color)?.colorHex ?? null;
  const stockOf = (s: string | null, c: string | null) => p.variants.find((v) => (v.size ?? null) === s && (v.color ?? null) === c)?.stock ?? 0;
  const label = [color, size].filter(Boolean).join(" · ") || null;

  const addToCart = () => {
    if (soldOut) return;
    add({ key: cartKey(p.id, variant?.id ?? null), productId: p.id, variantId: variant?.id ?? null, title: p.title, series: p.series, variantLabel: label, price, hue: p.hue, glyph: p.glyph, cat: p.cat, imageUrl: p.images[0] ?? null }, qty);
    setAdded(true);
  };

  return (
    <div className="pd" style={{ "--prod-accent": `var(--${hueToken(p.hue)})` } as React.CSSProperties}>
      <div className="pd-gallery">
        <div className="pd-stage ov-panel">
          <ProductArt cat={p.cat} glyph={p.glyph} imageUrl={p.images[shot] ?? null} tint={hex} />
          {p.badge && <div className={`product-badge ${p.badge}`}>{p.badge === "ltd" ? "Limited" : p.badge}</div>}
        </div>
        {p.images.length > 1 && (
          <div className="pd-thumbs" role="group" aria-label="Product photos">
            {p.images.map((url, i) => (
              <button key={url} type="button" className="pd-thumb" aria-pressed={i === shot} aria-label={`Photo ${i + 1}`} style={{ backgroundImage: `url(${JSON.stringify(url)})` }} onClick={() => setShot(i)} />
            ))}
          </div>
        )}
        {!p.images.length && <p className="ov-hint pd-note">Illustration, not a photo. Product photography is on its way.</p>}
      </div>

      <div className="pd-info">
        <p className="product-brand">{p.brand}</p>
        <h1 className="pd-title">{p.title}</h1>
        <p className="pd-series">{p.series}</p>
        <p className="pd-price">{formatPrice(price)}</p>
        <div className="pd-desc">{p.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>

        {colors.length > 0 && (
          <fieldset className="pd-opt">
            <legend className="ov-label">Colour: <span className="pd-picked">{color}</span></legend>
            <div className="pd-swatches">
              {colors.map((c) => {
                const v = p.variants.find((x) => x.color === c);
                return (
                  <button key={c} type="button" className="pd-swatch" aria-pressed={c === color} aria-label={c} title={c} style={{ "--sw": v?.colorHex ?? "var(--fg-dim)" } as React.CSSProperties}
                    onClick={() => { setColor(c); setAdded(false); }} />
                );
              })}
            </div>
          </fieldset>
        )}
        {sizes.length > 0 && (
          <fieldset className="pd-opt">
            <legend className="ov-label">Size</legend>
            <div className="pd-sizes">
              {sizes.map((s) => {
                const out = stockOf(s, color) <= 0;
                return (
                  <button key={s} type="button" className={`ov-chip pd-size${out ? " out" : ""}`} aria-pressed={s === size} onClick={() => { setSize(s); setAdded(false); }}>
                    {s}{out && <span className="pd-out"> · sold out</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="pd-buy">
          <div className="qty" role="group" aria-label="Quantity">
            <button type="button" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
            <span aria-live="polite">{qty}</span>
            <button type="button" aria-label="One more" disabled={qty >= CART_MAX_QTY} onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <button type="button" className="btn btn-primary pd-add" disabled={soldOut} onClick={addToCart}>{soldOut ? "Sold out" : `Add to cart · ${formatPrice(price * qty)}`}</button>
          <PinButton kind="product" targetId={p.id} label={p.title} className="btn btn-ghost" withText />
        </div>
        {added && (
          <div className="ov-ok" role="status">
            Added {qty > 1 ? `${qty} × ` : ""}{p.title}{label ? ` (${label})` : ""} to your cart. <Link className="ov-link" href="/store/cart">View cart</Link>
          </div>
        )}
        <ul className="pd-facts">
          <li>Free shipping on orders over $75</li>
          <li>Checkout isn&apos;t open yet. Your cart is saved on this device until it is.</li>
        </ul>
      </div>
    </div>
  );
}
