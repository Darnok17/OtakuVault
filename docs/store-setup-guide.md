# OtakuVault Store Setup Guide: Stripe Payments and Affiliate Links

This manual walks you through two jobs, in order:

- **Part A:** connect Stripe so the store takes real payments.
- **Part B:** add affiliate links so the store can also send buyers to other retailers.

Every code snippet is written against the code that is in this repo now (Next.js 16.4.5 with `cacheComponents: true`, Drizzle + Postgres, Better Auth, Zustand cart). Nothing here has been implemented yet. You make each change yourself as you go.

> Researched 16 Nov 2026. Fees, commission rates and program rules change often. Each section links to the official page, so check it before you rely on a number.

---

## Contents

0. [What exists today](#0-what-exists-today)
1. [Decisions you need to make first](#1-decisions-you-need-to-make-first)
2. [Part A: Stripe](#part-a-stripe)
   - [A1. Create and verify your Stripe account](#a1-create-and-verify-your-stripe-account)
   - [A2. Choose how keys get into Vercel (Marketplace or manual)](#a2-choose-how-keys-get-into-vercel)
   - [A3. API keys and environment variables](#a3-api-keys-and-environment-variables)
   - [A4. Install the SDK](#a4-install-the-sdk)
   - [A5. Database changes for orders](#a5-database-changes-for-orders)
   - [A6. Products and prices: Stripe vs your database](#a6-products-and-prices-stripe-vs-your-database)
   - [A7. Build the checkout](#a7-build-the-checkout)
   - [A8. Webhooks](#a8-webhooks)
   - [A9. Test end to end in test mode](#a9-test-end-to-end-in-test-mode)
   - [A10. Go-live checklist](#a10-go-live-checklist)
   - [A11. Security rules](#a11-security-rules)
3. [Part B: Affiliate links](#part-b-affiliate-links)
   - [B1. The catalog problem to solve first](#b1-the-catalog-problem-to-solve-first)
   - [B2. Which programs fit an anime store](#b2-which-programs-fit-an-anime-store)
   - [B3. Apply to Amazon Associates](#b3-apply-to-amazon-associates)
   - [B4. Apply to the specialty retailers](#b4-apply-to-the-specialty-retailers)
   - [B5. Store affiliate links in the app](#b5-store-affiliate-links-in-the-app)
   - [B6. Click-tracking redirect route](#b6-click-tracking-redirect-route)
   - [B7. Render "Buy at retailer" buttons](#b7-render-buy-at-retailer-buttons)
   - [B8. Disclosure, Amazon rules and privacy policy](#b8-disclosure-amazon-rules-and-privacy-policy)
   - [B9. Stripe products and affiliate products side by side](#b9-stripe-products-and-affiliate-products-side-by-side)
4. [Troubleshooting](#troubleshooting)
5. [Combined checklist](#combined-checklist)

---

## 0. What exists today

What the code does right now, so you know what each step changes:

| Piece | Where | State today |
| --- | --- | --- |
| Product catalog | `products`, `product_variants`, `product_images` tables in `lib/db/schema.ts`; starter rows in `drizzle/seeds/products.sql` | **In the database**, edited by hand (SQL or Drizzle Studio). No admin UI. Prices are integer **cents**. Variants can override the price (`product_variants.price`, null = product price) and track `stock`. |
| Reads | `lib/shop.ts` (`listProducts`, `getProduct`, `recommendProducts`) | Server-only. Recommendations count `orders` with status `paid`/`fulfilled`. |
| Cart | `lib/cart-store.ts` (Zustand, `localStorage` key `ov-cart`) | **Browser only.** Each item carries a `price` copied from the page, so the server must **never trust it**. |
| Cart page | `app/store/cart/page.tsx` + `_components/CartClient.tsx` | Works. Shipping: free from $75 (`FREE_SHIPPING_FROM = 7500`), else $6.95 (`SHIPPING_FLAT = 695`). |
| Checkout page | `app/store/checkout/page.tsx` + `_components/CheckoutClient.tsx` | A placeholder form (address, country, delivery speed). The Pay button is disabled. Guests can view it. |
| Orders | `orders`, `order_items` tables, `order_status` enum (`pending`, `paid`, `fulfilled`, `cancelled`, `refunded`) | Tables exist (migration `0002`). `orders.stripe_session_id` already exists. **`orders.user_id` is NOT NULL**, so guests can't have orders yet, and `order_items` has no `variant_id`. Nothing writes to these tables yet. |
| Webhook | none | `README.md` mentions `app/api/webhooks/stripe/`, but it doesn't exist. |
| Admin | `users.is_admin` | Used for forum moderation only. |
| Legal pages | `app/privacy/page.tsx`, `app/terms/page.tsx` | The privacy page says "There are no advertising or cross-site tracking cookies". **Affiliate links make that untrue**, so it has to change (see B8). |
| Copy that mentions "checkout coming soon" | `app/store/page.tsx` (lede), `ProductDetailClient.tsx` (facts list), `CheckoutClient.tsx` | Update when you launch. |

---

## 1. Decisions you need to make first

Make these before you write code. Each one changes what you build.

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| **D1** | **What are you actually selling?** | (a) Your own original designs, made by you or a print-on-demand supplier. (b) Officially licensed merch you buy wholesale. (c) Affiliate-only: no selling, just links. (d) A mix. | **This is the biggest one.** The seed catalog is fictional brands ("Tanuki Threads", "Kumo Works") making designs based on real series (Attack on Titan, Jujutsu Kaisen…). Selling unlicensed merch of someone else's series is IP infringement. Stripe [lists IP-infringing and counterfeit goods as prohibited](https://stripe.com/legal/restricted-businesses), and accounts selling them get closed and funds held. Only sell through Stripe what you have the right to sell: your original art, or licensed stock with invoices. Use affiliate links (Part B) for official series merch. |
| **D2** | Stripe key setup | Vercel Marketplace integration, or keys copied from the Stripe Dashboard by hand | **Manual Dashboard keys** (A2 explains why). The Marketplace sandbox is fine for a first look. |
| **D3** | Guest checkout? | Require login, or allow guests | **Allow guests.** The checkout page already lets guests in, and requiring an account costs sales. That means `orders.user_id` becomes nullable (A5). If you'd rather require login, skip that part and add `/store/checkout` to the `proxy.ts` matcher. |
| **D4** | Where prices live | Database only, sending prices to Stripe inline at checkout (`price_data`), or Stripe Products/Prices with `stripe_price_id` stored on each variant | **Database only (inline `price_data`).** Your prices live per variant in Postgres and there's no admin UI to keep two copies in sync. A6 covers both options. |
| **D5** | Checkout UI | Stripe-hosted Checkout page, embedded Checkout, or a custom Payment Element form | **Hosted Checkout.** It's the least code, Stripe handles address collection, Apple/Google Pay, 3-D Secure and receipts, and your server never touches card data. |
| **D6** | Countries and currency | Charge USD only, ship to the 7 countries in the current checkout form (US, CA, GB, DE, FR, AU, JP) | Start with USD and the countries you can actually ship to and handle returns from. Shipping physical goods to the EU/UK/AU/JP brings VAT/GST and customs duties. Consider **US-only at launch**. |
| **D7** | Sales tax | Stripe Tax, or handle it yourself, or don't collect yet | Talk to an accountant about where you have tax obligations. Stripe Tax costs [0.5% of volume in jurisdictions where you're registered](https://support.stripe.com/questions/understanding-stripe-tax-pricing) on no-code/Checkout integrations, and **does not file returns for you** by default. |
| **D8** | Business entity | Individual / sole proprietor, or an LLC | Stripe accepts either. An LLC separates liability for selling physical goods. Decide before verification, because changing the legal entity later means re-verifying. |
| **D9** | Which affiliate programs | Amazon Associates, plus 1–3 specialty retailers | Amazon first (widest catalog, strict rules). Add HobbyLink Japan or Entertainment Earth for figures. Details in B2. |
| **D10** | Fulfillment | Ship it yourself, or a print-on-demand / 3PL partner | Required before you go live. Stripe only takes the money. Someone has to pack the box. |

---

# Part A: Stripe

## A1. Create and verify your Stripe account

You can build and test with only an email address. You need full verification before you can take live payments.

1. Go to <https://dashboard.stripe.com/register>. Enter email, full name, country (**United States**, assumed throughout because prices are in USD) and a password. Confirm the email.
2. Turn on two-factor authentication: click your account icon (top right) → **Profile** → **Two-step authentication**. Use an authenticator app or passkey, not SMS. Anyone with this login can redirect your payouts.
3. You start in a **sandbox** (test mode). Test-mode keys start with `sk_test_` / `pk_test_`. Nothing is charged.
4. When you're ready for real money (you can do this now; verification can take a few days), click **Activate payments** / **Complete your profile** on the Dashboard home and fill in:
   - **Business type:** Individual/Sole proprietor, or Company (LLC). See D8.
   - **Legal name, date of birth, home address, phone**, and **SSN** (last 4 digits first, the full number if Stripe asks). An LLC also needs its **EIN**.
   - **Industry:** something like *Retail → Hobby, toy and game shops* or *Clothing and accessories*. Pick what matches your main products.
   - **Business website:** your production URL (e.g. `https://otakuvault.vercel.app` or your custom domain). Stripe reviewers visit it, so before you submit, the site should show (A10 step 9):
     - clear product descriptions and prices,
     - a refund/return policy,
     - a shipping policy,
     - customer-service contact details (email; a phone number helps),
     - terms of service and a privacy policy.
   - **Product description:** one or two plain sentences, e.g. *"Original anime-inspired apparel, prints and accessories sold online and shipped within the US. Orders ship in 3–5 business days."* Don't describe it as fan merch of named series (see D1).
   - **Statement descriptor:** what appears on card statements, 5–22 characters, e.g. `OTAKUVAULT`. Also set a **shortened descriptor** (e.g. `OTAKUVLT`).
   - **Customer support phone/email/address**, which appear on receipts.
   - **Bank account** for payouts (routing + account number, or instant verification through your bank).
5. Wait for verification. Stripe may ask for an ID photo or proof of address. Check **Settings → Business → Account details** for anything outstanding.

Docs: [Account activation](https://docs.stripe.com/get-started/account/activate) · [Required verification info](https://docs.stripe.com/connect/required-verification-information) · [Website requirements (checklist)](https://docs.stripe.com/get-started/checklist/website) · [Restricted businesses](https://stripe.com/legal/restricted-businesses)

**Fees (US cards):** standard online card pricing is 2.9% + 30¢ per successful charge. Check <https://stripe.com/pricing>. International cards and currency conversion cost extra. **Refunds don't return the original fee.**

---

## A2. Choose how keys get into Vercel

You have two ways to get Stripe keys into your Vercel project.

### Option 1: Vercel Marketplace Stripe integration

What it does ([Vercel docs](https://vercel.com/docs/integrations/ecommerce/stripe)):
- Creates a Stripe **sandbox** for you (no Stripe signup needed to start) and adds the keys to your project as env vars (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- Later, **Install → Import Existing Stripe Account** connects your real, verified account. Vercel then swaps in the live keys, and you redeploy.
- Key rotation from the resource's **Settings** page in Vercel.

Steps:
1. Install the latest Vercel CLI (yours is 65.12.1): `pnpm add -g vercel@latest`.
2. Link the repo if you haven't: `cd ~/projects/otakuvault && vercel link`.
3. Either open <https://vercel.com/marketplace/stripe> → **Install** → **Install New Stripe Sandbox** → **Continue** → name it → **Create** → **Projects** → **Connect Project** → pick `otakuvault`,
   or from the terminal: `vercel integration add stripe` and follow the prompts.
4. Check what was created, which shows names only, never values: `vercel env ls`. Check which **environments** (Development / Preview / Production) each variable covers.
5. Pull them locally: `vercel env pull .env.local` (see the warning in A3).
6. Going live: Vercel dashboard → Integrations → Stripe → **Install** dropdown → **Import Existing Stripe Account** → **Continue to Stripe** → approve → **Done** → connect the project → **redeploy**.

### Option 2: Keys from the Stripe Dashboard, added by hand

You copy keys from Stripe and add them to Vercel per environment (A3).

### Recommendation: Option 2 (manual)

Reasons:
- **You want test keys on Preview and live keys only on Production.** Every non-`main` branch gets a preview deployment. With manual vars you control that split. The Vercel docs don't say how the Marketplace integration scopes live keys across environments once you import a live account. If you use it, run `vercel env ls` after going live and confirm Preview doesn't have a live `sk_live_` key.
- **You need the webhook signing secret anyway.** It comes from the webhook endpoint you register in Stripe (A8), and it differs per endpoint (local CLI, test-mode prod endpoint, live-mode prod endpoint). Whether the integration provides it isn't documented, so plan on adding `STRIPE_WEBHOOK_SECRET` yourself either way.
- Your account must be fully verified (A1) before live payments either way, so the Marketplace doesn't skip that step.

The Marketplace sandbox is fine for trying things out. If you start there, you can still switch to manual vars later. Remove the integration's project connection first so two sources don't fight over the same names.

> Vercel's Marketplace guidance recommends **Shopify** for full catalog stores, since it covers catalog, cart, checkout and payments. You already have a catalog, cart and checkout UI in your own database, and Stripe Checkout fits on top of that with far less rework. Shopify only makes sense if you'd rather manage products, inventory and fulfillment in Shopify's admin than in SQL.

---

## A3. API keys and environment variables

### The three kinds of key

| Key | Prefix | Used where | Secret? |
| --- | --- | --- | --- |
| Secret key | `sk_test_…` / `sk_live_…` | Server only (server actions, route handlers) | **Yes.** Full account access. |
| Restricted key | `rk_test_…` / `rk_live_…` | Server only, scoped to specific permissions | Yes, but limited damage if leaked. **Recommended for production.** |
| Publishable key | `pk_test_…` / `pk_live_…` | Browser (Stripe.js) | No. **Hosted Checkout doesn't need it at all.** Only add it if you later embed Stripe Elements. |
| Webhook signing secret | `whsec_…` | Webhook route only | Yes |

### Get the keys

1. Stripe Dashboard → make sure the **Test mode / sandbox** toggle is on → **Developers** → **API keys**.
2. Copy the **Secret key** (`sk_test_…`).
3. (Recommended for production) **Create restricted key** → name `otakuvault-web` → set these permissions, leave everything else None:
   - **Checkout Sessions:** Write
   - **Shipping rates** (if you use `shipping_rate_data`): Write
   - **Products** and **Prices:** Write if you choose D4 option B, otherwise Read or None
   - **Charges / PaymentIntents:** Read
   - **Webhook Endpoints:** None (the app never calls this)

   If a call fails with a permissions error in test mode, add the missing permission. That's the point of testing with the restricted key before you go live.

### Variables

| Name | Value | Development (`.env.local`) | Preview (Vercel) | Production (Vercel) |
| --- | --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_…` or `rk_…` | test key | **test** key | **live** key (at go-live) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | from `stripe listen` (A8) | test endpoint's secret, if you register one for previews | live endpoint's secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_…` | only if you embed Stripe.js later | same | same |

`BETTER_AUTH_URL` (already set) is reused as the site's base URL for Stripe's redirect URLs.

### Add them locally

The repo uses `.env` (loaded by both Next.js and `drizzle.config.ts`). Add to `.env` **or** `.env.local` (both are gitignored; `.env.local` wins in Next.js):

```bash
# .env.local
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # filled in during A8
```

Also add empty placeholders to `.env.example` so the variable names are documented:

```bash
# Stripe (test keys locally; see docs/store-setup-guide.md)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

### Add them on Vercel

Dashboard: **Vercel → otakuvault → Settings → Environment Variables → Add**. Enter the name and value, tick only the environments the value belongs to (table above), and mark it **Sensitive**.

Or with the CLI:

```bash
vercel env add STRIPE_SECRET_KEY preview       # paste the sk_test_ key
vercel env add STRIPE_SECRET_KEY production    # paste the sk_test_ key for now; swap to live at go-live
vercel env add STRIPE_WEBHOOK_SECRET production
```

Env var changes only apply to **new** deployments. Redeploy after every change (Deployments → ⋯ → **Redeploy**).

> **`vercel env pull` warning.** `vercel env pull .env.local` writes the **Development** environment's variables into `.env.local`, which overrides `.env`. If your Vercel Development environment has the Neon production `DATABASE_URL`, your local app would then run against production. Run `vercel env ls` first, or pull to a separate file (`vercel env pull .env.vercel`) and copy over only the Stripe lines.

Update the table in `DEPLOYMENT.md` with the new variables while you're at it.

---

## A4. Install the SDK

```bash
pnpm add stripe server-only
```

- `stripe` is the official Node SDK. Each SDK version pins a Stripe **API version**, and its TypeScript types match that version. Don't override `apiVersion` unless you have a reason. To see the pinned version: `cat node_modules/stripe/types/apiVersion.d.ts` (or the SDK's [CHANGELOG](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md)). You'll pick the **same API version** when you create webhook endpoints (A8).
- `server-only` makes the build fail if a client component imports a file that uses your secret key. The Next.js docs recommend it in *Server and Client Components → Preventing environment poisoning*.

Install the **Stripe CLI** in WSL (used in A8/A9). See <https://docs.stripe.com/stripe-cli/install>. For Debian/Ubuntu, use the apt repository instructions on that page, then:

```bash
stripe login          # opens a browser to pair the CLI with your account (test mode)
stripe --version
```

---

## A5. Database changes for orders

The existing `orders` / `order_items` tables are a start, but checkout needs a few more columns:

- `orders.user_id` must become **nullable** for guest checkout (D3). Its FK changes to `on delete set null` so deleting an account doesn't fail just because they once bought something.
- `orders` needs the buyer's email, a price breakdown (subtotal/shipping/tax), currency, shipping address, the PaymentIntent id (for refunds) and timestamps.
- `order_items` needs `variant_id` (to decrement the right stock) plus a title/variant snapshot so old orders still read correctly after you edit or delete a product.

### Step 1: Edit `lib/db/schema.ts`

Replace the `orders` and `orderItems` definitions (around lines 179–199) with:

```ts
// lib/db/schema.ts
export const orderStatus = pgEnum("order_status", ["pending", "paid", "fulfilled", "cancelled", "refunded"]);

export type ShippingAddress = {
  name: string | null;
  address: {
    line1: string | null; line2: string | null; city: string | null;
    state: string | null; postal_code: string | null; country: string | null;
  } | null;
};

export const orders = pgTable("orders", {
  id: id(),
  // Null for guest checkouts, and for orders whose account was later deleted.
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  email: text("email"),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  currency: text("currency").notNull().default("usd"),
  subtotal: integer("subtotal").notNull().default(0), // cents
  shipping: integer("shipping").notNull().default(0), // cents
  tax: integer("tax").notNull().default(0), // cents
  total: integer("total").notNull(), // cents; Stripe's amount_total once paid
  shippingAddress: jsonb("shipping_address").$type<ShippingAddress>(),
  status: orderStatus("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("orders_user_id_idx").on(t.userId),
  index("orders_payment_intent_idx").on(t.stripePaymentIntentId),
]);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  // Snapshot at purchase time, so the order still reads right after the product is edited.
  title: text("title").notNull().default(""),
  variantLabel: text("variant_label"),
  quantity: integer("quantity").notNull(),
  priceAtPurchase: integer("price_at_purchase").notNull(), // cents, per unit
}, (t) => [
  index("order_items_order_id_idx").on(t.orderId),
  check("order_items_quantity_positive", sql`${t.quantity} > 0`),
]);
```

If you chose D4 option B, also add the Stripe price column now (see A6).

If you're also doing Part B, make the B5 schema changes **in the same edit** so you only generate one migration.

### Step 2: Generate and review the migration

```bash
pnpm db:up                                   # local Postgres in Docker
pnpm db:generate --name stripe_checkout      # writes drizzle/0004_stripe_checkout.sql
```

Open the new SQL file and check it contains:
- `ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL;`
- the FK `orders_user_id_users_id_fk` dropped and re-added with `ON DELETE set null`
- `ADD COLUMN` lines for the new columns, all nullable or with defaults (safe on a table with rows)
- nothing that drops data.

### Step 3: Apply

```bash
pnpm db:migrate                                                     # local
DATABASE_URL='<Neon DIRECT connection string>' pnpm db:migrate      # production, per DEPLOYMENT.md
```

Never `db:push` against production (see `DEPLOYMENT.md`). Commit the schema change and the generated `drizzle/0004_*.sql` + `drizzle/meta/*` together.

---

## A6. Products and prices: Stripe vs your database

### Option A (recommended): the database stays the only price list

At checkout the server reads each item's price **from Postgres** and sends it to Stripe inline with `price_data`. Nothing needs syncing, and editing a price in the DB takes effect on the next checkout. Stripe shows the item name, description and image you pass in.

Trade-off: Stripe's product reports group by name, not by a Stripe Product object. You still get full line items on every payment, and your own `order_items` table is the real record.

### Option B: mirror products in Stripe and store `stripe_price_id`

Choose this if you want Stripe Dashboard product reporting, Payment Links, or Stripe-managed prices.

1. Add columns (in the same schema edit as A5):

   ```ts
   // lib/db/schema.ts — in products
   stripeProductId: text("stripe_product_id").unique(),

   // lib/db/schema.ts — in productVariants
   stripePriceId: text("stripe_price_id").unique(),
   ```

   Products **without** variants need a price too. Either add `stripePriceId` to `products` as well, or give every product at least one variant row.

2. Create the objects. In the Dashboard: **Product catalog → + Add product** → name, image, one-off price in USD → save → copy the `price_…` id. With 26 products and ~60 variants, a one-off script is faster. Create `scripts/sync-stripe-prices.ts`, run it with `pnpm tsx scripts/sync-stripe-prices.ts`, and have it:
   - for each product without `stripe_product_id`: `stripe.products.create({ name, description, images, metadata: { productId } })` and save the id;
   - for each variant (or product) without `stripe_price_id`: `stripe.prices.create({ product, currency: "usd", unit_amount, metadata: { variantId } })` and save the id.
3. **Stripe Prices are immutable.** To change a price you create a new Price, save its id, and archive the old one (`stripe.prices.update(old, { active: false })`). Every price edit in the DB has to go through that script, or Stripe and the DB drift apart.
4. Test mode and live mode have **separate** catalogs. Run the sync again with live keys at go-live and store the live ids. Test ids won't work with live keys.
5. In A7 replace `price_data: {…}` with `price: variant.stripePriceId` and still verify the DB price server-side.

The rest of this guide uses **Option A**.

---

## A7. Build the checkout

Flow:

```
Cart (browser) ──"Continue to payment"──▶ server action startCheckout()
   │                                      • re-reads every price & stock from Postgres
   │                                      • inserts a pending order + items
   │                                      • creates a Stripe Checkout Session
   ◀──────────── redirect to checkout.stripe.com ─┘
Stripe hosted page (address, shipping speed, card / Apple Pay / Google Pay)
   ├─ success ─▶ /store/checkout/success?session_id=cs_...  (shows result, clears cart)
   └─ cancel  ─▶ /store/cart
Stripe ──webhook──▶ /api/webhooks/stripe  ──▶ fulfillCheckout(): order → paid, stock decremented
```

Docs: [Checkout quickstart](https://docs.stripe.com/checkout/quickstart) · [Create Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create) · [Collect shipping](https://docs.stripe.com/payments/checkout/shipping) · Next.js: `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `…/03-api-reference/04-functions/redirect.md`.

### Step 1: Stripe client: `lib/stripe.ts` (new)

```ts
// lib/stripe.ts
import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

// Created on first use so a missing key fails the request that needs it,
// not the build or unrelated pages.
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client = new Stripe(key, { appInfo: { name: "OtakuVault" } });
  return client;
}

// Public base URL for Stripe's redirects. BETTER_AUTH_URL is already the site's origin.
export function siteUrl(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw new Error("BETTER_AUTH_URL is not set");
  return url.replace(/\/$/, "");
}
```

### Step 2: Shipping rules shared by UI and server

Express shipping is hard-coded as `1400` in `CheckoutClient.tsx`. Move it next to the other shipping constants so the server uses the same numbers:

```ts
// lib/store-shared.ts — next to FREE_SHIPPING_FROM / SHIPPING_FLAT
export const SHIPPING_EXPRESS_EXTRA = 1400; // cents, on top of standard shipping
// Countries Stripe Checkout will accept a shipping address for (D6).
export const SHIP_TO_COUNTRIES = ["US"] as const; // e.g. ["US", "CA", "GB", "DE", "FR", "AU", "JP"]
export const standardShipping = (subtotal: number) => (subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FLAT);
```

### Step 3: Fulfillment function: `lib/checkout.ts` (new)

The webhook (A8) and the success page both call this. It's safe to run more than once, including concurrently, which is what [Stripe's fulfillment guide](https://docs.stripe.com/checkout/fulfillment) requires: the `UPDATE … WHERE status = 'pending'` can only succeed once per order.

```ts
// lib/checkout.ts
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, orderItems, orders, productVariants, type ShippingAddress } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export type FulfillResult = "paid" | "already-paid" | "awaiting-payment" | "unknown-order";

export async function fulfillCheckout(sessionId: string): Promise<FulfillResult> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const orderId = session.metadata?.orderId;
  if (!orderId) return "unknown-order"; // e.g. a session made by `stripe trigger`
  // "unpaid" = a delayed method (bank debit) still processing; async_payment_succeeded comes later.
  if (session.payment_status === "unpaid") return "awaiting-payment";

  const ship = session.collected_information?.shipping_details;
  const shippingAddress: ShippingAddress | null = ship
    ? { name: ship.name ?? null, address: ship.address ? { ...ship.address } : null }
    : null;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  return db.transaction(async (tx) => {
    // Flip pending → paid exactly once; a second (or concurrent) call matches no row.
    const [order] = await tx.update(orders).set({
      status: "paid",
      paidAt: new Date(),
      email: session.customer_details?.email ?? null,
      total: session.amount_total ?? 0,
      shipping: session.total_details?.amount_shipping ?? 0,
      tax: session.total_details?.amount_tax ?? 0,
      shippingAddress,
      stripePaymentIntentId: paymentIntentId,
    }).where(and(
      eq(orders.id, orderId),
      eq(orders.stripeSessionId, session.id),
      eq(orders.status, "pending"),
    )).returning({ id: orders.id });

    if (!order) return "already-paid";

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      if (!item.variantId) continue;
      await tx.update(productVariants)
        .set({ stock: sql`greatest(${productVariants.stock} - ${item.quantity}, 0)` })
        .where(eq(productVariants.id, item.variantId));
    }
    // TODO (your choice): email yourself a packing slip, or push to your fulfillment partner (D10).
    return "paid";
  });
}
```

> `collected_information.shipping_details` is where recent Stripe API versions put the shipping address. Older API versions used `session.shipping_details`. If TypeScript says the property doesn't exist, check which API version your SDK pins (A4).

> **Overselling:** stock is checked when the session is created and decremented when payment lands. Two people can buy the last item in the same minute. At your volume that's rare. If it happens, refund one of them from the Dashboard. You can also reserve stock at session creation and release it on `checkout.session.expired` (A8).

### Step 4: Server action: `app/actions/checkout.ts` (new)

The browser sends **only ids and quantities**. Every price, title and stock level is read again from Postgres. This is the most important security rule in this guide.

```ts
// app/actions/checkout.ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, orderItems, orders, productVariants, products } from "@/lib/db";
import { getStripe, siteUrl } from "@/lib/stripe";
import { CART_MAX_QTY, SHIP_TO_COUNTRIES, SHIPPING_EXPRESS_EXTRA, standardShipping } from "@/lib/store-shared";

export type CheckoutLine = { productId: string; variantId: string | null; qty: number };

// Called from the checkout page. Redirects to Stripe on success, returns { error } otherwise.
export async function startCheckout(lines: CheckoutLine[]): Promise<{ error: string }> {
  // Treat input as hostile: anyone can POST to a server action.
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) return { error: "Your cart is empty." };

  const session = await auth.api.getSession({ headers: await headers() });

  const productIds = [...new Set(lines.map((l) => String(l.productId)))];
  const [rows, variants] = await Promise.all([
    db.select().from(products).where(inArray(products.id, productIds)),
    db.select().from(productVariants).where(inArray(productVariants.productId, productIds)),
  ]);

  const items: { productId: string; variantId: string | null; title: string; label: string | null; image: string | null; qty: number; unit: number }[] = [];
  for (const line of lines) {
    const p = rows.find((r) => r.id === line.productId);
    // With Part B: also reject `p.sellMode !== "direct"` here (B9).
    if (!p) return { error: "An item in your cart is no longer sold. Remove it and try again." };
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > CART_MAX_QTY) return { error: "Invalid quantity." };

    const own = variants.filter((v) => v.productId === p.id);
    const v = own.length ? own.find((x) => x.id === line.variantId) : null;
    if (own.length && !v) return { error: `Pick a size or colour for ${p.title}.` };
    if (v && v.stock < qty) return { error: `${p.title} doesn't have ${qty} left in that option.` };

    items.push({
      productId: p.id, variantId: v?.id ?? null, title: p.title,
      label: [v?.color, v?.size].filter(Boolean).join(" · ") || null,
      image: p.imageUrl, qty, unit: v?.price ?? p.price,
    });
  }

  const subtotal = items.reduce((n, i) => n + i.unit * i.qty, 0);
  const standard = standardShipping(subtotal);

  // 1. Record the order as pending before Stripe knows about it.
  const [order] = await db.insert(orders).values({
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    subtotal, total: subtotal, status: "pending",
  }).returning({ id: orders.id });
  await db.insert(orderItems).values(items.map((i) => ({
    orderId: order.id, productId: i.productId, variantId: i.variantId,
    title: i.title, variantLabel: i.label, quantity: i.qty, priceAtPurchase: i.unit,
  })));

  // 2. Create the hosted Checkout Session.
  const origin = siteUrl();
  const checkout = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: items.map((i) => ({
      quantity: i.qty,
      price_data: {
        currency: "usd",
        unit_amount: i.unit,
        product_data: {
          name: i.title,
          ...(i.label ? { description: i.label } : {}),
          // Stripe fetches images itself, so they must be public absolute URLs (Vercel Blob URLs are).
          ...(i.image?.startsWith("https://") ? { images: [i.image] } : {}),
          metadata: { productId: i.productId, variantId: i.variantId ?? "" },
        },
      },
    })),
    shipping_address_collection: { allowed_countries: [...SHIP_TO_COUNTRIES] },
    shipping_options: [
      { shipping_rate_data: {
        type: "fixed_amount", display_name: "Standard",
        fixed_amount: { amount: standard, currency: "usd" },
        delivery_estimate: { minimum: { unit: "business_day", value: 5 }, maximum: { unit: "business_day", value: 8 } },
      } },
      { shipping_rate_data: {
        type: "fixed_amount", display_name: "Express",
        fixed_amount: { amount: standard + SHIPPING_EXPRESS_EXTRA, currency: "usd" },
        delivery_estimate: { minimum: { unit: "business_day", value: 2 }, maximum: { unit: "business_day", value: 3 } },
      } },
    ],
    // automatic_tax: { enabled: true },   // only after you've set up Stripe Tax (D7, A10)
    ...(session?.user.email ? { customer_email: session.user.email } : {}),
    client_reference_id: order.id,
    metadata: { orderId: order.id },
    payment_intent_data: { metadata: { orderId: order.id } },
    success_url: `${origin}/store/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store/cart`,
  }, { idempotencyKey: `checkout-${order.id}` });

  await db.update(orders).set({ stripeSessionId: checkout.id }).where(eq(orders.id, order.id));

  // redirect() throws, so it must stay outside any try/catch. Absolute URLs are allowed.
  redirect(checkout.url!);
}
```

Notes:
- `{CHECKOUT_SESSION_ID}` is a literal placeholder that Stripe fills in. Keep the braces.
- Leaving `ui_mode` out gives you the hosted page (the default).
- Cards, Apple Pay, Google Pay and Link are controlled from **Dashboard → Settings → Payment methods**, not in code. Turn on only the methods you want.
- Stripe sends receipts itself once you enable them (A10).

### Step 5: Wire the button: `app/store/_components/CheckoutClient.tsx`

Stripe now collects the address, country and shipping speed, so the placeholder form goes. The checkout page becomes "review your order, then continue to Stripe". Replace the component with:

```tsx
// app/store/_components/CheckoutClient.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { startCheckout } from "@/app/actions/checkout";
import { useCartStore } from "@/lib/cart-store";
import { LineItem, Summary } from "./CartClient";
import { useHydrated } from "./StoreBits";

export default function CheckoutClient({ email }: { email: string }) {
  const hydrated = useHydrated();
  const stored = useCartStore((s) => s.items);
  const items = hydrated ? stored : [];
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return <div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading checkout…</p></div>;
  if (!items.length) {
    return <div className="ov-empty"><strong>Nothing to check out</strong>Your cart is empty. <Link className="ov-link" href="/store">Back to the store</Link>.</div>;
  }

  const pay = () => startTransition(async () => {
    setError(null);
    // Only ids and quantities go to the server; it looks up prices itself.
    const res = await startCheckout(items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })));
    if (res?.error) setError(res.error);
  });

  return (
    <div className="ct co">
      <div className="ov-stack">
        <section className="ov-panel co-pay">
          <h2 className="ov-title">Payment</h2>
          <p className="ov-sub">
            You&apos;ll enter your shipping address and card on Stripe&apos;s secure page. OtakuVault never sees or stores your card number.
            {email && <> Your receipt goes to {email}.</>}
          </p>
        </section>
        {error && <div className="ov-error" role="alert">{error}</div>}
        <button type="button" className="btn btn-primary co-submit" disabled={pending} onClick={pay}>
          {pending ? "Opening secure checkout…" : "Continue to payment"}
        </button>
        <p className="ov-hint">Shipping speed and any tax are chosen and shown on the next page.</p>
      </div>
      <Summary items={items}>
        <ul className="ct-items co-items">{items.map((i) => <LineItem key={i.key} item={i} editable={false} />)}</ul>
        <Link className="ov-link" href="/store/cart">Edit cart</Link>
      </Summary>
    </div>
  );
}
```

`ov-error` may not exist in your CSS. Use whatever class your other forms use for error text.

### Step 6: Success page: `app/store/checkout/success/page.tsx` (new)

Stripe recommends also running fulfillment when the buyer lands back on your site, because webhooks can be a few seconds late. The function is idempotent, so running it in both places is safe. `searchParams` is request data, so under `cacheComponents` it has to be read inside a `<Suspense>` boundary, the same pattern the other store pages use.

```tsx
// app/store/checkout/success/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { fulfillCheckout } from "@/lib/checkout";
import ClearCart from "../../_components/ClearCart";

export const metadata: Metadata = { title: "Order confirmed · Store · OtakuVault", robots: { index: false } };

async function Result({ searchParams }: PageProps<"/store/checkout/success">) {
  const { session_id } = await searchParams;
  const id = typeof session_id === "string" && session_id.startsWith("cs_") ? session_id : null;
  const result = id ? await fulfillCheckout(id).catch(() => "unknown-order" as const) : "unknown-order";

  if (result === "paid" || result === "already-paid") {
    return (
      <div className="ov-panel">
        <ClearCart />
        <h2 className="ov-title">Thank you, your order is in</h2>
        <p className="ov-sub">A receipt from Stripe is on its way to your email. We&apos;ll email again when it ships.</p>
        <Link className="btn btn-primary" href="/store">Back to the store</Link>
      </div>
    );
  }
  if (result === "awaiting-payment") {
    return <div className="ov-panel"><ClearCart /><h2 className="ov-title">Payment processing</h2><p className="ov-sub">Your bank payment is still clearing. We&apos;ll email you once it does.</p></div>;
  }
  return <div className="ov-empty"><strong>We couldn&apos;t find that order</strong>If you were charged, email us and we&apos;ll sort it out. <Link className="ov-link" href="/store/cart">Back to your cart</Link>.</div>;
}

export default function SuccessPage(props: PageProps<"/store/checkout/success">) {
  return (
    <main className="ov-page">
      <div className="ov-page-head"><h1 className="ov-masthead">Order confirmed</h1></div>
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Confirming your payment…</p></div>}>
        <Result {...props} />
      </Suspense>
    </main>
  );
}
```

`PageProps<"/store/checkout/success">` is the generated route type the app already uses (see `app/store/[productId]/page.tsx`). It appears after the next `pnpm dev`/`pnpm build`.

And the small client component that empties the cart:

```tsx
// app/store/_components/ClearCart.tsx
"use client";

import { useEffect } from "react";
import { useCartStore } from "@/lib/cart-store";

export default function ClearCart() {
  useEffect(() => { useCartStore.getState().clear(); }, []);
  return null;
}
```

### Step 7: Update the "coming soon" copy

- `app/store/page.tsx`: the lede "Browse now; checkout opens soon."
- `app/store/_components/ProductDetailClient.tsx`: the line "Checkout isn't open yet. Your cart is saved on this device until it is."
- `README.md`: tick "Store with Stripe Checkout".

### Step 8 (optional): Order history

`orders` now records `user_id`, so a signed-in member's orders are one query away: `db.select().from(orders).where(eq(orders.userId, session.user.id))`. A simple `/settings/orders` or profile tab is a good follow-up, since `README.md` promises "order history".

---

## A8. Webhooks

The webhook is what reliably marks orders paid. Customers sometimes close the tab before the success page loads.

Docs: [Fulfill orders](https://docs.stripe.com/checkout/fulfillment) · [Webhooks](https://docs.stripe.com/webhooks) · [Signature verification](https://docs.stripe.com/webhooks/signature) · Next.js: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `…/02-guides/backend-for-frontend.md` ("Webhooks and callback URLs").

### Step 1: The route handler: `app/api/webhooks/stripe/route.ts` (new)

Key points:
- Read the **raw** body with `await request.text()`. Signature verification fails on re-serialized JSON.
- `POST` route handlers always run at request time, so no caching config is needed. Don't add `export const runtime = "edge"`, because the default Node.js runtime is what you want.
- `proxy.ts` only matches `/collection`, `/settings`, etc., so it won't redirect Stripe to `/login`. Keep `/api/webhooks/*` out of that matcher.

```ts
// app/api/webhooks/stripe/route.ts
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db, orders } from "@/lib/db";
import { fulfillCheckout } from "@/lib/checkout";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return new Response("Missing signature or secret", { status: 400 });

  const body = await request.text(); // raw body, required for signature verification
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckout(event.data.object.id);
        break;

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const orderId = event.data.object.metadata?.orderId;
        if (orderId) {
          await db.update(orders).set({ status: "cancelled" })
            .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        // Only mark fully refunded charges; partial refunds keep the order as paid.
        if (charge.refunded && typeof charge.payment_intent === "string") {
          await db.update(orders).set({ status: "refunded" })
            .where(eq(orders.stripePaymentIntentId, charge.payment_intent));
        }
        break;
      }
    }
  } catch (err) {
    console.error("stripe webhook failed", event.type, event.id, err);
    // A non-2xx makes Stripe retry with backoff (for up to ~3 days in live mode).
    return new Response("Handler error", { status: 500 });
  }

  return Response.json({ received: true });
}
```

**Idempotency:** Stripe can deliver the same event more than once, and the success page may run fulfillment at the same time. Every write above is conditional (`status = 'pending'`), so duplicates do nothing. If you add side effects later, such as emails or a fulfillment-partner API call, put them **inside** the "row was updated" branch of `fulfillCheckout` so they also run only once.

### Step 2: Test locally with the Stripe CLI

Terminal 1:
```bash
pnpm dev
```

Terminal 2:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded
```

It prints `Ready! Your webhook signing secret is whsec_…`. Put that in `.env.local` as `STRIPE_WEBHOOK_SECRET` and restart `pnpm dev`. This secret only works for the CLI and stays the same across `stripe listen` runs on this machine.

Then:
- Do a real test checkout in the browser (A9). Terminal 2 should show `checkout.session.completed → [200]`.
- `stripe trigger checkout.session.completed` sends a synthetic event. It has no `orderId`, so the handler correctly ignores it. Use it only to confirm signature verification works (`[200]`, not `[400]`).
- `stripe events resend evt_…` re-sends a real event. Use it to confirm a duplicate doesn't double-decrement stock.

### Step 3: Register the production endpoint

Do this once in **test mode** (so your deployed site works with test cards) and again in **live mode** at go-live.

1. Stripe Dashboard → **Developers** → **Webhooks**. Newer accounts reach this through **Workbench → Webhooks / Event destinations**.
2. **Add destination** (or **Add endpoint**).
3. **Events from:** *Your account*. **API version:** the version your installed SDK pins (A4).
4. Select events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
5. Destination type **Webhook endpoint**, URL: `https://<your production domain>/api/webhooks/stripe`.
6. Create it, open the endpoint, **Reveal** the **Signing secret** (`whsec_…`) and add it to Vercel as `STRIPE_WEBHOOK_SECRET` for **Production**. Redeploy.
7. Use **Send test event** on the endpoint page, or do a test purchase, and check the delivery shows **200**.

Preview deployments: with the test keys on Preview, Stripe can't reach previews anyway if **Vercel Deployment Protection** is on (it returns 401). The success page still marks orders paid, which is enough for testing a preview. Don't point a webhook at a preview URL unless you set up a protection bypass.

---

## A9. Test end to end in test mode

Use Stripe's [test cards](https://docs.stripe.com/testing), with any future expiry, any CVC and any postal code:

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0025 0000 3155` | Asks for 3-D Secure authentication, then succeeds |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0002` | Declined (generic) |

Test script (do all of it, locally and then on the deployed site):

1. Add 2 products to the cart, one with a variant (e.g. a hoodie size M) and one without.
2. Go to `/store/checkout` → **Continue to payment**. You land on `checkout.stripe.com` with the right items, prices and the $6.95 / free shipping rule.
3. **Edit the price in DevTools** before clicking: open DevTools → Application → Local Storage → `ov-cart`, change a `price` to `1`, reload, check out. Stripe must still show the **real** price. This proves server-side pricing works.
4. Pay with `4242…`. You land on `/store/checkout/success`, and the cart is empty.
5. Check the database (`pnpm db:studio`): the order is `paid`, has email, address, shipping and total, and the variant's `stock` went down by the quantity.
6. Stripe Dashboard → **Payments**: the payment shows with metadata `orderId`.
7. Repeat with `4000 0000 0000 9995`. Stripe shows the decline, and no order becomes `paid`.
8. Start a checkout and click the back arrow on Stripe's page. You're back at the cart, and the order stays `pending`. (`checkout.session.expired` fires after 24 h. Trigger it sooner with `stripe checkout sessions expire cs_test_…`, then confirm the order becomes `cancelled`.)
9. Refund the test payment in Dashboard → Payments → ⋯ → **Refund**. The order becomes `refunded`.
10. Signed out: check out as a guest. The order has `user_id` NULL and the email from Stripe.
11. Set a variant's stock to 0, then try to buy it. You get the "doesn't have N left" error.

---

## A10. Go-live checklist

Work through this in order, after A9 passes on the deployed site with test keys.

1. **Account verified** (A1): Dashboard shows no "Complete your profile" banner, and payouts are enabled.
2. **Payouts:** Settings → **Payouts** → bank account confirmed. Choose a schedule (daily automatic is the default; the first payout usually takes about a week).
3. **Live restricted key:** toggle test mode **off** → Developers → API keys → create the restricted key again (A3) in live mode.
4. **Vercel:** set `STRIPE_SECRET_KEY` for **Production only** to the live key. Leave Preview and Development on test keys.
5. **Live webhook endpoint** (A8 step 3, in live mode) → its new `whsec_…` → `STRIPE_WEBHOOK_SECRET` in **Production**.
6. **D4 option B only:** run the price sync against live mode and store the live price ids.
7. **Receipts:** Settings → **Customer emails** (Business → Customer emails) → turn on **Successful payments** and **Refunds**. Settings → **Branding** → add your logo and accent colour, which also style the hosted Checkout page.
8. **Tax (D7):** if you'll collect tax, Settings → **Tax** → set your origin address and default product tax code (e.g. general tangible goods) → add **registrations** for each state/country where you're registered → then uncomment `automatic_tax: { enabled: true }` in `startCheckout`, and add `tax_behavior: "exclusive"` to each `price_data` and `shipping_rate_data`. Test in test mode first. Docs: [Stripe Tax with Checkout](https://docs.stripe.com/tax/checkout).
9. **Policy pages on the site:** Stripe's reviewers and card networks expect these to be visible ([checklist](https://docs.stripe.com/get-started/checklist/website)):
   - **Refund & return policy** (new page, e.g. `app/store/returns/page.tsx`). State the return window, condition rules, who pays return shipping, and how long refunds take.
   - **Shipping policy** (processing time, carriers, countries, what happens with lost parcels).
   - **Contact** (support email at minimum; the privacy page uses `privacy@otakuvault.example`, a placeholder you need to replace).
   - **Terms** (`app/terms/page.tsx`): add a "Purchases" section covering pricing errors, cancellations and the governing law.
   - **Privacy** (`app/privacy/page.tsx`): add that Stripe processes payments, that you store name, email, shipping address and order history, and why (see B8 for the affiliate additions).
   - Link all of them from the footer and from the checkout page. Stripe can also show your policy links on the hosted page: Settings → Checkout and Payment Links → **Policies**.
10. **Radar** (fraud): on by default. Settings → **Radar** → consider blocking payments where the CVC check or postal-code check fails.
11. **Disputes:** know where they appear (Dashboard → Payments → Disputes). Keep shipping proof (tracking numbers) for every order. The dispute fee is charged even if you win.
12. **Refunds:** issue them from Dashboard → Payments → the payment → **Refund**. The webhook marks the order `refunded`. Refund on the original card. The Stripe fee isn't returned.
13. **Fulfillment ready (D10):** you know who ships each `paid` order and how you'll mark it `fulfilled`. For now that can be a manual SQL update or Drizzle Studio edit.
14. **Copy updated** (A7 step 7), and `DEPLOYMENT.md` lists the Stripe env vars.
15. **Redeploy production**, then make **one real purchase** with your own card for a cheap item, confirm the order goes `paid`, the webhook delivery is 200 in the **live** endpoint's log, and the receipt email arrives. Then refund it.
16. Watch Dashboard → Developers → **Webhooks** for failed deliveries for the first few days.

---

## A11. Security rules

- **The secret key only lives in server code.** It's used only in `lib/stripe.ts` (protected by `import "server-only"`), server actions, and route handlers. Never prefix it with `NEXT_PUBLIC_`. Never paste it in chat, issues or commits. If it leaks: Dashboard → API keys → **Roll key**, update Vercel, redeploy.
- **Use a restricted key** in production (A3).
- **Never trust prices, totals or stock from the browser.** The cart in `localStorage` is for display only. `startCheckout` re-reads everything from Postgres, and the amount you record as paid comes from Stripe's session (`amount_total`), not your own math.
- **Server actions are public endpoints.** Next.js docs: "Treat every action as an untrusted entry point". Validate every field, as `startCheckout` does (array length, qty bounds, ids exist).
- **Always verify webhook signatures** with the raw body. Reject anything that fails with a 400.
- **Make fulfillment idempotent.** Conditional updates (`WHERE status = 'pending'`) mean duplicate events and the success page can't double-fulfill.
- **Never mark an order paid from the success URL alone without asking Stripe.** `fulfillCheckout` always retrieves the session from Stripe and checks `payment_status`. A forged `?session_id=` can't fake a payment.
- **Keep test and live separate:** test keys on Preview/Development, live only on Production.
- **No card data touches your server**, which keeps you in the simplest PCI scope (SAQ A) with hosted Checkout. Stripe has you confirm this yearly in the Dashboard.

---

# Part B: Affiliate links

## B1. The catalog problem to solve first

Affiliate links point at **real products sold by a real retailer**. The products in `drizzle/seeds/products.sql` are invented ("Limitless 1/7 Scale Figure" by "Kumo Works"), so no retailer sells them and no affiliate link can point at them.

To add affiliate products you need to:

1. **Pick real, licensed products** that fit your audience: e.g. a specific Good Smile Nendoroid, a Funko Pop, the official *Frieren* art book from the English publisher, a manga box set from VIZ / Yen Press / Kodansha. The recommendation engine already works per AniList title (`related_anilist_ids`), so map each real product to the right AniList id and it shows up in "Recommended for You".
2. Add each one as a `products` row with `sell_mode = 'affiliate'` (B5) and one or more retailer links.
3. **Images:** don't copy retailer product photos onto your site unless the program allows it. Amazon provides images through SiteStripe image links and the Creators API. Other programs usually provide banners or product images in their dashboards. Otherwise use your existing glyph art (`ProductArt` already falls back to it when `image_url` is null).
4. Decide what happens to the fictional seed products: delete them, keep them as your own original designs (D1), or hide them.

## B2. Which programs fit an anime store

Checked Nov 2026. Third-party listings disagree a lot, so the "Verify" column says how sure each figure is. **Always read the current terms in each program's dashboard before you rely on them.**

| Program | Sells | Commission | Cookie | Network / how to join | Verify |
| --- | --- | --- | --- | --- | --- |
| **Amazon Associates** (US) | Everything: figures, manga, Blu-ray, apparel | Category-based, roughly 1–4.5%; toys reportedly ~3% | 24 h after click (90 days for items added to cart in that window) | [affiliate-program.amazon.com](https://affiliate-program.amazon.com/) | Official site. Check the [fee schedule](https://affiliate-program.amazon.com/help/operating/schedule) for current rates. |
| **HobbyLink Japan (HLJ)** | Figures, Gunpla, model kits, imported goods | **3%** of each order via your link | Link-tracked (see their terms) | [hlj.com/affiliate-program](https://www.hlj.com/affiliate-program). Applications reviewed manually. | Official page (3%) |
| **Entertainment Earth** | Licensed figures, Funko, collectibles incl. anime | "Up to 15%" per their page; third parties list 5–10% | Reported 5–60 days (conflicting) | [entertainmentearth.com/affiliate-program](https://www.entertainmentearth.com/affiliate-program). Free. Also listed on some networks. | Official page for "up to 15%". Cookie unconfirmed. |
| **CDJapan** | Japanese CDs/Blu-ray, manga, figures, shipped from Japan | Reported 5–7%, tiered by sales volume | (check) | Their site → Affiliate program | Third-party only |
| **Tokyo Otaku Mode** | Figures, apparel, goods from Japan | Reported 5% | Reported 30 days | Program status **unclear**. One network lists it as deactivated. | Check otakumode.com before applying |
| **Crunchyroll Store** | Official anime merch | Reported 5–12% (conflicting) | – | Was on Impact. In 2026 the store reportedly moved behind a Crunchyroll subscription, and its program status is unclear. | **Not recommended right now.** Recheck later. |
| AmiAmi, Good Smile Company | Figures | No public affiliate program found | – | – | Don't count on them |
| Right Stuf | – | – | – | Merged into Crunchyroll Store in 2023. **Gone.** | – |

**Recommendation:** start with **Amazon Associates** for manga, Blu-rays and widely stocked figures, plus **HobbyLink Japan** and/or **Entertainment Earth** for figures and collectibles. That's enough to launch. Add more once you see which links get clicks (B6).

A fallback worth knowing: auto-affiliate networks (e.g. Sovrn Commerce, Skimlinks) rewrite ordinary retailer links into affiliate links across thousands of merchants with one signup. They pay less per sale, but they cover shops that have no program of their own.

Sources for this table: [Amazon Associates](https://affiliate-program.amazon.com/), [HLJ affiliate program](https://www.hlj.com/affiliate-program), [Entertainment Earth affiliate program](https://www.entertainmentearth.com/affiliate-program), [UpPromote anime programs list](https://uppromote.com/affiliate-programs/anime/), [Affilorama anime programs 2026](https://www.affilorama.com/blog/best-anime-affiliate-programs), [affi.io Tokyo Otaku Mode listing](https://affi.io/m/tokyo-otaku-mode-inc-deactivated), [GamesRadar on the Crunchyroll Store change](https://www.gamesradar.com/entertainment/anime-shows/the-crunchyroll-store-change-is-even-worse-than-it-sounded-a-usd10-subscription-lets-you-browse-but-you-wont-be-allowed-to-buy/).

## B3. Apply to Amazon Associates

**Before you apply:** the site must be live and public with real original content (it is: collections, forum, title pages), plus the store pages where links will go. The affiliate disclosure (B8) must be in place before the first link goes live.

1. Go to <https://affiliate-program.amazon.com/> → **Sign up**. Use your normal Amazon account, or create one for the business.
2. **Account information:** payee name and address. Enter the same legal identity as on your tax forms.
3. **Website and mobile app list:** enter your production URL (and your custom domain if you have one). Each site you'll put links on must be listed. Add more later under Account Settings.
4. **Profile:**
   - **Preferred Associates Store ID:** this becomes your **tracking ID**, e.g. `otakuvault-20` (`-20` is the US suffix).
   - Describe the site: *"Anime and manga collection tracker with community forum and a curated store of figures, manga and merchandise."*
   - Topics: Entertainment, Toys & Games, Books.
   - Traffic and monetization questions: answer honestly (how you drive traffic, monthly visitors).
5. **Tax interview:** Account Settings → **Tax Information** (W-9 for US persons). You can't be paid until it's done.
6. **Payment method:** direct deposit or Amazon gift card (the minimum payout is lower than for checks; see Amazon's payment help).
7. **The 180-day clock:** you must make **3 qualifying sales within 180 days** of signing up. Amazon then reviews the site, approves or rejects it, and closes accounts that don't reach 3. Your own purchases and purchases by friends and family you ask to buy don't count and can get you banned.

**Generating links:**
- **SiteStripe** (easiest): while signed in to Associates, browse amazon.com. A toolbar appears at the top of product pages. Click **Get Link** → **Text** → choose **Short link** (`amzn.to/…`) or **Full link** (contains `tag=otakuvault-20`). Copy it into the database (B5).
- **Link to any page:** Associates Central → **Product Linking** → **Link to Any Page**, for search results or category pages.
- **Tracking IDs:** Account Settings → **Manage Tracking IDs** → add a separate ID per placement if you want to compare, e.g. `otakuvault-store-20` vs `otakuvault-forum-20`. Reports then break down by ID.
- **Creators API** (Amazon's replacement for the old Product Advertising API) gives you live prices and images. It's only available after you have **10 qualifying sales in the last 30 days**. Until then, **don't show Amazon prices** (B8).

Docs: [Participation requirements](https://affiliate-program.amazon.com/help/operating/participation/) · [Linking requirements](https://affiliate-program.amazon.com/gp/associates/help/operating/linking/) · [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)

## B4. Apply to the specialty retailers

The process is similar for each:

1. Open the program page (B2 table) and fill in the application: name, site URL, a description of the site and audience, monthly traffic, how you'll promote (on-site product pages, no paid search on their brand, no coupon sites).
2. Most programs ask for a **PayPal address** or bank details and a **US tax form** (W-9).
3. Wait for approval. HLJ and others review by hand and may reject new or low-traffic sites. A store page that already lists their products (without links yet) helps.
4. Once approved, generate links in their dashboard:
   - **HLJ:** product links carry your affiliate id. Use the link builder in the affiliate area, or append your id the way their instructions say. Tracking is by link, with no coupon codes.
   - **Entertainment Earth / network programs:** use the program's **link builder** / "deep link" tool. Paste the product URL and copy the tracked URL.
5. **Test each link:** open it in a private window and check it lands on the right product. Most dashboards show the click within a few hours.
6. Read each program's **prohibited practices**. Common ones: no links in emails, no bidding on their brand name in ads, no "coupon" claims, no cloaking that hides the destination.

## B5. Store affiliate links in the app

### Schema

Add to `lib/db/schema.ts`, in the Store section. Do this in the same edit as A5 if you're doing both, so you only generate one migration.

```ts
// lib/db/schema.ts — in products: how the product is sold.
//   "direct"    = sold here through Stripe (Add to cart)
//   "affiliate" = sold by retailers; we link out
sellMode: text("sell_mode").notNull().default("direct"),
```

```ts
// lib/db/schema.ts — new tables, after productImages
// Retailer links for a product. A product can have several (Amazon, HLJ, ...).
export const productOffers = pgTable("product_offers", {
  id: id(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  retailer: text("retailer").notNull(), // "amazon" | "hlj" | "entertainment-earth" | ...
  url: text("url").notNull(),           // the full tracked affiliate URL
  label: text("label"),                 // optional override, e.g. "Amazon (Kindle)"
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("product_offers_product_id_idx").on(t.productId, t.position)]);

// One row per outbound click. No IP or user agent: just enough to see what gets clicked.
export const affiliateClicks = pgTable("affiliate_clicks", {
  id: id(),
  offerId: text("offer_id").notNull().references(() => productOffers.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("affiliate_clicks_offer_created_idx").on(t.offerId, t.createdAt)]);
```

`products.price` is `NOT NULL`. For affiliate products, store `0` and never display it (B8 explains why you shouldn't show Amazon prices).

Then:
```bash
pnpm db:generate --name affiliate_offers     # or include it in stripe_checkout
pnpm db:migrate
DATABASE_URL='<Neon DIRECT connection string>' pnpm db:migrate
```

Add a display-name map in `lib/store-shared.ts`:

```ts
// lib/store-shared.ts
export const RETAILER_LABEL: Record<string, string> = {
  amazon: "Amazon", hlj: "HobbyLink Japan", "entertainment-earth": "Entertainment Earth", cdjapan: "CDJapan",
};
export type OfferView = { id: string; retailer: string; label: string };
```

### Entering data

There's no admin UI, and the catalog is hand-edited (same as now). Pick one way:

- **Drizzle Studio:** `pnpm db:studio` (locally), or run it with the Neon direct URL to edit production: `DATABASE_URL='<Neon DIRECT>' pnpm db:studio`. Add the product row with `sell_mode = affiliate`, then its `product_offers` rows.
- **Seed SQL:** create `drizzle/seeds/affiliate-products.sql` in the same style as `products.sql` (fixed ids, `on conflict do nothing`):

  ```sql
  -- drizzle/seeds/affiliate-products.sql
  begin;
  insert into products (id, title, brand, series, price, hue, glyph, badge, cat, description, related_anilist_ids, featured, sell_mode, created_at) values
    ('a-frieren-nendoroid', 'Frieren Nendoroid', 'Good Smile Company', 'Frieren: Beyond Journey''s End', 0, 'teal', '葬', null, 'figure',
     'The official Nendoroid with staff, grimoire and swap-out faces.', '{154587}', false, 'affiliate', now())
  on conflict (id) do nothing;

  insert into product_offers (id, product_id, retailer, url, position) values
    ('o-frieren-nendo-amazon', 'a-frieren-nendoroid', 'amazon', 'https://www.amazon.com/dp/XXXXXXXXXX?tag=otakuvault-20', 0),
    ('o-frieren-nendo-hlj',    'a-frieren-nendoroid', 'hlj',    'https://www.hlj.com/...your tracked link...', 1)
  on conflict (id) do nothing;
  commit;
  ```

  (Placeholder product. Replace the ASIN and links with real ones from SiteStripe and your HLJ dashboard.)

- **Later:** an admin page gated on `users.is_admin` (the forum already checks this flag) with a form to add offers. Worth building once you're managing more than ~30 links.

**Link hygiene:** paste the exact link the program generated. Don't edit tracking parameters by hand. Check links monthly, because products go out of stock and URLs change. The click log (B6) shows which links get used.

## B6. Click-tracking redirect route

Buttons link to `/go/<offerId>` instead of straight to the retailer. The route logs the click and redirects. Benefits: you see which links get used, you can fix a broken URL in one place, and the raw affiliate URLs aren't scattered through the HTML.

```ts
// app/go/[offerId]/route.ts
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { affiliateClicks, db, productOffers } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const [offer] = await db.select().from(productOffers)
    .where(and(eq(productOffers.id, offerId), eq(productOffers.active, true))).limit(1);
  if (!offer) return new Response("Link not found", { status: 404 });

  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  // Logging must never block the redirect.
  await db.insert(affiliateClicks).values({ offerId: offer.id, userId: session?.user.id ?? null }).catch(() => {});

  return new Response(null, {
    status: 302, // temporary: never let browsers or crawlers cache the hop
    headers: { Location: offer.url, "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" },
  });
}
```

Notes:
- A dynamic route handler with no `generateStaticParams` runs at request time, so the click is logged on every visit.
- Add `Disallow: /go/` to your robots rules. The repo has no `app/robots.ts` yet; create one, or add a `public/robots.txt` with `User-agent: *` / `Disallow: /go/`.
- **Amazon and redirects:** Amazon allows going through your own redirect as long as the customer can tell the link leads to Amazon. That's why the button text says "Buy on Amazon" (B7). Never disguise where a link goes. Check the current [linking requirements](https://affiliate-program.amazon.com/gp/associates/help/operating/linking/). If you're unsure for a given program, link to its URL directly and skip `/go/` for that retailer.
- Count clicks per product with a query in Drizzle Studio, e.g. `select o.product_id, o.retailer, count(*) from affiliate_clicks c join product_offers o on o.id = c.offer_id where c.created_at > now() - interval '30 days' group by 1,2 order by 3 desc;`.

## B7. Render "Buy at retailer" buttons

### Data: `lib/shop.ts`

Add `sellMode` to the view model and load offers with the product.

```ts
// lib/store-shared.ts — extend ProductView and ProductDetail
export type ProductView = {
  /* ...existing fields... */
  sellMode: "direct" | "affiliate";
};
export type ProductDetail = ProductView & {
  /* ...existing fields... */
  offers: OfferView[];
};
```

```ts
// lib/shop.ts — in toView(), add:
sellMode: p.sellMode === "affiliate" ? "affiliate" : "direct",

// lib/shop.ts — in getProduct(), load offers alongside variants and images:
const [variants, images, offers] = await Promise.all([
  /* ...existing two queries... */,
  db.select().from(productOffers)
    .where(and(eq(productOffers.productId, id), eq(productOffers.active, true)))
    .orderBy(asc(productOffers.position)),
]);
// and in the returned object:
offers: offers.map((o) => ({ id: o.id, retailer: o.retailer, label: o.label ?? RETAILER_LABEL[o.retailer] ?? o.retailer })),
```

(Import `productOffers` from `@/lib/db` and `RETAILER_LABEL` from `@/lib/store-shared`.)

### Product page: `app/store/_components/ProductDetailClient.tsx`

For affiliate products, replace the price line and the whole `pd-buy` block (quantity, Add to cart) with retailer buttons and the disclosure **right next to them**:

```tsx
// app/store/_components/ProductDetailClient.tsx (inside the component)
if (p.sellMode === "affiliate") {
  // render this instead of <p className="pd-price"> and <div className="pd-buy">…</div>
}

<div className="pd-buy pd-offers">
  {p.offers.map((o) => (
    <a key={o.id} className="btn btn-primary" href={`/go/${o.id}`} target="_blank" rel="sponsored nofollow noopener">
      Buy at {o.label}
    </a>
  ))}
  <PinButton kind="product" targetId={p.id} label={p.title} className="btn btn-ghost" withText />
</div>
<p className="ov-hint pd-disclosure">
  Paid links: OtakuVault earns a commission if you buy through these links, at no extra cost to you.
  {p.offers.some((o) => o.retailer === "amazon") && " As an Amazon Associate I earn from qualifying purchases."}
</p>
```

- Use a plain `<a>`, **not** `next/link`. It's an external hop, and you don't want Next.js prefetching `/go/…`, which would log fake clicks.
- `rel="sponsored"` tells search engines it's a paid link (Google's guidance). `nofollow` keeps link equity out. `noopener` stops the new tab from reaching back into your page.
- Change the `pd-facts` list for affiliate items, since "Free shipping on orders over $75" doesn't apply. Use something like "Sold and shipped by the retailer. Prices and stock are on their site."

### Product cards: `app/store/_components/ProductCard.tsx`

Cards currently show `formatPrice(p.price)`. For `sellMode === "affiliate"`, show a small "at Amazon" / "at retailers" tag instead of a price. The card should link to your own product page, not straight out, so the disclosure is seen before the click.

### Cart guard

`startCheckout` (A7) must reject affiliate products. In the loop, change the check to:

```ts
if (!p || p.sellMode !== "direct") return { error: "An item in your cart can't be bought here. Remove it and try again." };
```

Affiliate product pages have no Add to cart button, so this only guards against a stale or crafted cart.

## B8. Disclosure, Amazon rules and privacy policy

### FTC disclosure (US law)

From the FTC's 2023 Endorsement Guides and their FAQ ["What People Are Asking"](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking) ([16 CFR Part 255](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255)):

- The disclosure must be **clear and conspicuous**: "difficult to miss and easily understandable by ordinary consumers".
- **Placement:** next to the link, visible at the same time as the button. A footer link or a separate "Affiliate disclosure" page alone is **not** enough.
- **Wording that works:** "Paid link", or "We earn a commission if you buy through these links". The FAQ calls "affiliate link" alone, or a bare "Buy now" button, inadequate. Plain words beat jargon.
- Same text size and contrast as nearby text. Not hidden in a tooltip, not only in a hover state.
- Applies everywhere you place links: product pages, store rails, and any forum post or home-page module you add links to.

Recommended wording (used in B7):
> **Paid links:** OtakuVault earns a commission if you buy through these links, at no extra cost to you.

Also add a short **"How the store works"** section to the store page or footer explaining that some items are sold by OtakuVault and others link to retailers who pay a commission. This supplements the on-page disclosure; it doesn't replace it.

### Amazon Associates rules that affect this app

From Amazon's [Operating Agreement](https://affiliate-program.amazon.com/help/operating/agreement), [Program Policies](https://affiliate-program.amazon.com/help/operating/policies) and [Participation Requirements](https://affiliate-program.amazon.com/help/operating/participation/). Re-read these yourself; breaking them closes the account and forfeits unpaid commissions.

1. **Required statement:** "As an Amazon Associate I earn from qualifying purchases." It must appear on the site. Put it next to Amazon buttons (B7) and in the footer/store disclosure.
2. **No prices or availability unless they come from Amazon's API.** You may not type Amazon prices into your DB or show "In stock". Via the Creators API (after 10 sales in 30 days) you can, but only with a **timestamp** next to the price and refreshed data. Until then, **show no price** for Amazon items. That's why affiliate products store `price = 0` and hide it.
3. **No links in emails, newsletters, PDFs, printed material or offline.** If you add order or newsletter emails later, keep Amazon links out of them. Link to your own product page instead.
4. **Don't buy through your own links** or ask friends and family to.
5. **No "click here to support us" bribery or incentives** for clicking or buying (no points, raffles or discounts for using your Amazon links).
6. **Don't use Amazon trademarks** in your domain or imply Amazon endorses you. "Buy on Amazon" as button text is fine.
7. **Don't cloak links** to hide that they go to Amazon. Clear button text plus a redirect is the accepted pattern (B6).
8. **Not for under-13s:** sites directed at children can't participate. Your terms already set an age limit; keep it.
9. **Use only the images Amazon provides** (SiteStripe image links or the API). Don't download and re-host Amazon product photos.
10. Amazon links in **user-generated content** (forum posts) earn nothing for you and aren't your responsibility, but don't rewrite user links to add your tag.

### Privacy policy updates (`app/privacy/page.tsx`)

The current page says: *"There are no advertising or cross-site tracking cookies, which is why there is no cookie banner."* With affiliate links:

- **Your site** still sets no ad cookies (the `/go/` route only writes a click row). Keep that statement accurate.
- **Retailers** set their own cookies once someone clicks through, so that's third-party tracking initiated from your site. Add a section like:

  > **Shopping links.** Some store items link to other retailers (such as Amazon and HobbyLink Japan). When you click one, we record that the link was clicked (which link, when, and your account if you're signed in) so we can see which products are useful. The retailer then sets its own cookies to credit us with a commission if you buy. Their privacy policies apply on their sites.

- **Payments (Part A):** add that Stripe processes card payments under its own [privacy policy](https://stripe.com/privacy), and that you store order details (name, email, shipping address, items, amounts) to fulfill orders, handle returns and meet tax and accounting obligations, with how long you keep them.
- Update the "last updated" date and the contact email (it's currently the placeholder `privacy@otakuvault.example`).
- If you target EU/UK visitors, consider whether affiliate redirects need consent under ePrivacy. The cookies are set on the retailer's domain after a deliberate click, which most sites treat as not needing a banner, but check with a lawyer if the EU/UK is a real market for you.

## B9. Stripe products and affiliate products side by side

How it fits together:

| | Direct (`sell_mode = 'direct'`) | Affiliate (`sell_mode = 'affiliate'`) |
| --- | --- | --- |
| Who sells it | You, through Stripe | A retailer. You earn a commission. |
| Card shows | Price (`formatPrice`) | "at Amazon" / "at retailers" tag, no price |
| Product page | Variants, quantity, **Add to cart** | **Buy at …** buttons + disclosure |
| Cart / checkout | Allowed | Blocked by the server (`startCheckout`) |
| Stock | `product_variants.stock`, decremented by the webhook | Not tracked. The retailer shows it. |
| Recommendations | Ranked as today | Ranked as today (same `related_anilist_ids` logic) |
| "Trending" | Counts paid orders | Has no orders, so it only appears in trending via the "newest" fallback. You could add recent `affiliate_clicks` counts to `trendingOrder()` in `lib/shop.ts` later. |

Suggested UI touches:
- A small filter on `/store/categories`: **All · Sold by OtakuVault · From retailers**.
- On a direct product, optionally an "Also available at" line using its `product_offers` (for example, a figure you sell that's out of stock and can also be bought at HLJ). That needs the same disclosure next to it.
- Keep the badge styling distinct so buyers always know whether they're buying from you or leaving the site.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `STRIPE_SECRET_KEY is not set` | Env var missing in that environment, or no redeploy since adding it | `vercel env ls`. Add it to the right environment, then redeploy. Locally, restart `pnpm dev` after editing `.env.local`. |
| Webhook returns **400 Invalid signature** | Wrong `whsec_` for this endpoint (the CLI secret ≠ the Dashboard endpoint secret, and test ≠ live). Or the body was parsed before verification. | Use the secret printed by `stripe listen` locally and the endpoint's own secret in Vercel. Keep `await request.text()`, never `request.json()`. |
| Webhook returns **401 / 307** on a preview URL | Vercel Deployment Protection, or a redirect to `/login` | Don't point Stripe at previews. Confirm `proxy.ts`'s matcher doesn't include `/api`. |
| Webhook works locally but production deliveries fail | Endpoint registered in test mode while Production uses live keys, or the reverse | Each mode has its own endpoints and secrets. Check the **live** endpoint's delivery log. |
| Order stays `pending` after paying | Webhook not reaching you and the success page not loaded, or `metadata.orderId` missing | Dashboard → Webhooks → the endpoint → failed deliveries → **Resend**. Check that `startCheckout` sets `metadata: { orderId }`. |
| `stripe trigger checkout.session.completed` doesn't create an order | Expected: synthetic events have no `orderId` | Test with a real browser checkout instead. |
| Stripe page shows a different price than your DB | D4 option B with a stale `stripe_price_id`, or you're looking at an old session | Re-run the price sync. Sessions keep the price they were created with. |
| `TypeError` on `collected_information` | Your SDK's API version predates that field | Use `session.shipping_details`, or upgrade `stripe`. |
| Redirect to Stripe doesn't happen and the button just spins | `redirect()` called inside `try/catch`, or the action threw | Keep `redirect(checkout.url!)` outside any try. Check the server logs (Vercel → Logs). |
| "No such price" / "No such product" after go-live | Test-mode ids used with live keys | Test and live catalogs are separate. Re-sync in live mode. |
| Product images missing on Stripe's page | Image URL is relative or local (`/uploads/…` in dev) | Stripe needs a public `https://` URL. Vercel Blob URLs work in production. |
| `db:migrate` fails on `DROP NOT NULL` / the FK | A migration was half-applied, or you ran `db:push` earlier | Inspect `drizzle.__drizzle_migrations`. Fix forward with a new migration, never by editing an applied one. |
| Styles don't update while working on new store CSS | Known Tailwind/Turbopack mtime cache issue in this repo | See `DEPLOYMENT.md`. `@tailwindcss/turbopack` is already at 4.3.5. Touch `app/globals.css` or restart dev. |
| Amazon clicks show in Associates reports but no orders | 24-hour cookie, low intent, or links missing `tag=` | Open the stored URL and confirm `tag=otakuvault-20` is present. Short `amzn.to` links carry it. |
| Amazon account closed after 180 days | Fewer than 3 qualifying sales | You can reapply later. Focus links where buyers already are (manga volumes, popular figures). |
| `/go/<id>` returns 404 | Offer `active = false`, or a typo in the id | Check `product_offers` in Drizzle Studio. |
| Clicks are double-counted | Something prefetches `/go/...` | Make sure the buttons are plain `<a>` tags, not `next/link`. |

---

## Combined checklist

### Decisions
- [ ] D1: what you're legally allowed to sell is settled; no unlicensed series merch goes through Stripe
- [ ] D2–D10 decided (keys, guest checkout, price source, UI, countries, tax, entity, programs, fulfillment)

### Stripe: setup
- [ ] Stripe account created, 2FA on
- [ ] Business verification submitted (A1), with statement descriptor, support details and bank account
- [ ] Test secret key (or restricted key) in `.env.local`, Vercel **Preview**, and Vercel **Production** (test key until go-live)
- [ ] `.env.example` and `DEPLOYMENT.md` list the new variables
- [ ] `pnpm add stripe server-only`; Stripe CLI installed and logged in

### Stripe: code
- [ ] Schema: `orders` (nullable `user_id`, email, breakdown, address, PI id, timestamps) and `order_items` (`variant_id`, snapshot)
- [ ] Migration generated, reviewed, applied locally and to Neon (direct URL)
- [ ] `lib/stripe.ts`, `lib/checkout.ts`, `app/actions/checkout.ts`
- [ ] Shipping constants moved into `lib/store-shared.ts`
- [ ] `CheckoutClient.tsx` rewired; success page and `ClearCart` added
- [ ] `app/api/webhooks/stripe/route.ts`
- [ ] "Checkout coming soon" copy removed

### Stripe: testing
- [ ] `stripe listen` forwarding locally; `STRIPE_WEBHOOK_SECRET` from the CLI
- [ ] All 11 steps in A9 pass locally
- [ ] Test-mode webhook endpoint registered for production; A9 passes on the deployed site

### Stripe: go live
- [ ] Account verified, payouts enabled
- [ ] Live restricted key in **Production only**
- [ ] Live webhook endpoint + secret in **Production**
- [ ] Receipts, branding, payment methods, Radar rules set
- [ ] Tax decision implemented (or consciously deferred)
- [ ] Refund, shipping, contact, terms and privacy pages live and linked
- [ ] Fulfillment process ready
- [ ] One real purchase + refund succeeded

### Affiliate
- [ ] Real, licensed products chosen and mapped to AniList ids
- [ ] Amazon Associates applied; tax interview + payment method done; tracking ID noted
- [ ] HLJ and/or Entertainment Earth applied
- [ ] Schema: `products.sell_mode`, `product_offers`, `affiliate_clicks`; migration applied
- [ ] `/go/[offerId]` route; `/go/` disallowed in robots
- [ ] Product page shows "Buy at …" buttons with `rel="sponsored nofollow noopener"` and the disclosure next to them
- [ ] Cards hide prices for affiliate items; checkout rejects them
- [ ] Amazon statement shown; no Amazon prices; no Amazon links in emails
- [ ] Privacy policy updated (shopping links + Stripe + order data); contact email replaced
- [ ] First links tested in a private window and showing up in each program's reports
- [ ] Calendar reminder: Amazon's 180-day / 3-sale deadline, and a monthly link check

---

### References

**Stripe:** [Checkout quickstart](https://docs.stripe.com/checkout/quickstart) · [Checkout Sessions vs Payment Intents](https://docs.stripe.com/payments/checkout-sessions-and-payment-intents-comparison) · [Fulfill orders](https://docs.stripe.com/checkout/fulfillment) · [Webhooks](https://docs.stripe.com/webhooks) · [Stripe CLI](https://docs.stripe.com/stripe-cli) · [Testing](https://docs.stripe.com/testing) · [Shipping in Checkout](https://docs.stripe.com/payments/checkout/shipping) · [Stripe Tax for Checkout](https://docs.stripe.com/tax/checkout) · [Stripe Tax pricing](https://support.stripe.com/questions/understanding-stripe-tax-pricing) · [API keys best practices](https://docs.stripe.com/keys-best-practices) · [Restricted businesses](https://stripe.com/legal/restricted-businesses) · [Pricing](https://stripe.com/pricing) · [stripe-node releases](https://github.com/stripe/stripe-node/releases)

**Vercel:** [Stripe integration](https://vercel.com/docs/integrations/ecommerce/stripe) · [Marketplace Stripe page](https://vercel.com/marketplace/stripe) · [Next.js + Stripe store guide](https://vercel.com/kb/guide/how-to-deploy-a-next-js-online-store-with-stripe) · [Environment variables](https://vercel.com/docs/environment-variables)

**Next.js (installed version):** `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` · `…/01-getting-started/15-route-handlers.md` · `…/03-api-reference/03-file-conventions/route.md` · `…/03-api-reference/04-functions/redirect.md` · `…/01-getting-started/05-server-and-client-components.md` (server-only)

**Affiliate & compliance:** [Amazon Associates](https://affiliate-program.amazon.com/) · [Participation requirements](https://affiliate-program.amazon.com/help/operating/participation/) · [Linking requirements](https://affiliate-program.amazon.com/gp/associates/help/operating/linking/) · [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) · [HLJ affiliate program](https://www.hlj.com/affiliate-program) · [Entertainment Earth affiliate program](https://www.entertainmentearth.com/affiliate-program) · [FTC Endorsement Guides FAQ](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking) · [Google: qualify outbound links (rel="sponsored")](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)
