import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 3000 });
await page.goto('http://localhost:5173/budget/verify/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1800));

const out = await page.evaluate(() => {
  const res = [];
  const tags = ['延期天数','节点分析','竞对','订单金额','转化效率'];
  tags.forEach(tag => {
    const card = [...document.querySelectorAll('.ant-card')].find(c => c.textContent.includes(tag));
    if (!card) { res.push({ tag, err: 'no card' }); return; }
    const svg = card.querySelector('svg');
    const cRect = card.getBoundingClientRect();
    const sRect = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox'); // "0 0 W H"
    const [, , vbW, vbH] = vb.split(' ').map(Number);
    const scaleX = sRect.width / vbW;
    const scaleY = sRect.height / vbH;
    const scale = Math.min(scaleX, scaleY);
    // 文本分类：按 fontWeight / 颜色 / 内容
    const texts = [...svg.querySelectorAll('text')];
    const xLabels = [], yLabels = [], barVals = [];
    texts.forEach(t => {
      const tspans = [...t.querySelectorAll('tspan')];
      tspans.forEach(ts => {
        const b = ts.getBoundingClientRect();
        const h = b.height;
        // Y 轴标签：textAnchor=end 且 x 靠近左缘
        const parent = ts.ownerSVGElement;
        if (t.getAttribute('text-anchor') === 'end') { yLabels.push({ txt: ts.textContent.trim(), h }); }
        else if (/^[\d.]+$|^\d/.test(ts.textContent.trim()) || /[%－]/.test(ts.textContent.trim())) { barVals.push({ txt: ts.textContent.trim(), h }); }
        else { xLabels.push({ txt: ts.textContent.trim(), h }); }
      });
    });
    // 延期卡 0 线：找 y 轴网格线中最长的一条在卡片内的位置
    let zeroLine = null;
    const gridLines = [...svg.querySelectorAll('line')].filter(l => l.getAttribute('stroke') === '#e8e8e8' || l.getAttribute('stroke-width') === '1');
    if (gridLines.length) {
      const ys = gridLines.map(l => {
        const r = l.getBoundingClientRect();
        return r.top + r.height / 2 - sRect.top;
      });
      zeroLine = ys.length ? Math.min(...ys) : null; // 最上面一条是 max 值线，0 线在下面——用最长那根?简化:记录所有
    }
    const barBottoms = [...svg.querySelectorAll('rect')].map(r => r.getBoundingClientRect().bottom - sRect.top);
    const deepBar = barBottoms.length ? Math.max(...barBottoms) : null;
    res.push({
      tag,
      cardH: cRect.height.toFixed(1),
      cardW: cRect.width.toFixed(1),
      svgW: sRect.width.toFixed(1),
      svgH: sRect.height.toFixed(1),
      viewBox: vb,
      scale: scale.toFixed(4),
      // 文本渲染尺寸（getBoundingClientRect height ≈ 字号）
      xLabelPx: xLabels.length ? Math.max(...xLabels.map(x => x.h)).toFixed(2) : null,
      xLabelN: xLabels.length,
      yLabelPx: yLabels.length ? Math.max(...yLabels.map(y => y.h)).toFixed(2) : null,
      yLabelN: yLabels.length,
      barValPx: barVals.length ? Math.max(...barVals.map(b => b.h)).toFixed(2) : null,
      barValN: barVals.length,
      deepBarInSvg: deepBar ? deepBar.toFixed(1) : null,
    });
  });
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
