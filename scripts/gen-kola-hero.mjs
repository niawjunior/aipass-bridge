/**
 * Generates public/kola-hero.png (800x800 RGBA) so KolaHeroLive's
 * eye-overlay percentages line up exactly with the artwork.
 * Run: node scripts/gen-kola-hero.mjs
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 800;
const H = 800;
const SS = 2; // supersampling factor for anti-aliasing

// ---- shape helpers (signed distance functions, in pixel space) ----
// NOTE: avoid Math.hypot in these loops; it is dramatically slower than
// Math.sqrt and made a full 800x800 render exceed the CLI timeout.
const len2 = (a, b) => Math.sqrt(a * a + b * b);

const ellipse = (cx, cy, rx, ry) => (x, y) =>
  len2((x - cx) / rx, (y - cy) / ry) - 1;

const roundRect = (x0, y0, w, h, r) => (x, y) => {
  const cx = Math.abs(x - (x0 + w / 2)) - (w / 2 - r);
  const cy = Math.abs(y - (y0 + h / 2)) - (h / 2 - r);
  const ax = Math.max(cx, 0);
  const ay = Math.max(cy, 0);
  return len2(ax, ay) + Math.min(Math.max(cx, cy), 0) - r;
};

const vline = (cx, y0, y1, hw) => (x, y) => {
  const dx = Math.abs(x - cx) - hw;
  const dy = Math.max(y0 - y, y - y1);
  return len2(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
};

// ---- palette ----
const SHELL_TOP = [248, 251, 255];
const SHELL_BOT = [185, 211, 234];
const SHELL_EDGE = [143, 180, 212];
const VISOR_TOP = [11, 42, 69];
const VISOR_BOT = [4, 16, 28];
const EYE = [103, 232, 249];
const EYE_WHITE = [255, 255, 255];
const ACCENT = [34, 211, 238];
const NECK = [159, 192, 218];

// Geometry (must stay in sync with EYE_BOXES below)
const HEAD = ellipse(400, 392, 248, 222);
const VISOR = roundRect(186, 286, 428, 196, 98);
const EYE_L = ellipse(302, 384, 42, 28);
const EYE_R = ellipse(498, 384, 42, 28);
const EAR_L = roundRect(88, 336, 54, 132, 27);
const EAR_R = roundRect(658, 336, 54, 132, 27);
const ANTENNA = vline(400, 100, 162, 4);
const ANTENNA_BALL = ellipse(400, 92, 26, 26);
const CHEEK_L = ellipse(232, 520, 15, 15);
const CHEEK_R = ellipse(568, 520, 15, 15);
const MOUTH = roundRect(350, 508, 100, 14, 7);
const NECK_R = roundRect(362, 586, 76, 64, 22);
const SHOULDERS = ellipse(400, 770, 205, 86);

/** Percentage boxes for the blinking-eye overlay, matching the art. */
const EYE_BOXES = [
  { left: 32.5, top: 44.5 },
  { left: 57.0, top: 44.5 },
];

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Composite one sample: returns [r,g,b,a] 0-255 (straight alpha). */
function sample(x, y) {
  let r = 0, g = 0, b = 0, a = 0;
  const put = (col, alpha) => {
    if (alpha <= 0) return;
    const na = alpha + a * (1 - alpha);
    if (na <= 0) return;
    r = (col[0] * alpha + r * a * (1 - alpha)) / na;
    g = (col[1] * alpha + g * a * (1 - alpha)) / na;
    b = (col[2] * alpha + b * a * (1 - alpha)) / na;
    a = na;
  };
  const cov = (sdf) => Math.max(0, Math.min(1, 0.5 - sdf));

  put(mix(SHELL_TOP, SHELL_BOT, y / H), cov(SHOULDERS(x, y)));
  put(NECK, cov(NECK_R(x, y)));

  const shell = mix(SHELL_TOP, SHELL_BOT, y / H);
  put(shell, cov(EAR_L(x, y)));
  put(shell, cov(EAR_R(x, y)));

  const dHead = HEAD(x, y);
  put(shell, cov(dHead));
  if (dHead > -6 && dHead < 0) put(SHELL_EDGE, cov(dHead) * 0.5 * (1 + dHead / 6));

  put(mix(VISOR_TOP, VISOR_BOT, y / H), cov(VISOR(x, y)));

  // antenna sits behind the head
  const ant = Math.max(cov(ANTENNA(x, y)), cov(ANTENNA_BALL(x, y)));
  if (ant > 0 && dHead > 0) put(ACCENT, ant);

  const dEye = Math.min(EYE_L(x, y), EYE_R(x, y));
  put(EYE, cov(dEye));
  if (dEye > -5 && dEye < 0) put(ACCENT, cov(dEye) * 0.55);

  const hl = Math.min(ellipse(288, 372, 13, 8)(x, y), ellipse(484, 372, 13, 8)(x, y));
  put(EYE_WHITE, cov(hl) * 0.9);

  put(ACCENT, cov(Math.min(CHEEK_L(x, y), CHEEK_R(x, y))) * 0.8);
  put(VISOR_TOP, cov(MOUTH(x, y)) * 0.85);

  return [r, g, b, a * 255];
}

