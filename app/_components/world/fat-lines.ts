"use client";

import { AdditiveBlending, Color, NormalBlending, type InterleavedBufferAttribute, type Vector3 } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

// Screen-space-width line segments. WebGL draws plain lines one pixel wide whatever you ask for,
// which is right for the glowing themes and far too faint as ink on the paper ones.

export type LineLook = { color: Color; opacity: number; width: number; additive: boolean };

// Pulses: a short bright stretch travelling along each segment from its first end to its second
// (title world edge pulses). Off (strength 0) unless a web asks for them; the shader is the same
// either way, so turning them on or off never recompiles.
const PULSE_VERTEX = /* glsl */ `
  varying float vPulseT;
  varying float vPulsePhase;
  void main() {
    vPulseT = position.y < 0.5 ? 0.0 : 1.0;
    vPulsePhase = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453) * 0.3;
`;
const PULSE_FRAGMENT = /* glsl */ `
  uniform float uPulseTime;
  uniform float uPulse;
  uniform float uPulseOnly;
  uniform vec3 uPulseFlash;
  varying float vPulseT;
  varying float vPulsePhase;
  void main() {
`;
const PULSE_OUT = /* glsl */ `
  float pulseAt = fract(uPulseTime * 0.45 - vPulsePhase) * 1.3 - 0.15;
  float pulse = uPulse * (1.0 - smoothstep(0.0, 0.16, abs(vPulseT - pulseAt)));
  gl_FragColor = vec4(mix(diffuseColor.rgb, uPulseFlash, pulse * 0.55),
    uPulseOnly > 0.5 ? alpha * pulse : min(1.0, alpha * (1.0 + 1.6 * pulse)));
`;

export class FatLines {
  readonly object: LineSegments2;
  private readonly data: Float32Array;
  private readonly uniforms = {
    uPulseTime: { value: 0 }, uPulse: { value: 0 }, uPulseOnly: { value: 0 }, uPulseFlash: { value: new Color() },
  };

  constructor(segments: number, look: LineLook, positions?: ArrayLike<number>) {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(new Float32Array(Math.max(segments, 1) * 6));
    const material = new LineMaterial({
      color: look.color, linewidth: look.width, opacity: look.opacity, transparent: true, depthWrite: false, fog: true,
      blending: look.additive ? AdditiveBlending : NormalBlending, worldUnits: false,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace("void main() {", PULSE_VERTEX);
      shader.fragmentShader = shader.fragmentShader.replace("void main() {", PULSE_FRAGMENT)
        .replace("gl_FragColor = vec4( diffuseColor.rgb, alpha );", PULSE_OUT);
    };
    material.customProgramCacheKey = () => "ow-pulse";
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

  // strength 0 turns pulses off. only: draw just the travelling light (an overlay on other lines)
  // instead of brightening the line itself. flash: what the light leans toward (white on the
  // glowing themes, ink on paper).
  pulse(time: number, strength: number, flash: Color, only = false) {
    const u = this.uniforms;
    u.uPulseTime.value = time;
    u.uPulse.value = strength;
    u.uPulseOnly.value = only ? 1 : 0;
    u.uPulseFlash.value.copy(flash);
  }

  // Line widths are in CSS pixels; the material needs the canvas size to convert.
  resize(width: number, height: number) { this.material.resolution.set(width, height); }

  dispose() { this.object.geometry.dispose(); this.material.dispose(); }
}
