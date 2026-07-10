"use client";

import { useEffect, useRef } from "react";

/**
 * Two wave sources, and light where they meet.
 *
 * The product's whole claim is that a post exists only at the intersection of
 * live discourse and something you actually said. So the background is an
 * interference pattern: one source for each input, rings expanding from both,
 * and genuine brightness only where the wavefronts cross. Additive blending
 * does the physics — nothing is painted at the intersections, they simply are
 * brighter. The ring is also the product's mark.
 *
 * Canvas rather than SVG: a few dozen arcs per frame in one requestAnimationFrame
 * loop, instead of hundreds of DOM nodes reconciled by React.
 *
 * Hydration-safe (the server renders an empty canvas), pauses when the tab is
 * hidden, and renders a single still frame under prefers-reduced-motion.
 */

interface Source {
  /** Position as a fraction of the panel. */
  x: number;
  y: number;
  /** Milliseconds for a ring to travel from origin to full radius. */
  period: number;
  /** Fraction of the diagonal a ring reaches before it dies. */
  reach: number;
  color: [number, number, number];
  /** How far this source drifts with the pointer, in px. */
  parallax: number;
}

/** White for the live feed, the headline's pale blue for your own words. */
const SOURCES: Source[] = [
  { x: 0.28, y: 0.24, period: 9000, reach: 0.95, color: [255, 255, 255], parallax: 26 },
  { x: 0.74, y: 0.78, period: 11000, reach: 1.05, color: [191, 220, 247], parallax: -18 },
];

const RINGS_PER_SOURCE = 10;
const PEAK = 0.12; // where in a ring's life it is brightest (0 = birth)

/** Ring brightness: swells just after birth, then fades toward its reach. */
function ringAlpha(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  const rise = Math.min(1, progress / PEAK);
  const fall = Math.pow(1 - (progress - PEAK) / (1 - PEAK), 1.7);
  return rise * (progress < PEAK ? 1 : fall);
}

/** Thin lines read as premium; thick ones read as a screensaver. */
function ringWidth(progress: number, dpr: number): number {
  return (0.55 + 1.25 * (1 - progress)) * dpr;
}

/**
 * The two points where two circles cross, or null when they don't. This is
 * the whole idea made literal: the nodes are computed, never decorated on.
 */
export function circleIntersections(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): [number, number][] | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return null;

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  if (hSq < 0) return null;
  const h = Math.sqrt(hSq);

  const mx = x1 + (a * dx) / d;
  const my = y1 + (a * dy) / d;
  const ox = (h * -dy) / d;
  const oy = (h * dx) / d;
  return [
    [mx + ox, my + oy],
    [mx - ox, my - oy],
  ];
}

export function CurrentField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let running = true;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const draw = (time: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Ease the pointer so parallax glides instead of snapping.
      pointer.current.x += (pointer.current.tx - pointer.current.x) * 0.05;
      pointer.current.y += (pointer.current.ty - pointer.current.y) * 0.05;

      const diag = Math.hypot(width, height) * dpr;

      // Wavefronts add rather than occlude: crossings brighten on their own.
      ctx.globalCompositeOperation = "lighter";

      // Live geometry per source, reused for the crossing pass below.
      const live = SOURCES.map((source) => {
        const cx = source.x * width * dpr + pointer.current.x * source.parallax * dpr;
        const cy = source.y * height * dpr + pointer.current.y * source.parallax * dpr;
        const maxR = diag * source.reach;
        const rings: { radius: number; alpha: number; progress: number }[] = [];
        for (let i = 0; i < RINGS_PER_SOURCE; i++) {
          // Stagger births so rings are evenly spaced through their lifetime.
          const phase = i / RINGS_PER_SOURCE;
          const progress = (((time / source.period + phase) % 1) + 1) % 1;
          const alpha = ringAlpha(progress);
          if (alpha > 0.001) rings.push({ radius: progress * maxR, alpha, progress });
        }
        return { source, cx, cy, maxR, rings };
      });

      for (const { source, cx, cy, rings } of live) {
        const [r, g, b] = source.color;

        // A soft bloom marks the origin without drawing a hard dot.
        const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190 * dpr);
        bloom.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.085)`);
        bloom.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(cx, cy, 190 * dpr, 0, Math.PI * 2);
        ctx.fill();

        for (const ring of rings) {
          ctx.beginPath();
          ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${ring.alpha * 0.15})`;
          ctx.lineWidth = ringWidth(ring.progress, dpr);
          ctx.stroke();
        }
      }

      // Where a wavefront from each source crosses, a node. Both must be
      // strong for it to show, so the light is genuinely the intersection.
      const [a, b] = live;
      if (a && b) {
        for (const ringA of a.rings) {
          for (const ringB of b.rings) {
            const points = circleIntersections(
              a.cx, a.cy, ringA.radius,
              b.cx, b.cy, ringB.radius,
            );
            if (!points) continue;
            const strength = ringA.alpha * ringB.alpha;
            if (strength < 0.02) continue;

            const radius = (7 + 16 * strength) * dpr;
            for (const [px, py] of points) {
              if (px < -radius || py < -radius) continue;
              if (px > canvas.width + radius || py > canvas.height + radius) continue;
              const node = ctx.createRadialGradient(px, py, 0, px, py, radius);
              node.addColorStop(0, `rgba(226, 240, 255, ${0.5 * strength})`);
              node.addColorStop(0.35, `rgba(191, 220, 247, ${0.22 * strength})`);
              node.addColorStop(1, "rgba(191, 220, 247, 0)");
              ctx.fillStyle = node;
              ctx.beginPath();
              ctx.arc(px, py, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      ctx.globalCompositeOperation = "source-over";
      if (running && !reduced) raf = requestAnimationFrame(draw);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (reduced) return;
      const rect = parent.getBoundingClientRect();
      // -1..1 from the panel's centre.
      pointer.current.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    observer.observe(parent);

    resize();
    if (reduced) {
      // One still frame, composed at a moment where the rings read well.
      draw(2600);
    } else {
      raf = requestAnimationFrame(draw);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}

export default CurrentField;
