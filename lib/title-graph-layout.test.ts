import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraFor, cameraForPerson, layoutWorld, personLayout, safeArea, viewPoints, type V3, type Viewport } from "./title-graph-layout";
import type { HubId, TitleGraph, WebNode } from "./title-graph";

// A minimal graph: a cast web of `n` voice actors, enough for layoutWorld to place the hub.
function graphWith(n: number): TitleGraph {
  const node = (i: number): WebNode => ({
    id: `va:${i + 1}`, label: `VA ${i}`, sub: "Japanese", image: null, tone: "azure", weight: 0.5, group: "Japanese",
    detail: { type: "person", role: "Japanese voice" },
  });
  const hub = (id: HubId, nodes: WebNode[]) => ({ id, label: id, kanji: "", tone: "azure" as const, nodes });
  return {
    anilistId: 1, entryType: "anime", title: "T", romaji: "T", english: null, native: null, cover: null, color: null, score: null,
    status: null, synopsis: [], start: null,
    hubs: [hub("details", []), hub("cast", Array.from({ length: n }, (_, i) => node(i))), hub("staff", [node(99)])],
  };
}

// Where a world point lands on screen (NDC) from a camera view.
function project(view: { pos: V3; target: V3 }, vp: Viewport, p: V3) {
  const cam = new PerspectiveCamera(FOV, vp.width / vp.height, 0.1, 500);
  cam.position.set(...view.pos);
  cam.lookAt(...view.target);
  cam.updateMatrixWorld();
  return new Vector3(...p).project(cam);
}

const VIEWPORTS: Viewport[] = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];

test("person webs are deterministic and framed whole on desktop and phones", () => {
  const layout = layoutWorld(graphWith(24));
  const at = layout.hubs.cast;
  for (const count of [1, 6, 12, 19, 30]) {
    const web = personLayout(at, 3, count);
    assert.equal(web.nodes.length, count);
    assert.deepEqual(personLayout(at, 3, count), web, "same input, same layout");
    for (const vp of VIEWPORTS) {
      const area = safeArea(vp, true);
      const view = cameraForPerson(web, null, vp);
      for (const p of [...web.nodes, web.pos]) {
        const s = project(view, vp, p);
        assert.ok(s.z < 1, "in front of the camera");
        assert.ok(s.x >= area.x0 - 1e-6 && s.x <= area.x1 + 1e-6, `x in the safe area (${count} works, ${vp.width}×${vp.height})`);
        assert.ok(s.y >= area.y0 - 1e-6 && s.y <= area.y1 + 1e-6, `y in the safe area (${count} works, ${vp.width}×${vp.height})`);
      }
    }
  }
});

test("works never sit on top of each other", () => {
  const web = personLayout(layoutWorld(graphWith(24)).hubs.cast, 0, 30);
  for (let i = 0; i < web.nodes.length; i++) for (let j = i + 1; j < web.nodes.length; j++) {
    const d = Math.hypot(...web.nodes[i].map((v, k) => v - web.nodes[j][k]));
    assert.ok(d > 1.1, `works ${i} and ${j} are ${d.toFixed(2)} apart`);
  }
});

