-- The "Super Anime" theme is now "Comic Strip" (id: anime -> comic-strip). Accounts that chose it
-- keep it under the new id. Safe to run twice. ('super-anime' was never a stored id; it is listed
-- only so a hand-edited row cannot be left behind.)
UPDATE "users" SET "preferred_theme" = 'comic-strip' WHERE "preferred_theme" IN ('anime', 'super-anime');
