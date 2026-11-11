-- Starter catalogue for the store. Not a migration: products are a manually edited table
-- (there is no admin CMS), so this file only gives it something to show.
--
-- Safe to run more than once: fixed ids, and rows that already exist are left exactly as they are.
-- Local:  docker exec -i otakuvault-db psql -U otaku -d otakuvault < drizzle/seeds/products.sql
-- Neon:   paste into the SQL editor, or  psql "<Neon DIRECT connection string>" -f drizzle/seeds/products.sql
--
-- price is in cents. cat is one of: apparel, figure, poster, artbook, plush, accessory, manga
-- (lib/store-shared.ts). related_anilist_ids ties a product to AniList titles and is what
-- "Recommended for You" matches against a member's collection.

begin;

insert into products (id, title, brand, series, price, hue, glyph, badge, cat, description, related_anilist_ids, featured, created_at) values
  ('p-aot-scout-hoodie', 'Survey Corps Wings Hoodie', 'Tanuki Threads', 'Attack on Titan', 6400, 'crimson', '進', 'new', 'apparel', 'Heavyweight fleece with the Wings of Freedom embroidered across the back and a small crest on the chest. Brushed inside, ribbed cuffs, kangaroo pocket.', '{16498}', true, now() - interval '0 hours'),
  ('p-aot-wall-poster', 'Wall Maria Blueprint Poster', 'Hoshi Press', 'Attack on Titan', 2200, 'crimson', '壁', null, 'poster', 'An architect''s cutaway of the three walls, printed in two inks on 200 gsm matte stock. Ships rolled.', '{16498}', false, now() - interval '7 hours'),
  ('p-jjk-gojo-figure', 'Limitless 1/7 Scale Figure', 'Kumo Works', 'Jujutsu Kaisen', 15900, 'violet', '呪', 'ltd', 'figure', 'The strongest sorcerer mid-technique, with a translucent effect part and a magnetic base. 26 cm tall. Limited to one production run.', '{113415}', true, now() - interval '14 hours'),
  ('p-jjk-uniform-tee', 'Jujutsu High Uniform Tee', 'Tanuki Threads', 'Jujutsu Kaisen', 2900, 'violet', '術', null, 'apparel', 'The school button swirl printed at the collar of a boxy 220 gsm cotton tee.', '{113415}', false, now() - interval '21 hours'),
  ('p-ds-haori-cardigan', 'Checkered Haori Cardigan', 'Tanuki Threads', 'Demon Slayer', 5800, 'teal', '鬼', 'new', 'apparel', 'A knit cardigan in the green-and-black ichimatsu pattern, cut loose like a haori. One button, two patch pockets.', '{101922}', true, now() - interval '28 hours'),
  ('p-ds-breath-print', 'Water Breathing Woodblock Print', 'Hoshi Press', 'Demon Slayer', 3400, 'azure', '水', null, 'poster', 'The tenth form as an ukiyo-e wave, giclée printed with a deckled edge.', '{101922}', false, now() - interval '35 hours'),
  ('p-ds-nezuko-plush', 'Bamboo Box Plush', 'Mochi & Co.', 'Demon Slayer', 2800, 'rose', '竹', 'sale', 'plush', 'A small sleepy plush that fits inside its own felt carrying box.', '{101922}', false, now() - interval '42 hours'),
  ('p-op-strawhat-cap', 'Straw Hat Crew Cap', 'Tanuki Threads', 'One Piece', 3200, 'gold', '海', null, 'apparel', 'Six-panel cotton cap with the jolly roger embroidered front and centre and the crew''s bounty total stitched inside the brim.', '{21}', false, now() - interval '49 hours'),
  ('p-op-wanted-set', 'Wanted Poster Set (9)', 'Hoshi Press', 'One Piece', 3900, 'gold', '賞', 'new', 'poster', 'Nine bounty posters on aged kraft stock, each 21 × 30 cm. Tape them up crooked for the full effect.', '{21}', true, now() - interval '56 hours'),
  ('p-op-merry-figure', 'Going Merry Desk Model', 'Kumo Works', 'One Piece', 8900, 'orange', '船', null, 'figure', 'A 18 cm snap-fit model of the ship that carried them through the first half of the Grand Line. No glue needed.', '{21}', false, now() - interval '63 hours'),
  ('p-fmab-pocket-watch', 'State Alchemist Pocket Watch', 'Kiri Goods', 'Fullmetal Alchemist: Brotherhood', 5400, 'gold', '錬', 'ltd', 'accessory', 'A working quartz pocket watch with the Amestris crest on the lid and a date scratched inside it. You know which one.', '{5114}', true, now() - interval '70 hours'),
  ('p-fmab-circle-poster', 'Transmutation Circle Poster', 'Hoshi Press', 'Fullmetal Alchemist: Brotherhood', 2400, 'crimson', '円', null, 'poster', 'The human transmutation circle, screen printed in oxblood on cream stock.', '{5114}', false, now() - interval '77 hours'),
  ('p-dn-notebook', 'Ruled Black Notebook', 'Kiri Goods', 'Death Note', 1800, 'violet', '死', null, 'accessory', 'A5, 160 ruled pages, silver-foil lettering, and the rules printed inside the cover. For shopping lists.', '{1535}', false, now() - interval '84 hours'),
  ('p-dn-apple-pin', 'Shinigami Apple Enamel Pin', 'Kiri Goods', 'Death Note', 1100, 'crimson', '林', null, 'accessory', 'Hard enamel, 3 cm, with a bite out of it.', '{1535}', false, now() - interval '91 hours'),
  ('p-sxf-anya-plush', 'Peanut-Loving Telepath Plush', 'Mochi & Co.', 'Spy x Family', 3200, 'rose', '家', 'new', 'plush', 'With the smug face. 30 cm, embroidered details, weighted base so it sits up on a shelf.', '{140960}', false, now() - interval '98 hours'),
  ('p-sxf-tee', 'Operation Strix Tee', 'Tanuki Threads', 'Spy x Family', 2800, 'teal', '謀', null, 'apparel', 'A small dossier stamp on the chest, the family portrait across the back.', '{140960}', false, now() - interval '105 hours'),
  ('p-csm-pochita-plush', 'Chainsaw Dog Plush', 'Mochi & Co.', 'Chainsaw Man', 3600, 'orange', '鋸', 'sale', 'plush', 'Round, orange, handle on the back. The handle is soft.', '{127230}', true, now() - interval '112 hours'),
  ('p-csm-bomber', 'Public Safety Bomber Jacket', 'Tanuki Threads', 'Chainsaw Man', 8900, 'crimson', '公', null, 'apparel', 'Black nylon bomber with a division patch on the sleeve and an orange lining.', '{127230}', false, now() - interval '119 hours'),
  ('p-frieren-artbook', 'Journey''s End Art Book', 'Hoshi Press', 'Frieren: Beyond Journey''s End', 4600, 'teal', '葬', 'new', 'artbook', '176 pages of background paintings and colour scripts from the long walk north, with notes from the art director.', '{154587}', true, now() - interval '126 hours'),
  ('p-frieren-grimoire', 'Folk Magic Grimoire Journal', 'Kiri Goods', 'Frieren: Beyond Journey''s End', 2600, 'gold', '魔', null, 'accessory', 'A clothbound journal with a ribbon marker. Blank pages, for collecting spells of your own.', '{154587}', false, now() - interval '133 hours'),
  ('p-vinland-artbook', 'A True Warrior Art Book', 'Hoshi Press', 'Vinland Saga', 4200, 'azure', '海', null, 'artbook', 'Character sheets and landscape studies from both seasons. Lay-flat binding.', '{101348}', false, now() - interval '140 hours'),
  ('p-berserk-deluxe', 'Deluxe Hardcover Vol. 1', 'Hoshi Press', 'Berserk', 4999, 'crimson', '剣', null, 'manga', 'The first three volumes in one oversized hardcover with a ribbon marker.', '{30002}', false, now() - interval '147 hours'),
  ('p-vagabond-box', 'Collector''s Box (Vols 1–6)', 'Hoshi Press', 'Vagabond', 11900, 'violet', '武', 'ltd', 'manga', 'Six volumes in a slipcase with a brush-painted spine that lines up across the set.', '{30656}', false, now() - interval '154 hours'),
  ('p-dungeon-cookbook', 'Adventurer''s Cookbook', 'Hoshi Press', 'Delicious in Dungeon', 2900, 'gold', '食', null, 'artbook', 'Thirty recipes from the party''s descent, adapted for ingredients you can buy above ground.', '{153518}', false, now() - interval '161 hours'),
  ('p-mob-keychain', '100% Acrylic Keychain', 'Kiri Goods', 'Mob Psycho 100', 1200, 'teal', '霊', null, 'accessory', 'Double-sided acrylic with a percentage counter you can slide.', '{21507}', false, now() - interval '168 hours'),
  ('p-sl-shadow-tee', 'Arise Shadow Army Tee', 'Tanuki Threads', 'Solo Leveling', 3000, 'violet', '影', 'new', 'apparel', 'Glow-in-the-dark ink on a washed black tee.', '{151807,105398}', false, now() - interval '175 hours')
