// Regenerates icons/*.png. Run with: node dev/make-icons.cjs
//
// A rounded app tile with a 2x2 grid on it: the shape of a speed dial, still
// readable at 16px where anything finer turns to mush. One tile is amber so the
// icon has a focal point and is easy to pick out of a row of tabs.
//
// PNG is written by hand rather than pulling in a dependency: an IHDR, one
// deflated IDAT and an IEND is the whole format for what this needs.

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

const BG_TOP = hex("#4f8dfb");
const BG_BOTTOM = hex("#7c3aed");
const TILE = hex("#ffffff");
const ACCENT = hex("#fbbf24");

// everything below is in fractions of the icon, so one description fits all sizes
const TILE_SIZE = 0.3;
const GAP = 0.075;
const CORNER = 0.225;
const TILE_CORNER = 0.075;

function insideRounded(x, y, left, top, w, h, r) {
  const cx = Math.min(Math.max(x, left + r), left + w - r);
  const cy = Math.min(Math.max(y, top + r), top + h - r);
  if (x < left || x > left + w || y < top || y > top + h) return false;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size) {
  const SS = 4; // supersample, then average down for clean edges
  const S = size * SS;
  const acc = new Float64Array(size * size * 4);

  const span = TILE_SIZE * 2 + GAP;
  const margin = (1 - span) / 2;

  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const x = (px + 0.5) / S;
      const y = (py + 0.5) / S;
      if (!insideRounded(x, y, 0, 0, 1, 1, CORNER)) continue;

      let r, g, b;
      let tile = null;
      for (let ty = 0; ty < 2 && !tile; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          const left = margin + tx * (TILE_SIZE + GAP);
          const top = margin + ty * (TILE_SIZE + GAP);
          if (insideRounded(x, y, left, top, TILE_SIZE, TILE_SIZE, TILE_CORNER)) {
            tile = { tx, ty };
            break;
          }
        }
      }

      if (tile) {
        [r, g, b] = tile.tx === 1 && tile.ty === 0 ? ACCENT : TILE;
      } else {
        const t = y;
        r = BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t;
        g = BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t;
        b = BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t;
      }

      const i = (Math.floor(py / SS) * size + Math.floor(px / SS)) * 4;
      acc[i] += r;
      acc[i + 1] += g;
      acc[i + 2] += b;
      acc[i + 3] += 255;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3] / n;
    // un-premultiply, otherwise the edge pixels darken towards black
    const cov = a / 255 || 1;
    out[i * 4] = Math.round(acc[i * 4] / n / cov);
    out[i * 4 + 1] = Math.round(acc[i * 4 + 1] / n / cov);
    out[i * 4 + 2] = Math.round(acc[i * 4 + 2] / n / cov);
    out[i * 4 + 3] = Math.round(a);
  }
  return out;
}

const ROOT = path.resolve(__dirname, "..");
const dir = path.join(ROOT, "icons");
for (const size of [16, 32, 48, 128]) {
  const file = path.join(dir, `icon${size}.png`);
  fs.writeFileSync(file, png(size, render(size)));
  console.log("wrote", path.relative(ROOT, file));
}

// The Chrome Web Store wants its listing icon to sit in a 96px square inside a
// 128px canvas. Without that padding it renders noticeably larger than every
// other extension in a row, which reads as sloppy rather than bold.
const promo = path.join(ROOT, "dist", "promo");
fs.mkdirSync(promo, { recursive: true });

const inner = render(96);
const canvas = Buffer.alloc(128 * 128 * 4); // transparent
for (let y = 0; y < 96; y++) {
  inner.copy(canvas, ((y + 16) * 128 + 16) * 4, y * 96 * 4, (y + 1) * 96 * 4);
}
const storeIcon = path.join(promo, "store-icon-128.png");
fs.writeFileSync(storeIcon, png(128, canvas));
console.log("wrote", path.relative(ROOT, storeIcon), "(96px artwork, 16px padding)");
