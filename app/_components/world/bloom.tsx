"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CustomBlending, HalfFloatType, OneFactor, Vector2, WebGLRenderTarget, ZeroFactor } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { PHONE_WIDTH } from "@/lib/title-graph-layout";
import type { SceneBloom } from "./scene-theme";

// Soft light bleeding off the glowing themes' halos, rings and pulses. Mounted only on those
// themes with the effects setting on (WorldScene); while mounted it takes over the frame (a
// useFrame with priority stops R3F's own render). Static: nothing in it moves, so reduced motion
// keeps it. On phones the scene renders at no more than 1.5× and the bloom chain at a quarter of
// that, which keeps it to a few cheap blurs.
export default function Bloom({ look }: { look: SceneBloom }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const phone = size.width <= PHONE_WIDTH;

  const fx = useMemo(() => {
    // Multisampled on desktop so lines and disc edges stay as smooth as without the composer.
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: phone ? 0 : 4 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(256, 256), look.strength, look.radius, look.threshold);
    // The blurs write alpha 1, so the stock additive blend would make the canvas opaque and hide
    // Matrix's code rain. Add light to the colour only and keep the scene's own alpha: on the
    // premultiplied canvas the glow still lands on whatever shows through.
    const blend = bloom.blendMaterial;
    blend.blending = CustomBlending;
    blend.blendSrc = OneFactor; blend.blendDst = OneFactor;
    blend.blendSrcAlpha = ZeroFactor; blend.blendDstAlpha = OneFactor;
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, bloom };
  }, [gl, scene, camera, phone, look]);
  useEffect(() => () => { fx.bloom.dispose(); fx.composer.dispose(); }, [fx]);

  useEffect(() => {
    const { composer, bloom } = fx;
    composer.setPixelRatio(phone ? Math.min(gl.getPixelRatio(), 1.5) : gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    if (phone) bloom.setSize(size.width / 2, size.height / 2);
  }, [fx, gl, size, phone]);

  useFrame((_, dt) => fx.composer.render(dt), 1);
  return null;
}