// A full-size show: every hub at the size the graph caps it to (a 60-strong cast hanging from
// 20 characters, 25 staff across every group, a long franchise path with side stories).
function bigGraph(): TitleGraph {
  const n = (id: string, group: string | null, extra: Partial<WebNode> = {}): WebNode => ({
    id, label: `Node ${id}`, sub: group, image: "x", tone: "azure", weight: 0.5, group, detail: { type: "person", role: null }, ...extra,
  });
  const hub = (id: HubId, nodes: WebNode[]) => ({ id, label: id, kanji: "", tone: "azure" as const, nodes });
  const chars = Array.from({ length: 20 }, (_, i) => n(`cast:char:${i}`, "characters", { anchor: true }));
  const langs = ["Japanese", "English", "Portuguese"];
  const cast = Array.from({ length: 60 }, (_, i) => n(`va:${i}`, langs[i % 3], { links: [`cast:char:${i % 20}`] }));
  const staffGroups = ["Direction", "Writing", "Music & sound", "Animation & art", "Other"];
  const facts = ["Genres", "Stats", "Studios", "Tags"].flatMap((g, k) => Array.from({ length: [5, 6, 2, 14][k] }, (_, i) =>
    n(`fact:${g}:${i}`, g, { image: null, detail: { type: "fact", group: g } })));
  const rel = (i: number, kind: string, start: number) => n(`rel:${i}:${kind}`, kind === "PREQUEL" || kind === "SEQUEL" ? "spine" : kind, { start });
  const franchise = [rel(1, "PREQUEL", 201801), rel(2, "PREQUEL", 202001), rel(3, "SEQUEL", 202601), rel(4, "SEQUEL", 202801),
    rel(5, "SIDE_STORY", 202401), rel(6, "SIDE_STORY", 202402), rel(7, "ADAPTATION", 202001), rel(8, "SOURCE", 201601), rel(9, "SPIN_OFF", 202701)];
  return {
    anilistId: 1, entryType: "anime", title: "T", romaji: "T", english: null, native: null, cover: null, color: null, score: null,
    status: null, synopsis: [], start: 202310,
    hubs: [
      hub("details", facts),
      hub("characters", Array.from({ length: 25 }, (_, i) => n(`char:${i}`, i < 5 ? "main" : "supporting"))),
      hub("cast", [...chars, ...cast]),
      hub("staff", Array.from({ length: 25 }, (_, i) => n(`staff:${i}`, staffGroups[i % 5]))),
      hub("franchise", franchise),
      hub("similar", Array.from({ length: 10 }, (_, i) => n(`sim:${i}`, null))),
      hub("watch", Array.from({ length: 6 }, (_, i) => n(`link:${i}`, null, { image: null }))),
    ],
  };
}

// The phone world as the compact HUD measures it: a 390-wide screen below the site nav (short
// when the nav wraps for a signed-in user, tall when it doesn't), the HUD's two lines on top and
// the focus sheet peeking at the bottom (TitleWorld adds 12px to each).
const PHONES: Viewport[] = [645, 780].map((height) => ({ width: 390, height, insets: { top: 73, right: 16, bottom: 106, left: 16 } }));

test("every hub web fits whole between the phone HUD and the peeking sheet", () => {
  const graph = bigGraph();
  const layout = layoutWorld(graph);
  for (const vp of PHONES) {
    const area = safeArea(vp, true);
    // The insets are taken as measured, not squeezed: there's room for every web.
    assert.ok(Math.abs(area.y1 - (1 - (2 * 73) / vp.height)) < 1e-9 && Math.abs(area.y0 - (-1 + (2 * 106) / vp.height)) < 1e-9);
    for (const h of graph.hubs) {
      const view = cameraFor(layout, h.id, null, vp);
      for (const p of viewPoints(layout, h.id)) {
        const s = project(view, vp, p);
        assert.ok(s.z < 1, `${h.id}: in front of the camera`);
        assert.ok(s.x >= area.x0 - 1e-6 && s.x <= area.x1 + 1e-6, `${h.id}: x in the safe area (${vp.width}×${vp.height})`);
        assert.ok(s.y >= area.y0 - 1e-6 && s.y <= area.y1 + 1e-6, `${h.id}: y in the safe area (${vp.width}×${vp.height})`);
      }
    }
  }
});

test("person webs fit between the phone HUD and the peeking sheet", () => {
  const layout = layoutWorld(bigGraph());
  for (const hubId of ["cast", "staff"] as const) for (const count of [3, 19, 30]) {
    const web = personLayout(layout.hubs[hubId], 7, count);
    for (const vp of PHONES) {
      const area = safeArea(vp, true);
      const view = cameraForPerson(web, null, vp);
      for (const p of [...web.nodes, web.pos]) {
        const s = project(view, vp, p);
        assert.ok(s.x >= area.x0 - 1e-6 && s.x <= area.x1 + 1e-6 && s.y >= area.y0 - 1e-6 && s.y <= area.y1 + 1e-6,
          `${hubId} person web of ${count} on ${vp.width}×${vp.height}`);
      }
    }
  }
});
