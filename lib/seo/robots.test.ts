import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Crawlers (GPTBot ~1 req/s) walked every genre/sort/page combination of the index pages, and each
// one is a dynamic render with database reads. Filtered variants must be off-limits; the plain
// index pages and title pages stay crawlable.
process.env.NEXT_PUBLIC_SITE_URL = "https://otakuvault.app";

describe("robots.txt", async () => {
  const { default: robots } = await import("@/app/robots");
  const rules = [robots().rules].flat()[0]!;
  const disallow = [rules.disallow ?? []].flat();

  // Mirrors how crawlers apply robots.txt patterns: `*` matches anything, `$` anchors the end.
  const blocked = (path: string) => disallow.some((p) => {
    const re = new RegExp("^" + p.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    return re.test(path);
  });

  it("blocks filtered and paginated index URLs", () => {
    for (const p of ["/index-page?genre=action", "/index-page/anime?genre=action", "/index-page/manga?_rsc=abc&genre=comedy", "/index-page/novels?page=2"]) {
      assert.ok(blocked(p), `${p} should be disallowed`);
    }
  });

  it("keeps the plain index pages and title pages crawlable", () => {
    for (const p of ["/", "/index-page", "/index-page/anime", "/anime/154587"]) {
      assert.ok(!blocked(p), `${p} should be allowed`);
    }
  });
});
