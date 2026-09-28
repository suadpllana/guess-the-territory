// npm test: SDK call order with a recording mock + a quick multi-level playthrough.
import { ROOT, devServer, launch } from './harness.mjs';

const server = await devServer();
const browser = await launch();
let failed = false;
const fail = (m) => {
  failed = true;
  console.log('FAIL', m);
};

// 1) SDK call order
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const MOCK = `window.__calls=[];const log=(n)=>window.__calls.push(n);window.PokiSDK={init:()=>{log('init');return new Promise(r=>setTimeout(r,200))},setDebug(){},gameLoadingStart:()=>log('gameLoadingStart'),gameLoadingProgress(){},gameLoadingFinished:()=>log('gameLoadingFinished'),gameplayStart:()=>log('gameplayStart'),gameplayStop:()=>log('gameplayStop'),commercialBreak:(cb)=>{log('commercialBreak');cb&&cb();return Promise.resolve()},rewardedBreak:(cb)=>{log('rewardedBreak');cb&&cb();return Promise.resolve(true)},measure:(c,w,a)=>log('measure:'+[c,w,a].join('|')),captureError:()=>log('captureError')};`;
  await page.route('**/poki-sdk.js', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await page.goto(`${server.url}/?home=FR&lang=fr`);
  await page.waitForSelector('.answers .answer', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const pre = await page.evaluate(() => window.__calls.slice());
  if (pre.includes('gameplayStart')) fail('gameplayStart fired before the first input');
  await (await page.$$('.answers .answer'))[0].click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('.overlay .btn.primary');
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => window.__calls.slice());
  const order = ['init', 'gameLoadingStart', 'gameLoadingFinished', 'gameplayStart', 'gameplayStop', 'gameplayStart'];
  let i = 0;
  for (const c of calls) if (c === order[i]) i++;
  if (i < order.length) fail('SDK order: ' + calls.filter((c) => !c.startsWith('measure')).join(' > '));
  let playing = false;
  for (const c of calls) {
    if (c === 'gameplayStart') {
      if (playing) fail('double gameplayStart');
      playing = true;
    }
    if (c === 'gameplayStop') playing = false;
  }
  if (calls.some((c) => c.startsWith('measure:') && /[/^]/.test(c.slice(8)))) fail('measure value contains / or ^');
  if (errors.length) fail('page errors: ' + errors.join('; '));
  console.log('sdk flow:', calls.filter((c) => !c.startsWith('measure')).join(' > '));
  await page.close();
}

// 2) Play levels 1-4 quickly (dev-only ?speed) answering mostly right.
{
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/?home=US&lang=en&speed=4`);
  await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
  const t0 = Date.now();
  let answered = 0;
  const modes = new Set();
  while (Date.now() - t0 < 150000) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      const q = g.currentQ;
      return { level: g.level, mode: q?.mode, picking: g.ui.picking, idx: q ? q.options.indexOf(q.target) : -1, tap: !!g.map.onTap, overlay: g.ui.overlayOpen, blitz: !!g.blitzEnd };
    });
    if (s.level > 4) break;
    if (s.overlay) {
      await page.click('.overlay .btn').catch(() => {});
      continue;
    }
    const right = Math.random() < 0.95;
    if (s.mode === 'find' && s.tap) {
      const pos = await page.evaluate((right) => {
        const g = window.__game;
        const q = g.currentQ;
        const f = right ? q.target : q.options.find((o) => o !== q.target);
        return g.map.screenOf(f.label[0], f.label[1]);
      }, right);
      await page.mouse.click(pos[0], pos[1]);
      answered++;
      modes.add('find');
    } else if (s.picking) {
      const b = await page.$$('.answers .answer, .answers .tile');
      const n = b.length;
      const idx = right ? s.idx : (s.idx + 1) % n;
      if (b[idx]) {
        await b[idx].click().catch(() => {});
        answered++;
        modes.add(s.blitz ? 'blitz' : s.mode);
      }
    }
    await page.waitForTimeout(150);
  }
  const level = await page.evaluate(() => window.__game.level);
  console.log(`playthrough: reached level ${level} after ${answered} answers; modes seen: ${[...modes].join(', ')}`);
  if (level < 5) fail('did not reach level 5');
  for (const m of ['classic', 'reveal', 'shape', 'blitz', 'find']) if (!modes.has(m)) fail('mode never played: ' + m);
  if (errors.length) fail('page errors: ' + errors.join('; '));
  await page.close();
}

await browser.close();
await server.close();
console.log(failed ? 'E2E FAILED' : 'E2E OK');
process.exit(failed ? 1 : 0);
