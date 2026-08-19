import zlib from 'node:zlib';
import fs from 'node:fs';

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8, width = 0, height = 0, colorType = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c); v += (pa<=pb&&pa<=pc)?a:(pb<=pc?b:c); }
      cur[x] = v & 0xff;
    }
    cur.copy(prev);
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      if (colorType === 6) { out[d]=cur[s]; out[d+1]=cur[s+1]; out[d+2]=cur[s+2]; out[d+3]=cur[s+3]; }
      else if (colorType === 2) { out[d]=cur[s]; out[d+1]=cur[s+1]; out[d+2]=cur[s+2]; out[d+3]=255; }
      else { out[d]=cur[s]; out[d+1]=cur[s+1]; out[d+2]=cur[s+2]; out[d+3]=255; }
    }
  }
  return { width, height, data: out };
}

const img = decodePNG(fs.readFileSync('verify/dashboard_baseline_delivery_status.png'));
const W = img.width, H = img.height;
const sat = (x, y) => {
  const d = (y * W + x) * 4;
  const r = img.data[d], g = img.data[d+1], b = img.data[d+2];
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
  return mx - mn; // 饱和度（彩色边框/文字高，灰白低）
};
// 每列扫描：找饱和像素的上/下边界（柱体边框竖条）
const cols = [];
for (let x = 0; x < W; x++) {
  let top = -1, bottom = -1, count = 0;
  for (let y = 0; y < H; y++) {
    if (sat(x, y) > 40) { if (top < 0) top = y; bottom = y; count++; }
  }
  cols.push({ x, top, bottom, count });
}
// 合并相邻饱和列 → 柱
const bars = [];
let cur = null;
for (const col of cols) {
  if (col.count > 0) {
    if (cur && col.x === cur.xEnd + 1) { cur.xEnd = col.x; cur.w++; cur.top = Math.min(cur.top, col.top); cur.bottom = Math.max(cur.bottom, col.bottom); }
    else { if (cur) bars.push(cur); cur = { x: col.x, xEnd: col.x, w: 1, top: col.top, bottom: col.bottom }; }
  } else if (cur) { bars.push(cur); cur = null; }
}
if (cur) bars.push(cur);
// 取柱体内侧边缘颜色（左缘+2px）
const out = bars.filter(b => b.w >= 3).map(b => {
  const mx = b.x + 2;
  const my = Math.round((b.top + b.bottom) / 2);
  const d = (my * W + mx) * 4;
  return { x: b.x, w: b.w, top: b.top, bottom: b.bottom, h: b.bottom - b.top + 1, color: [img.data[d], img.data[d+1], img.data[d+2]] };
});
out.sort((a, b) => a.x - b.x);
console.log('image:', W + 'x' + H, '| 饱和柱体数:', out.length);
out.forEach((b, i) => console.log(`bar[${i}] x=${b.x} w=${b.w} top=${b.top} bottom=${b.bottom} h=${b.h} color=${b.color.join(',')}`));
if (out.length) {
  console.log('bottoms:', [...new Set(out.map(b => b.bottom))].join(','));
  console.log('tops:', [...new Set(out.map(b => b.top))].join(','));
}
