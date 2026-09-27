// Ads build check (vite --mode ads + mock SDK): midroll timing and rewarded flows.
import { ROOT, launch } from './harness.mjs';

const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, mode: 'ads', logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const MOCK = `window.__calls=[];const log=(n)=>window.__calls.push(n);window.PokiSDK={init:()=>{log('init');return Promise.resolve()},setDebug(){},gameLoadingStart:()=>log('gameLoadingStart'),gameLoadingProgress(){},gameLoadingFinished:()=>log('gameLoadingFinished'),gameplayStart:()=>log('gameplayStart'),gameplayStop:()=>log('gameplayStop'),commercialBreak:(cb)=>{log('commercialBreak:L'+window.__game.level);cb&&cb();return new Promise(r=>setTimeout(r,300))},rewardedBreak:(cb)=>{log('rewardedBreak');cb&&cb();return new Promise(r=>setTimeout(()=>r(true),300))},measure(){},captureError(){}};`;
await page.route('**/poki-sdk.js', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
await page.goto(`${url}/?home=GB&lang=en&speed=4`);
await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
let sawVideoHint = false;
let usedRewardHint = false;
let sawRewardCard = false;
const t0 = Date.now();
while (Date.now() - t0 < 200000) {
  const s = await page.evaluate(() => {
    const g = window.__game;
    const q = g.currentQ;
    return { level: g.level, mode: q?.mode, picking: g.ui.picking, idx: q ? q.options.indexOf(q.target) : -1, tap: !!g.map.onTap, hints: g.save.hints, overlay: g.ui.overlayOpen, blitz: !!g.blitzEnd };
  });
  if (s.level > 4) break;
  if (s.overlay) {
    const reward = await page.$('.overlay .btn.reward');
    if (reward) {
      sawRewardCard = true;
      await reward.click();
    } else await page.click('.overlay .btn').catch(() => {});
    await page.waitForTimeout(500);
    continue;
  }
  // drain hint tokens on level 2 to reach the rewarded (video) hint
  const hintBtn = await page.$('.fab.hint:not(.hide)');
  if (hintBtn && s.picking && s.level === 2 && !usedRewardHint) {
    const video = await page.$('.fab.hint.video:not(.hide)');
    if (video) {
      sawVideoHint = true;
      usedRewardHint = true;
    }
    await hintBtn.click();
    await page.waitForTimeout(500);
  }
  // on level 3 answer wrong until the hearts run out twice (second time shows the card)
  const right = s.level === 3 ? false : Math.random() < 0.9;
  if (s.mode === 'find' && s.tap) {
    const pos = await page.evaluate((right) => { const g = window.__game; const q = g.currentQ; const f = right ? q.target : q.options.find((o) => o !== q.target); return g.map.screenOf(f.label[0], f.label[1]); }, right);
    await page.mouse.click(pos[0], pos[1]);
  } else if (s.picking) {
    const all = await page.$$('.answers .answer, .answers .tile');
    const wrongIdx = await page.evaluate((idx) => {
      const els = [...document.querySelectorAll('.answers .answer, .answers .tile')];
      return els.findIndex((e, i) => i !== idx && !e.classList.contains('gone'));
    }, s.idx);
    await all[right ? s.idx : wrongIdx]?.click().catch(() => {});
  }
  await page.waitForTimeout(150);
}
const calls = await page.evaluate(() => window.__calls.slice());
console.log('commercial breaks:', calls.filter((c) => c.startsWith('commercialBreak')).join(', ') || 'none');
console.log('rewarded breaks:', calls.filter((c) => c === 'rewardedBreak').length, '| video hint seen:', sawVideoHint, '| reward card seen:', sawRewardCard);
const bad = [];
calls.forEach((c, i) => {
  if (c.startsWith('commercialBreak') || c === 'rewardedBreak') {
    const prev = calls.slice(0, i).reverse().find((x) => x === 'gameplayStart' || x === 'gameplayStop');
    if (prev === 'gameplayStart') bad.push(c + ' without gameplayStop first');
  }
});
const early = calls.filter((c) => /^commercialBreak:L[123]$/.test(c));
if (early.length) bad.push('midroll before level 4: ' + early.join(','));
console.log(bad.length ? 'PROBLEMS: ' + bad.join('; ') : 'ADS FLOW OK', errors.length ? 'errors: ' + errors : '');
await browser.close();
await server.close();
