import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 3000 });
await page.goto('http://localhost:5179/budget/verify/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(() => {
  const res = [];
  const tags = ['延期天数','延期P','节点分析','竞对','订单金额','转化效率'];
  tags.forEach(tag => {
    const card = [...document.querySelectorAll('.ant-card')].find(c => c.textContent.includes(tag));
    if (!card) { res.push({ tag, err: 'no card' }); return; }
    const svg = card.querySelector('svg');
    const sRect = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox'); // "0 0 W H"
    const [, , vbW, vbH] = vb.split(' ').map(Number);
    const scale = sRect.width / vbW;

    // 文本分类：textAnchor=end → Y 轴标签；fontWeight=600 → 柱顶值；其余 → X 轴标签
    const texts = [...svg.querySelectorAll('text')];
    const xLabels = [], yLabels = [], barVals = [];
    texts.forEach(t => {
      const b = t.getBoundingClientRect();
      const h = b.height;
      const txt = t.textContent.trim();
      if (t.getAttribute('text-anchor') === 'end') yLabels.push({ txt, h });
      else if (t.getAttribute('font-weight') === '600') barVals.push({ txt, h });
      else if (txt) xLabels.push({ txt, h });
    });
    const hStat = (arr) => arr.length
      ? { n: arr.length, min: Math.min(...arr.map(a => a.h)).toFixed(2), max: Math.max(...arr.map(a => a.h)).toFixed(2) }
      : null;

    // 零线：找文本为 "0" 的 Y 轴标签，取其中心 y（相对 svg 顶）
    let zeroY = null;
    const z = yLabels.find(l => l.txt === '0');
    if (z) {
      const el = [...svg.querySelectorAll('text')].find(t => t.getAttribute('text-anchor') === 'end' && t.textContent.trim() === '0');
      if (el) zeroY = (el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - sRect.top).toFixed(1);
    }

    // negFloor：最深 rect 底（相对 svg 顶）
    const rectBottoms = [...svg.querySelectorAll('rect')].map(r => r.getBoundingClientRect().bottom - sRect.top);
    const negFloor = rectBottoms.length ? Math.max(...rectBottoms).toFixed(1) : null;
    const rectTops = [...svg.querySelectorAll('rect')].map(r => r.getBoundingClientRect().top - sRect.top);
    const minBarTop = rectTops.length ? Math.min(...rectTops).toFixed(1) : null;
    const maxBarH = rectBottoms.length ? (Math.max(...rectBottoms) - Math.min(...rectTops)).toFixed(1) : null;

    res.push({
      tag,
      svgW: sRect.width.toFixed(1),
      svgH: sRect.height.toFixed(1),
      viewBox: vb,
      scale: scale.toFixed(4),
      xLabelPx: hStat(xLabels),
      yLabelPx: hStat(yLabels),
      barValPx: hStat(barVals),
      zeroY,            // 期望：延期P=85；延期(平衡)=181
      negFloor,         // 期望：205（两者皆）
      minBarTop,        // 期望：延期P=50（正值柱顶）、延期(平衡)=50
      maxBarH,          // 期望：延期P=120（最深负柱）、延期(平衡)=24（钳制）
    });
  });
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
