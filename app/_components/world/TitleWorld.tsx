"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { hubSize, personIdOf, personWeb, type Hub, type HubId, type TitleGraph, type WebNode } from "@/lib/title-graph";
import type { EntryType, ListMark } from "@/lib/types";
import { STATUS_TONE, markLine, statusText } from "./list-marks";
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
    return page || extra ? { ...page, ...extra } : null;
  }, [pageMarks, marksPromise, personState]);

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
      world.querySelectorAll(".ow-hud-main, .ow-hud-side").forEach((el) => { top = Math.max(top, el.getBoundingClientRect().bottom - box.top); });
      const panel = world.querySelector(".ow-panel")?.getBoundingClientRect();
      // A panel spanning most of the width (phones) sits at the bottom; otherwise on the right.
      if (panel && panel.width > box.width * 0.6) bottom = box.bottom - panel.top;
      else if (panel) right = box.right - panel.left;
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

  const level = work ? 4 : focus.person != null ? 3 : node ? 2 : hub ? 1 : 0;
  const webName = hub?.id === "cast" ? "Roles" : "Works";

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

      <div className="ow-hud">
        <div className="ow-hud-main">
          <nav className="ov-crumbs ow-crumbs" aria-label="Web position">
            <button type="button" onClick={() => setFocus(null)} aria-current={!hub ? "location" : undefined}>{graph.title}</button>
            {hub && <><span aria-hidden="true">/</span><button type="button" onClick={() => setFocus(hub.id)} aria-current={!node ? "location" : undefined}>{hub.label}</button></>}
            {node && (focus.person != null
              ? <><span aria-hidden="true">/</span><button type="button" onClick={() => setFocus(hub!.id, node.id)}>{node.label}</button></>
              : <><span aria-hidden="true">/</span><span aria-current="location">{node.label}</span></>)}
            {focus.person != null && (work
              ? <><span aria-hidden="true">/</span><button type="button" onClick={() => setFocus(hub!.id, node!.id, focus.person)}>{webName}</button>
                <span aria-hidden="true">/</span><span aria-current="location">{work.label}</span></>
              : <><span aria-hidden="true">/</span><span aria-current="location">{webName}</span></>)}
          </nav>
          <h1 className="ow-title">{graph.romaji}</h1>
          {(graph.english && graph.english !== graph.romaji) && <div className="ow-title-sub">{graph.english}</div>}
          <div className="ow-hud-actions">{actions}</div>
        </div>
        <div className="ow-hud-side">
          {graph.score != null && <span className="td-chip">★ {graph.score}%</span>}
          <Link className="btn btn-ghost" href={listHref}>List view</Link>
        </div>
      </div>

      {hub && (
        <aside className="ow-panel" aria-live="polite">
          {work ? <NodeCard node={work} hub={hub} marks={marks} onOpenPerson={null} />
            : node && focus.person != null ? (
              <PersonCard node={node} hub={hub} state={personState} works={works} marks={marks} onBack={back} onRetry={() => loadPerson(focus.person!)} />
            ) : node ? (
              <NodeCard node={node} hub={hub} marks={marks} onOpenPerson={personId != null ? () => setFocus(hub.id, node.id, personId) : null} />
            ) : <HubCard hub={hub} graph={graph} marks={marks} />}
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
