import zlib from 'node:zlib';
import fs from 'node:fs';

function decodePNG(path) {
  const buf = fs.readFileSync(path);
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

const a = decodePNG('verify/dashboard_baseline_delivery_status.png');
const b = decodePNG('verify/dashboard_migrated_delivery_status.png');
const W = Math.min(a.width, b.width), H = Math.min(a.height, b.height);
console.log('baseline', a.width + 'x' + a.height, '| migrated', b.width + 'x' + b.height);

// 逐像素差（容差：抗锯齿允许 ±30/通道）
function diffAt(x, y) {
  const da = (y * a.width + x) * 4, db = (y * b.width + x) * 4;
  let m = 0;
  for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a.data[da+k] - b.data[db+k]));
  return m;
}
// 按 x 区域统计差异像素数（交付状态 4 子图）
const regions = [
  ['项目状态', 0, 305],
  ['节点执行', 306, 560],
  ['节点准时率', 561, 940],
  ['利润概览', 941, 1310],
];
for (const [name, x0, x1] of regions) {
  let total = 0;
  const rows = new Map();
  for (let x = x0; x <= x1; x++) {
    for (let y = 0; y < H; y++) {
      if (diffAt(x, y) > 40) {
        total++;
        const key = Math.floor(y / 20) * 20;
        rows.set(key, (rows.get(key) || 0) + 1);
      }
    }
  }
  const rowSummary = [...rows.entries()].sort((a2,b2)=>b2[1]-a2[1]).slice(0, 5).map(([y,c])=>`y=${y}(${c}px)`).join(', ');
  console.log(`\n[${name}] 差异像素: ${total}`);
  console.log(`  差异集中行: ${rowSummary}`);
}
// 最显著的差异行
let worst = [];
for (let y = 0; y < H; y++) {
  let c = 0;
  for (let x = 0; x < W; x++) if (diffAt(x, y) > 40) c++;
  worst.push({ y, c });
}
worst.sort((p, q) => q.c - p.c);
console.log('\n差异最集中的行（全局）:', worst.slice(0, 8).map(w => `y=${w.y}(${w.c}px)`).join(', '));
