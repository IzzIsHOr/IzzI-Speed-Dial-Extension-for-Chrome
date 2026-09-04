// Renders the two Chrome Web Store promo tiles. Run with: node dev/promo.cjs
//
// Needs the dev server running: node dev/server.cjs
//
// The store rejects any image carrying an alpha channel, and headless Chrome
// writes RGBA PNGs, so each capture is decoded and re-encoded as a 24-bit
// truecolour PNG. Compositing onto an opaque background first would be wrong
// here anyway: the tiles are already fully opaque, the alpha channel is simply
// along for the ride.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:5177/dev/promo.html";
const OUT = path.resolve(__dirname, "..", "dist", "promo");

const TILES = [
  ["small-promo-440x280", "small", 440, 280],
  ["marquee-promo-1400x560", "marquee", 1400, 560]
];

/* ------------------------------------------------------------ png plumbing */

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

/** Reads a PNG into {width, height, pixels} with 4 bytes per pixel. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("only 8-bit depth is handled");
      colourType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType];
  if (!channels) throw new Error("unhandled colour type " + colourType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 0xff;
    }
  }

  return { width, height, channels, pixels: out };
}

/** Writes 24-bit truecolour PNG, no alpha, which is what the store accepts. */
function encodeRgb(width, height, channels, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour, no alpha

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * channels;
      const d = y * (stride + 1) + 1 + x * 3;
      raw[d] = pixels[s];
      raw[d + 1] = pixels[s + 1];
      raw[d + 2] = pixels[s + 2];
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------------------------------------------------------------- capture */

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const [name, tile, w, h] of TILES) {
  const file = path.join(OUT, name + ".png");
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${w},${h}`,
      "--virtual-time-budget=4000",
      "--screenshot=" + file,
      `${BASE}?tile=${tile}`
    ],
    { stdio: ["ignore", "ignore", "ignore"] }
  );

  const before = decodePng(fs.readFileSync(file));
  fs.writeFileSync(file, encodeRgb(before.width, before.height, before.channels, before.pixels));
  const after = decodePng(fs.readFileSync(file));

  console.log(
    `${name}.png  ${after.width}x${after.height}  ` +
      `${after.channels === 3 ? "RGB, no alpha" : after.channels + " channels"}  ` +
      `${(fs.statSync(file).size / 1024).toFixed(0)} KB`
  );
}

console.log("\n" + path.relative(path.resolve(__dirname, ".."), OUT));
