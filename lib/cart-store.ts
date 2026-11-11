import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CART_MAX_QTY, type CartItem } from "./store-shared";

// The cart lives in this browser only (localStorage "ov-cart"); there is no server-side cart
// until checkout exists.

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const clamp = (n: number) => Math.max(1, Math.min(CART_MAX_QTY, Math.round(n) || 1));

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, qty = 1) => set((s) => {
        const existing = s.items.find((i) => i.key === item.key);
        return {
          items: existing
            ? s.items.map((i) => (i.key === item.key ? { ...i, ...item, qty: clamp(i.qty + qty) } : i))
            : [...s.items, { ...item, qty: clamp(qty) }],
        };
      }),
      setQty: (key, qty) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, qty: clamp(qty) } : i)) })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    { name: "ov-cart", version: 1 },
  ),
);

export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);
export const cartSubtotal = (items: CartItem[]) => items.reduce((n, i) => n + i.qty * i.price, 0);
