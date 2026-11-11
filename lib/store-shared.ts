// Store constants and view models shared by server and client. Pure — no imports.

export const STORE_CATEGORIES = [
  { id: "apparel", label: "Apparel", kanji: "服", blurb: "Hoodies, tees, jackets and caps" },
  { id: "figure", label: "Figures", kanji: "像", blurb: "Scale figures and desk models" },
  { id: "poster", label: "Posters & Prints", kanji: "絵", blurb: "Wall art, in three sizes" },
  { id: "artbook", label: "Art Books", kanji: "画", blurb: "Art books and cookbooks" },
  { id: "plush", label: "Plushies", kanji: "縫", blurb: "Soft things with faces" },
  { id: "accessory", label: "Accessories", kanji: "飾", blurb: "Pins, keychains, notebooks, watches" },
  { id: "manga", label: "Manga Volumes", kanji: "巻", blurb: "Box sets and deluxe editions" },
] as const;
export type StoreCategoryId = (typeof STORE_CATEGORIES)[number]["id"];
export const isStoreCategory = (v: unknown): v is StoreCategoryId => STORE_CATEGORIES.some((c) => c.id === v);
export const STORE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(STORE_CATEGORIES.map((c) => [c.id, c.label]));

export const STORE_SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;
export type StoreSort = (typeof STORE_SORTS)[number]["value"];
export const isStoreSort = (v: unknown): v is StoreSort => STORE_SORTS.some((s) => s.value === v);

// Product hues are stored by their original names; this maps them onto theme tokens.
const HUE_TOKEN: Record<string, string> = {
  crimson: "acc-1", violet: "acc-2", teal: "acc-3", gold: "gold", azure: "azure", orange: "orange", rose: "rose",
};
export const hueToken = (hue: string) => HUE_TOKEN[hue] ?? "gold";

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export type ProductView = {
  id: string; title: string; brand: string; series: string; price: number; // cents; the lowest variant price
  hue: string; glyph: string; badge: string | null; cat: string; imageUrl: string | null; featured: boolean;
  hasVariants: boolean;
};

export type VariantView = { id: string; size: string | null; color: string | null; colorHex: string | null; price: number; stock: number };

export type ProductDetail = ProductView & {
  description: string; basePrice: number; images: string[]; variants: VariantView[]; relatedAnilistIds: number[];
};

export type Recommended = {
  items: ProductView[];
  // True when the list was ranked from the member's own collection and pins.
  personal: boolean;
  // Titles the ranking leaned on most, for the "Because you rated…" line.
  basis: string[];
};

export type CartItem = {
  key: string; productId: string; variantId: string | null;
  title: string; series: string; variantLabel: string | null; price: number; // cents, per unit
  hue: string; glyph: string; cat: string; imageUrl: string | null; qty: number;
};
export const CART_MAX_QTY = 10;
export const cartKey = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ""}`;

export const FREE_SHIPPING_FROM = 7500; // cents
export const SHIPPING_FLAT = 695;
