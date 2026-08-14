import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 2200 });
await page.goto('http://localhost:5179/budget/verify/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));

const result = await page.evaluate(() => {
  const out = [];
  ['延期天数','订单金额','转化效率'].forEach(tag => {
    const card = [...document.querySelectorAll('.ant-card')].find(c => c.textContent.includes(tag));
    if (!card) { out.push({ tag, err: 'no card' }); return; }
    const svg = card.querySelector('svg');
    const sRect = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox'); // "0 0 W H"
    const [,,vbW, vbH] = vb.split(' ').map(Number);
    // 计算实际渲染缩放：preserveAspectRatio meet
    const scaleX = sRect.width / vbW;
    const scaleY = sRect.height / vbH;
    const scale = Math.min(scaleX, scaleY);
    // 内容实际高度
    const contentH = vbH * scale;
    // 标签：取最后一个 X 轴项目名 tspan 的 viewport 位置
    const texts = [...svg.querySelectorAll('text')];
    const xlabelInfo = [];
    texts.forEach(t => {
      const tspans = [...t.querySelectorAll('tspan')];
      tspans.forEach(ts => {
        const br = ts.getBoundingClientRect();
        xlabelInfo.push({ txt: ts.textContent, vTop: br.top, vBottom: br.bottom });
      });
    });
    // 最后一个 X 标签（底部）位置
    const lastXLabel = xlabelInfo.filter(x => /[\u4e00-\u9fa5A-Za-z]/.test(x.txt));
    const maxLblBottom = lastXLabel.length ? Math.max(...lastXLabel.map(l => l.vBottom)) : null;
    out.push({
      tag,
      svgEl: { w: sRect.width.toFixed(1), h: sRect.height.toFixed(1), top: sRect.top.toFixed(1), bottom: sRect.bottom.toFixed(1) },
      viewBox: vb, vbW, vbH,
      scale, contentH: contentH.toFixed(1),
      // 若内容高 < svg 高 → 下方留白
      blankBottom: (sRect.height - contentH).toFixed(1),
      // X 标签在 svg 内的相对位置
      xlabelInSvg: maxLblBottom ? { fromTop: (maxLblBottom - sRect.top).toFixed(1), fromBottom: (sRect.bottom - maxLblBottom).toFixed(1) } : null,
    });
  });
  return out;
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
