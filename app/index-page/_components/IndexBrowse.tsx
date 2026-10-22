"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { browseTitlesAction, searchTitlesAction } from "@/app/actions/anilist";
import {
  DEFAULT_FILTERS, ENTRY_TYPES,
  type BrowseFilters, type BrowseSort, type BrowseStatus, type Title, type TitlePage,
} from "@/lib/anilist-shared";
import type { EntryType } from "@/lib/types";
import { useIndex } from "./IndexProvider";
import { PosterCard } from "./posters";

export type BrowseInitial = { page: TitlePage | null; counts: number[] | null };

type View = { key: string; items: Title[]; total: number; hasNext: boolean; pageNo: number; error?: boolean };

const TYPE_LABELS: [EntryType, string][] = [["anime", "Anime"], ["manga", "Manga"], ["webtoon", "Webtoon"], ["novel", "Light / Web Novel"]];
const STATUS_LABELS: [BrowseStatus, string][] = [["RELEASING", "Airing / Ongoing"], ["FINISHED", "Completed / Finished"], ["NOT_YET_RELEASED", "Not Yet Released"], ["HIATUS", "Hiatus"]];
const GENRES = ["Action","Adventure","Comedy","Drama","Fantasy","Horror","Isekai","Mecha","Mystery","Romance","Sci-Fi","Seinen","Shonen","Slice of Life","Sports","Supernatural","Thriller"];
const SORT_LABELS: [BrowseSort, string][] = [["popularity", "Popularity"], ["rating-desc", "Rating ↓"], ["rating-asc", "Rating ↑"], ["newest", "Newest"], ["oldest", "Oldest"]];

const SEARCH_DEBOUNCE_MS = 350;
const FILTER_DEBOUNCE_MS = 250;

const parseYear = (s: string) => (/^\d{4}$/.test(s) && +s >= 1950 && +s <= 2030 ? +s : null);
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const sameSet = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x) => b.includes(x));
const isDefaultFilters = (f: BrowseFilters) =>
  sameSet(f.types, DEFAULT_FILTERS.types) && !f.statuses.length && !f.genres.length &&
  f.yearFrom == null && f.yearTo == null && !f.minStars && f.sort === DEFAULT_FILTERS.sort;

const fromInitial = (key: string, init: BrowseInitial): View =>
  init.page
    ? { key, items: init.page.items, total: init.page.total, hasNext: init.page.hasNext, pageNo: 1 }
    : { key, items: [], total: 0, hasNext: false, pageNo: 1, error: true };

// The first page streams from the server; once filters/search change, client results take over.
function useView(initial: Promise<BrowseInitial>, results: View | null, key: string, isDefault: boolean): View {
  if (results?.key === key) return results;
  if (!isDefault && results) return results; // keep the last results up (dimmed) while the next load runs
  // Outside the default view the streamed page is only a placeholder until the first client load lands.
  return fromInitial(isDefault ? key : "initial", use(initial));
}