on conflict (id) do nothing;

insert into product_variants (id, product_id, size, color, color_hex, price, stock, position) values
  ('v-aot-scout-hoodie-1', 'p-aot-scout-hoodie', 'S', 'Black', '#16161c', null, 25, 0),
  ('v-aot-scout-hoodie-2', 'p-aot-scout-hoodie', 'M', 'Black', '#16161c', null, 25, 1),
  ('v-aot-scout-hoodie-3', 'p-aot-scout-hoodie', 'L', 'Black', '#16161c', null, 25, 2),
  ('v-aot-scout-hoodie-4', 'p-aot-scout-hoodie', 'XL', 'Black', '#16161c', null, 25, 3),
  ('v-aot-scout-hoodie-5', 'p-aot-scout-hoodie', 'S', 'Bone', '#e9e2d0', null, 25, 4),
  ('v-aot-scout-hoodie-6', 'p-aot-scout-hoodie', 'M', 'Bone', '#e9e2d0', null, 25, 5),
  ('v-aot-scout-hoodie-7', 'p-aot-scout-hoodie', 'L', 'Bone', '#e9e2d0', null, 25, 6),
  ('v-aot-scout-hoodie-8', 'p-aot-scout-hoodie', 'XL', 'Bone', '#e9e2d0', null, 0, 7),
  ('v-aot-wall-poster-1', 'p-aot-wall-poster', 'A3 · 30 × 42 cm', null, null, null, 25, 0),
  ('v-aot-wall-poster-2', 'p-aot-wall-poster', 'A2 · 42 × 59 cm', null, null, 3000, 25, 1),
  ('v-aot-wall-poster-3', 'p-aot-wall-poster', 'A1 · 59 × 84 cm', null, null, 4000, 25, 2),
  ('v-jjk-uniform-tee-1', 'p-jjk-uniform-tee', 'S', 'Black', '#16161c', null, 25, 0),
  ('v-jjk-uniform-tee-2', 'p-jjk-uniform-tee', 'M', 'Black', '#16161c', null, 25, 1),
  ('v-jjk-uniform-tee-3', 'p-jjk-uniform-tee', 'L', 'Black', '#16161c', null, 25, 2),
  ('v-jjk-uniform-tee-4', 'p-jjk-uniform-tee', 'XL', 'Black', '#16161c', null, 25, 3),
  ('v-jjk-uniform-tee-5', 'p-jjk-uniform-tee', 'S', 'Bone', '#e9e2d0', null, 25, 4),
  ('v-jjk-uniform-tee-6', 'p-jjk-uniform-tee', 'M', 'Bone', '#e9e2d0', null, 25, 5),
  ('v-jjk-uniform-tee-7', 'p-jjk-uniform-tee', 'L', 'Bone', '#e9e2d0', null, 25, 6),
  ('v-jjk-uniform-tee-8', 'p-jjk-uniform-tee', 'XL', 'Bone', '#e9e2d0', null, 0, 7),
  ('v-ds-haori-cardigan-1', 'p-ds-haori-cardigan', 'S', null, null, null, 25, 0),
  ('v-ds-haori-cardigan-2', 'p-ds-haori-cardigan', 'M', null, null, null, 25, 1),
  ('v-ds-haori-cardigan-3', 'p-ds-haori-cardigan', 'L', null, null, null, 25, 2),
  ('v-ds-haori-cardigan-4', 'p-ds-haori-cardigan', 'XL', null, null, null, 25, 3),
  ('v-ds-breath-print-1', 'p-ds-breath-print', 'A3 · 30 × 42 cm', null, null, null, 25, 0),
  ('v-ds-breath-print-2', 'p-ds-breath-print', 'A2 · 42 × 59 cm', null, null, 4200, 25, 1),
  ('v-ds-breath-print-3', 'p-ds-breath-print', 'A1 · 59 × 84 cm', null, null, 5200, 25, 2),
  ('v-ds-nezuko-plush-1', 'p-ds-nezuko-plush', 'Small · 15 cm', null, null, 1800, 25, 0),
  ('v-ds-nezuko-plush-2', 'p-ds-nezuko-plush', 'Standard · 30 cm', null, null, null, 25, 1),
  ('v-ds-nezuko-plush-3', 'p-ds-nezuko-plush', 'Jumbo · 60 cm', null, null, 6200, 25, 2),
  ('v-op-strawhat-cap-1', 'p-op-strawhat-cap', null, 'Natural', '#d9c08a', null, 25, 0),
  ('v-op-strawhat-cap-2', 'p-op-strawhat-cap', null, 'Navy', '#1c2a4a', null, 25, 1),
  ('v-fmab-circle-poster-1', 'p-fmab-circle-poster', 'A3 · 30 × 42 cm', null, null, null, 25, 0),
  ('v-fmab-circle-poster-2', 'p-fmab-circle-poster', 'A2 · 42 × 59 cm', null, null, 3200, 25, 1),
  ('v-fmab-circle-poster-3', 'p-fmab-circle-poster', 'A1 · 59 × 84 cm', null, null, 4200, 25, 2),
  ('v-sxf-anya-plush-1', 'p-sxf-anya-plush', 'Small · 15 cm', null, null, 2200, 25, 0),
  ('v-sxf-anya-plush-2', 'p-sxf-anya-plush', 'Standard · 30 cm', null, null, null, 25, 1),
  ('v-sxf-anya-plush-3', 'p-sxf-anya-plush', 'Jumbo · 60 cm', null, null, 6600, 25, 2),
  ('v-sxf-tee-1', 'p-sxf-tee', 'S', 'Black', '#16161c', null, 25, 0),
  ('v-sxf-tee-2', 'p-sxf-tee', 'M', 'Black', '#16161c', null, 25, 1),
  ('v-sxf-tee-3', 'p-sxf-tee', 'L', 'Black', '#16161c', null, 25, 2),
  ('v-sxf-tee-4', 'p-sxf-tee', 'XL', 'Black', '#16161c', null, 25, 3),
  ('v-sxf-tee-5', 'p-sxf-tee', 'S', 'Bone', '#e9e2d0', null, 25, 4),
  ('v-sxf-tee-6', 'p-sxf-tee', 'M', 'Bone', '#e9e2d0', null, 25, 5),
  ('v-sxf-tee-7', 'p-sxf-tee', 'L', 'Bone', '#e9e2d0', null, 25, 6),
  ('v-sxf-tee-8', 'p-sxf-tee', 'XL', 'Bone', '#e9e2d0', null, 0, 7),
  ('v-csm-pochita-plush-1', 'p-csm-pochita-plush', 'Small · 15 cm', null, null, 2600, 25, 0),
  ('v-csm-pochita-plush-2', 'p-csm-pochita-plush', 'Standard · 30 cm', null, null, null, 25, 1),
  ('v-csm-pochita-plush-3', 'p-csm-pochita-plush', 'Jumbo · 60 cm', null, null, 7000, 25, 2),
  ('v-csm-bomber-1', 'p-csm-bomber', 'S', null, null, null, 25, 0),
  ('v-csm-bomber-2', 'p-csm-bomber', 'M', null, null, null, 25, 1),
  ('v-csm-bomber-3', 'p-csm-bomber', 'L', null, null, null, 25, 2),
  ('v-csm-bomber-4', 'p-csm-bomber', 'XL', null, null, null, 25, 3),
  ('v-sl-shadow-tee-1', 'p-sl-shadow-tee', 'S', 'Black', '#16161c', null, 25, 0),
  ('v-sl-shadow-tee-2', 'p-sl-shadow-tee', 'M', 'Black', '#16161c', null, 25, 1),
  ('v-sl-shadow-tee-3', 'p-sl-shadow-tee', 'L', 'Black', '#16161c', null, 25, 2),
  ('v-sl-shadow-tee-4', 'p-sl-shadow-tee', 'XL', 'Black', '#16161c', null, 25, 3),
  ('v-sl-shadow-tee-5', 'p-sl-shadow-tee', 'S', 'Bone', '#e9e2d0', null, 25, 4),
  ('v-sl-shadow-tee-6', 'p-sl-shadow-tee', 'M', 'Bone', '#e9e2d0', null, 25, 5),
  ('v-sl-shadow-tee-7', 'p-sl-shadow-tee', 'L', 'Bone', '#e9e2d0', null, 25, 6),
  ('v-sl-shadow-tee-8', 'p-sl-shadow-tee', 'XL', 'Bone', '#e9e2d0', null, 0, 7)
on conflict (id) do nothing;

commit;
