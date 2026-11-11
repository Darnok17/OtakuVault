import {
  pgTable, pgEnum, text, integer, real, boolean, timestamp, jsonb, smallint, uuid,
  index, uniqueIndex, unique, check, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { EntryStatus, EntryType, MoodNode, MoodWire, PinKind, PublicFields } from "@/lib/types";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

/* ---------- Auth (Better-Auth; field mapping lives in lib/auth.ts) ---------- */

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  username: text("username").unique(),
  // Better-Auth's `name` and `image` fields map onto these.
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  // Theme chosen in Settings; follows the account across devices (see lib/themes.ts for the ids).
  preferredTheme: text("preferred_theme").notNull().default("terminal"),
  // Flipped once the starter collection has been added, so it is only ever seeded once.
  seeded: boolean("seeded").notNull().default(false),
  agreedToTermsAt: timestamp("agreed_to_terms_at", { withTimezone: true }),
  /* Profile */
  usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
  bio: text("bio"),
  pronouns: text("pronouns"),
  // An uploaded profile picture; shown in preference to `avatar` (the OAuth provider's image).
  avatarUrl: text("avatar_url"),
  isProfilePublic: boolean("is_profile_public").notNull().default(true),
  // Per-section visibility of a public profile. A missing key means "visible", so new sections
  // need no backfill; read it through publicFieldsOf() (lib/types.ts).
  publicFields: jsonb("public_fields").$type<Partial<PublicFields>>().notNull().default({}),
  // Forum moderation: may delete any post, pin threads and review reports.
  isAdmin: boolean("is_admin").notNull().default(false),
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
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("accounts_user_id_idx").on(t.userId),
  unique("accounts_provider_account_uq").on(t.providerId, t.accountId),
]);

// Email verification / password reset tokens.
export const verifications = pgTable("verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("verifications_identifier_idx").on(t.identifier)]);

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
  // The AniList title behind this entry; null for entries added by hand.
  anilistId: integer("anilist_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("entries_user_id_idx").on(t.userId), index("entries_user_anilist_idx").on(t.userId, t.anilistId)]);

export const moodboards = pgTable("moodboards", {
  id: id(),
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  nodes: jsonb("nodes").$type<MoodNode[]>().notNull().default([]),
  wires: jsonb("wires").$type<MoodWire[]>().notNull().default([]),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("moodboards_entry_id_idx").on(t.entryId)]);

/* ---------- Profile pins ---------- */

export const pinKind = pgEnum("pin_kind",
  ["entry", "moodboard", "forum_thread", "product"] as const satisfies readonly PinKind[]);

// What a user shows off on their profile. target_id is the id of the pinned thing in its own
// table (entries.id for both "entry" and "moodboard"), so there is deliberately no foreign key;
// pins whose target is gone are skipped when the profile is read.
export const profilePins = pgTable("profile_pins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: pinKind("kind").notNull(),
  targetId: text("target_id").notNull(),
  position: integer("position").notNull().default(0),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("profile_pins_user_kind_target_uq").on(t.userId, t.kind, t.targetId),
  index("profile_pins_user_position_idx").on(t.userId, t.position),
]);

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
  cat: text("cat").notNull(), // a STORE_CATEGORIES id (lib/store-shared.ts)
  imageUrl: text("image_url"),
  description: text("description").notNull().default(""),
  // AniList titles this product belongs to; drives "Recommended for You".
  relatedAnilistIds: integer("related_anilist_ids").array().notNull().default(sql`'{}'`),
  featured: boolean("featured").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("products_cat_idx").on(t.cat)]);

// Size/colour options of a product. A product without variants is sold as a single item.
export const productVariants = pgTable("product_variants", {
  id: id(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  size: text("size"),
  color: text("color"),
  colorHex: text("color_hex"),
  price: integer("price"), // cents; null = the product's price
  stock: integer("stock").notNull().default(25),
  position: integer("position").notNull().default(0),
}, (t) => [index("product_variants_product_id_idx").on(t.productId, t.position)]);

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
  // Full detail-page payload (TitleDetails), filled the first time the page is visited.
  details: jsonb("details").$type<Record<string, unknown>>(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cached_titles_anilist_id_idx").on(t.anilistId)]);

// Result lists of AniList queries (search, seasonal, trending, browse, recommendations),
// stored as ordered anilist ids; the titles themselves live in cached_titles.
export const cachedQueries = pgTable("cached_queries", {
  key: text("key").primaryKey(),
  anilistIds: jsonb("anilist_ids").$type<number[]>().notNull(),
  total: integer("total").notNull().default(0),
  hasNext: boolean("has_next").notNull().default(false),
  updatedAt: updatedAt(),
}, (t) => [index("cached_queries_updated_at_idx").on(t.updatedAt)]);

/* ---------- Forum ---------- */

// A thread's opening post is its root row in forum_posts (depth 0), which is what gets voted on,
// edited and soft-deleted. `body` and `score` here mirror that root post so the thread list can
// show an excerpt and rank without joining; both are written in the same transaction.
export const forumThreads = pgTable("forum_threads", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cat: text("cat").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  viewCount: integer("view_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  score: integer("score").notNull().default(0),
  // Admin pin: floats to the top of its category.
  isPinned: boolean("is_pinned").notNull().default(false),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
  // 0 = the thread's opening post, 1 = a reply to it, 2 = a reply to a reply (the deepest level).
  depth: smallint("depth").notNull().default(1),
  // The depth-1 reply a depth-2 post hangs under; null otherwise.
  parentId: text("parent_id").references((): AnyPgColumn => forumPosts.id, { onDelete: "cascade" }),
  score: integer("score").notNull().default(0),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  // Optional attachments, both pointing at one of the author's collection entries.
  attachedEntryId: text("attached_entry_id").references(() => entries.id, { onDelete: "set null" }),
  attachedMoodboardEntryId: text("attached_moodboard_entry_id").references(() => entries.id, { onDelete: "set null" }),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  // Soft delete: the row stays so replies keep their place; the body renders as "[deleted]".
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  index("forum_posts_thread_id_idx").on(t.threadId, t.createdAt),
  index("forum_posts_user_id_idx").on(t.userId, t.createdAt),
]);

export const forumVotes = pgTable("forum_votes", {
  id: id(),
  postId: text("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  value: smallint("value").notNull(),
}, (t) => [
  unique("forum_votes_post_user_uq").on(t.postId, t.userId),
  check("forum_votes_value_check", sql`${t.value} in (-1, 1)`),
]);

export const forumReports = pgTable("forum_reports", {
  id: id(),
  postId: text("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("open"), // "open" | "dismissed" | "actioned"
  resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  unique("forum_reports_post_reporter_uq").on(t.postId, t.reporterId),
  index("forum_reports_status_idx").on(t.status, t.createdAt),
]);