export default function IndexBrowse({ initial }: { initial: Promise<BrowseInitial> }) {
  const { query, chip } = useIndex();
  const [types, setTypes] = useState<EntryType[]>([...ENTRY_TYPES]);
  const [statuses, setStatuses] = useState<BrowseStatus[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [stars, setStars] = useState(0);
  const [sort, setSort] = useState<BrowseSort>("popularity");
  const [results, setResults] = useState<View | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);

  const q = query.trim();
  const searching = q.length >= 2;
  // A hero chip narrows everything to that type; "All" defers to the Type checkboxes.
  const filters = useMemo<BrowseFilters>(() => ({
    types: chip === "all" ? types : [chip], statuses, genres,
    yearFrom: parseYear(yearFrom), yearTo: parseYear(yearTo), minStars: stars, sort,
  }), [chip, types, statuses, genres, yearFrom, yearTo, stars, sort]);
  const key = JSON.stringify(searching ? { q: q.toLowerCase(), chip } : filters);
  const isDefault = !searching && isDefaultFilters(filters);

  useEffect(() => {
    const id = ++reqId.current;
    if (isDefault) return; // the server-streamed first page covers this
    const timer = setTimeout(async () => {
      try {
        const page = searching
          ? await searchTitlesAction(q, chip === "all" ? undefined : chip)
          : await browseTitlesAction(filters, 1);
        if (id === reqId.current) setResults({ key, ...page, pageNo: 1 });
      } catch {
        if (id === reqId.current) setResults({ key, items: [], total: 0, hasNext: false, pageNo: 1, error: true });
      }
    }, searching ? SEARCH_DEBOUNCE_MS : FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, isDefault, searching, q, chip, filters]);

  const loadMore = async (view: View) => {
    if (loadingMore) return;
    setLoadingMore(true);
    const id = reqId.current;
    try {
      const next = await browseTitlesAction(filters, view.pageNo + 1);
      if (id !== reqId.current) return;
      const seen = new Set(view.items.map((t) => t.anilistId));
      setResults({
        key: view.key, items: [...view.items, ...next.items.filter((t) => !seen.has(t.anilistId))],
        total: next.total, hasNext: next.hasNext, pageNo: view.pageNo + 1,
      });
    } catch {
      // Leave the button in place so the user can retry.
    } finally {
      setLoadingMore(false);
    }
  };

  const clear = () => {
    setTypes([...ENTRY_TYPES]); setStatuses([]); setGenres([]); setYearFrom(""); setYearTo(""); setStars(0); setSort("popularity");
  };

  const grid = { initial, results, viewKey: key, isDefault, searching, q, loadingMore, loadMore };

  return (
    <div className="idx-browse" id="idx-browse">
      <aside className="idx-filters">
        <div className="idx-filters-head">
          <div className="idx-filters-head-title">Filters</div>
          <button className="idx-filters-clear" type="button" onClick={clear}>Clear</button>
        </div>
        <div className="idx-filter-group">
          <div className="idx-filter-label">Type</div>
          {TYPE_LABELS.map(([t, label], i) => (
            <label key={t} className="idx-check">
              <input type="checkbox" checked={types.includes(t)} onChange={() => setTypes(toggle(types, t))} />
              <span className="idx-check-box"></span><span className="idx-check-text">{label}</span>
              <span className="idx-check-count"><Suspense fallback="…"><TypeCount initial={initial} index={i} /></Suspense></span>
            </label>
          ))}
        </div>
        <div className="idx-filter-group">
          <div className="idx-filter-label">Status</div>
          {STATUS_LABELS.map(([s, label]) => (
            <label key={s} className="idx-check">
              <input type="checkbox" checked={statuses.includes(s)} onChange={() => setStatuses(toggle(statuses, s))} />
              <span className="idx-check-box"></span><span className="idx-check-text">{label}</span>
            </label>
          ))}
        </div>
        <div className="idx-filter-group">
          <div className="idx-filter-label">Genre</div>
          <div className="idx-genre-chips">
            {GENRES.map((g) => (
              <button key={g} className={`idx-genre-chip ${genres.includes(g) ? "active" : ""}`} type="button" onClick={() => setGenres(toggle(genres, g))}>{g}</button>
            ))}
          </div>
        </div>
        <div className="idx-filter-group">
          <div className="idx-filter-label">Year</div>
          <div className="idx-year-range">
            <input type="number" placeholder="1980" min={1950} max={2030} value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
            <span>→</span>
            <input type="number" placeholder="2026" min={1950} max={2030} value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
          </div>
        </div>
        <div className="idx-filter-group">
          <div className="idx-filter-label">Min Rating</div>
          <div className={`idx-stars rating-${stars}`}>
            {[1,2,3,4,5].map((v) => (
              <button key={v} type="button" onClick={() => setStars(stars === v ? 0 : v)}>★</button>
            ))}
          </div>
        </div>
      </aside>

      <div className="idx-browse-main">
        <div className="idx-browse-toolbar">
          <Suspense fallback={<div className="idx-result-count"><strong>…</strong> titles</div>}>
            <ResultCount {...grid} />
          </Suspense>
          <div className="idx-sort-wrap">
            <span className="idx-sort-label">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as BrowseSort)} disabled={searching}>
              {SORT_LABELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
        </div>
        <Suspense fallback={<GridSkeleton />}>
          <BrowseGrid {...grid} />
        </Suspense>
      </div>
    </div>
  );
}

type GridProps = {
  initial: Promise<BrowseInitial>; results: View | null; viewKey: string; isDefault: boolean;
  searching: boolean; q: string; loadingMore: boolean; loadMore: (v: View) => void;
};

function TypeCount({ initial, index }: { initial: Promise<BrowseInitial>; index: number }) {
  const n = use(initial).counts?.[index];
  return n == null ? "—" : n.toLocaleString("en-US");
}

function ResultCount({ initial, results, viewKey, isDefault, searching, q }: GridProps) {
  const view = useView(initial, results, viewKey, isDefault);
  // While the next load runs the grid still shows the old results; don't pair their count with the new label.
  const n = view.key !== viewKey ? null : searching ? view.items.length : view.total;
  return searching
    ? <div className="idx-result-count"><strong>{n ?? "…"}</strong> {n === 1 ? "result" : "results"} for “{q}”</div>
    : <div className="idx-result-count"><strong>{n?.toLocaleString("en-US") ?? "…"}</strong> titles</div>;
}

function BrowseGrid({ initial, results, viewKey, isDefault, searching, loadingMore, loadMore }: GridProps) {
  const view = useView(initial, results, viewKey, isDefault);
  const pending = view.key !== viewKey;
  return (
    <>
      <div className="idx-grid" aria-busy={pending}>
        {view.items.map((t) => <PosterCard key={t.anilistId} t={t} />)}
        {!view.items.length && (
          <div className="idx-grid-empty">
            {view.error ? "> AniList is unreachable right now — try again in a moment." : "> No titles match. Loosen a filter or try another search."}
          </div>
        )}
      </div>
      {!searching && view.hasNext && !pending && (
        <div className="idx-load-more-wrap">
          <button className="idx-load-more" type="button" disabled={loadingMore} onClick={() => loadMore(view)}>
            {loadingMore ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
    </>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="idx-grid" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rec-poster rec-poster-skeleton" aria-hidden="true"><div className="rec-poster-cover" /></div>
      ))}
    </div>
  );
}
