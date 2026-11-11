-- Themes, settings, profiles + pins, the forum (threading, votes, reports, moderation) and the
-- store (descriptions, related titles, variants). Additive only, and safe to run twice.
DO $$ BEGIN
	CREATE TYPE "public"."pin_kind" AS ENUM('entry', 'moodboard', 'forum_thread', 'product');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forum_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_reports_post_reporter_uq" UNIQUE("post_id","reporter_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"size" text,
	"color" text,
	"color_hex" text,
	"price" integer,
	"stock" integer DEFAULT 25 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "pin_kind" NOT NULL,
	"target_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_pins_user_kind_target_uq" UNIQUE("user_id","kind","target_id")
);--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "depth" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "parent_id" text;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "images" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "attached_entry_id" text;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "attached_moodboard_entry_id" text;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD COLUMN IF NOT EXISTS "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "related_anilist_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_theme" text DEFAULT 'terminal' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agreed_to_terms_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pronouns" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_profile_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "forum_reports" ADD CONSTRAINT "forum_reports_post_id_forum_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "forum_reports" ADD CONSTRAINT "forum_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "forum_reports" ADD CONSTRAINT "forum_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "profile_pins" ADD CONSTRAINT "profile_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_reports_status_idx" ON "forum_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_pins_user_position_idx" ON "profile_pins" USING btree ("user_id","position");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_parent_id_forum_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_attached_entry_id_entries_id_fk" FOREIGN KEY ("attached_entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_attached_moodboard_entry_id_entries_id_fk" FOREIGN KEY ("attached_moodboard_entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_posts_user_id_idx" ON "forum_posts" USING btree ("user_id","created_at");--> statement-breakpoint
-- Accounts that exist today already have a collection: they never get the starter entries.
UPDATE "users" SET "seeded" = true WHERE "seeded" = false;--> statement-breakpoint
-- The first account is the site admin (only when nobody is one yet).
UPDATE "users" SET "is_admin" = true
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
	AND NOT EXISTS (SELECT 1 FROM "users" WHERE "is_admin");--> statement-breakpoint
-- Usernames for accounts that predate profiles. The signup form's "Username" was stored as the
-- display name, so that is tried first; the email prefix is the fallback. Lowercase [a-z0-9_],
-- 3-20 characters, with a numeric suffix when the name is reserved or taken.
DO $$
DECLARE
	u record;
	base text;
	candidate text;
	n int;
BEGIN
	FOR u IN SELECT "id", "email", "display_name" FROM "users" WHERE "username" IS NULL ORDER BY "created_at" LOOP
		base := regexp_replace(lower(u.display_name), '[^a-z0-9_]', '', 'g');
		IF length(base) < 3 THEN
			base := regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_]', '', 'g');
		END IF;
		IF length(base) < 3 THEN
			base := 'user_' || base;
		END IF;
		base := left(base, 20);
		candidate := base;
		n := 1;
		WHILE candidate = ANY (ARRAY['admin', 'administrator', 'edit', 'settings', 'me', 'new', 'null', 'undefined', 'otakuvault', 'support', 'help', 'api', 'login', 'signup', 'deleted', 'anonymous', 'moderator', 'mod', 'staff', 'system', 'root', 'official'])
			OR EXISTS (SELECT 1 FROM "users" WHERE "username" = candidate) LOOP
			n := n + 1;
			candidate := left(base, 20 - length(n::text)) || n::text;
		END LOOP;
		UPDATE "users" SET "username" = candidate WHERE "id" = u.id;
	END LOOP;
END $$;--> statement-breakpoint
-- A thread's opening post now lives in forum_posts as its root row (depth 0).
INSERT INTO "forum_posts" ("id", "thread_id", "user_id", "body", "depth", "created_at")
SELECT gen_random_uuid()::text, t."id", t."user_id", t."body", 0, t."created_at"
FROM "forum_threads" t
WHERE NOT EXISTS (SELECT 1 FROM "forum_posts" p WHERE p."thread_id" = t."id" AND p."depth" = 0);