// ---- rasterize with supersampled edges ----
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [pr, pg, pb, pa] = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        const a = pa / 255;
        sr += pr * a; sg += pg * a; sb += pb * a; sa += a;
      }
    }
    const n = SS * SS;
    const alpha = sa / n;
    const o = rowStart + 1 + x * 4;
    // un-premultiply so PNG stores straight alpha
    raw[o] = alpha > 0 ? Math.round(Math.min(255, sr / sa)) : 0;
    raw[o + 1] = alpha > 0 ? Math.round(Math.min(255, sg / sa)) : 0;
    raw[o + 2] = alpha > 0 ? Math.round(Math.min(255, sb / sa)) : 0;
    raw[o + 3] = Math.round(alpha * 255);
  }
}

// ---- minimal PNG encoder ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // colour type: RGBA
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

// ---- assert the render actually produced artwork ----
// A previous run was killed mid-render and still produced a structurally
// valid but 92%-empty PNG, so verify content, not just the container.
let opaque = 0;
let bright = 0;
let cyan = 0;
let total = 0;
for (let y = 0; y < H; y += 2) {
  for (let x = 0; x < W; x += 2) {
    const o = y * (1 + W * 4) + 1 + x * 4;
    const a = raw[o + 3];
    const r = raw[o];
    const g = raw[o + 1];
    const b = raw[o + 2];
    total++;
    if (a > 200) opaque++;
    if (a > 100 && r > 200 && g > 200 && b > 200) bright++;
    if (a > 150 && b > 180 && g > 150 && r < 160) cyan++;
  }
}
const pctOpaque = (opaque / total) * 100;
const pctBright = (bright / total) * 100;
const pctCyan = (cyan / total) * 100;
console.log(
  `coverage: opaque=${pctOpaque.toFixed(1)}%  white-shell=${pctBright.toFixed(1)}%  cyan=${pctCyan.toFixed(1)}%`
);
if (pctOpaque < 8 || pctBright < 3 || pctCyan < 0.2) {
  console.error(
    `RENDER LOOKS EMPTY (opaque ${pctOpaque.toFixed(1)}%, white ${pctBright.toFixed(
      1
    )}%, cyan ${pctCyan.toFixed(1)}%) - refusing to write`
  );
  process.exit(1);
}

const out = path.join(__dirname, "..", "public", "kola-hero.png");
fs.writeFileSync(out, png);
console.log("wrote", out, (png.length / 1024).toFixed(1) + " KB");
console.log("eye overlay boxes (%)", JSON.stringify(EYE_BOXES));
