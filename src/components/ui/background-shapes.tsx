"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * A slowly-shuffling grid of geometric marks, mirrored down the middle.
 * Drawn behind a solid colour as ambient texture, never as content.
 *
 * Three corrections to the reference implementation, each load-bearing:
 *
 *  1. Hydration. Picking the first shape with Math.random() during render
 *     makes the server and client disagree, which React reports as a
 *     hydration mismatch. Every cell now starts empty and only begins
 *     shuffling after mount, so the first paint is deterministic.
 *  2. Scale. The cell art is drawn in a 0-100 box, so the scale factor has
 *     to be cellSize/100. Hardcoding 0.2 silently assumed cellSize=20 and
 *     overflowed at any other size.
 *  3. Motion. One timer per cell means hundreds of timers; at small cell
 *     sizes that is a lot of wasted work behind a static panel. Cells share
 *     one ticker, and `prefers-reduced-motion` freezes the grid entirely.
 */

type CellProps = { colors: string[]; strokeWidth: number };

const Dot = ({ colors }: CellProps) => (
  <circle cx="50" cy="50" r="9.44" fill={colors[0]} fillRule="evenodd" />
);

const Lines = ({ colors, strokeWidth }: CellProps) => (
  <>
    <line x1="25" x2="75" y1="25" y2="25" stroke={colors[0]} strokeWidth={strokeWidth} />
    <line x1="25" x2="75" y1="50" y2="50" stroke={colors[0]} strokeWidth={strokeWidth} />
    <line x1="25" x2="75" y1="75" y2="75" stroke={colors[0]} strokeWidth={strokeWidth} />
  </>
);

const Cross = ({ colors, strokeWidth }: CellProps) => (
  <>
    <line x1="25" x2="75" y1="25" y2="75" stroke={colors[0]} strokeWidth={strokeWidth} />
    <line x1="25" x2="75" y1="75" y2="25" stroke={colors[0]} strokeWidth={strokeWidth} />
  </>
);

const Square = ({ colors, strokeWidth }: CellProps) => (
  <rect
    width="50"
    height="50"
    x="25"
    y="25"
    fill="none"
    stroke={colors[0]}
    strokeWidth={strokeWidth}
  />
);

const Slash = ({ colors, strokeWidth }: CellProps) => (
  <line x1="25" x2="75" y1="75" y2="25" fill="none" stroke={colors[0]} strokeWidth={strokeWidth} />
);

const Empty = () => null;

const Tile = () => <rect width="75" height="75" x="12.5" y="12.5" fill="rgba(255,255,255,0.1)" />;

interface ShapeConfig {
  shape: (props: CellProps) => ReactElement | null;
  weight: number;
}

/** Empty is heavily weighted: the grid should read as texture, not pattern. */
const SHAPES: ShapeConfig[] = [
  { shape: Dot, weight: 1 },
  { shape: Lines, weight: 1 },
  { shape: Cross, weight: 1 },
  { shape: Square, weight: 1 },
  { shape: Slash, weight: 1 },
  { shape: Empty, weight: 5 },
  { shape: Tile, weight: 3 },
];

const WEIGHTED: ShapeConfig[] = SHAPES.flatMap((item) =>
  Array.from({ length: item.weight }, () => item),
);

const pickShape = (): ShapeConfig =>
  WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)] ?? SHAPES[0];

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
  minInterval = 1000,
  maxInterval = 5000,
  churn = 0.06,
  preserveAspectRatio = "xMidYMid meet",
}: BackgroundShapesProps) => {
  const borderSize = cellSize * 2;
  const scale = cellSize / 100;
  const colorsKey = colors.join("|");
  const reducedMotion = usePrefersReducedMotion();

  /** Cell origins, computed once: left half plus its mirror. */
  const cells = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let x = borderSize; x < width / 2; x += cellSize) {
      for (let y = borderSize; y < height - borderSize; y += cellSize) {
        list.push({ x, y });
        list.push({ x: width - cellSize - x, y });
      }
    }
    return list;
  }, [width, height, cellSize, borderSize]);

  // Deterministic first paint: an empty grid renders identically on the
  // server and the client. Shapes arrive on the first post-mount tick.
  const [assigned, setAssigned] = useState<number[]>(() =>
    cells.map(() => SHAPES.indexOf(SHAPES.find((s) => s.shape === Empty)!)),
  );

  useEffect(() => {
    setAssigned(cells.map(() => SHAPES.indexOf(pickShape())));
  }, [cells]);

  useEffect(() => {
    if (reducedMotion || cells.length === 0) return;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      setAssigned((prev) => {
        const next = [...prev];
        const rerolls = Math.max(1, Math.round(next.length * churn));
        for (let i = 0; i < rerolls; i++) {
          next[Math.floor(Math.random() * next.length)] = SHAPES.indexOf(pickShape());
        }
        return next;
      });
      timeoutId = setTimeout(tick, Math.random() * (maxInterval - minInterval) + minInterval);
    };

    timeoutId = setTimeout(tick, minInterval);
    return () => clearTimeout(timeoutId);
  }, [cells.length, minInterval, maxInterval, churn, reducedMotion]);

  const rendered = useMemo<ReactNode[]>(
    () =>
      cells.map((cell, i) => {
        const ShapeComponent = (SHAPES[assigned[i]] ?? SHAPES[0]).shape;
        return (
          <g key={`${cell.x}-${cell.y}`} transform={`translate(${cell.x} ${cell.y})`}>
            <g transform={`scale(${scale})`}>
              <ShapeComponent colors={colors} strokeWidth={strokeWidth} />
            </g>
          </g>
        );
      }),
    // colors identity changes per render; the join key is the stable signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, assigned, scale, strokeWidth, colorsKey],
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={preserveAspectRatio}
      className={className}
      aria-hidden
      focusable="false"
    >
      {rendered}
    </svg>
  );
};

export default BackgroundShapes;
