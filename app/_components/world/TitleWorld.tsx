"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { hubSize, personIdOf, personWeb, type Hub, type HubId, type TitleGraph, type WebNode } from "@/lib/title-graph";
import type { EntryType, ListMark } from "@/lib/types";
import { ENTRY_SAVED, type EntrySaved } from "@/lib/entry-events";
import { STATUS_TONE, entryMark, markLine, statusGlyph, statusText } from "./list-marks";
import { usePrefersReducedMotion, useSceneTheme } from "./scene-theme";
import { useWorldHover, useWorldInsets, useWorldPeople, type PersonState } from "./world-store";
import type { Focus, PersonView } from "./WorldScene";

// The title page as a world: the 3D web (WorldScene, client-only and lazy) plus the DOM layers
// over it — HUD with the user's list actions, the focus card, and a keyboard/screen-reader list of
// the nodes in view. Where you are lives in the URL, one parameter per level, so the back button
// and Esc step out one level at a time and any view is a shareable link:
//   ?hub=cast  →  &node=va:95185  →  &person=95185 (their web of other works)  →  &work=pw:…

const WorldScene = dynamic(() => import("./WorldScene"), { ssr: false, loading: () => <WorldLoading /> });

function WorldLoading() {
  return <div className="ow-loading" aria-hidden="true"><span className="ow-loading-orb" /></div>;
}

