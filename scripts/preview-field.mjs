/**
 * Rasterises the CurrentField interference pattern to a PNG so it can be
 * inspected without a browser. Canvas won't render headlessly, so this mirrors
 * the component's maths: additive ring strokes over the panel's blue gradient.
 *
 * Purely a design-review tool. Composition only, not a pixel-exact rendering.
 *
 *   node scripts/preview-field.mjs [timeMs]
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const W = 760;
const H = 620;
const TIME = Number(process.argv[2] ?? 2600);

// Mirrors current-field.tsx
const SOURCES = [
  { x: 0.28, y: 0.24, period: 9000, reach: 0.95, color: [255, 255, 255], bloom: 0.085 },
  { x: 0.74, y: 0.78, period: 11000, reach: 1.05, color: [191, 220, 247], bloom: 0.085 },
];
const RINGS_PER_SOURCE = 10;
const PEAK = 0.12;

function ringAlpha(p) {
  if (p <= 0 || p >= 1) return 0;
  const rise = Math.min(1, p / PEAK);
  const fall = Math.pow(1 - (p - PEAK) / (1 - PEAK), 1.7);
  return rise * (p < PEAK ? 1 : fall);
}
const ringWidth = (p) => 0.55 + 1.25 * (1 - p);

function circleIntersections(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  if (hSq < 0) return null;
  const h = Math.sqrt(hSq);
  const mx = x1 + (a * dx) / d, my = y1 + (a * dy) / d;
  const ox = (h * -dy) / d, oy = (h * dx) / d;
  return [[mx + ox, my + oy], [mx - ox, my - oy]];
}

/** The panel's background: linear-gradient(150deg, #0a66c2, #0b5cb0, #08417c) */
function background(x, y) {
  const t = Math.min(1, Math.max(0, (x / W) * 0.42 + (y / H) * 0.72));
  const stops = [
    [0.0, [0x0a, 0x66, 0xc2]],
    [0.55, [0x0b, 0x5c, 0xb0]],
    [1.0, [0x08, 0x41, 0x7c]],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [0, 1, 2].map((i) => a[1][i] + (b[1][i] - a[1][i]) * f);
}

const diag = Math.hypot(W, H);

/** Live rings per source at TIME, mirroring the component. */
const LIVE = SOURCES.map((s) => {
  const cx = s.x * W;
  const cy = s.y * H;
  const rings = [];
  for (let i = 0; i < RINGS_PER_SOURCE; i++) {
    const phase = i / RINGS_PER_SOURCE;
    const progress = (((TIME / s.period + phase) % 1) + 1) % 1;
    const alpha = ringAlpha(progress);
    if (alpha > 0.001) rings.push({ radius: progress * diag * s.reach, alpha, progress });
  }
  return { s, cx, cy, rings };
});

/** Intersection nodes, computed the same way the component computes them. */
const NODES = [];
if (LIVE[0] && LIVE[1]) {
  const [a, b] = LIVE;
  for (const ra of a.rings) {
    for (const rb of b.rings) {
      const pts = circleIntersections(a.cx, a.cy, ra.radius, b.cx, b.cy, rb.radius);
      if (!pts) continue;
      const strength = ra.alpha * rb.alpha;
      if (strength < 0.02) continue;
      for (const [px, py] of pts) NODES.push({ px, py, strength, radius: 7 + 16 * strength });
    }
  }
}

/** Additive light from every ring, bloom, and node at this pixel. */
function fieldLight(x, y) {
  const acc = [0, 0, 0];

  for (const { s, cx, cy, rings } of LIVE) {
    const d = Math.hypot(x - cx, y - cy);
    const bloom = Math.exp(-(d * d) / (2 * 120 * 120)) * s.bloom;
    for (let i = 0; i < 3; i++) acc[i] += s.color[i] * bloom;

    for (const ring of rings) {
      const w = ringWidth(ring.progress);
      // Gaussian across the stroke approximates an anti-aliased arc.
      const band = Math.exp(-((d - ring.radius) ** 2) / (2 * w * w));
      const light = ring.alpha * 0.15 * band;
      for (let k = 0; k < 3; k++) acc[k] += s.color[k] * light;
    }
  }

  for (const n of NODES) {
    const d = Math.hypot(x - n.px, y - n.py);
    if (d > n.radius) continue;
    const t = 1 - d / n.radius;
    const light = 0.5 * n.strength * t * t;
    acc[0] += 226 * light;
    acc[1] += 240 * light;
    acc[2] += 255 * light;
  }
  return acc;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  for (let x = 0; x < W; x++) {
    const bg = background(x, y);
    const light = fieldLight(x, y);
    const o = y * (1 + W * 3) + 1 + x * 3;
    for (let i = 0; i < 3; i++) {
      raw[o + i] = Math.max(0, Math.min(255, Math.round(bg[i] + light[i])));
    }
  }
}

/* ── minimal PNG encoder ─────────────────────────────────────────── */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../.field-preview.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${W}x${H}, t=${TIME}ms, ${png.length} bytes)`);
