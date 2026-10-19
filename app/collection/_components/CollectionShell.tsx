"use client";

import { useState, useEffect, useMemo } from "react";
import { useEntriesStore } from "@/lib/store";
import type { Entry, EntryStatus, EntryType } from "@/lib/types";
import EmptyState from "./EmptyState";
import EntryCard from "./EntryCard";
import EntryModal from "./EntryModal";

export default function CollectionShell() {
  const entries = useEntriesStore((s) => s.entries);
  const addEntry = useEntriesStore((s) => s.addEntry);
  const updateEntry = useEntriesStore((s) => s.updateEntry);
  const removeEntry = useEntriesStore((s) => s.deleteEntry);
  const [activeType, setActiveType] = useState<"all" | EntryType | "watchlist">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EntryStatus>("all");
  const [sort, setSort] = useState("rating-desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Load from localStorage (or seed) on mount
  useEffect(() => {
    useEntriesStore.persist.rehydrate();
  }, []);

  // Stats (exclude plan-to + dropped)
  const stats = useMemo(() => {
    const countable = entries.filter((e) => e.status !== "plan-to" && e.status !== "dropped");
    return {
      total: countable.length,
      anime: countable.filter((e) => e.type === "anime").length,
      manga: countable.filter((e) => e.type === "manga").length,
      webtoon: countable.filter((e) => e.type === "webtoon").length,
      novel: countable.filter((e) => e.type === "novel").length,
    };
  }, [entries]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = [...entries];

    if (activeType === "watchlist") {
      list = list.filter((e) => e.status === "plan-to");
    } else {
      list = list.filter((e) => e.status !== "plan-to");
      if (activeType !== "all") list = list.filter((e) => e.type === activeType);
      if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    }

    if (q) list = list.filter((e) =>
      e.title.toLowerCase().includes(q) ||
      e.genre.toLowerCase().includes(q) ||
      e.notes.toLowerCase().includes(q)
    );

    list.sort((a, b) => {
      switch (sort) {
        case "newest":      return b.created - a.created;
        case "oldest":      return a.created - b.created;
        case "rating-desc": return (b.rating - a.rating) || (b.created - a.created);
        case "rating-asc":  return (a.rating - b.rating) || (b.created - a.created);
        case "title-asc":   return a.title.localeCompare(b.title);
        case "title-desc":  return b.title.localeCompare(a.title);
        default:            return 0;
      }
    });

    return list;
  }, [entries, activeType, statusFilter, sort, search]);

  const sections = useMemo(() => ([
    { title: "Anime",              cssClass: "anime",   items: filtered.filter((e) => e.type === "anime") },
    { title: "Manga & Manhwa",     cssClass: "manga",   items: filtered.filter((e) => e.type === "manga") },
    { title: "Webtoons",           cssClass: "webtoon", items: filtered.filter((e) => e.type === "webtoon") },
    { title: "Light & Web Novels", cssClass: "novel",   items: filtered.filter((e) => e.type === "novel") },
  ]), [filtered]);

  const openAdd = () => { setEditing(null); setShowModal(true); };
  const openEdit = (id: string) => { setEditing(entries.find((e) => e.id === id) ?? null); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const saveEntry = (e: Entry) => {
    if (entries.some((p) => p.id === e.id)) updateEntry(e.id, e);
    else addEntry(e);
    closeModal();
  };

  const deleteEntry = (id: string) => {
    if (!confirm("Delete this entry?")) return;
    removeEntry(id);
  };

  const empty = entries.filter((e) => e.status !== "plan-to").length === 0;
  const noResults = !empty && filtered.length === 0;

  return (
    <section className="site-page active" id="page-collection" data-page="collection">
      <div className="everything">
        <header>
          <div className="logo">
            <span className="logo-main">OtakuVault</span>
            <span className="logo-sub">Personal Collection Tracker</span>
          </div>
          <div className="header-stats">
            <div className="stat-pill total"><span className="stat-num">{stats.total}</span><span className="stat-label">Total</span></div>
            <div className="stat-pill anime"><span className="stat-num">{stats.anime}</span><span className="stat-label">Anime</span></div>
            <div className="stat-pill manga"><span className="stat-num">{stats.manga}</span><span className="stat-label">Manga</span></div>
            <div className="stat-pill webtoon"><span className="stat-num">{stats.webtoon}</span><span className="stat-label">Webtoon</span></div>
            <div className="stat-pill novel"><span className="stat-num">{stats.novel}</span><span className="stat-label">Novels</span></div>
          </div>
        </header>

        <div className="controls">
          <div className="search-wrap">
            <span className="search-icon">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles, genres, notes…" />
          </div>

          <div className="filter-tabs">
            {(["all","anime","manga","webtoon","novel"] as const).map((t) => (
              <button key={t} className={`tab-btn ${activeType === t ? "active" : ""}`} onClick={() => setActiveType(t)}>
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <span className="tab-divider"></span>
            <button className={`tab-btn ${activeType === "watchlist" ? "active" : ""}`} onClick={() => setActiveType("watchlist")}>
              <span className="tab-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3 L18 3 L18 21 L12 17 L6 21 Z"/>
                  <path d="M12 7 L13.2 10 L16.3 10 L13.8 11.9 L14.7 15 L12 13.1 L9.3 15 L10.2 11.9 L7.7 10 L10.8 10 Z" fill="currentColor" stroke="none"/>
                </svg>
              </span>Watchlist
            </button>
          </div>

          <div className="view-toggle" role="group" aria-label="View mode">
            <button className={`view-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")} title="Grid view" aria-label="Grid view">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
            </button>
            <button className={`view-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")} title="List view" aria-label="List view">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="4" cy="6" r="1" fill="currentColor"/>
                <circle cx="4" cy="12" r="1" fill="currentColor"/>
                <circle cx="4" cy="18" r="1" fill="currentColor"/>
              </svg>
            </button>
          </div>

          <div className="sort-wrap">
            <span className="sort-label">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="rating-desc">Rating ↓</option>
              <option value="rating-asc">Rating ↑</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title-asc">Title A–Z</option>
              <option value="title-desc">Title Z–A</option>
            </select>
          </div>

          <div className="sort-wrap">
            <span className="sort-label">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | EntryStatus)}>
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="watching">Watching / Reading</option>
              <option value="on-hold">On Hold</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>

          <button className="btn btn-primary" onClick={openAdd}>+ Add Entry</button>
        </div>

        <main className="main">
          {empty && <EmptyState variant="empty" />}

          {noResults && <EmptyState variant="no-results" />}

          {activeType === "watchlist" && filtered.length > 0 && (
            <div className="watchlist-banner">
              <span className="watchlist-banner-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3 L18 3 L18 21 L12 17 L6 21 Z"/>
                  <path d="M12 7 L13.2 10 L16.3 10 L13.8 11.9 L14.7 15 L12 13.1 L9.3 15 L10.2 11.9 L7.7 10 L10.8 10 Z" fill="currentColor" stroke="none"/>
                </svg>
              </span>
              <span>Your Watchlist — titles you've bookmarked to start later.</span>
            </div>
          )}

          {!empty && !noResults && sections.map((s) =>
            s.items.length === 0 ? null : (
              <div key={s.cssClass}>
                <div className="section-header">
                  <span className={`section-title ${s.cssClass}`}>{s.title}</span>
                  <span className="section-line"></span>
                  <span className="section-count">
                    {s.items.length} entr{s.items.length === 1 ? "y" : "ies"}
                  </span>
                </div>
                <div className={`card-grid ${view === "list" ? "view-list" : ""}`}>
                  {s.items.map((e, i) => (
                    <EntryCard key={e.id} entry={e} rank={i + 1} onEdit={openEdit} onDelete={deleteEntry} />
                  ))}
                </div>
              </div>
            )
          )}
        </main>
      </div>

      {showModal && <EntryModal entry={editing} onSave={saveEntry} onClose={closeModal} />}
    </section>
  );
}