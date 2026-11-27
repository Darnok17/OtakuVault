"use client";

import {
  AdditiveBlending, CanvasTexture, Color, DynamicDrawUsage, MeshBasicMaterial, type Matrix4, InstancedBufferAttribute, InstancedMesh, LinearMipmapLinearFilter, PlaneGeometry,
  SRGBColorSpace, ShaderMaterial, UniformsLib, UniformsUtils, type Intersection, type Texture,
} from "three";

// Every disc of one web (a hub's cluster or a person's web of works) in one draw call: an
// instanced quad per node whose fragment shader draws the portrait (from a shared atlas), the tone
// ring, the paper themes' ink rim and the "in your list" ring — what used to be four or five
// meshes and materials per node. Billboarding, hover and the open/close animation write each
// instance's matrix per frame (WorldScene's Cluster).

/* ---------- portrait atlas ---------- */

const PAD = 4; // px around each cell, so mipmaps don't bleed between neighbours

// Portraits drawn into one canvas texture, cropped like `object-fit: cover`, top-aligned so faces
// stay in. Images come from the scene's CORS-loaded textures, so the canvas stays untainted.
export class PortraitAtlas {
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cols: number;
  private readonly cell: number;
  private readonly size: number;
  private dirtyAt = -1;

  constructor(count: number, phone: boolean) {
    this.cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    // Discs are at most ~100 CSS px across; phones get smaller cells to save memory.
    this.cell = Math.min(phone ? 128 : 192, Math.floor(4096 / this.cols));
    this.size = this.cols * this.cell;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.size;
    this.ctx = canvas.getContext("2d")!;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
  }

  // The cell's rectangle in UV space: [u0, v0, du, dv] (canvas rows run down, UVs up).
  rect(cell: number): [number, number, number, number] {
    const c = cell % this.cols, r = Math.floor(cell / this.cols), s = this.size, k = this.cell;
    return [(c * k + PAD) / s, 1 - ((r + 1) * k - PAD) / s, (k - 2 * PAD) / s, (k - 2 * PAD) / s];
  }

  draw(cell: number, image: CanvasImageSource & { width: number; height: number }, now: number) {
    const c = cell % this.cols, r = Math.floor(cell / this.cols), k = this.cell;
    const w = image.width, h = image.height;
    if (!w || !h) return;
    const side = Math.min(w, h);
    this.ctx.drawImage(image, (w - side) / 2, 0, side, side, c * k, r * k, k, k);
    if (this.dirtyAt < 0) this.dirtyAt = now;
  }

  // Uploads at most every 150ms while portraits stream in: each upload sends the whole canvas.
  flush(now: number) {
    if (this.dirtyAt < 0 || now - this.dirtyAt < 0.15) return false;
    this.dirtyAt = -1;
    this.texture.needsUpdate = true;
    return true;
  }

  dispose() { this.texture.dispose(); }
}

/* ---------- per-node look ---------- */

// Everything one disc needs, in the node's own units (before hover and spawn scaling).
export type DiscLook = {
  radius: number; // the portrait (or a fact's plain disc)
  ring: number; // outer edge of the tone ring (= radius for facts, which have none)
  rim: number; // ink rim width outside the ring; 0 on the glowing themes
  markR0: number; markW: number; // the "in your list" ring
  markFraction: number; markTrack: number; // arc length 0..1, opacity of the faint full track
  markMode: 0 | 1 | 2; // none, status ring, dashed "not started" track
  fill: Color; tone: Color; markColor: Color;
  fade: number; markFade: number;
  half: number; // the quad's half size: everything above fits inside
};

/* ---------- the batch ---------- */

type Attr = { name: string; size: number };
const ATTRS: Attr[] = [
  { name: "aCell", size: 4 }, // atlas rect, du = 0 while the portrait hasn't loaded
  { name: "aGeo", size: 4 }, // radius, ring, rim, half
  { name: "aMarkGeo", size: 4 }, // r0, width, fraction, track opacity
  { name: "aFill", size: 3 },
  { name: "aTone", size: 3 },
  { name: "aMarkColor", size: 3 },
  { name: "aFade", size: 3 }, // fade, mark fade, mode
];

