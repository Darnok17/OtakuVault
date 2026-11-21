-- pg_trgm backs titles_search_trgm_idx (fuzzy title search). Available on Neon and in PGlite.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "airing_schedule" (
	"title_id" text NOT NULL,
	"episode" integer NOT NULL,
	"airing_at" timestamp with time zone NOT NULL,
	CONSTRAINT "airing_schedule_title_id_episode_pk" PRIMARY KEY("title_id","episode")
);
--> statement-breakpoint
CREATE TABLE "catalog_lookups" (
	"key" text PRIMARY KEY NOT NULL,
	"looked_up_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"name" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studios" (
	"id" text PRIMARY KEY NOT NULL,
	"anilist_id" integer,
	"name" text NOT NULL,
	"is_animation_studio" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"name" text PRIMARY KEY NOT NULL,
	"category" text,
	"is_adult" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_genres" (
	"title_id" text NOT NULL,
	"genre" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "title_genres_title_id_genre_pk" PRIMARY KEY("title_id","genre")
);
--> statement-breakpoint
CREATE TABLE "title_studios" (
	"title_id" text NOT NULL,
	"studio_id" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "title_studios_title_id_studio_id_pk" PRIMARY KEY("title_id","studio_id")
);
--> statement-breakpoint
CREATE TABLE "title_tags" (
	"title_id" text NOT NULL,
	"tag" text NOT NULL,
	"rank" smallint DEFAULT 0 NOT NULL,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	CONSTRAINT "title_tags_title_id_tag_pk" PRIMARY KEY("title_id","tag")
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" text PRIMARY KEY NOT NULL,
	"anilist_id" integer,
	"mal_id" integer,
	"kitsu_id" integer,
	"tmdb_id" integer,
	"kind" text NOT NULL,
	"entry_type" "entry_type" NOT NULL,
	"title" text NOT NULL,
	"romaji" text NOT NULL,
	"english" text,
	"native" text,
	"synonyms" text[] DEFAULT '{}'::text[] NOT NULL,
	"format" text,
	"status" text,
	"country" text,
	"is_adult" boolean DEFAULT false NOT NULL,
	"episodes" integer,
	"aired_episodes" integer,
	"chapters" integer,
	"volumes" integer,
	"duration" integer,
	"average_score" smallint,
	"mean_score" smallint,
	"popularity" integer,
	"trending" integer DEFAULT 0 NOT NULL,
	"favourites" integer,
	"popularity_rank" integer,
	"season" text,
	"season_year" smallint,
	"start_date" integer,
	"end_date" integer,
	"description" text,
	"source_material" text,
	"site_url" text,
	"color" text,
	"cover_source" text,
	"thumb_source" text,
	"banner_source" text,
	"cover" text,
	"banner" text,
	"extras" jsonb,
	"extras_fetched_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED
);
--> statement-breakpoint
ALTER TABLE "airing_schedule" ADD CONSTRAINT "airing_schedule_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_genre_genres_name_fk" FOREIGN KEY ("genre") REFERENCES "public"."genres"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_studios" ADD CONSTRAINT "title_studios_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_studios" ADD CONSTRAINT "title_studios_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_tags" ADD CONSTRAINT "title_tags_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_tags" ADD CONSTRAINT "title_tags_tag_tags_name_fk" FOREIGN KEY ("tag") REFERENCES "public"."tags"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airing_schedule_airing_at_idx" ON "airing_schedule" USING btree ("airing_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studios_anilist_id_idx" ON "studios" USING btree ("anilist_id");--> statement-breakpoint
CREATE INDEX "title_genres_genre_idx" ON "title_genres" USING btree ("genre");--> statement-breakpoint
CREATE INDEX "title_studios_studio_idx" ON "title_studios" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "title_tags_tag_idx" ON "title_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "titles_anilist_id_idx" ON "titles" USING btree ("anilist_id");--> statement-breakpoint
CREATE INDEX "titles_mal_id_idx" ON "titles" USING btree ("mal_id");--> statement-breakpoint
CREATE INDEX "titles_popularity_idx" ON "titles" USING btree ("popularity" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "titles_entry_type_popularity_idx" ON "titles" USING btree ("entry_type","popularity" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "titles_trending_idx" ON "titles" USING btree ("trending" DESC NULLS LAST) WHERE "titles"."trending" > 0;--> statement-breakpoint
CREATE INDEX "titles_season_idx" ON "titles" USING btree ("season_year","season");--> statement-breakpoint
CREATE INDEX "titles_start_date_idx" ON "titles" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "titles_synced_at_idx" ON "titles" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "titles_search_idx" ON "titles" USING gin ("search");--> statement-breakpoint
CREATE INDEX "titles_search_trgm_idx" ON "titles" USING gin ("search_text" gin_trgm_ops);