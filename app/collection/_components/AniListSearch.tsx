"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchTitlesAction } from "@/app/actions/anilist";
import type { Title } from "@/lib/anilist-shared";

// "Search AniList" autofill for the Add Entry modal. Picking a result hands the title to
// onPick; "Type it manually" closes the list and hands focus back via onManual.

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;
const MAX_RESULTS = 8;

type Status = "idle" | "loading" | "ready" | "error";

export default function AniListSearch({ onPick, onManual, inputStyle, labelStyle }: {
  onPick: (t: Title) => void;
  onManual: () => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Title[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const reqId = useRef(0);

  const q = query.trim();

  useEffect(() => {
    const id = ++reqId.current;
    if (q.length < MIN_CHARS) return;
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const page = await searchTitlesAction(q);
        if (id !== reqId.current) return;
        setResults(page.items.slice(0, MAX_RESULTS));
        setActive(0);
        setStatus("ready");
        setOpen(true);
      } catch {
        if (id !== reqId.current) return;
        setResults([]);
        setStatus("error");
        setOpen(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const short = q.length < MIN_CHARS;
  const showList = open && !short && status !== "error" && status !== "idle";

  const pick = (t: Title) => {
    onPick(t);
    reqId.current++;
    setQuery("");
    setResults([]);
    setStatus("idle");
    setOpen(false);
  };

  const manual = () => {
    setOpen(false);
    onManual();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (showList) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) { if (results.length) setOpen(true); return; }
      if (!results.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + results.length) % results.length);
      return;
    }
    if (e.key === "Enter") {
      // Never submit the form from the search box.
      e.preventDefault();
      if (showList && results[active]) pick(results[active]);
    }
  };

  return (
    <div className="al-search" style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
        <span style={labelStyle}>Search AniList</span>
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (status === "error") setStatus("idle"); }}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length) setOpen(true); }}
          // Rows use onMouseDown + preventDefault, so a click on them doesn't blur first.
          onBlur={() => setOpen(false)}
          placeholder="Frieren, Vinland Saga, Solo Leveling…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          style={inputStyle}
        />
      </label>

      {status === "error" && !short && (
        <span className="al-search-note error" role="status">&gt; Search unavailable — fill fields manually</span>
      )}

      {showList && (
        <div className="al-search-panel">
          <ul className="al-search-list" id={listId} role="listbox" aria-label="AniList results" aria-busy={status === "loading"}>
            {results.map((t, i) => (
              <li
                key={t.anilistId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`al-search-row ${i === active ? "active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); pick(t); }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="al-search-thumb">
                  {(t.thumb ?? t.cover) && (
                    // eslint-disable-next-line @next/next/no-img-element -- remote AniList covers
                    <img src={(t.thumb ?? t.cover)!} alt="" loading="lazy" />
                  )}
                </span>
                <span className="al-search-title">
                  {t.title}
                  {t.startYear && <span className="al-search-year">{t.startYear}</span>}
                </span>
                <span className={`badge badge-type-${t.entryType}`}>{t.entryType}</span>
              </li>
            ))}
            {!results.length && status === "ready" && <li className="al-search-empty">&gt; No matches on AniList.</li>}
          </ul>
          <button type="button" className="al-search-manual" onMouseDown={(e) => e.preventDefault()} onClick={manual}>
            Can&apos;t find it? Type it manually
          </button>
        </div>
      )}
    </div>
  );
}
