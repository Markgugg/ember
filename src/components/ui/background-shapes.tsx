"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

/**
 * A slowly-shuffling grid of geometric marks, mirrored down the middle.
 * Ambient texture behind a solid colour, never content.
 *
 * Corrections to the reference implementation, each load-bearing:
 *
 *  1. Duplicate keys. The mirror of the centre column lands on itself, so
 *     those cells rendered twice under one key and React warned once per
 *     cell, per render. Cells are deduped by coordinate.
 *  2. Wasted renders. A shared `assigned` array meant every cell re-rendered
 *     on every tick, hundreds at a time, for a handful of actual changes.
 *     Cells are memoised on their own shape, so only the ones that changed
 *     do any work.
 *  3. Hydration. Choosing a shape with Math.random() during render makes the
 *     server and client disagree. The grid starts empty and fills in after
 *     mount, so first paint is deterministic.
 *  4. Scale. Cell art is drawn in a 0-100 box, so the factor must be
 *     cellSize/100. Hardcoding 0.2 silently assumed cellSize === 20.
 *
 * Motion is a slow crossfade rather than a pop, and stops entirely under
 * prefers-reduced-motion.
 */

type CellProps = { color: string; strokeWidth: number };

const Dot = ({ color }: CellProps) => <circle cx="50" cy="50" r="7" fill={color} />;

const Lines = ({ color, strokeWidth }: CellProps) => (
  <>
    <line x1="28" x2="72" y1="34" y2="34" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <line x1="28" x2="72" y1="50" y2="50" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <line x1="28" x2="72" y1="66" y2="66" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </>
);

const Cross = ({ color, strokeWidth }: CellProps) => (
  <>
    <line x1="30" x2="70" y1="30" y2="70" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <line x1="30" x2="70" y1="70" y2="30" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </>
);

const Square = ({ color, strokeWidth }: CellProps) => (
  <rect
    width="42"
    height="42"
    x="29"
    y="29"
    rx="4"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
  />
);

const Slash = ({ color, strokeWidth }: CellProps) => (
  <line x1="30" x2="70" y1="70" y2="30" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
);

const Ring = ({ color, strokeWidth }: CellProps) => (
  <circle cx="50" cy="50" r="19" fill="none" stroke={color} strokeWidth={strokeWidth} />
);

const Empty = () => null;

interface ShapeConfig {
  shape: (props: CellProps) => ReactElement | null;
  weight: number;
}

/**
 * Empty dominates so the grid reads as texture rather than pattern. The
 * reference's translucent filled tiles are gone: at low opacity they turned
 * into grey blocks that made the whole panel look like a compression artifact.
 */
const SHAPES: ShapeConfig[] = [
  { shape: Empty, weight: 11 },
  { shape: Dot, weight: 2 },
  { shape: Lines, weight: 1 },
  { shape: Cross, weight: 2 },
  { shape: Square, weight: 1 },
  { shape: Slash, weight: 2 },
  { shape: Ring, weight: 1 },
];

const EMPTY_INDEX = 0;

const WEIGHTED: number[] = SHAPES.flatMap((item, i) =>
  Array.from({ length: item.weight }, () => i),
);

const pickIndex = (): number =>
  WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)] ?? EMPTY_INDEX;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Memoised: a cell only re-renders when its own shape changes. */
const Cell = memo(function Cell({
  x,
  y,
  scale,
  shapeIndex,
  color,
  strokeWidth,
  fade,
}: {
  x: number;
  y: number;
  scale: number;
  shapeIndex: number;
  color: string;
  strokeWidth: number;
  fade: boolean;
}) {
  const ShapeComponent = (SHAPES[shapeIndex] ?? SHAPES[EMPTY_INDEX]).shape;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* Keyed on the shape so a change remounts the node and replays the
          fade, rather than snapping to the new mark. */}
      <g key={shapeIndex} className={fade ? "animate-shape-in" : undefined}>
        <ShapeComponent color={color} strokeWidth={strokeWidth} />
      </g>
    </g>
  );
});

interface BackgroundShapesProps {
  width?: number;
  height?: number;
  cellSize?: number;
  strokeWidth?: number;
  colors?: string[];
  className?: string;
  minInterval?: number;
  maxInterval?: number;
  /** Fraction of cells that re-roll on each tick. Keeps motion sparse. */
  churn?: number;
  /** Pass "xMidYMid slice" to cover a container of a different aspect ratio. */
  preserveAspectRatio?: string;
}

export const BackgroundShapes = ({
  width = 500,
  height = 500,
  cellSize = 20,
  strokeWidth = 10,
  colors = ["white"],
  className = "",
  minInterval = 900,
  maxInterval = 2200,
  churn = 0.015,
  preserveAspectRatio = "xMidYMid meet",
}: BackgroundShapesProps) => {
  const borderSize = cellSize * 2;
  const scale = cellSize / 100;
  const color = colors[0] ?? "white";
  const reducedMotion = usePrefersReducedMotion();

  /**
   * Cell origins: the left half plus its mirror, deduped. Without the dedupe
   * the centre column mirrors onto itself and collides.
   */
  const cells = useMemo(() => {
    const seen = new Set<string>();
    const list: { x: number; y: number }[] = [];
    for (let x = borderSize; x < width / 2; x += cellSize) {
      for (let y = borderSize; y < height - borderSize; y += cellSize) {
        for (const cx of [x, width - cellSize - x]) {
          const key = `${cx}-${y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ x: cx, y });
        }
      }
    }
    return list;
  }, [width, height, cellSize, borderSize]);

  // Deterministic first paint: an empty grid renders the same on both sides.
  const [assigned, setAssigned] = useState<number[]>(() =>
    cells.map(() => EMPTY_INDEX),
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setAssigned(cells.map(() => pickIndex()));
    setMounted(true);
  }, [cells]);

  const churnRef = useRef(churn);
  churnRef.current = churn;

  useEffect(() => {
    if (reducedMotion || !mounted || cells.length === 0) return;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      setAssigned((prev) => {
        const next = [...prev];
        const rerolls = Math.max(1, Math.round(next.length * churnRef.current));
        for (let i = 0; i < rerolls; i++) {
          next[Math.floor(Math.random() * next.length)] = pickIndex();
        }
        return next;
      });
      timeoutId = setTimeout(
        tick,
        Math.random() * (maxInterval - minInterval) + minInterval,
      );
    };

    timeoutId = setTimeout(tick, minInterval);
    return () => clearTimeout(timeoutId);
  }, [cells.length, minInterval, maxInterval, reducedMotion, mounted]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={preserveAspectRatio}
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* Thins the pattern behind the centred copy so text keeps contrast,
            without dimming the whole layer into mush. */}
        <radialGradient id="bg-shapes-fade" cx="50%" cy="46%" r="62%">
          <stop offset="0%" stopColor="black" stopOpacity="0.18" />
          <stop offset="55%" stopColor="black" stopOpacity="0.7" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </radialGradient>
        <mask id="bg-shapes-mask">
          <rect width={width} height={height} fill="url(#bg-shapes-fade)" />
        </mask>
      </defs>

      <g mask="url(#bg-shapes-mask)">
        {cells.map((cell, i) => (
          <Cell
            key={`${cell.x}-${cell.y}`}
            x={cell.x}
            y={cell.y}
            scale={scale}
            shapeIndex={assigned[i] ?? EMPTY_INDEX}
            color={color}
            strokeWidth={strokeWidth}
            fade={!reducedMotion}
          />
        ))}
      </g>
    </svg>
  );
};

export default BackgroundShapes;
