/**
 * src/components/marketing/particle-background.tsx
 *
 * Ambient full-page particle field behind the marketing content.
 * Deliberately Canvas2D rather than a second Three.js/WebGL context —
 * running two WebGL contexts (this + the hero AI core) on a mid-range
 * Android phone is exactly the kind of GPU pressure section 8 asks us
 * to avoid, and a page-wide ambient effect doesn't need WebGL's
 * capability to look right.
 *
 * Respects prefers-reduced-motion (renders nothing), pauses the
 * animation loop when the tab is hidden, and cleans up its
 * requestAnimationFrame + resize listener on unmount.
 */
"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const PARTICLE_COUNT_DESKTOP = 70;
const PARTICLE_COUNT_MOBILE = 32;
const LINK_DISTANCE = 130;

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let rafId = 0;
    let active = document.visibilityState === "visible";

    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    const count = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.offsetWidth;
      height = canvas!.offsetHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius: Math.random() * 1.4 + 0.4,
      }));
    }

    function step() {
      if (!active) {
        rafId = requestAnimationFrame(step);
        return;
      }
      ctx!.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(125, 211, 252, 0.55)";
        ctx!.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          if (!a || !b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.strokeStyle = `rgba(59, 130, 246, ${0.12 * (1 - dist / LINK_DISTANCE)})`;
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        }
      }

      rafId = requestAnimationFrame(step);
    }

    function onVisibility() {
      active = document.visibilityState === "visible";
    }

    resize();
    seed();
    rafId = requestAnimationFrame(step);

    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 size-full opacity-70"
    />
  );
}
