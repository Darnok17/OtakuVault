"use client";

import { AdditiveBlending, NormalBlending, type Color, type InterleavedBufferAttribute, type Vector3 } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

// Screen-space-width line segments. WebGL draws plain lines one pixel wide whatever you ask for,
// which is right for the glowing themes and far too faint as ink on the paper ones.

export type LineLook = { color: Color; opacity: number; width: number; additive: boolean };

export class FatLines {
  readonly object: LineSegments2;
  private readonly data: Float32Array;

  constructor(segments: number, look: LineLook, positions?: ArrayLike<number>) {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(new Float32Array(Math.max(segments, 1) * 6));
    const material = new LineMaterial({
      color: look.color, linewidth: look.width, opacity: look.opacity, transparent: true, depthWrite: false, fog: true,
      blending: look.additive ? AdditiveBlending : NormalBlending, worldUnits: false,
    });
    this.object = new LineSegments2(geometry, material);
    this.object.frustumCulled = false; // positions move every frame while a web opens
    this.data = (geometry.attributes.instanceStart as InterleavedBufferAttribute).data.array as Float32Array;
    if (positions) { this.data.set(positions); this.commit(segments); }
    else geometry.instanceCount = 0;
  }

  get material() { return this.object.material; }

  set(i: number, a: Vector3, b: Vector3) {
    const k = i * 6;
    this.data[k] = a.x; this.data[k + 1] = a.y; this.data[k + 2] = a.z;
    this.data[k + 3] = b.x; this.data[k + 4] = b.y; this.data[k + 5] = b.z;
  }

  // Draw the first `count` segments.
  commit(count: number) {
    const geometry = this.object.geometry;
    (geometry.attributes.instanceStart as InterleavedBufferAttribute).data.needsUpdate = true;
    geometry.instanceCount = count;
  }

  fade(opacity: number) { this.object.material.opacity = opacity; }

  // Line widths are in CSS pixels; the material needs the canvas size to convert.
  resize(width: number, height: number) { this.material.resolution.set(width, height); }

  dispose() { this.object.geometry.dispose(); this.material.dispose(); }
}
