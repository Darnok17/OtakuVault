import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraForPerson, layoutWorld, personLayout, safeArea, type V3, type Viewport } from "./title-graph-layout";
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
