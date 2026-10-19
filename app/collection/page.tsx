"use client";

import { useState, useEffect, useMemo } from "react";

// ─── Types & constants ────────────────────────────────────────
type EntryType = "anime" | "manga" | "webtoon" | "novel";
type EntryStatus = "completed" | "watching" | "on-hold" | "plan-to" | "dropped";

type Entry = {
  id: string;
  title: string;
  type: EntryType;
  status: EntryStatus;
  genre: string;
  totalEps: string;
  notes: string;
  rating: number;
  imageUrl: string;
  progressCurrent: number;
  progressTotal: number;
  created: number;
};

const STATUS_LABELS: Record<EntryStatus, string> = {
  completed: "Completed",
  watching: "Watching/Reading",
  "on-hold": "On Hold",
  "plan-to": "Plan To",
  dropped: "Dropped",
};

const DEMO: Omit<Entry, "id" | "created">[] = [
  { title:"Fullmetal Alchemist: Brotherhood", type:"anime", status:"completed", genre:"Action, Adventure", totalEps:"64 eps", notes:"A true masterpiece from start to finish.", rating:5, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Demon Slayer",                     type:"anime", status:"watching",  genre:"Action, Supernatural", totalEps:"26 eps", notes:"Stunning animation.", rating:4, imageUrl:"", progressCurrent:18, progressTotal:26 },
  { title:"Vinland Saga",                     type:"manga", status:"completed", genre:"Historical, Action", totalEps:"Ch. 210", notes:"One of the greatest manga ever written.", rating:5, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Solo Leveling",                    type:"webtoon",status:"completed", genre:"Action, Fantasy", totalEps:"179 ch", notes:"Peak power fantasy, loved every chapter.", rating:4, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"One Piece",                        type:"anime", status:"watching",  genre:"Action, Adventure", totalEps:"1000+ eps", notes:"The greatest adventure.", rating:5, imageUrl:"", progressCurrent:600, progressTotal:1100 },
  { title:"Hunter x Hunter",                  type:"anime", status:"plan-to",   genre:"Action, Adventure", totalEps:"148 eps", notes:"", rating:0, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Berserk",                          type:"manga", status:"plan-to",   genre:"Dark Fantasy, Action", totalEps:"374 ch", notes:"", rating:0, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Re:Zero",                          type:"novel", status:"watching",  genre:"Isekai, Psychological", totalEps:"36 vol", notes:"Subaru arcs hit different in the LN.", rating:5, imageUrl:"", progressCurrent:14, progressTotal:36 },
  { title:"Mushoku Tensei",                   type:"novel", status:"completed", genre:"Isekai, Adventure", totalEps:"26 vol", notes:"The grandfather of modern isekai.", rating:5, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Overlord",                         type:"novel", status:"plan-to",   genre:"Isekai, Dark Fantasy", totalEps:"18 vol", notes:"", rating:0, imageUrl:"", progressCurrent:0, progressTotal:0 },
];

const STORAGE_KEY = "otakuvault.entries.v1";

// ─── Visual helpers ───────────────────────────────────────────
function CoverPlaceholder() {
  return (
    <div className="card-cover-placeholder">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <circle cx="16" cy="9" r="2" fill="currentColor" stroke="none"/>
        <path d="M3 17 L8 12 L12 15 L16 11 L21 16"/>
      </svg>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const r = Number(rating) || 0;
  return (
    <span className="stars-display">
      {[1,2,3,4,5].map((i) => {
        const cls = r >= i ? "full" : r >= i - 0.5 ? "half" : "";
        return (
          <span key={i} className={`star-cell ${cls}`}>
            <span className="star-bg">★</span>
            <span className="star-on">★</span>
          </span>
        );
      })}
    </span>
  );
}

function ProgressBar({ entry }: { entry: Entry }) {
  const hasProgress = (entry.status === "watching" || entry.status === "dropped") && (entry.progressCurrent || entry.progressTotal);
  if (!hasProgress) return <div className="card-progress card-progress-empty" aria-hidden="true"></div>;
  const cur = entry.progressCurrent || 0;
  const total = entry.progressTotal || 0;
  const pct = total > 0 ? Math.min(100, (cur / total) * 100) : null;
  const label = total > 0 ? `${cur} / ${total}` : `${cur} done`;
  return (
    <div className="card-progress">
      <div className="card-progress-label">Progress: {label}</div>
      {pct !== null && (
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }}></div>
        </div>
      )}
    </div>
  );
}

// ─── Entry card ───────────────────────────────────────────────
function Card({
  entry, rank, onEdit, onDelete,
}: {
  entry: Entry; rank: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isTop = rank <= 3 && entry.rating >= 4;
  const isPlanTo = entry.status === "plan-to";
  return (
    <div className="card" data-type={entry.type} data-id={entry.id}>
      {!isPlanTo && <div className="drag-handle" title="Drag to reorder" aria-label="Drag handle"></div>}
      <div className="card-cover-wrap">
        {entry.imageUrl
          ? <img className="card-cover" src={entry.imageUrl} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          : <CoverPlaceholder />}
      </div>
      <div className="card-type-stripe"></div>
      <div className="card-actions">
        <button className="icon-btn" onClick={() => onEdit(entry.id)} title="Edit" type="button">✎</button>
        <button className="icon-btn del" onClick={() => onDelete(entry.id)} title="Delete" type="button">✕</button>
      </div>
      <div className="card-body">
        <div className="card-title">{entry.title}</div>
        <div className="card-meta">
          <span className={`badge badge-type-${entry.type}`}>{entry.type}</span>
          <span className="badge badge-status">{STATUS_LABELS[entry.status]}</span>
          {entry.genre && <span className="badge badge-genre">{entry.genre}</span>}
        </div>
        {entry.totalEps && <div className="card-eps">{entry.totalEps}</div>}
        <ProgressBar entry={entry} />
        {entry.notes && <div className="card-notes">{entry.notes}</div>}
        {!isPlanTo && (
          <div className="card-footer">
            <div className="stars"><Stars rating={entry.rating} /></div>
            <span className={`rank-badge ${isTop ? "top" : ""}`}>#{rank}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add/Edit modal ───────────────────────────────────────────
function EntryModal({
  entry, onSave, onClose,
}: {
  entry: Entry | null;
  onSave: (e: Entry) => void;
  onClose: () => void;
}) {
  const isEdit = !!entry;
  const [form, setForm] = useState<Entry>(entry ?? {
    id: "e_" + Date.now(),
    title: "", type: "anime", status: "watching",
    genre: "", totalEps: "", notes: "", rating: 0, imageUrl: "",
    progressCurrent: 0, progressTotal: 0, created: Date.now(),
  });

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setForm({ ...form, [k]: v });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" style={{ display: "flex" }} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <button className="close-modal" type="button" onClick={onClose}>✕</button>
        <div className="modal-title">{isEdit ? "Edit Entry" : "Add New Entry"}</div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Title *</span>
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Type</span>
              <select value={form.type} onChange={(e) => set("type", e.target.value as EntryType)} style={inputStyle}>
                <option value="anime">Anime</option>
                <option value="manga">Manga</option>
                <option value="webtoon">Webtoon</option>
                <option value="novel">Novel</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Status</span>
              <select value={form.status} onChange={(e) => set("status", e.target.value as EntryStatus)} style={inputStyle}>
                <option value="watching">Watching / Reading</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On Hold</option>
                <option value="plan-to">Plan To</option>
                <option value="dropped">Dropped</option>
              </select>
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Genre</span>
            <input type="text" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Action, Fantasy" style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Total episodes/chapters</span>
              <input type="text" value={form.totalEps} onChange={(e) => set("totalEps", e.target.value)} placeholder="24 eps" style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Cover image URL</span>
              <input type="url" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" style={inputStyle} />
            </label>
          </div>

          {(form.status === "watching" || form.status === "dropped") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
                <span style={labelStyle}>Progress — current</span>
                <input type="number" value={form.progressCurrent} min={0} onChange={(e) => set("progressCurrent", Number(e.target.value))} style={inputStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
                <span style={labelStyle}>Progress — total</span>
                <input type="number" value={form.progressTotal} min={0} onChange={(e) => set("progressTotal", Number(e.target.value))} style={inputStyle} />
              </label>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Notes</span>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Rating (0–5, half stars allowed)</span>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
              <input type="number" value={form.rating} min={0} max={5} step={0.5} onChange={(e) => set("rating", Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
              <Stars rating={form.rating} />
            </div>
          </label>

          <div style={{ display: "flex", gap: ".75rem", marginTop: ".5rem" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{isEdit ? "Save Changes" : "Add Entry"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: ".65rem .8rem",
  background: "rgba(0,0,0,.3)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text)",
  fontFamily: "var(--font-space-mono)",
  fontSize: ".78rem",
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-space-mono)",
  fontSize: ".65rem",
  letterSpacing: ".15em",
  color: "var(--text-dim)",
  textTransform: "uppercase",
};

// ─── Main page ────────────────────────────────────────────────
export default function CollectionPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeType, setActiveType] = useState<"all" | EntryType | "watchlist">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EntryStatus>("all");
  const [sort, setSort] = useState("rating-desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Load from localStorage (or seed) on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setEntries(JSON.parse(stored)); return; } catch {}
    }
    const seeded: Entry[] = DEMO.map((d, i) => ({
      ...d,
      id: "demo_" + i,
      created: Date.now() - (DEMO.length - i) * 86400000,
    }));
    setEntries(seeded);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  }, []);

  // Persist on changes
  useEffect(() => {
    if (entries.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

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
    setEntries((prev) => {
      const idx = prev.findIndex((p) => p.id === e.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = e;
        return next;
      }
      return [e, ...prev];
    });
    closeModal();
  };

  const deleteEntry = (id: string) => {
    if (!confirm("Delete this entry?")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
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
          {empty && (
            <div className="empty-state" style={{ marginTop: "3rem" }}>
              <div className="empty-icon"><CoverPlaceholder /></div>
              <div className="empty-title">Your vault is empty</div>
              <div className="empty-sub">Hit "+ Add Entry" and start building your collection!</div>
            </div>
          )}

          {noResults && (
            <div className="empty-state" style={{ marginTop: "3rem" }}>
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="10" cy="10" r="7"/>
                  <line x1="15.5" y1="15.5" x2="21" y2="21"/>
                  <line x1="10" y1="7" x2="10" y2="13"/>
                  <line x1="7" y1="10" x2="13" y2="10"/>
                </svg>
              </div>
              <div className="empty-title">No Results Found</div>
              <div className="empty-sub">Try a different search or filter.</div>
            </div>
          )}

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
                    <Card key={e.id} entry={e} rank={i + 1} onEdit={openEdit} onDelete={deleteEntry} />
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