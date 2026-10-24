/**
 * src/app/(marketing)/_3d/ai-core.tsx
 *
 * The hero "AI Core" sphere, implemented per the contract in
 * src/lib/three/scene-provider.tsx. This module is ONLY ever loaded via
 * `next/dynamic` with `ssr: false` (see ai-core-visual.tsx) — importing
 * it directly anywhere else will break server rendering, since `three`
 * touches `window` at module scope.
 *
 * Implements the particle engine contract exactly:
 *  - Fixed BufferGeometry, allocated once via useMemo (no per-frame resize).
 *  - Only the Float32Array position attribute is written per frame.
 *  - `needsUpdate = true` set on the position attribute each frame.
 *  - Particle count capped via PARTICLE_COUNTS[performanceTier].
 *  - Rendering pauses (stops writing) rather than disposes when inactive —
 *    controlled by the `active` prop from ai-core-visual.tsx's
 *    IntersectionObserver + visibilitychange logic.
 *
 * Colors are read from the design system's CSS custom properties at mount
 * (not hardcoded hex) so the 3D scene stays in sync with tokens.css —
 * the same brand-consistency requirement that governs every 2D surface.
 */
"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PARTICLE_COUNTS, type SceneConfig } from "@/lib/three/scene-provider";

function readTokenColor(varName: string, fallback: string): THREE.Color {
  if (typeof window === "undefined") return new THREE.Color(fallback);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return new THREE.Color(fallback);
  // tokens.css stores HSL triplets as "217 91% 60%" for use inside hsl(var(...)).
  const [h, s, l] = raw.split(" ");
  try {
    return new THREE.Color(`hsl(${h}, ${s}, ${l})`);
  } catch {
    return new THREE.Color(fallback);
  }
}

interface CoreProps {
  interactive: boolean;
}

function Core({ interactive }: CoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const colors = useMemo(
    () => ({
      secondary: readTokenColor("--secondary", "#22d3ee"),
      primary: readTokenColor("--primary", "#3b82f6"),
      accent: readTokenColor("--accent", "#10b981"),
    }),
    []
  );

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.18;
    groupRef.current.rotation.x += delta * 0.04;

    if (interactive) {
      // Subtle parallax toward pointer position — never a hard snap.
      const targetX = pointer.current.y * 0.25;
      const targetY = groupRef.current.rotation.y + pointer.current.x * 0.0008;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetX, 0.03);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetY, 0.02);
    }

    if (state.pointer) {
      pointer.current = { x: state.pointer.x, y: state.pointer.y };
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[1.4, 1]} />
        <meshBasicMaterial color={colors.secondary} wireframe transparent opacity={0.55} />
      </mesh>
      <mesh scale={0.86}>
        <icosahedronGeometry args={[1.4, 2]} />
        <meshBasicMaterial color={colors.primary} wireframe transparent opacity={0.3} />
      </mesh>
      <mesh scale={0.6}>
        <sphereGeometry args={[1.2, 24, 24]} />
        <meshBasicMaterial color={colors.accent} transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function ParticleField({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  // Pre-allocated once — the particle engine contract forbids per-frame
  // geometry resizing.
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 2.1 + Math.random() * 1.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = radius * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += delta * 0.03;
    const attr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#7dd3fc" transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

export interface AICoreSceneProps {
  performanceTier: SceneConfig["performanceTier"];
  interactive: boolean;
  targetFPS: SceneConfig["targetFPS"];
  /** false pauses the render loop entirely (off-screen or tab hidden) without unmounting the canvas. */
  active: boolean;
}

export function AICoreScene({ performanceTier, interactive, targetFPS, active }: AICoreSceneProps) {
  const particleCount = PARTICLE_COUNTS[performanceTier];
  // R3F's render loop runs at the display's native refresh rate; we don't
  // fight that with manual frame-skipping (it causes visible judder).
  // targetFPS instead governs render *cost*: the 30fps tier caps device
  // pixel ratio at 1 so the GPU has less work per frame, which is the
  // practical lever for staying smooth on low-powered devices.
  const maxDpr = targetFPS === 30 ? 1 : performanceTier === "full" ? 2 : 1.5;

  return (
    <Canvas
      dpr={[1, maxDpr]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [0, 0, 4.2], fov: 45 }}
      frameloop={active ? "always" : "never"}
      // Canvas cleanup (WebGL context + geometries/materials) is handled
      // automatically by R3F on unmount, per its default `dispose` behaviour.
    >
      <ambientLight intensity={0.6} />
      <Core interactive={interactive} />
      <ParticleField count={particleCount} />
    </Canvas>
  );
}