const vertexShader = /* glsl */ `
  attribute vec4 aCell; attribute vec4 aGeo; attribute vec4 aMarkGeo;
  attribute vec3 aFill; attribute vec3 aTone; attribute vec3 aMarkColor; attribute vec3 aFade;
  varying vec2 vQ; varying vec4 vCell; varying vec4 vGeo; varying vec4 vMarkGeo;
  varying vec3 vFill; varying vec3 vTone; varying vec3 vMarkColor; varying vec3 vFade;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vQ = position.xy * 2.0; // the plane is 1×1: -1..1 across the quad
    vCell = aCell; vGeo = aGeo; vMarkGeo = aMarkGeo; vFill = aFill; vTone = aTone; vMarkColor = aMarkColor; vFade = aFade;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas; uniform vec3 uInk; uniform vec3 uDim;
  varying vec2 vQ; varying vec4 vCell; varying vec4 vGeo; varying vec4 vMarkGeo;
  varying vec3 vFill; varying vec3 vTone; varying vec3 vMarkColor; varying vec3 vFade;
  #include <common>
  #include <fog_pars_fragment>

  // Antialiased band between radii a and b.
  float band(float r, float a, float b, float aa) {
    return smoothstep(a - aa, a + aa, r) * (1.0 - smoothstep(b - aa, b + aa, r));
  }
  // Painter's "over", premultiplied.
  void over(inout vec4 acc, vec3 c, float a) { acc = vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a)); }

  void main() {
    float radius = vGeo.x, ring = vGeo.y, rim = vGeo.z, half_ = vGeo.w;
    float r = length(vQ) * half_;
    float aa = max(fwidth(r) * 0.75, 1e-4);
    float fade = vFade.x, markFade = vFade.y, mode = vFade.z;
    vec4 acc = vec4(0.0);

    // The portrait, or a flat fill until it loads (and for facts).
    vec3 disc = vFill;
    if (vCell.z > 0.0) {
      vec2 uv = clamp(vQ * half_ / radius * 0.5 + 0.5, 0.0, 1.0);
      disc = texture2D(uAtlas, vCell.xy + uv * vCell.zw).rgb;
    }
    over(acc, disc, (1.0 - smoothstep(radius - aa, radius + aa, r)) * fade);
    if (ring > radius + 1e-4) over(acc, vTone, band(r, radius, ring, aa) * fade);
    if (rim > 0.0) over(acc, uInk, band(r, ring, ring + rim, aa) * fade);

    if (mode > 0.5) {
      // Clockwise from twelve o'clock.
      float theta = atan(vQ.x, vQ.y);
      if (theta < 0.0) theta += PI2;
      float r0 = vMarkGeo.x, w = vMarkGeo.y;
      if (mode < 1.5) {
        float f = vMarkGeo.z;
        float b = band(r, r0, r0 + w, aa);
        float arc = f >= 1.0 ? 1.0 : 1.0 - smoothstep(-aa, aa, theta * r - f * PI2 * r);
        over(acc, vMarkColor, b * max(arc, vMarkGeo.w) * markFade);
      } else {
        // Fourteen short dashes: an entry of the franchise you haven't started.
        float dw = min(w * 0.45, 0.045);
        float k = fract(theta / (PI2 / 14.0));
        over(acc, uDim, band(r, r0, r0 + dw, aa) * step(k, 0.45) * 0.5 * markFade);
      }
    }
    if (acc.a < 0.003) discard;
    gl_FragColor = vec4(acc.rgb / acc.a, acc.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class DiscBatch {
  readonly mesh: InstancedMesh;
  private readonly attrs: Record<string, InstancedBufferAttribute>;

  constructor(count: number, atlas: Texture) {
    const geometry = new PlaneGeometry(1, 1);
    this.attrs = {};
    for (const a of ATTRS) {
      const attr = new InstancedBufferAttribute(new Float32Array(Math.max(count, 1) * a.size), a.size);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute(a.name, attr);
      this.attrs[a.name] = attr;
    }
    const material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uAtlas: { value: null }, uInk: { value: new Color() }, uDim: { value: new Color() } }]),
      vertexShader, fragmentShader, transparent: true, fog: true,
    });
    material.uniforms.uAtlas.value = atlas;
    this.mesh = new InstancedMesh(geometry, material, Math.max(count, 1));
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false; // nodes fly in and out every frame while a web opens
    this.mesh.count = count;
  }

  get material() { return this.mesh.material as ShaderMaterial; }

  // Which instance slots take the pointer; the rest are skipped by picking.
  setFilter(pickable: (slot: number) => boolean) {
    this.mesh.raycast = (raycaster, hits) => {
      const found: Intersection[] = [];
      InstancedMesh.prototype.raycast.call(this.mesh, raycaster, found);
      for (const h of found) if (h.instanceId != null && pickable(h.instanceId)) hits.push(h);
    };
  }

  setColors(ink: Color, dim: Color) {
    this.material.uniforms.uInk.value.copy(ink);
    this.material.uniforms.uDim.value.copy(dim);
  }

  // Writes node `look` into instance slot `k`; cell is the atlas rect, or null without a portrait.
  write(k: number, look: DiscLook, cell: readonly number[] | null) {
    const a = this.attrs;
    a.aCell.setXYZW(k, cell?.[0] ?? 0, cell?.[1] ?? 0, cell?.[2] ?? 0, cell?.[3] ?? 0);
    a.aGeo.setXYZW(k, look.radius, look.ring, look.rim, look.half);
    a.aMarkGeo.setXYZW(k, look.markR0, look.markW, look.markFraction, look.markTrack);
    a.aFill.setXYZ(k, look.fill.r, look.fill.g, look.fill.b);
    a.aTone.setXYZ(k, look.tone.r, look.tone.g, look.tone.b);
    a.aMarkColor.setXYZ(k, look.markColor.r, look.markColor.g, look.markColor.b);
    a.aFade.setXYZ(k, look.fade, look.markFade, look.markMode);
  }

  commit() {
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); this.mesh.dispose(); }
}

// The glowing themes' soft halos behind the discs: additive, so draw order doesn't matter and the
// opacity folds into the colour.
export class HaloBatch {
  readonly mesh: InstancedMesh;

  constructor(count: number, map: Texture) {
    const material = new MeshBasicMaterial({ map, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, Math.max(count, 1));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.raycast = () => {};
    this.mesh.setColorAt(0, new Color());
    this.mesh.count = 0;
  }

  set(i: number, matrix: Matrix4, color: Color) { this.mesh.setMatrixAt(i, matrix); this.mesh.setColorAt(i, color); }

  commit(count: number) {
    this.mesh.count = count;
    if (!count) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as MeshBasicMaterial).dispose(); this.mesh.dispose(); }
}
