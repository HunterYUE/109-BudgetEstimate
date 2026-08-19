import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 3000 });
await page.goto('http://localhost:5173/budget/verify/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1800));
const out = await page.evaluate(() => {
  const res = [];
  ['延期天数','节点分析','竞对','订单金额'].forEach(tag => {
    const card = [...document.querySelectorAll('.ant-card')].find(c => c.textContent.includes(tag));
    const cRect = card.getBoundingClientRect();
    const svg = card.querySelector('svg');
    const s = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox');
    const xLabels = [], bars = [];
    svg.querySelectorAll('text').forEach(t => t.querySelectorAll('tspan').forEach(ts => { const b = ts.getBoundingClientRect(); xLabels.push(b.top); }));
    svg.querySelectorAll('rect').forEach(r => { const b = r.getBoundingClientRect(); bars.push(b.bottom); });
    const barDeep = bars.length ? Math.max(...bars) : null;
    const xTop = xLabels.length ? Math.min(...xLabels) : null;
    const xBot = xLabels.length ? Math.max(...xLabels) : null;
    res.push({
      tag,
      cardH: cRect.height.toFixed(1), svgH: s.height.toFixed(1), viewBox: vb,
      gapDeep: (barDeep != null && xTop != null) ? (xTop - barDeep).toFixed(1) + 'px' : 'n/a',
      clip: (xBot != null) ? ((cRect.bottom - xBot).toFixed(1) + 'px 距卡底') : 'n/a',
    });
  });
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
