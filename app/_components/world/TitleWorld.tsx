"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { hubSize, type Hub, type HubId, type TitleGraph, type WebNode } from "@/lib/title-graph";
import { usePrefersReducedMotion, useSceneTheme } from "./scene-theme";
import { useWorldHover, useWorldInsets } from "./world-store";
import type { Focus } from "./WorldScene";

// The title page as a world: the 3D web (WorldScene, client-only and lazy) plus the DOM layers
// over it — HUD with the user's list actions, the focus card, and a keyboard/screen-reader list of
// the nodes in view. Which hub and node are open lives in the URL (?hub=&node=), so the back
// button zooms out and any view is a shareable link.

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

/* ---------- focus card ---------- */

// A plain <img>: the scene's texture loader copes with the non-CORS cache copy this leaves.
function CardImg({ src, className }: { src: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- remote AniList images, as on the detail page
  return <img className={className} src={src} alt="" />;
}

function NodeCard({ node, hub }: { node: WebNode; hub: Hub }) {
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
        </>
      )}
      {d.type === "title" && (
        <>
          {(d.format || d.year) && <p className="ow-card-sub">{[d.format, d.year].filter(Boolean).join(" · ")}</p>}
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

function HubCard({ hub, graph }: { hub: Hub; graph: TitleGraph }) {
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
  return (
    <article className="ow-card bp-node" style={tone(hub.tone)}>
      <span className="bp-tag">{hub.kanji}</span>
      <h2 className="ow-card-title">{hub.label}</h2>
      <p className="ow-card-sub">{hubSize(hub)} in this web — pick one to look closer.</p>
    </article>
  );
}

/* ---------- world ---------- */

export default function TitleWorld({ graph, actions, listHref }: { graph: TitleGraph; actions: ReactNode; listHref: string }) {
  const params = useSearchParams();
  const theme = useSceneTheme();
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => null);
  const setHovered = useWorldHover((s) => s.setHovered);

  // Focus is read from the URL; unknown hubs or nodes (stale links) fall back a level.
  const focus = useMemo<Focus>(() => {
    const hub = graph.hubs.find((h) => h.id === params.get("hub")) ?? null;
    const node = hub?.nodes.find((n) => n.id === params.get("node")) ?? null;
    return { hub: hub?.id ?? null, node: node?.id ?? null };
  }, [graph, params]);
  const hub = focus.hub ? graph.hubs.find((h) => h.id === focus.hub)! : null;
  const node = hub && focus.node ? hub.nodes.find((n) => n.id === focus.node)! : null;

  // Native pushState: Next syncs useSearchParams from it without a server round trip.
  const setFocus = useCallback((h: HubId | null, n: string | null = null) => {
    const sp = new URLSearchParams(window.location.search);
    if (h) sp.set("hub", h); else sp.delete("hub");
    if (n) sp.set("node", n); else sp.delete("node");
    window.history.pushState(null, "", `?${sp}`);
  }, []);
  const back = useCallback(() => {
    if (focus.node) setFocus(focus.hub);
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
  }, [focus.hub, focus.node, setInsets]);

  // The nodes a keyboard or screen-reader user can reach from the current level.
  const reachable = hub
    ? hub.nodes.filter((n) => !n.anchor).map((n) => ({ id: n.id, label: `${n.label}${n.sub ? `, ${n.sub}` : ""}`, go: () => setFocus(hub.id, n.id) }))
    : graph.hubs.map((h) => ({ id: h.id === "details" ? "core" : `hub:${h.id}`, label: `${h.id === "details" ? graph.title : h.label}, ${hubSize(h)} nodes`, go: () => setFocus(h.id) }));

  return (
    <div className="ow-world" ref={worldRef} data-level={node ? 2 : hub ? 1 : 0}>
      {webgl === false ? (
        <div className="ow-fallback">
          <p>Your browser can&apos;t draw the 3D web (WebGL is off or unsupported).</p>
          <Link className="btn btn-primary" href={listHref}>Open the list view</Link>
        </div>
      ) : webgl && theme ? (
        <WorldScene graph={graph} theme={theme} focus={focus} reducedMotion={reducedMotion} onFocus={setFocus} onBack={back} />
      ) : (
        <WorldLoading />
      )}

      <div className="ow-hud">
        <div className="ow-hud-main">
          <nav className="ov-crumbs ow-crumbs" aria-label="Web position">
            <button type="button" onClick={() => setFocus(null)} aria-current={!hub ? "location" : undefined}>{graph.title}</button>
            {hub && <><span aria-hidden="true">/</span><button type="button" onClick={() => setFocus(hub.id)} aria-current={!node ? "location" : undefined}>{hub.label}</button></>}
            {node && <><span aria-hidden="true">/</span><span aria-current="location">{node.label}</span></>}
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
          {node ? <NodeCard node={node} hub={hub} /> : <HubCard hub={hub} graph={graph} />}
        </aside>
      )}

      <p className="ow-hint" aria-hidden="true">
        {hub ? "Drag to orbit · scroll to zoom · Esc or empty space to go back" : "Click the show or a branch to dive in · drag to orbit"}
      </p>

      {/* Visible on keyboard focus only: the same nodes as the scene, as plain buttons. */}
      <nav className="ow-a11y" aria-label={hub ? `${hub.label} web` : "Branches"}>
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
