// Frame-time check under CPU throttling (approximates a budget Android phone).
import { devServer, launch } from './harness.mjs';

const rate = Number(process.env.RATE || 6);
const server = await devServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
await page.goto(`${server.url}/?home=PL&lang=pl`);
await page.waitForSelector('.answers .answer', { timeout: 60000 });
await page.evaluate(() => {
  window.__ft = [];
  let last = performance.now();
  const loop = (t) => { window.__ft.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2500);
  const b = await page.$$('.answers .answer:not(:disabled)');
  if (b.length) await b[0].tap();
}
await page.waitForTimeout(1500);
const ft = await page.evaluate(() => window.__ft.slice(5));
ft.sort((a, b) => a - b);
const q = (p) => ft[Math.min(ft.length - 1, Math.floor(ft.length * p))].toFixed(1);
const fps = (1000 / (ft.reduce((s, v) => s + v, 0) / ft.length)).toFixed(1);
const dpr = await page.evaluate(() => document.getElementById('map-base').width / window.innerWidth);
console.log(`cpu x${rate}: frames ${ft.length}, avg fps ${fps}, median ${q(0.5)} ms, p90 ${q(0.9)} ms, p99 ${q(0.99)} ms, canvas dpr now ${dpr.toFixed(2)}`);
await browser.close();
await server.close();
