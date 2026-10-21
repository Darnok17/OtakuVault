import {
  pgTable, pgEnum, text, integer, real, boolean, timestamp, jsonb, smallint,
  index, uniqueIndex, unique, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { EntryStatus, EntryType, MoodNode, MoodWire } from "@/lib/types";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

/* ---------- Auth (Better-Auth stubs; reconcile with its generated schema later) ---------- */

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  username: text("username").unique(),
  displayName: text("display_name"),
  avatar: text("avatar"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("sessions_user_id_idx").on(t.userId)]);

export const accounts = pgTable("accounts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("accounts_user_id_idx").on(t.userId),
  unique("accounts_provider_account_uq").on(t.providerId, t.accountId),
]);

/* ---------- Collection ---------- */

export const entryType = pgEnum("entry_type", ["anime", "manga", "webtoon", "novel"] as const satisfies readonly EntryType[]);
export const entryStatus = pgEnum("entry_status",
  ["completed", "watching", "on-hold", "plan-to", "dropped"] as const satisfies readonly EntryStatus[]);

export const entries = pgTable("entries", {
  // Text id so existing client-side ids (e.g. "demo_0") can be imported as-is.
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: entryType("type").notNull(),
  status: entryStatus("status").notNull(),
  genre: text("genre").notNull().default(""),
  totalEps: text("total_eps").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // Half-star steps (0–5).
  rating: real("rating").notNull().default(0),
  imageUrl: text("image_url").notNull().default(""),
  progressCurrent: integer("progress_current").notNull().default(0),
  progressTotal: integer("progress_total").notNull().default(0),
  manualOrder: integer("manual_order"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("entries_user_id_idx").on(t.userId)]);

export const moodboards = pgTable("moodboards", {
  id: id(),
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  nodes: jsonb("nodes").$type<MoodNode[]>().notNull().default([]),
  wires: jsonb("wires").$type<MoodWire[]>().notNull().default([]),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("moodboards_entry_id_idx").on(t.entryId)]);

/* ---------- Store ---------- */

export const products = pgTable("products", {
  id: id(),
  title: text("title").notNull(),
  brand: text("brand").notNull(),
  series: text("series").notNull(),
  price: integer("price").notNull(), // cents
  hue: text("hue").notNull(),
  glyph: text("glyph").notNull(),
  badge: text("badge"), // "new" | "sale" | "ltd" | null
  cat: text("cat").notNull(),
  imageUrl: text("image_url"),
  createdAt: createdAt(),
}, (t) => [index("products_cat_idx").on(t.cat)]);

export const productImages = pgTable("product_images", {
  id: id(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  order: integer("order").notNull().default(0),
}, (t) => [index("product_images_product_id_idx").on(t.productId)]);

export const orderStatus = pgEnum("order_status", ["pending", "paid", "fulfilled", "cancelled", "refunded"]);

export const orders = pgTable("orders", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  stripeSessionId: text("stripe_session_id").unique(),
  total: integer("total").notNull(), // cents
  status: orderStatus("status").notNull().default("pending"),
  createdAt: createdAt(),
}, (t) => [index("orders_user_id_idx").on(t.userId)]);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  priceAtPurchase: integer("price_at_purchase").notNull(), // cents, per unit
}, (t) => [
  index("order_items_order_id_idx").on(t.orderId),
  check("order_items_quantity_positive", sql`${t.quantity} > 0`),
]);

/* ---------- AniList cache ---------- */

export const cachedTitles = pgTable("cached_titles", {
  id: id(),
  anilistId: integer("anilist_id").notNull(),
  type: text("type").notNull(), // AniList media type: "ANIME" | "MANGA"
  title: text("title").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cached_titles_anilist_id_idx").on(t.anilistId)]);

/* ---------- Forum ---------- */

export const forumThreads = pgTable("forum_threads", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cat: text("cat").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  viewCount: integer("view_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  index("forum_threads_cat_created_idx").on(t.cat, t.createdAt),
  index("forum_threads_user_id_idx").on(t.userId),
]);

export const forumPosts = pgTable("forum_posts", {
  id: id(),
  threadId: text("thread_id").notNull().references(() => forumThreads.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => [index("forum_posts_thread_id_idx").on(t.threadId, t.createdAt)]);

export const forumVotes = pgTable("forum_votes", {
  id: id(),
  postId: text("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  value: smallint("value").notNull(),
}, (t) => [
  unique("forum_votes_post_user_uq").on(t.postId, t.userId),
  check("forum_votes_value_check", sql`${t.value} in (-1, 1)`),
]);
