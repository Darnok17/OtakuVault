ALTER TABLE "cached_titles" ADD COLUMN IF NOT EXISTS "details" jsonb;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "anilist_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entries_user_anilist_idx" ON "entries" USING btree ("user_id","anilist_id");