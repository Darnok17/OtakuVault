-- The "Terminal" theme was retired; "Matrix" replaces it and is the new default. Accounts that
-- chose Terminal (or never changed the old default) move to Matrix. Safe to run twice.
ALTER TABLE "users" ALTER COLUMN "preferred_theme" SET DEFAULT 'matrix';--> statement-breakpoint
UPDATE "users" SET "preferred_theme" = 'matrix' WHERE "preferred_theme" = 'terminal';