// Checked once per page load; null on the server, where there is no canvas to ask.
let webglSupport: boolean | null = null;
function hasWebGL() {
  if (webglSupport == null) {
    try {
      const c = document.createElement("canvas");
      webglSupport = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}
const noSubscribe = () => () => {};

// Phones get the compact HUD and the bottom sheet; matches PHONE_WIDTH and the CSS breakpoint.
const isPhone = () => window.matchMedia("(max-width:720px)").matches;

const tone = (t: string) => ({ "--c": `var(--${t})` }) as CSSProperties;

type Marks = Record<number, ListMark> | null;
const markOf = (node: WebNode, marks: Marks) => (node.detail.type === "title" ? marks?.[node.detail.anilistId] : undefined);

/* ---------- focus card ---------- */

// A plain <img>: the scene's texture loader copes with the non-CORS cache copy this leaves.
function CardImg({ src, className }: { src: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- remote AniList images, as on the detail page
  return <img className={className} src={src} alt="" />;
}

// "In your list" on a title's card. Signed out (marks null): nothing at all.
function ListLine({ mark, type, marks, franchise }: { mark: ListMark | undefined; type: EntryType; marks: Marks; franchise?: boolean }) {
  if (!marks) return null;
  if (!mark) return <p className="ow-card-mark is-empty">{franchise ? "Not started" : "Not in your list"}</p>;
  return <p className="ow-card-mark" style={tone(STATUS_TONE[mark.status])}><span className="ow-card-mark-k">In your list</span> {markLine(mark, type)}</p>;
}

function NodeCard({ node, hub, marks, onOpenPerson }: { node: WebNode; hub: Hub; marks: Marks; onOpenPerson: (() => void) | null }) {
  const d = node.detail;
  return (
    <article className="ow-card bp-node" style={tone(node.tone)}>
      <span className="bp-tag">{node.sub ?? hub.label}</span>
      {node.image && <CardImg className="ow-card-img" src={node.image} />}
      <h2 className="ow-card-title">{node.label}</h2>
      {d.type === "character" && d.voiceActors.length > 0 && (
        <div className="ow-card-list">
          <div className="ow-card-sub">Voiced by</div>
          {d.voiceActors.map((va) => (
            <div className="ow-card-row" key={va.id}>
              {va.image && <CardImg className="ow-card-face" src={va.image} />}
              <span>{va.name}</span><span className="bp-dim">{va.language}</span>
            </div>
          ))}
        </div>
      )}
      {d.type === "person" && (
        <>
          {d.role && <p className="ow-card-sub">{d.role}</p>}
          {d.characters && <p className="bp-text">Voices {d.characters.join(", ")}</p>}
          {onOpenPerson && (
            <div className="ow-card-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenPerson}>
                ◈ {hub.id === "cast" ? "Their other roles" : "Their other works"}
              </button>
            </div>
          )}
        </>
      )}
      {d.type === "title" && (
        <>
          {d.credit && <p className="ow-card-sub">{d.credit}</p>}
          {(d.format || d.year) && <p className="ow-card-sub">{[d.format, d.year].filter(Boolean).join(" · ")}</p>}
          <ListLine mark={markOf(node, marks)} type={d.entryType} marks={marks} franchise={hub.id === "franchise"} />
          <div className="ow-card-actions">
            {/* Into the other show's own world — the web links outward. */}
            <Link className="btn btn-primary" href={`${d.href}?world=1`}>Fly to its world</Link>
            <Link className="btn btn-ghost" href={d.href}>Page</Link>
          </div>
        </>
      )}
      {d.type === "link" && (
        <div className="ow-card-actions">
          <a className="btn btn-primary" href={d.url} target="_blank" rel="noopener noreferrer">Open ↗</a>
        </div>
      )}
      {d.type === "fact" && <p className="ow-card-sub">{d.group}</p>}
    </article>
  );
}

// The franchise in story order, this show included, each entry coloured by how far you've got.
type Stop = { id: string; label: string; type: EntryType; start: number | null; mark: ListMark | undefined; here?: boolean };
function franchiseStops(hub: Hub, graph: TitleGraph, marks: Record<number, ListMark>): Stop[] {
  const stops: Stop[] = [
    { id: "here", label: graph.title, type: graph.entryType, start: graph.start, mark: marks[graph.anilistId], here: true },
    ...hub.nodes.map((n) => ({
      id: n.id, label: n.label, type: n.detail.type === "title" ? n.detail.entryType : graph.entryType, start: n.start ?? null, mark: markOf(n, marks),
    })),
  ];
  // Undated entries last; ties keep the web's order.
  return stops.map((s, i) => [s, i] as const)
    .sort(([a, i], [b, j]) => (a.start ?? Infinity) - (b.start ?? Infinity) || i - j).map(([s]) => s);
}

function FranchiseProgress({ hub, graph, marks }: { hub: Hub; graph: TitleGraph; marks: Record<number, ListMark> }) {
  const stops = franchiseStops(hub, graph, marks);
  const done = stops.filter((s) => s.mark?.status === "completed").length;
  const watching = stops.filter((s) => s.mark?.status === "watching").length;
  const unstarted = stops.filter((s) => !s.mark).length;
  return (
    <div className="ow-progress">
      <p className="ow-card-sub">
        <strong>{done} of {stops.length}</strong> completed{watching > 0 && ` · ${watching} watching`}{unstarted > 0 && ` · ${unstarted} not started`}
      </p>
      <ol className="ow-progress-bar" aria-label="Your progress through the franchise, oldest first">
        {stops.map((s) => (
          <li key={s.id} data-status={s.mark?.status ?? "none"} data-here={s.here || undefined} style={s.mark ? tone(STATUS_TONE[s.mark.status]) : undefined}
            title={`${s.label}: ${s.mark ? statusText(s.mark.status, s.type) : "not started"}`}>
            <span className="ow-sr">{s.label}: {s.mark ? statusText(s.mark.status, s.type) : "not started"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HubCard({ hub, graph, marks }: { hub: Hub; graph: TitleGraph; marks: Marks }) {
  if (hub.id === "details") {
    return (
      <article className="ow-card bp-node" style={tone(hub.tone)}>
        <span className="bp-tag">Synopsis · {hub.kanji}</span>
        <h2 className="ow-card-title">{graph.title}</h2>
        <div className="ow-card-scroll">
          {graph.synopsis.length > 0 ? graph.synopsis.map((p, i) => <p key={i}>{p}</p>) : <p className="bp-dim">No synopsis yet.</p>}
        </div>
      </article>
    );
  }
  const inList = marks ? hub.nodes.filter((n) => markOf(n, marks)).length : 0;
  return (
    <article className="ow-card bp-node" style={tone(hub.tone)}>
      <span className="bp-tag">{hub.kanji}</span>
      <h2 className="ow-card-title">{hub.label}</h2>
      <p className="ow-card-sub">{hubSize(hub)} in this web — pick one to look closer.</p>
      {hub.id === "franchise" && marks && <FranchiseProgress hub={hub} graph={graph} marks={marks} />}
      {hub.id === "similar" && inList > 0 && <p className="ow-card-sub">{inList} already in your list.</p>}
    </article>
  );
}

function PersonCard({ node, hub, state, works, marks, onBack, onRetry }: {
  node: WebNode; hub: Hub; state: PersonState | undefined; works: WebNode[] | null; marks: Marks; onBack: () => void; onRetry: () => void;
}) {
  const inList = works && marks ? works.filter((w) => markOf(w, marks)).length : 0;
  const what = hub.id === "cast" ? "other roles" : "other works";
  return (
    <article className="ow-card ow-card-person bp-node" style={tone(node.tone)}>
      <span className="bp-tag">{hub.id === "cast" ? "Voice roles" : "Credits"}</span>
      {node.image && <CardImg className="ow-card-img" src={node.image} />}
      <h2 className="ow-card-title">{node.label}</h2>
      {(!state || state.status === "loading") && <p className="ow-card-sub ow-card-wait">Gathering their {what}…</p>}
      {state?.status === "error" && (
        <>
          <p className="ow-card-sub">Couldn&apos;t reach AniList for their {what}.</p>
          <div className="ow-card-actions"><button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button></div>
        </>
      )}
      {works && (
        <>
          <p className="ow-card-sub">{works.length > 0 ? `${works.length} ${what} — pick one to look closer.` : `No ${what} on AniList.`}</p>
          {inList > 0 && <p className="ow-card-sub">{inList} of them in your list.</p>}
        </>
      )}
      <div className="ow-card-actions"><button type="button" className="btn btn-ghost" onClick={onBack}>← Back to {hub.label.toLowerCase()}</button></div>
    </article>
  );
}

/* ---------- HUD ---------- */

type Crumb = { key: string; label: string; go: () => void };

// One line, always. On phones the middle levels fold into "…" (a step up to the last hidden one),
// leaving the show and the two deepest levels; every label truncates rather than wraps.
function Crumbs({ crumbs }: { crumbs: Crumb[] }) {
  const hidden = crumbs.slice(1, -2);
  return (
    <nav className="ov-crumbs ow-crumbs" aria-label="Web position">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        const mid = i > 0 && i < crumbs.length - 2;
        return (
          <Fragment key={c.key}>
            {i === 1 && hidden.length > 0 && (
              <span className="ow-crumb ow-crumb-more">
                <span className="ow-crumb-sep" aria-hidden="true">/</span>
                <button type="button" className="ow-crumb-label" onClick={hidden[hidden.length - 1].go}
                  aria-label={`Up to ${hidden[hidden.length - 1].label}`}>…</button>
              </span>
            )}
            <span className={`ow-crumb${mid ? " is-mid" : ""}${i === 0 ? " is-root" : ""}`}>
              {i > 0 && <span className="ow-crumb-sep" aria-hidden="true">/</span>}
              {last ? <span className="ow-crumb-label" aria-current="location">{c.label}</span>
                : <button type="button" className="ow-crumb-label" onClick={c.go}>{c.label}</button>}
            </span>
          </Fragment>
        );
      })}
    </nav>
  );
}

/* ---------- world ---------- */

export default function TitleWorld({ graph, marks: marksPromise, actions, listHref }: {
  graph: TitleGraph; marks: Promise<Record<number, ListMark> | null>; actions: ReactNode; listHref: string;
}) {
  const params = useSearchParams();
  const theme = useSceneTheme();
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => null);
  const setHovered = useWorldHover((s) => s.setHovered);

  // The page's marks stream in after the world is drawn; until then (and signed out) none show.
  const [pageMarks, setPageMarks] = useState<{ from: typeof marksPromise; marks: Marks } | null>(null);
  useEffect(() => {
    let live = true;
    marksPromise.then((marks) => { if (live) setPageMarks({ from: marksPromise, marks }); }, () => {});
    return () => { live = false; };
  }, [marksPromise]);

  // Saved from the HUD's list actions this visit: they win over what the page loaded with.
  const [liveMarks, setLiveMarks] = useState<Record<number, ListMark>>({});
  useEffect(() => {
    const onSaved = (e: Event) => {
      const { anilistId, entry } = (e as CustomEvent<EntrySaved>).detail;
      setLiveMarks((m) => ({ ...m, [anilistId]: entryMark(entry) }));
    };
    window.addEventListener(ENTRY_SAVED, onSaved);
    return () => window.removeEventListener(ENTRY_SAVED, onSaved);
  }, []);

  // Focus is read from the URL; unknown hubs, nodes or works (stale links) fall back a level.
  const hub = graph.hubs.find((h) => h.id === params.get("hub")) ?? null;
  const node = hub?.nodes.find((n) => n.id === params.get("node")) ?? null;
  const personId = hub && node ? personIdOf(hub.id, node.id) : null;
  const personOpen = personId != null && params.get("person") === String(personId);
  const loadPerson = useWorldPeople((s) => s.load);
  const personState = useWorldPeople((s) => (personOpen ? s.people[personId] : undefined));
  useEffect(() => { if (personOpen) loadPerson(personId); }, [personOpen, personId, loadPerson]);
  const works = useMemo(() => (hub && personState?.status === "ready" && personState.person
    ? personWeb(personState.person, hub.id, graph.anilistId) : null), [hub, personState, graph.anilistId]);
  const work = works?.find((w) => w.id === params.get("work")) ?? null;

  const focus = useMemo<Focus>(() => ({
    hub: hub?.id ?? null, node: node?.id ?? null, person: personOpen ? personId : null, work: work?.id ?? null,
  }), [hub, node, personOpen, personId, work]);
  const person = useMemo<PersonView | null>(() => (focus.person != null ? { id: focus.person, works } : null), [focus.person, works]);

  // Everything the user has that's on screen: this page's titles plus the open person's works.
  const marks = useMemo<Marks>(() => {
    const page = pageMarks?.from === marksPromise ? pageMarks.marks : null;
    const extra = personState?.status === "ready" ? personState.marks : null;
    // Live saves only ever come from a signed-in user, so they never turn marks on when signed out.
    return page || extra ? { ...page, ...extra, ...liveMarks } : null;
  }, [pageMarks, marksPromise, personState, liveMarks]);

  // Native pushState: Next syncs useSearchParams from it without a server round trip.
  const setFocus = useCallback((h: HubId | null, n: string | null = null, p: number | null = null, w: string | null = null) => {
    const sp = new URLSearchParams(window.location.search);
    const put = (k: string, v: string | number | null) => { if (v != null) sp.set(k, String(v)); else sp.delete(k); };
    put("hub", h); put("node", h && n); put("person", h && n && p); put("work", h && n && p != null ? w : null);
    window.history.pushState(null, "", `?${sp}`);
  }, []);
  const back = useCallback(() => {
    if (focus.work) setFocus(focus.hub, focus.node, focus.person);
    else if (focus.person != null) setFocus(focus.hub, focus.node);
    else if (focus.node) setFocus(focus.hub);
    else if (focus.hub) setFocus(null);
  }, [focus, setFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Leave Escape to open menus (the status dropdown) and form fields.
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [role=menu]")) return;
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  // Measure how far the HUD and the focus panel reach over the canvas; the camera frames around them.
  const worldRef = useRef<HTMLDivElement>(null);
  const setInsets = useWorldInsets((s) => s.setInsets);
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const measure = () => {
      const box = world.getBoundingClientRect();
      let top = 0, right = 0, bottom = 0;
      // The phone HUD's opened action menu floats over the web (position:absolute), so it isn't
      // part of these boxes and doesn't push the camera around while it's open.
      world.querySelectorAll(".ow-hud-main, .ow-hud-side").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height) top = Math.max(top, r.bottom - box.top);
      });
      const el = world.querySelector<HTMLElement>(".ow-panel");
      const panel = el?.getBoundingClientRect();
      // A panel spanning most of the width (the phone sheet) sits at the bottom; frame against its
      // peek height, not its expanded one or wherever a drag left it, so the web stays put.
      if (el && panel && panel.width > box.width * 0.6) {
        const peek = parseFloat(getComputedStyle(el).getPropertyValue("--peek")) || el.offsetHeight;
        bottom = Math.min(el.offsetHeight, peek);
      } else if (panel) right = box.right - panel.left;
      setInsets({ top: top + 12, right: right + 16, bottom: Math.max(bottom + 12, 36), left: 16 });
    };
    // Fires once on observe, then whenever the HUD, the panel or the page resizes.
    const ro = new ResizeObserver(measure);
    ro.observe(world);
    world.querySelectorAll(".ow-hud-main, .ow-hud-side, .ow-panel").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [focus, setInsets]);

  // The nodes a keyboard or screen-reader user can reach from the current level.
  const reachable = hub && node && focus.person != null
    ? (works ?? []).map((w) => ({ id: w.id, label: `${w.label}${w.sub ? `, ${w.sub}` : ""}`, go: () => setFocus(hub.id, node.id, focus.person, w.id) }))
    : hub
      ? hub.nodes.filter((n) => !n.anchor).map((n) => ({ id: n.id, label: `${n.label}${n.sub ? `, ${n.sub}` : ""}`, go: () => setFocus(hub.id, n.id) }))
      : graph.hubs.map((h) => ({ id: h.id === "details" ? "core" : `hub:${h.id}`, label: `${h.id === "details" ? graph.title : h.label}, ${hubSize(h)} nodes`, go: () => setFocus(h.id) }));

  // Breadcrumbs, one per level; the current one isn't a link.
  const crumbs: Crumb[] = [
    { key: "title", label: graph.title, go: () => setFocus(null) },
    ...(hub ? [{ key: "hub", label: hub.label, go: () => setFocus(hub.id) }] : []),
    ...(node ? [{ key: "node", label: node.label, go: () => setFocus(hub!.id, node.id) }] : []),
    ...(node && focus.person != null ? [{ key: "web", label: hub!.id === "cast" ? "Roles" : "Works", go: () => setFocus(hub!.id, node.id, focus.person) }] : []),
    ...(work ? [{ key: "work", label: work.label, go: () => {} }] : []),
  ];

  // This show's own mark, live: what the phone HUD's list button shows.
  const hereMark = marks?.[graph.anilistId];

  // The phone HUD's action menu. Closes on a click outside it or Esc (an open status dropdown
  // inside it gets Esc first).
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!actionsOpen) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!actionsRef.current?.contains(t) && !t.closest?.(".ow-hud-toggle")) setActionsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [actionsOpen]);
  const onActionsKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !actionsOpen || !isPhone()) return;
    e.preventDefault(); // not a step back out of the web
    if (actionsRef.current?.querySelector("[aria-expanded=true]")) return;
    setActionsOpen(false);
    document.querySelector<HTMLElement>(".ow-hud-toggle")?.focus();
  };

  // The phone sheet: peeking by default, and back to peeking whenever the focus moves on.
  const focusKey = `${focus.hub}|${focus.node}|${focus.person}|${focus.work}`;
  const [sheet, setSheet] = useState({ key: focusKey, open: false });
  const sheetOpen = sheet.key === focusKey && sheet.open;
  const setSheetOpen = (open: boolean) => setSheet({ key: focusKey, open });
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ y: number; t: number; base: number; max: number; at: number } | null>(null);
  const dragged = useRef(false);
  const onSheetKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !sheetOpen || !isPhone() || e.defaultPrevented) return;
    e.preventDefault(); // collapse first; the next Esc steps out of the web
    setSheetOpen(false);
    handleRef.current?.focus();
  };
  // Dragging the handle moves the sheet with the finger; letting go settles it open or peeking,
  // by where it was dropped and how fast it was flicked.
  const onDragStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = sheetRef.current;
    if (!el || !isPhone()) return;
    const peek = parseFloat(getComputedStyle(el).getPropertyValue("--peek")) || 0;
    const max = Math.max(0, el.offsetHeight - peek);
    const base = sheetOpen ? 0 : max;
    drag.current = { y: e.clientY, t: e.timeStamp, base, max, at: base };
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current, el = sheetRef.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 6) dragged.current = true;
    if (!dragged.current) return;
    d.at = Math.min(Math.max(d.base + dy, 0), d.max);
    el.style.transition = "none";
    el.style.transform = `translateY(${d.at}px)`;
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const d = drag.current, el = sheetRef.current;
    drag.current = null;
    if (!d || !el || !dragged.current) return;
    const v = (e.clientY - d.y) / Math.max(e.timeStamp - d.t, 1); // px/ms, + is down
    el.style.transition = "";
    el.style.transform = "";
    setSheetOpen(v < -0.4 ? true : v > 0.4 ? false : d.at < d.max / 2);
  };

  const level = work ? 4 : focus.person != null ? 3 : node ? 2 : hub ? 1 : 0;

  return (
    <div className="ow-world" ref={worldRef} data-level={level}>
      {webgl === false ? (
        <div className="ow-fallback">
          <p>Your browser can&apos;t draw the 3D web (WebGL is off or unsupported).</p>
          <Link className="btn btn-primary" href={listHref}>Open the list view</Link>
        </div>
      ) : webgl && theme ? (
        <WorldScene graph={graph} theme={theme} focus={focus} person={person} marks={marks} reducedMotion={reducedMotion}
          onFocus={setFocus} onBack={back} />
      ) : (
        <WorldLoading />
      )}

      <div className="ow-hud" data-actions={actionsOpen || undefined}>
        <div className="ow-hud-main">
          <Crumbs crumbs={crumbs} />
          <div className="ow-hud-titlebar">
            <h1 className="ow-title">{graph.romaji}</h1>
            {/* Phones: the list actions fold away behind this one button, which shows the status. */}
            <button type="button" className="btn btn-ghost ow-hud-toggle" aria-expanded={actionsOpen} aria-controls="ow-hud-actions"
              onClick={() => setActionsOpen(!actionsOpen)}>
              {hereMark ? <span style={tone(STATUS_TONE[hereMark.status])}>{statusGlyph(hereMark.status)} {statusText(hereMark.status, graph.entryType)}</span> : "Your list"}
              <span aria-hidden="true"> ▾</span>
            </button>
          </div>
          {(graph.english && graph.english !== graph.romaji) && <div className="ow-title-sub">{graph.english}</div>}
          <div className="ow-hud-actions" id="ow-hud-actions" ref={actionsRef} onKeyDown={onActionsKey}>
            {actions}
            <div className="ow-hud-more">
              {graph.score != null && <span className="td-chip">★ {graph.score}%</span>}
              <Link className="btn btn-ghost" href={listHref}>List view</Link>
            </div>
          </div>
        </div>
        <div className="ow-hud-side">
          {graph.score != null && <span className="td-chip">★ {graph.score}%</span>}
          <Link className="btn btn-ghost" href={listHref}>List view</Link>
        </div>
      </div>

      {hub && (
        // Desktop: a panel on the right. Phones: a bottom sheet that peeks (tag and title) and
        // expands by swipe, tap, or keyboard focus reaching anything below the fold.
        <aside className="ow-panel" ref={sheetRef} data-sheet={sheetOpen ? "open" : "peek"} aria-label="Details"
          onKeyDown={onSheetKey} onFocus={(e) => { if (e.target !== handleRef.current && !sheetOpen && isPhone()) setSheetOpen(true); }}>
          <button type="button" className="ow-sheet-handle" ref={handleRef} aria-expanded={sheetOpen} aria-controls="ow-sheet-body"
            aria-label={sheetOpen ? "Collapse details" : "Expand details"}
            onClick={() => { if (dragged.current) dragged.current = false; else setSheetOpen(!sheetOpen); }}
            onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
            <span aria-hidden="true" />
          </button>
          <div className="ow-sheet-body" id="ow-sheet-body" aria-live="polite"
            onClick={(e) => { if (!sheetOpen && isPhone() && !(e.target as HTMLElement).closest("a, button")) setSheetOpen(true); }}>
            {work ? <NodeCard node={work} hub={hub} marks={marks} onOpenPerson={null} />
              : node && focus.person != null ? (
                <PersonCard node={node} hub={hub} state={personState} works={works} marks={marks} onBack={back} onRetry={() => loadPerson(focus.person!)} />
              ) : node ? (
                <NodeCard node={node} hub={hub} marks={marks} onOpenPerson={personId != null ? () => setFocus(hub.id, node.id, personId) : null} />
              ) : <HubCard hub={hub} graph={graph} marks={marks} />}
          </div>
        </aside>
      )}

      <p className="ow-hint" aria-hidden="true">
        {hub ? "Drag to orbit · scroll to zoom · Esc or empty space to go back" : "Click the show or a branch to dive in · drag to orbit"}
      </p>

      {/* Visible on keyboard focus only: the same nodes as the scene, as plain buttons. */}
      <nav className="ow-a11y" aria-label={focus.person != null ? `${node?.label} web` : hub ? `${hub.label} web` : "Branches"}>
        <ul>
          {focus.hub && <li><button type="button" onClick={back}>← Back</button></li>}
          {reachable.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={r.go} onFocus={() => setHovered(r.id)} onBlur={() => setHovered(null)}>{r.label}</button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
