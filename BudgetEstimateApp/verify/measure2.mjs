import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const url = 'http://localhost:5179/budget/verify/index.html';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 2200 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));

const result = await page.evaluate(() => {
  const out = { delivery: [], sales: [] };

  // ══ 延期天数卡片 ══
  const delayCard = [...document.querySelectorAll('.ant-card')].find(c => c.textContent.includes('延期天数'));
  if (delayCard) {
    const cRect = delayCard.getBoundingClientRect();
    const svg = delayCard.querySelector('svg');
    const svgRect = svg.getBoundingClientRect();
    // 收集 SVG 内所有 text 元素：X 标签（name）、数值标签
    const texts = [...svg.querySelectorAll('text')];
    const xLabels = [], valLabels = [], barRects = [];
    texts.forEach(t => {
      const tspans = [...t.querySelectorAll('tspan')];
      const r = t.getBoundingClientRect();
      const txt = t.textContent.trim();
      if (tspans.length === 0) {
        // 单行 text：数值标签（彩色粗体）或 Y 轴标签
        const y = t.getAttribute('y');
        const isNum = /^-?[\d.]+%?$/.test(txt) || txt === '—';
        if (isNum && y && parseFloat(y) > 50) valLabels.push({ txt, svgY: +y, top: r.top, bottom: r.bottom });
      } else {
        // tspan：X 轴项目名
        tspans.forEach(ts => {
          const br = ts.getBoundingClientRect();
          xLabels.push({ txt: ts.textContent, top: br.top, bottom: br.bottom });
        });
      }
    });
    svg.querySelectorAll('rect').forEach(rr => {
      const rrRect = rr.getBoundingClientRect();
      barRects.push({ top: rrRect.top, bottom: rrRect.bottom, h: rrRect.height });
    });
    // 最小值柱（最低柱底部）与 X 标签位置关系
    const minBarBottom = barRects.length ? Math.min(...barRects.map(b => b.bottom)) : null;
    const maxXLabelBottom = xLabels.length ? Math.max(...xLabels.map(l => l.bottom)) : null;
    const minXLabelTop = xLabels.length ? Math.min(...xLabels.map(l => l.top)) : null;
    // 数值标签最低位置（负值柱下方标签）
    const minValBottom = valLabels.length ? Math.min(...valLabels.map(v => v.bottom)) : null;
    out.delivery = {
      cardH: cRect.height, svgH: svgRect.height, svgAttrH: svg.getAttribute('height'),
      svgTop: svgRect.top, cardTop: cRect.top,
      barCount: barRects.length,
      minBarBottom, maxXLabelBottom, minXLabelTop,
      minValBottom,
      // 重叠判定：最低柱底部 vs X标签顶部
      barVsXLabel: (minBarBottom != null && minXLabelTop != null) ? (minBarBottom - minXLabelTop).toFixed(1) + 'px (正=无重叠)' : 'n/a',
      xLabelTopVsValBottom: (minValBottom != null && minXLabelTop != null) ? (minXLabelTop - minValBottom).toFixed(1) + 'px' : 'n/a',
      xLabelSample: xLabels.slice(0, 4),
      valSample: valLabels.slice(0, 5),
      barSample: barRects.slice(0, 3),
    };
  }

  // ══ 4 个排行卡片 ══
  ['订单金额', '订单利润', '转化效率', '管道潜力'].forEach(tag => {
    const card = [...document.querySelectorAll('.ant-card')].find(c => c.textContent.includes(tag));
    if (!card) { out.sales.push({ tag, err: 'no card' }); return; }
    const cRect = card.getBoundingClientRect();
    const svg = card.querySelector('svg');
    const svgRect = svg.getBoundingClientRect();
    const texts = [...svg.querySelectorAll('text')];
    const xLabels = [], barRects = [];
    texts.forEach(t => {
      const tspans = [...t.querySelectorAll('tspan')];
      if (tspans.length > 0) {
        tspans.forEach(ts => { const br = ts.getBoundingClientRect(); xLabels.push({ txt: ts.textContent, top: br.top, bottom: br.bottom }); });
      }
    });
    svg.querySelectorAll('rect').forEach(rr => { const br = rr.getBoundingClientRect(); barRects.push({ top: br.top, bottom: br.bottom, h: br.height }); });
    const minBarBottom = barRects.length ? Math.min(...barRects.map(b => b.bottom)) : null;
    const maxXLabelBottom = xLabels.length ? Math.max(...xLabels.map(l => l.bottom)) : null;
    const minXLabelTop = xLabels.length ? Math.min(...xLabels.map(l => l.top)) : null;
    out.sales.push({
      tag,
      cardH: cRect.height, cardBottom: cRect.bottom,
      svgH: svgRect.height, svgAttrH: svg.getAttribute('height'), svgBottom: svgRect.bottom,
      // 卡片底部空白 = cardBottom - 最低 x 标签底部
      blankBelowLabel: (cRect.bottom - maxXLabelBottom).toFixed(1) + 'px',
      barVsXLabel: (minBarBottom != null && minXLabelTop != null) ? (minBarBottom - minXLabelTop).toFixed(1) + 'px' : 'n/a',
      barBottomSample: barRects.slice(0, 2).map(b => b.bottom.toFixed(1)),
      xLabelTopSample: xLabels.slice(0, 2).map(l => l.top.toFixed(1)),
    });
  });
  return out;
});

console.log(JSON.stringify(result, null, 1));
await browser.close();
