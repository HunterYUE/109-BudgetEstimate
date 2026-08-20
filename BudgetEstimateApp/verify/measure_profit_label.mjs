// 测量利润分析卡多行 X 轴标签行距（渲染像素级，DPR=1）
// 断言：多行第二行 top-to-top 行距 = 13×textScale 归一 → 恒 9.1px（XAxisLabel 行距单源，防回归）
// 前置：本地 `npm run dev` 后访问 /budget/verify/（verify/main.tsx 含 ProfitChart 两行名称数据）
import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1600, deviceScaleFactor: 1 });
await page.goto('http://localhost:5173/budget/verify/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => { console.log('goto warn:', e.message); });
await new Promise(r => setTimeout(r, 1500));

const result = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('svg').forEach((svg, si) => {
    // 找含 ≥2 个 tspan 的 text（多行 X 轴标签）
    const multi = [...svg.querySelectorAll('text')].filter(t => t.querySelectorAll('tspan').length >= 2);
    multi.forEach((t) => {
      const tspans = t.querySelectorAll('tspan');
      const first = tspans[0].getBoundingClientRect();
      const second = tspans[1].getBoundingClientRect();
      out.push({ svg: si, label: tspans[0].textContent + ' | ' + tspans[1].textContent, gap: +(second.y - first.y).toFixed(2) });
    });
  });
  return out;
});
const EXPECT = 9.1;
const bad = result.filter(r => Math.abs(r.gap - EXPECT) > 0.2);
console.log('多行标签行距（期望 ~9.1px）:');
for (const r of result) console.log(`  ${r.label}: ${r.gap}px`);
if (result.length === 0) { console.log('FAIL: 未找到多行标签'); await browser.close(); process.exit(1); }
if (bad.length > 0) { console.log(`FAIL: ${bad.length} 处行距偏离期望 ${EXPECT}px`); await browser.close(); process.exit(1); }
console.log(`PASS: 全部 ${result.length} 处行距 = ${EXPECT}px`);
await browser.close();
