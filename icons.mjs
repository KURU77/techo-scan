// アイコン生成（依存ライブラリなし・zlib だけで PNG を書く）
// 実行: node icons.mjs   → icons/icon-192.png, icon-512.png, apple-touch-icon.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'icons'), { recursive: true });

const CRC = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const INK = hex('#1C1A17');
const PAPER = hex('#F4F1EA');
const RULE = hex('#C9C0AF');
const AI = hex('#3D7FBF');
const AI_D = hex('#255E96');

// 開いた手帳の右ページ。時間の罫線が引かれ、そこに一つだけ予定のブロックが入っている。
function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255, ia = 1 - na;
    buf[i] = Math.round(buf[i] * ia + c[0] * na);
    buf[i + 1] = Math.round(buf[i + 1] * ia + c[1] * na);
    buf[i + 2] = Math.round(buf[i + 2] * ia + c[2] * na);
    buf[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, INK);

  // 角丸の矩形（アンチエイリアスは 3x3 のスーパーサンプル）
  const rect = (x0, y0, w, h, r, c) => {
    const inside = (px, py) => {
      if (px < x0 || py < y0 || px > x0 + w || py > y0 + h) return false;
      const cx = Math.min(Math.max(px, x0 + r), x0 + w - r);
      const cy = Math.min(Math.max(py, y0 + r), y0 + h - r);
      return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
        || (px >= x0 + r && px <= x0 + w - r) || (py >= y0 + r && py <= y0 + h - r);
    };
    for (let y = Math.floor(y0) - 1; y <= Math.ceil(y0 + h) + 1; y++) {
      for (let x = Math.floor(x0) - 1; x <= Math.ceil(x0 + w) + 1; x++) {
        let hit = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hit++;
        }
        if (hit) put(x, y, c, Math.round((hit / 9) * 255));
      }
    }
  };

  const u = size / 100; // 100 を基準にした座標
  const U = (x, y, w, h, r, c) => rect(x * u, y * u, w * u, h * u, r * u, c);

  U(18, 12, 64, 76, 6, PAPER);          // ページ
  U(18, 12, 64, 12, 6, AI_D);           // 見出し帯
  U(18, 20, 64, 4, 0, AI_D);            // 帯の下端を角丸にしない
  U(27, 32, 46, 2.4, 1.2, RULE);        // 時間の罫線
  U(27, 41, 46, 2.4, 1.2, RULE);
  U(27, 60, 46, 2.4, 1.2, RULE);
  U(27, 69, 46, 2.4, 1.2, RULE);
  U(27, 47, 40, 10, 2.5, AI);           // 書き込まれた予定のブロック
  U(22, 32, 2.6, 2.4, 1.2, RULE);       // 左の目盛り
  U(22, 41, 2.6, 2.4, 1.2, RULE);
  U(22, 50, 2.6, 2.4, 1.2, AI);
  U(22, 60, 2.6, 2.4, 1.2, RULE);
  U(22, 69, 2.6, 2.4, 1.2, RULE);

  return png(size, size, buf);
}

for (const s of [192, 512]) writeFileSync(join(here, 'icons', `icon-${s}.png`), draw(s));
writeFileSync(join(here, 'icons', 'apple-touch-icon.png'), draw(180));
console.log('built: icons/icon-192.png, icon-512.png, apple-touch-icon.png');
