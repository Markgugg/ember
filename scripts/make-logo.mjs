/**
 * Generates public/logo-300.png — the Current mark: a thick LinkedIn-blue ring
 * on white. Pure Node (zlib only), no image dependencies.
 *
 *   node scripts/make-logo.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 300;
const ACCENT = [0x0a, 0x66, 0xc2]; // #0A66C2
const BG = [0xff, 0xff, 0xff];

const cx = SIZE / 2;
const cy = SIZE / 2;
const outerR = 104;
const innerR = 62; // ring thickness = 42px, matching the nav mark's ratio

/** Coverage in [0,1] for a pixel, sampled 3x3 for a clean anti-aliased edge. */
function ringCoverage(x, y) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      const d = Math.hypot(px - cx, py - cy);
      if (d <= outerR && d >= innerR) hits++;
    }
  }
  return hits / 9;
}

// raw scanlines: filter byte 0 + RGB triples
const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0;
  for (let x = 0; x < SIZE; x++) {
    const a = ringCoverage(x, y);
    for (let c = 0; c < 3; c++) {
      raw[p++] = Math.round(ACCENT[c] * a + BG[c] * (1 - a));
    }
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolour RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../public/logo-300.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${SIZE}x${SIZE}, ${png.length} bytes)`);
