"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  ["/index-page", "All"],
  ["/index-page/anime", "Anime"],
  ["/index-page/manga", "Manga"],
  ["/index-page/webtoons", "Webtoons"],
  ["/index-page/novels", "Novels"],
] as const;

export function TabBar({ query = "" }: { query?: string }) {
  const pathname = usePathname();
  return (
    <nav className="filter-tabs" aria-label="Browse by type">
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={query ? `${href}?${query}` : href}
          className={`tab-btn ${pathname === href ? "active" : ""}`}
          aria-current={pathname === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

// Tabs carry the current filters along. ?type= is dropped: it only means something on All,
// where it holds the Type checkboxes; sub-routes get their type from the path.
export default function IndexTabs() {
  const params = new URLSearchParams(useSearchParams());
  params.delete("type");
  return <TabBar query={params.toString()} />;
}
