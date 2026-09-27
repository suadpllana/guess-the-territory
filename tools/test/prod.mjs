// Loads a built zip served from a sub-path and plays a few rounds (no dev handles).
import { chromium } from 'playwright-core';
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const errors = [];
const failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
await page.goto(url + '?home=IN&lang=hi');
await page.waitForSelector('.answers .answer', { timeout: 15000 });
await page.waitForTimeout(2200);
await page.screenshot({ path: process.argv[3] + '/prod-1.png' });
for (let i = 0; i < 4; i++) {
  const b = await page.$$('.answers .answer:not(:disabled)');
  if (b.length) await b[i % b.length].tap();
  await page.waitForTimeout(2600);
}
await page.screenshot({ path: process.argv[3] + '/prod-2.png' });
console.log('errors:', errors.length ? errors : 'none');
console.log('failed requests:', failed.filter((u) => !u.includes('poki-sdk')).length ? failed : 'none (except blocked SDK)');
await browser.close();
