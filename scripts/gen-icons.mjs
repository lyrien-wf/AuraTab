/**
 * 纯 Node（zlib）生成扩展图标 PNG：16 / 48 / 128。
 * 设计：圆角方块 + 靛蓝→紫罗兰渐变 + 白色「光环 + 光点」（呼应 Aura 主题）。
 * 运行：npm run icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

/* ---------------- 最小 PNG 编码器 ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- 图标绘制 ---------------- */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

function makeIcon(size) {
  const c = size / 2;
  const radius = size * 0.22; // 圆角半径
  const ringR = size * 0.27; // 光环中心半径
  const ringW = size * 0.075; // 光环粗细
  const dotR = size * 0.1; // 中心光点半径

  return encodePng(size, (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;

    // 圆角矩形 SDF
    const qx = Math.abs(px - c) - (c - radius);
    const qy = Math.abs(py - c) - (c - radius);
    const dRect = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
    const alpha = clamp01(0.5 - dRect);
    if (alpha <= 0) return [0, 0, 0, 0];

    // 对角渐变：#6366f1 → #a855f7
    const t = (x + y) / (2 * size);
    let r = lerp(0x63, 0xa8, t);
    let g = lerp(0x66, 0x55, t);
    let b = lerp(0xf1, 0xf7, t);

    // 白色光环 + 中心光点（带抗锯齿）
    const dist = Math.hypot(px - c, py - c);
    const dRing = Math.abs(dist - ringR) - ringW / 2;
    const white = Math.max(clamp01(0.5 - dRing), clamp01(dotR + 0.5 - dist));
    r = lerp(r, 255, white);
    g = lerp(g, 255, white);
    b = lerp(b, 255, white);

    return [r | 0, g | 0, b | 0, (alpha * 255) | 0];
  });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = join(OUT_DIR, `${size}.png`);
  writeFileSync(file, makeIcon(size));
  console.log(`✓ ${file}`);
}
