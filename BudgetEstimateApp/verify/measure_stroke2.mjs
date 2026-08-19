import puppeteer from 'puppeteer-core';
import zlib from 'node:zlib';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// ── 极简 PNG 解码器（仅解压到 RGBA，需行滤波器还原）──
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 8, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4; // 只支持常用类型
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
    cur.copy(prev);
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      if (colorType === 6) { out[d] = cur[s]; out[d+1] = cur[s+1]; out[d+2] = cur[s+2]; out[d+3] = cur[s+3]; }
      else if (colorType === 2) { out[d] = cur[s]; out[d+1] = cur[s+1]; out[d+2] = cur[s+2]; out[d+3] = 255; }
      else { const g = cur[s]; out[d]=g; out[d+1]=g; out[d+2]=g; out[d+3]=255; }
    }
  }
  return { width, height, data: out };
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 600, deviceScaleFactor: 1 });
await page.setContent(`
<html><body style="margin:0;background:#fff">
  <div id="cssbar" style="position:absolute;left:20px;top:20px;width:25px;height:120px;border:1.75px solid #1677ff;background:transparent"></div>
  <div id="cssbar2" style="position:absolute;left:60px;top:20px;width:25px;height:120px;border:2px solid #1677ff;background:transparent"></div>
  <div id="cssbar3" style="position:absolute;left:100px;top:20px;width:25px;height:120px;border:1.875px solid #1677ff;background:transparent"></div>
  <svg id="svgnative" style="position:absolute;left:120px;top:20px;width:50px;height:140px" viewBox="0 0 50 140">
    <rect x="0" y="10" width="25" height="120" fill="none" stroke="#1677ff" stroke-width="1.75"/>
  </svg>
  <svg id="svgfixed" style="position:absolute;left:220px;top:20px;width:258px;height:140px" viewBox="0 0 460 250">
    <rect x="0" y="10" width="25" height="120" fill="none" stroke="#1677ff" stroke-width="3.12"/>
  </svg>
</body></html>`);
await new Promise(r => setTimeout(r, 400));

const boxes = await page.evaluate(() => {
  const css = document.getElementById('cssbar').getBoundingClientRect();
  const css2 = document.getElementById('cssbar2').getBoundingClientRect();
  const css3 = document.getElementById('cssbar3').getBoundingClientRect();
  const sn = document.querySelector('#svgnative rect').getBoundingClientRect();
  const sf = document.querySelector('#svgfixed rect').getBoundingClientRect();
  return {
    css: { left: css.left, top: css.top, width: css.width, height: css.height },
    css2: { left: css2.left, top: css2.top, width: css2.width, height: css2.height },
    css3: { left: css3.left, top: css3.top, width: css3.width, height: css3.height },
    svgNative: { left: sn.left, top: sn.top, width: sn.width, height: sn.height },
    svgFixed: { left: sf.left, top: sf.top, width: sf.width, height: sf.height },
  };
});

// 左边缘竖线中点水平扫描，量非白像素游程
async function strokeAt(key, box, scanYOffset = 0.5) {
  const cx = box.left; // 柱体左缘（CSS border 外缘 / SVG path）
  const y = box.top + box.height * scanYOffset;
  const clip = { x: Math.max(0, cx - 4), y: Math.max(0, y - 2), width: 14, height: 5 };
  const shot = await page.screenshot({ clip, type: 'png' });
  const png = decodePNG(Buffer.from(shot));
  const rowY = Math.floor(png.height / 2);
  let runs = [], cur = -1;
  for (let x = 0; x < png.width; x++) {
    const d = (rowY * png.width + x) * 4;
    const nonWhite = png.data[d] < 235 || png.data[d+1] < 235 || png.data[d+2] < 235;
    if (nonWhite && cur < 0) cur = x;
    else if (!nonWhite && cur >= 0) { runs.push([cur, x-1]); cur = -1; }
  }
  if (cur >= 0) runs.push([cur, png.width - 1]);
  const profile = [];
  for (let x = 0; x < png.width; x++) {
    const d = (rowY * png.width + x) * 4;
    const r = png.data[d], g = png.data[d+1], b = png.data[d+2];
    if (!(r > 248 && g > 248 && b > 248)) profile.push({ x, rgb: [r, g, b] });
  }
  return { key, clip, stroke: runs.map(([s,e]) => e - s + 1), profile };
}

console.log(JSON.stringify(await Promise.all([
  strokeAt('css(div border 1.75)', boxes.css),
  strokeAt('css2(div border 2.0)', boxes.css2),
  strokeAt('css3(div border 1.875)', boxes.css3),
  strokeAt('svgNative(rect stroke 1.75, scale=1)', boxes.svgNative),
  strokeAt('svgFixed(rect stroke 3.12, downscale 0.56)', boxes.svgFixed),
]), null, 1));
await browser.close();
