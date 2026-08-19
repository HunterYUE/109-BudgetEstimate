import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1600, deviceScaleFactor: 1 });
await page.goto('http://118.89.92.58/budget/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 1500));
try {
  await page.type('input[placeholder="请输入邮箱"]', '119253172@qq.com');
  await page.type('input[placeholder="请输入密码"]', '1121152189@Yhd');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 40000 }).catch(()=>{});
} catch (e) { console.log('login warn:', e.message); }
await new Promise(r => setTimeout(r, 3500));

const regions = await page.evaluate(() => {
  const isDashboard = document.body.innerText.includes('仪表盘');
  const cards = [...document.querySelectorAll('.ant-card')].filter(c => c.getBoundingClientRect().top < 1600);
  const out = [];
  cards.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    out.push({ i, label: (c.textContent || '').slice(0, 20), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return { isDashboard, cards: out };
});
console.log('regions:', JSON.stringify(regions));
// 保存整页截图（基线）
await page.screenshot({ path: 'verify/dashboard_baseline_full.png' });
// 保存「交付状态」卡
const ds = regions.cards.find(c => c.label.includes('交付状态'));
if (ds) await page.screenshot({ clip: { x: ds.x, y: ds.y, width: ds.w, height: ds.h }, path: 'verify/dashboard_baseline_delivery_status.png' });
await browser.close();
console.log('baseline saved');
