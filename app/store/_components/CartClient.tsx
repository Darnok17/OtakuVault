"use client";

import Link from "next/link";
import { cartCount, cartSubtotal, useCartStore } from "@/lib/cart-store";
import { CART_MAX_QTY, FREE_SHIPPING_FROM, SHIPPING_FLAT, formatPrice, hueToken, type CartItem } from "@/lib/store-shared";
import ProductArt from "./ProductArt";
import { useHydrated } from "./StoreBits";

export function totals(items: CartItem[]) {
  const subtotal = cartSubtotal(items);
  const shipping = !items.length || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FLAT;
  return { subtotal, shipping, total: subtotal + shipping };
}

export function Summary({ items, children }: { items: CartItem[]; children?: React.ReactNode }) {
  const { subtotal, shipping, total } = totals(items);
  const n = cartCount(items);
  return (
    <aside className="ov-panel ct-summary">
      <h2 className="ov-title">Order summary</h2>
      <dl className="ct-lines">
        <div><dt>Subtotal ({n} item{n === 1 ? "" : "s"})</dt><dd>{formatPrice(subtotal)}</dd></div>
        <div><dt>Shipping</dt><dd>{shipping ? formatPrice(shipping) : "Free"}</dd></div>
        <div className="ct-total"><dt>Total</dt><dd>{formatPrice(total)}</dd></div>
      </dl>
      {shipping > 0 && <p className="ov-hint">Add {formatPrice(FREE_SHIPPING_FROM - subtotal)} more for free shipping.</p>}
      {children}
    </aside>
  );
}

export function LineItem({ item, editable = true }: { item: CartItem; editable?: boolean }) {
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  return (
    <li className="ct-item" style={{ "--prod-accent": `var(--${hueToken(item.hue)})` } as React.CSSProperties}>
      <Link className="ct-art" href={`/store/${item.productId}`} aria-label={item.title}><ProductArt cat={item.cat} glyph={item.glyph} imageUrl={item.imageUrl} /></Link>
      <div className="ct-text">
        <Link className="ct-name" href={`/store/${item.productId}`}>{item.title}</Link>
        <span className="ov-hint">{[item.series, item.variantLabel].filter(Boolean).join(" · ")}</span>
        {!editable && <span className="ov-hint">Qty {item.qty}</span>}
        {editable && <button type="button" className="fp-act danger ct-remove" onClick={() => remove(item.key)}>Remove</button>}
      </div>
      {editable && (
        <div className="qty" role="group" aria-label={`Quantity of ${item.title}`}>
          <button type="button" aria-label="One fewer" disabled={item.qty <= 1} onClick={() => setQty(item.key, item.qty - 1)}>−</button>
          <span aria-live="polite">{item.qty}</span>
          <button type="button" aria-label="One more" disabled={item.qty >= CART_MAX_QTY} onClick={() => setQty(item.key, item.qty + 1)}>+</button>
        </div>
      )}
      <span className="ct-price">{formatPrice(item.price * item.qty)}</span>
    </li>
  );
}

export default function CartClient() {
  const hydrated = useHydrated();
  const stored = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const items = hydrated ? stored : [];

  if (!hydrated) return <div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading your cart…</p></div>;
  if (!items.length) {
    return (
      <div className="ov-empty">
        <strong>Your cart is empty</strong>
        Find something in the <Link className="ov-link" href="/store">store</Link>.
      </div>
    );
  }
  return (
    <div className="ct">
      <div className="ov-panel">
        <ul className="ct-items">{items.map((i) => <LineItem key={i.key} item={i} />)}</ul>
        <div className="ov-row between ct-foot">
          <Link className="ov-link" href="/store/categories">Keep shopping</Link>
          <button type="button" className="fp-act danger" onClick={clear}>Empty cart</button>
        </div>
      </div>
      <Summary items={items}>
        <Link className="btn btn-primary ct-go" href="/store/checkout">Checkout</Link>
        <p className="ov-hint">Your cart is saved on this device.</p>
      </Summary>
    </div>
  );
}
