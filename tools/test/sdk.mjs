// Verifies Poki SDK call order with a recording mock SDK (dev server or preview).
import { chromium } from 'playwright-core';

const base = process.env.BASE || 'http://localhost:5173/';
const query = process.env.Q || '?home=TR&lang=tr&speed=3';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const MOCK = `
  window.__calls = [];
  const log = (n, a) => window.__calls.push(n + (a !== undefined ? ':' + JSON.stringify(a) : ''));
  window.PokiSDK = {
    init: () => { log('init'); return new Promise((r) => setTimeout(r, 300)); },
    setDebug: () => {},
    gameLoadingStart: () => log('gameLoadingStart'),
    gameLoadingProgress: (p) => log('gameLoadingProgress', p.percentageDone),
    gameLoadingFinished: () => log('gameLoadingFinished'),
    gameplayStart: () => log('gameplayStart'),
    gameplayStop: () => log('gameplayStop'),
    commercialBreak: (cb) => { log('commercialBreak'); cb && cb(); return new Promise((r) => setTimeout(r, 500)); },
    rewardedBreak: (cb) => { log('rewardedBreak'); cb && cb(); return new Promise((r) => setTimeout(() => r(true), 500)); },
    measure: (c, w, a) => log('measure', [c, w, a].join('|')),
    captureError: (e) => log('captureError', String(e)),
  };`;
await page.route('**/poki-sdk.js', (route) => route.fulfill({ contentType: 'application/javascript', body: MOCK }));
await page.goto(base + query);
await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
await page.waitForTimeout(2500);
const beforeInput = await page.evaluate(() => window.__calls.slice());
// first input: answer the question
const answer = async () => {
  const idx = await page.evaluate(() => { const q = window.__game.currentQ; return q.options.indexOf(q.target); });
  const b = await page.$$('.answers .answer');
  await b[idx].click();
};
await answer();
await page.waitForTimeout(1500);
// pause via ESC then resume via button
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const pausedShot = '/tmp/claude-0/-home-user-guess-the-territory/33a4f764-be7b-564e-9612-8ed8da2682f0/scratchpad/pause-tr.png';
await page.screenshot({ path: pausedShot });
await page.click('.overlay .btn.primary');
await page.waitForTimeout(400);
// tab hidden -> visible
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(300);
const overlayAfterHide = await page.evaluate(() => !document.querySelector('.overlay').classList.contains('hide'));
await page.click('.overlay .btn.primary').catch(() => {});
await page.waitForTimeout(300);
const calls = await page.evaluate(() => window.__calls.slice());

const idx = (n) => calls.findIndex((c) => c.startsWith(n));
const problems = [];
if (!(idx('init') === 0)) problems.push('init is not first');
if (!(idx('gameLoadingStart') > idx('init'))) problems.push('gameLoadingStart missing/out of order');
if (!(idx('gameLoadingFinished') > idx('gameLoadingStart'))) problems.push('gameLoadingFinished missing/out of order');
if (beforeInput.some((c) => c === 'gameplayStart')) problems.push('gameplayStart before first input');
let playing = false;
for (const c of calls) {
  if (c === 'gameplayStart') { if (playing) problems.push('double gameplayStart'); playing = true; }
  if (c === 'gameplayStop') { if (!playing) problems.push('gameplayStop while stopped'); playing = false; }
}
if (!overlayAfterHide) problems.push('no pause overlay after tab hidden');
const measures = calls.filter((c) => c.startsWith('measure'));
if (measures.some((m) => /[\\/^]/.test(m.slice(8)))) problems.push('measure contains / or ^');
console.log('calls:', calls.filter((c) => !c.startsWith('measure')).join(' → '));
console.log('measures:', measures.map((m) => m.slice(9)).join(', '));
console.log('errors:', errors.length ? errors : 'none');
console.log(problems.length ? 'PROBLEMS: ' + problems.join('; ') : 'SDK FLOW OK');
await browser.close();
