"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ThemedSelect from "@/app/_components/ThemedSelect";
import { cartCount, useCartStore } from "@/lib/cart-store";
import { STORE_SORTS, cartKey, type ProductView, type StoreSort } from "@/lib/store-shared";

// The cart is read from localStorage, which the server can't see: render as empty until
// hydration is done so the server and first client render agree.
const noSubscribe = () => () => {};
export const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export function CartLink({ className = "btn btn-ghost" }: { className?: string }) {
  const hydrated = useHydrated();
  const count = useCartStore((s) => cartCount(s.items));
  const n = hydrated ? count : 0;
  return (
    <Link className={`${className} cart-link`} href="/store/cart" aria-label={n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart, empty"}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6 5 2H2" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /></svg>
      <span>Cart</span>
      {n > 0 && <span className="cart-count">{n}</span>}
    </Link>
  );
}

// "+ Cart" on a product card. Products with sizes or colours send you to their page to choose.
export function QuickAdd({ p }: { p: ProductView }) {
  const add = useCartStore((s) => s.add);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  if (p.hasVariants) return <Link className="product-cart" href={`/store/${p.id}`}>Options</Link>;
  return (
    <button
      type="button" className={`product-cart${added ? " added" : ""}`} aria-label={`Add ${p.title} to cart`}
      onClick={() => {
        add({ key: cartKey(p.id, null), productId: p.id, variantId: null, title: p.title, series: p.series, variantLabel: null, price: p.price, hue: p.hue, glyph: p.glyph, cat: p.cat, imageUrl: p.imageUrl });
        setAdded(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setAdded(false), 1400);
      }}
    >
      {added ? "Added" : "+ Cart"}
    </button>
  );
}

// A horizontally scrolling row with arrow buttons.
export function Rail({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.round((ref.current.clientWidth || 600) * 0.75), behavior: "smooth" });
  return (
    <div className="store-row-track">
      <button type="button" className="store-row-nav store-row-nav-prev" aria-label={`Scroll ${label} left`} onClick={() => by(-1)}>‹</button>
      <div className="store-row-scroll" ref={ref}>{children}</div>
      <button type="button" className="store-row-nav store-row-nav-next" aria-label={`Scroll ${label} right`} onClick={() => by(1)}>›</button>
    </div>
  );
}

export function SortSelect({ value }: { value: StoreSort }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <ThemedSelect
      value={value} options={STORE_SORTS} aria-label="Sort products"
      onChange={(next) => {
        const q = new URLSearchParams(params);
        if (next === "featured") q.delete("sort"); else q.set("sort", next);
        const qs = q.toString();
        router.push(qs ? `${path}?${qs}` : path, { scroll: false });
      }}
    />
  );
}
